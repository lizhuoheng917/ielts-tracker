import { useState, useMemo } from 'react'
import { Sparkles, FileText, ChevronDown, ChevronUp, Save, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { streamAIChat, type AIMessage } from '@/lib/aiService'
import { AILoadingState } from './AILoadingState'
import { useReportStore } from '@/stores/reportStore'

export interface WritingScore {
  tr_ta: number
  cc: number
  lr: number
  gra: number
  total: number
}

export interface WritingCorrectionResult {
  scores: WritingScore
  paragraphFeedback: { paragraph: string; feedback: string }[]
  suggestions: string[]
  improvedVersion?: string
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
    improved: false,
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')

  const addReport = useReportStore((s) => s.addReport)

  const systemPrompt = useMemo(() => {
    return `你是 IELTS Tracker 的 AI 写作批改助手。你是一位经验丰富的雅思写作考官，熟悉雅思写作评分标准。

## 作文类型
用户提交的是${essayType === 'task1' ? '小作文（Task 1）' : '大作文（Task 2）'}。

## 你的职责
1. 按照雅思写作评分标准对用户的作文进行评分（满分 9 分）
2. 逐段给出详细的修改建议和评语
3. 指出语法、词汇、逻辑等方面的问题
4. 给出改进后的范文或修改建议

## 输出格式要求（极其重要）
请严格按照以下 JSON 格式输出，不要包含其他内容：
\`\`\`json
{
  "scores": {
    "tr_ta": 评分(0-9),
    "cc": 评分(0-9),
    "lr": 评分(0-9),
    "gra": 评分(0-9),
    "total": 总分
  },
  "paragraphFeedback": [
    {
      "paragraph": "原文段落内容",
      "feedback": "该段落的详细点评和修改建议"
    }
  ],
  "suggestions": ["总体建议1", "总体建议2", "总体建议3"],
  "improvedVersion": "改进后的完整范文（可选）"
}
\`\`\`

## 评分标准
- TR/TA (Task Response/Achievement): 任务回应/完成度
- CC (Coherence and Cohesion): 连贯与衔接
- LR (Lexical Resource): 词汇资源
- GRA (Grammatical Range and Accuracy): 语法多样性与准确性

## 风格要求
- 点评用中文，但可以引用原文中的英文表达
- 语气专业但鼓励
- 具体指出问题所在，避免泛泛而谈`
  }, [essayType])

  const handleSubmit = async () => {
    if (!essayContent.trim()) return

    setIsLoading(true)
    setResult(null)
    setRawContent('')
    setError('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: essayContent },
    ]

    let fullContent = ''

    await streamAIChat(messages, {
      onContent: (content) => {
        fullContent = content
        setRawContent(content)
      },
      onError: (err) => {
        setError(err)
        setIsLoading(false)
      },
      onDone: () => {
        setIsLoading(false)
        // 尝试解析 JSON 结果
        try {
          const jsonMatch = fullContent.match(/```json\s*([\s\S]*?)\s*```/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[1])
            setResult(parsed)
          } else {
            // 尝试直接解析
            const parsed = JSON.parse(fullContent)
            setResult(parsed)
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
    const reportContent = formatReportContent(result)
    
    addReport({
      type: 'writing_correction',
      title: `${essayType === 'task1' ? '小作文' : '大作文'}批改报告`,
      content: reportContent,
      createdAt: new Date().toISOString(),
      metadata: {
        essayType,
        scores: result.scores,
      },
    })

    setSaveStatus('saved')
    onSuccess?.()
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  const formatReportContent = (r: WritingCorrectionResult): string => {
    let content = `## 评分结果\n\n`
    content += `| 评分项 | 分数 |\n|--------|------|\n`
    content += `| 任务回应 (TR/TA) | ${r.scores.tr_ta} |\n`
    content += `| 连贯衔接 (CC) | ${r.scores.cc} |\n`
    content += `| 词汇资源 (LR) | ${r.scores.lr} |\n`
    content += `| 语法准确性 (GRA) | ${r.scores.gra} |\n`
    content += `| **总分** | **${r.scores.total}** |\n\n`
    
    content += `## 逐段点评\n\n`
    r.paragraphFeedback.forEach((p, i) => {
      content += `### 段落 ${i + 1}\n`
      content += `> ${p.paragraph}\n\n`
      content += `${p.feedback}\n\n`
    })
    
    content += `## 总体建议\n\n`
    r.suggestions.forEach((s, i) => {
      content += `${i + 1}. ${s}\n`
    })
    
    if (r.improvedVersion) {
      content += `\n## 改进范文\n\n${r.improvedVersion}`
    }
    
    return content
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
              ? '请粘贴你的小作文（图表描述/书信等）...' 
              : '请粘贴你的大作文（议论文/讨论类等）...'}
            rows={8}
            className="min-h-[200px] resize-none"
          />
          <p className="text-[11px] text-muted-foreground text-right">
            {essayContent.length} 字符
          </p>
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
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
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

          {/* 逐段点评 */}
          <Card>
            <CardContent className="pt-4">
              <button
                onClick={() => toggleSection('feedback')}
                className="w-full flex items-center justify-between"
              >
                <h4 className="font-semibold">逐段点评</h4>
                {expandedSections.feedback ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expandedSections.feedback && (
                <div className="mt-3 space-y-3">
                  {result.paragraphFeedback.map((p, i) => (
                    <div key={i} className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm font-medium text-muted-foreground mb-1">段落 {i + 1}</p>
                      <blockquote className="text-sm border-l-2 border-amber-300 dark:border-amber-700 pl-2 italic mb-2">
                        {p.paragraph}
                      </blockquote>
                      <p className="text-sm">{p.feedback}</p>
                    </div>
                  ))}
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

          {/* 改进范文 */}
          {result.improvedVersion && (
            <Card>
              <CardContent className="pt-4">
                <button
                  onClick={() => toggleSection('improved')}
                  className="w-full flex items-center justify-between"
                >
                  <h4 className="font-semibold">改进范文</h4>
                  {expandedSections.improved ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {expandedSections.improved && (
                  <div className="mt-3 text-sm whitespace-pre-wrap bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    {result.improvedVersion}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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

      {/* 原始内容（调试用，可删除） */}
      {!result && rawContent && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold mb-2">原始返回内容</h4>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-[300px]">
              {rawContent}
            </pre>
          </CardContent>
        </Card>
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
