import { useState, useMemo } from 'react'
import { Sparkles, RefreshCw, AlertCircle, Loader2, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    const brief = `今天${data.today}, 连续打卡${data.streakDays}天, 总学习${data.totalActiveDays}天, 背词${data.totalWords}个, 练习${data.totalPractice}次`
    return `你是雅思学习助手。根据用户情况给出2条今日学习建议。

用户: ${brief}

要求: 直接输出2条建议，每条一句话，不要任何其他内容。`
  }, [])

  // 从推理内容中提取最终建议
  const extractAnswer = (text: string): string => {
    // 方法1: 找到中文内容部分
    const chineseMatch = text.match(/[\u4e00-\u9fff].*$/s)
    if (chineseMatch) {
      let result = chineseMatch[0]
      // 清理常见的推理标记
      result = result.replace(/^(?:Draft|建议|建议如下|今日建议)[：:]\s*/gm, '')
      result = result.replace(/^\d+[.、]\s*/gm, '')
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

      const response = await chatAI(messages, { temperature: 0.7, max_tokens: 256 })
      
      let content = response?.content || response?.reasoning_content || ''
      content = extractAnswer(content)
      
      if (content) {
        setSuggestion(content.trim())
      } else {
        setError('生成失败，请重试')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsLoading(false)
    }
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
          <CardContent className="pt-4">
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
