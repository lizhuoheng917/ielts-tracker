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
    const brief = `今天${data.today}, 连续打卡${data.streakDays}天, 总学习${data.totalActiveDays}天, 背词${data.totalWords}个, 练习${data.totalPractice}次`
    return `你是雅思学习助手。根据用户情况生成今日学习建议。

用户情况: ${brief}

请用 [SUGGESTION] 标签包裹你的建议，格式如下：
[SUGGESTION]
建议1的内容
建议2的内容
[/SUGGESTION]`
  }, [])

  const extractSuggestion = (text: string): string => {
    console.log('[AI Suggestion] Raw content length:', text.length)
    console.log('[AI Suggestion] Raw content:', text)
    
    // 尝试提取 [SUGGESTION] 标签内容
    const tagMatch = text.match(/\[SUGGESTION\]([\s\S]*?)\[\/SUGGESTION\]/i)
    if (tagMatch) {
      console.log('[AI Suggestion] Found tag content:', tagMatch[1])
      return tagMatch[1].trim()
    }
    
    console.log('[AI Suggestion] No tag found, trying Chinese extraction')
    // 尝试提取中文内容
    const chineseLines = text.match(/[\u4e00-\u9fff][^\n]*/g)
    if (chineseLines) {
      console.log('[AI Suggestion] Chinese lines found:', chineseLines)
      const filtered = chineseLines.filter(s => s.length > 5)
      console.log('[AI Suggestion] Filtered Chinese:', filtered)
      if (filtered.length > 0) {
        return filtered.join('\n')
      }
    }
    
    console.log('[AI Suggestion] No valid content found')
    return ''
  }

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')
    console.log('[AI Suggestion] Starting generation...')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '生成今日学习建议' },
    ]

    let fullContent = ''

    await streamAIChat(messages, {
      onContent: (content) => {
        fullContent = content
        console.log('[AI Suggestion] Content chunk:', content.substring(0, 50))
      },
      onError: (err) => {
        console.error('[AI Suggestion] Error:', err)
        setError(err)
        setIsLoading(false)
      },
      onDone: () => {
        console.log('[AI Suggestion] Stream done. Full content:', fullContent)
        setIsLoading(false)
        const extracted = extractSuggestion(fullContent)
        console.log('[AI Suggestion] Extracted:', extracted)
        
        if (extracted) {
          setSuggestion(extracted)
        } else {
          setError('未收到有效内容，请重试')
        }
      },
    }, { temperature: 0.7, max_tokens: 256 })
  }

  return (
    <div className="space-y-4">
      {/* 加载状态 */}
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

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 建议报告 */}
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
                  <p className="text-sm leading-relaxed">{line.replace(/^\d+[.、]\s*/, '')}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {new Date(suggestion.createdAt).toLocaleDateString('zh-CN')} 生成
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={generateSuggestion}
                disabled={isLoading}
                className="h-7 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                换一批
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 空状态 */}
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

      {/* 生成按钮 */}
      {!suggestion && (
        <Button
          onClick={generateSuggestion}
          disabled={isLoading}
          className="w-full bg-indigo-500 hover:bg-indigo-600"
        >
          {isLoading ? (
            '生成中...'
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              生成今日建议
            </>
          )}
        </Button>
      )}
    </div>
  )
}
