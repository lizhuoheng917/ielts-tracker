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
  const { suggestion, setSuggestion } = useAiSuggestionStore()

  const systemPrompt = useMemo(() => {
    const data = getAllLearningData()
    return `你是 IELTS Tracker 的 AI 学习助手。请根据用户的学习数据，给出今日学习建议。

## 用户学习数据
${JSON.stringify(data, null, 2)}

## 你的任务
根据以上数据，给出 2-3 条具体、可执行的今日学习建议。

## 要求
1. 用中文回复
2. 语气友好、鼓励
3. 建议要具体，避免空泛的"多练习"
4. 根据用户今天的学习情况和薄弱项给出针对性建议
5. 如果用户今天还没有学习，鼓励开始
6. 如果用户今天已经学习了很多，给予肯定并建议适度休息
7. 回复使用 Markdown 格式，使用标题和列表
8. 控制在 200 字以内`
  }, [])

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请给我今日的学习建议' },
    ]

    let fullContent = ''

    await streamAIChat(messages, {
      onContent: (content) => {
        fullContent = content
      },
      onError: (err) => {
        setError(err)
        setIsLoading(false)
      },
      onDone: () => {
        setIsLoading(false)
        if (fullContent) {
          setSuggestion(fullContent)
        }
      },
    }, { temperature: 0.7, max_tokens: 1024 })
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
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
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
