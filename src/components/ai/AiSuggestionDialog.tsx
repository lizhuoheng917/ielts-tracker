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

  const systemPrompt = useMemo(() => {
    const data = getAllLearningData()
    return `你是 IELTS Tracker 的 AI 学习助手。你是一位经验丰富的雅思备考教练。

## 用户学习数据
${JSON.stringify(data, null, 2)}

## 你的任务
根据用户今天的学习数据，给出 2-3 条具体的学习建议。

## 要求
- 用中文回复
- 每条建议一句话，简洁明了
- 建议要具体可执行
- 语气友好鼓励
- 使用 Markdown 列表格式`
  }, [])

  // 从内容中提取建议（取最后的中文列表部分）
  const extractSuggestion = (text: string): string => {
    // 找到所有中文句子
    const lines = text.split('\n')
    const chineseLines: string[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      // 检查是否包含中文字符且长度足够
      if (/[\u4e00-\u9fff]/.test(trimmed) && trimmed.length > 5) {
        // 移除 Markdown 格式符号
        const cleaned = trimmed.replace(/^[-*]\s*/, '').replace(/^\d+[.、]\s*/, '')
        if (cleaned.length > 5) {
          chineseLines.push(cleaned)
        }
      }
    }
    
    // 取最后 3 条（通常是实际建议）
    if (chineseLines.length >= 2) {
      return chineseLines.slice(-3).join('\n')
    }
    
    return chineseLines.join('\n')
  }

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '请给出今日学习建议' },
    ]

    let fullContent = ''

    // 不限制 max_tokens，让模型自由输出（与学习报告相同）
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
        const extracted = extractSuggestion(fullContent)
        
        if (extracted) {
          setSuggestion(extracted)
        } else {
          setError('生成失败，请重试')
        }
      },
    })  // 不传 options，使用默认 max_tokens: 4096
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
          <CardContent className="pt-4 max-h-[300px] overflow-y-auto">
            <div className="space-y-3">
              {suggestion.content.split('\n').filter((line: string) => line.trim()).map((line: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 mt-0.5">
                    <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">{i + 1}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{line}</p>
                </div>
              ))}
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
