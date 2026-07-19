import { useState, useMemo } from 'react'
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { streamAIChat, type AIMessage, getAllLearningData } from '@/lib/aiService'
import { AILoadingState } from './AILoadingState'
import { useAiSuggestionStore } from '@/stores/aiSuggestionStore'

interface AiSuggestionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AiSuggestionDialog({ open: _open, onOpenChange: _onOpenChange }: AiSuggestionDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [rawContent, setRawContent] = useState('')
  const { suggestion, setSuggestion } = useAiSuggestionStore()

  const systemPrompt = useMemo(() => {
    const data = getAllLearningData()
    // 只提取最简要的数据
    const brief = `今天${data.today}, 连续打卡${data.streakDays}天, 总学习${data.totalActiveDays}天, 背词${data.totalWords}个, 练习${data.totalPractice}次, 等级${data.currentLevel}`
    return `你是雅思学习助手。根据用户情况给出2-3条今日学习建议。

用户: ${brief}

要求: 中文, 150字以内, 具体可执行, 语气友好。直接输出建议。`
  }, [])

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')
    setRawContent('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '今日学习建议' },
    ]

    let fullContent = ''
    let hasReceivedAnyContent = false

    await streamAIChat(messages, {
      onContent: (content) => {
        fullContent = content
        hasReceivedAnyContent = true
        setRawContent(content)
      },
      onError: (err) => {
        setError(`AI 错误: ${err}`)
        setIsLoading(false)
      },
      onDone: () => {
        setIsLoading(false)
        if (fullContent && fullContent.trim()) {
          setSuggestion(fullContent.trim())
        } else if (hasReceivedAnyContent) {
          setError('AI 返回了空内容，请重试')
        } else {
          setError('未收到 AI 响应，请检查网络连接后重试')
        }
      },
    }, { temperature: 0.7, max_tokens: 512 })
  }

  const handleRegenerate = () => {
    generateSuggestion()
  }

  return (
    <div className="space-y-4">
      {/* 状态提示 */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-4">
          <AILoadingState text="正在生成学习建议" />
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <Card size="sm" className="border-destructive">
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-destructive mb-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
            {rawContent ? (
              <details open className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground mb-2">AI 返回的内容：</summary>
                <pre className="p-2 bg-muted rounded-lg whitespace-pre-wrap overflow-auto max-h-[200px]">
                  {rawContent}
                </pre>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground">未收到 AI 响应</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 建议内容 */}
      {!isLoading && suggestion && (
        <Card size="sm" className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border-indigo-200 dark:border-indigo-800">
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: formatMarkdown(suggestion.content) }} />
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

// 简单的 Markdown 转 HTML（支持标题和列表）
function formatMarkdown(text: string): string {
  return text
    // 标题
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mb-2 mt-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mb-2 mt-4">$1</h2>')
    // 无序列表
    .replace(/^- (.+)$/gm, '<li class="text-sm mb-1 ml-4 list-disc">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="mb-2">$&</ul>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li class="text-sm mb-1 ml-4 list-decimal">$1</li>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 换行
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
