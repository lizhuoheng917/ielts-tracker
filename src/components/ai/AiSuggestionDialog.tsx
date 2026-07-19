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
    return `给一个雅思初学者2条今日学习建议。
今天是${data.today}，连续打卡${data.streakDays}天，已背词${data.totalWords}个。
每条建议一句话，共2句话，直接输出，不要编号，不要其他内容。`
  }, [])

  // 提取中文建议
  const extractSuggestion = (text: string): string => {
    // 提取所有中文句子（至少10个字符）
    const chineseSentences = text.match(/[\u4e00-\u9fff][\u4e00-\u9fff\w\s，。！？、；：""''（）\d]*/g)
    
    if (!chineseSentences) return ''
    
    // 过滤出有意义的句子（长度>10）
    const meaningful = chineseSentences
      .filter(s => s.trim().length > 10)
      .map(s => s.trim())
    
    // 去重
    const unique = [...new Set(meaningful)]
    
    // 取最后2条（通常是实际建议，不是思考过程）
    if (unique.length >= 2) {
      return unique.slice(-2).join('\n')
    }
    
    return unique.join('\n')
  }

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '给出建议' },
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
        const extracted = extractSuggestion(fullContent)
        
        if (extracted) {
          setSuggestion(extracted)
        } else {
          setError('生成失败，请重试')
        }
      },
    }, { temperature: 0.7, max_tokens: 2048 })
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
