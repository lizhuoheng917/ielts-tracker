import { useState, useMemo } from 'react'
import { Sparkles, FileText, ChevronDown, ChevronUp, Save, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { streamAIChat, type AIMessage } from '@/lib/aiService'
import { AILoadingState } from './AILoadingState'
import { useWritingReportStore } from '@/stores/writingReportStore'

export interface WritingScore {
  tr_ta: number
  cc: number
  lr: number
  gra: number
  total: number
}

export interface WritingCorrectionResult {
  scores: WritingScore
  feedback: string
  suggestions: string[]
}

interface WritingCorrectionProps {
  onSuccess?: () => void
}

export function WritingCorrection({ onSuccess }: WritingCorrectionProps) {
  const [essayType, setEssayType] = useState<'task1' | 'task2'>('task2')
  const [essayContent, setEssayContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<WritingCorrectionResult | null>(null)
  const [rawContent, setRawContent] = useState('')
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    scores: true,
    feedback: true,
    suggestions: true,
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')

  const addReport = useWritingReportStore((s) => s.addReport)

  const systemPrompt = useMemo(() => {
    return `你是雅思写作批改助手。请按以下 JSON 格式输出批改结果，不要输出其他内容：

{
  "scores": {"tr_ta": 评分, "cc": 评分, "lr": 评分, "gra": 评分, "total": 总分},
  "feedback": "逐段点评（将所有段落的点评合并为一段文字，用【段落1】【段落2】等标记分隔）",
  "suggestions": ["建议1", "建议2", "建议3"]
}

评分标准：TR/TA=任务回应, CC=连贯衔接, LR=词汇, GRA=语法，各项 0-9 分。

注意：
- 每项评分可以是小数（如 6.5）
- feedback 用中文写，简洁明了，每段 1-2 句话
- suggestions 3 条即可，每条不超过 30 字
- 直接输出 JSON，不要用代码块包裹`
  }, [essayType])

  const handleSubmit = async () => {
    if (!essayContent.trim()) return

    // 检查输入长度
    const estimatedTokens = Math.ceil((systemPrompt.length + essayContent.length) / 3)
    if (estimatedTokens > 8000) {
      setError(`输入内容过长（约 ${estimatedTokens} tokens），请缩减作文长度后重试。建议控制在 500 词以内。`)
      return
    }

    setIsLoading(true)
    setResult(null)
    setRawContent('')
    setError('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: essayContent },
    ]

    let fullContent = ''
    let hasReceivedContent = false

    await streamAIChat(messages, {
      onContent: (content) => {
        fullContent = content
        hasReceivedContent = true
        setRawContent(content)
      },
      onError: (err) => {
        setError(err)
        setIsLoading(false)
        // 确保在错误时也显示原始内容
        if (fullContent) {
          setRawContent(fullContent)
        } else if (!hasReceivedContent) {
          setRawContent(`[错误] ${err}\n\n提示：可能是输入内容过长或 API 配置问题。`)
        }
      },
      onDone: () => {
        setIsLoading(false)
        // 确保 rawContent 有值
        if (fullContent) {
          setRawContent(fullContent)
        }
        // 尝试解析 JSON 结果
        try {
          // 尝试多种方式解析 JSON
          let parsed = null
          
          // 方式 1: 尝试直接解析
          try {
            parsed = JSON.parse(fullContent)
          } catch {
            // 方式 2: 尝试从代码块中提取
            const jsonMatch = fullContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[1])
              } catch {
                // 继续尝试其他方式
              }
            }
          }
          
          // 方式 3: 尝试找到第一个 { 和最后一个 } 之间的内容
          if (!parsed) {
            const firstBrace = fullContent.indexOf('{')
            const lastBrace = fullContent.lastIndexOf('}')
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const jsonString = fullContent.substring(firstBrace, lastBrace + 1)
              try {
                parsed = JSON.parse(jsonString)
              } catch {
                // 继续尝试其他方式
              }
            }
          }
          
          if (parsed && parsed.scores) {
            // 验证数据结构
            const scores = parsed.scores
            if (typeof scores.tr_ta === 'number' && typeof scores.cc === 'number' &&
                typeof scores.lr === 'number' && typeof scores.gra === 'number' &&
                typeof scores.total === 'number') {
              setResult({
                scores: parsed.scores,
                feedback: parsed.feedback || '',
                suggestions: parsed.suggestions || [],
              })
            } else {
              setError('评分数据格式不正确，请重试')
            }
          } else {
            setError('结果解析失败，请重试')
          }
        } catch {
          // JSON 解析失败，显示原始内容
          setError('结果解析失败，请重试')
        }
      },
    }, { temperature: 0.3, max_tokens: 4096 })
  }

  const handleSave = async () => {
    if (!result) return

    setSaveStatus('saving')
    
    addReport({
      essayType,
      essayContent,
      scores: result.scores,
      feedback: result.feedback,
      suggestions: result.suggestions,
    })

    setSaveStatus('saved')
    onSuccess?.()
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <div className="space-y-4">
      {/* 输入区域 */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>作文类型</Label>
          <div className="flex gap-2">
            <Button
              variant={essayType === 'task1' ? 'default' : 'outline'}
              onClick={() => setEssayType('task1')}
              disabled={isLoading}
              className={cn(
                'flex-1',
                essayType === 'task1' && 'bg-amber-500 hover:bg-amber-600'
              )}
            >
              <FileText className="h-4 w-4 mr-1.5" />
              小作文 (Task 1)
            </Button>
            <Button
              variant={essayType === 'task2' ? 'default' : 'outline'}
              onClick={() => setEssayType('task2')}
              disabled={isLoading}
              className={cn(
                'flex-1',
                essayType === 'task2' && 'bg-amber-500 hover:bg-amber-600'
              )}
            >
              <FileText className="h-4 w-4 mr-1.5" />
              大作文 (Task 2)
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>粘贴你的作文</Label>
          <Textarea
            value={essayContent}
            onChange={(e) => setEssayContent(e.target.value)}
            placeholder={essayType === 'task1' 
              ? '请粘贴你的小作文（图表描述/书信等），建议 150 词以内...' 
              : '请粘贴你的大作文（议论文/讨论类等），建议 250 词以内...'}
            rows={8}
            className="min-h-[200px] resize-none"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>约 {Math.ceil(essayContent.length / 5)} 词</span>
            <span className={essayContent.length > 2500 ? 'text-destructive' : ''}>
              {essayContent.length > 2500 ? '内容较长，建议精简' : '建议 250 词以内'}
            </span>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!essayContent.trim() || isLoading}
          className="w-full bg-amber-500 hover:bg-amber-600"
        >
          {isLoading ? (
            <>
              <AILoadingState text="批改中" className="mr-2" />
              AI 正在批改...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              AI 批改
            </>
          )}
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-destructive mb-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
            {/* 显示原始内容帮助调试 */}
            {rawContent ? (
              <details open className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground mb-2">AI 返回的原始内容：</summary>
                <pre className="p-3 bg-muted rounded-lg whitespace-pre-wrap overflow-auto max-h-[300px] text-xs">
                  {rawContent}
                </pre>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground">未收到 AI 响应内容</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="space-y-3">
          {/* 评分卡片 */}
          <Card className={cn(
            'border-2 transition-colors',
            result.scores.total >= 7 ? 'border-green-200 dark:border-green-800' :
            result.scores.total >= 5 ? 'border-amber-200 dark:border-amber-800' :
            'border-red-200 dark:border-red-800'
          )}>
            <CardContent className="pt-4">
              <button
                onClick={() => toggleSection('scores')}
                className="w-full flex items-center justify-between"
              >
                <h4 className="font-semibold">评分结果</h4>
                {expandedSections.scores ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expandedSections.scores && (
                <div className="mt-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <ScoreCard label="TR/TA" score={result.scores.tr_ta} />
                    <ScoreCard label="CC" score={result.scores.cc} />
                    <ScoreCard label="LR" score={result.scores.lr} />
                    <ScoreCard label="GRA" score={result.scores.gra} />
                  </div>
                  <div className="mt-3 text-center">
                    <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      总分: {result.scores.total}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 详细点评 */}
          <Card>
            <CardContent className="pt-4">
              <button
                onClick={() => toggleSection('feedback')}
                className="w-full flex items-center justify-between"
              >
                <h4 className="font-semibold">详细点评</h4>
                {expandedSections.feedback ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expandedSections.feedback && (
                <div className="mt-3">
                  <p className="text-sm whitespace-pre-wrap">{result.feedback}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 总体建议 */}
          <Card>
            <CardContent className="pt-4">
              <button
                onClick={() => toggleSection('suggestions')}
                className="w-full flex items-center justify-between"
              >
                <h4 className="font-semibold">总体建议</h4>
                {expandedSections.suggestions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expandedSections.suggestions && (
                <ul className="mt-3 space-y-2">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 保存按钮 */}
          <Button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            variant="outline"
            className="w-full"
          >
            {saveStatus === 'saving' ? (
              '保存中...'
            ) : saveStatus === 'saved' ? (
              <>
                <Save className="h-4 w-4 mr-1.5 text-green-500" />
                已保存
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                保存到报告列表
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

// 评分卡片组件
function ScoreCard({ label, score }: { label: string; score: number }) {
  const color = score >= 7 ? 'text-green-600 dark:text-green-400' :
                score >= 5 ? 'text-amber-600 dark:text-amber-400' :
                'text-red-600 dark:text-red-400'
  
  return (
    <div className="text-center p-2 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold', color)}>{score}</p>
    </div>
  )
}
