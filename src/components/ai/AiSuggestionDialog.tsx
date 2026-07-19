import { useState, useMemo } from 'react'
import { Sparkles, RefreshCw, AlertCircle, Loader2, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { streamAIChat, getAllLearningData, type AIMessage } from '@/lib/aiService'
import { useAiSuggestionStore } from '@/stores/aiSuggestionStore'

interface AiSuggestionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AiSuggestionDialog({ open: _open, onOpenChange: _onOpenChange }: AiSuggestionDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { suggestion, setSuggestion } = useAiSuggestionStore()

  // 完全复制学习报告的提示词风格
  const systemPrompt = useMemo(() => {
    const data = getAllLearningData()
    return `你是 IELTS Tracker 的 AI 智能学习助手。你是一位经验丰富的雅思备考教练，擅长分析学习数据并给出专业建议。

## 用户学习数据
${JSON.stringify(data, null, 2)}

## 你的任务
根据用户今天的学习数据，生成今日学习建议。

## 要求
1. 给出 2-3 条具体的学习建议
2. 用中文回复
3. 每条建议一句话，简洁明了
4. 建议要具体可执行，避免空泛的"多练习"
5. 语气友好、鼓励但不失专业
6. 使用 Markdown 列表格式`
  }, [])

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请根据我的学习数据，给出今日的学习建议。' },
    ]

    let fullContent = ''

    // 与学习报告完全相同的方式
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
        } else {
          setError('生成失败，请重试')
        }
      },
    })
  }

  return (
    <div className="space-y-4">
      {isLoading && (
        <Card size="sm">
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm text-muted-foreground">正在生成今日学习建议...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isLoading && suggestion && (
        <Card size="sm" className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              今日学习建议
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 max-h-[400px] overflow-y-auto">
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
              {suggestion.content}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {new Date(suggestion.createdAt).toLocaleDateString('zh-CN')} 生成
              </p>
              <Button variant="ghost" size="sm" onClick={generateSuggestion} disabled={isLoading} className="h-7 text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                换一批
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !suggestion && !error && (
        <Card size="sm">
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                <Sparkles className="h-6 w-6 text-indigo-500" />
              </div>
              <p className="text-sm text-muted-foreground text-center">点击下方按钮获取今日学习建议</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!suggestion && (
        <Button onClick={generateSuggestion} disabled={isLoading} className="w-full bg-indigo-500 hover:bg-indigo-600">
          {isLoading ? '生成中...' : <><Sparkles className="h-4 w-4 mr-1.5" />生成今日建议</>}
        </Button>
      )}
    </div>
  )
}
