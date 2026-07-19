import { useState, useMemo } from 'react'
import { Sparkles, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { chatAI, getAllLearningData, type AIMessage } from '@/lib/aiService'
import { useAiSuggestionStore } from '@/stores/aiSuggestionStore'

interface AiSuggestionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AiSuggestionDialog({ open: _open, onOpenChange: _onOpenChange }: AiSuggestionDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { suggestion, setSuggestion } = useAiSuggestionStore()

  const systemPrompt = useMemo(() => {
    const data = getAllLearningData()
    const brief = `今天${data.today}, 连续打卡${data.streakDays}天, 总学习${data.totalActiveDays}天, 背词${data.totalWords}个, 练习${data.totalPractice}次, 等级${data.currentLevel}`
    return `你是雅思学习助手。根据用户情况给出2-3条今日学习建议。

用户: ${brief}

直接输出建议文本，不要思考过程。`
  }, [])

  // 从内容中提取最终建议（过滤掉推理过程）
  const extractFinalContent = (text: string): string => {
    // 尝试找到中文内容部分
    const chineseMatch = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef].*$/s)
    if (chineseMatch) {
      // 清理掉前面的英文推理部分
      let result = chineseMatch[0]
      // 移除常见的推理标记
      result = result.replace(/^(Requirements|Identify|Draft|Check|Step|Analysis).*$/gm, '')
      result = result.replace(/^-.*$/gm, '')
      result = result.replace(/\n{3,}/g, '\n\n')
      return result.trim()
    }
    return text
  }

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')

    try {
      const messages: AIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '今日学习建议' },
      ]

      const response = await chatAI(messages, { temperature: 0.7, max_tokens: 512 })
      
      // 从 content 或 reasoning_content 中提取内容
      let content = response?.content || response?.reasoning_content || ''
      
      // 提取最终建议，过滤推理过程
      content = extractFinalContent(content)
      
      if (content) {
        setSuggestion(content.trim())
      } else {
        setError('AI 返回了空内容，请重试')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegenerate = () => {
    generateSuggestion()
  }

  return (
    <div className="space-y-4">
      {/* 状态提示 */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">正在生成学习建议...</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 建议内容 */}
      {!isLoading && suggestion && (
        <Card size="sm" className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border-indigo-200 dark:border-indigo-800">
          <CardContent className="max-h-[300px] overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
                  {suggestion.content}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  生成于 {new Date(suggestion.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 空状态 */}
      {!isLoading && !suggestion && !error && (
        <div className="text-center py-8">
          <Sparkles className="h-12 w-12 mx-auto text-indigo-300 dark:text-indigo-600 mb-3" />
          <p className="text-sm text-muted-foreground">点击下方按钮生成今日学习建议</p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button
          onClick={handleRegenerate}
          disabled={isLoading}
          className="flex-1 bg-indigo-500 hover:bg-indigo-600"
        >
          {isLoading ? (
            '生成中...'
          ) : suggestion ? (
            <>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              重新生成
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              生成建议
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
