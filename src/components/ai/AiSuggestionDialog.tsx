import { useState, useMemo } from 'react'
import { Sparkles, RefreshCw, AlertCircle, Loader2, Calendar, Lightbulb } from 'lucide-react'
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
    return `你是 IELTS Tracker 的 AI 智能学习助手。

## 用户学习数据
${JSON.stringify(data, null, 2)}

## 输出要求
直接输出 2-3 条学习建议，每条以 "- " 开头。

格式：
- 第1条建议内容
- 第2条建议内容

注意：直接输出列表，不要有其他内容。`
  }, [])

  const extractList = (text: string): string => {
    const listStart = text.indexOf('\n- ')
    if (listStart !== -1) {
      return text.substring(listStart + 1).trim()
    }
    
    const lines = text.split('\n')
    const listLines: string[] = []
    let foundList = false
    
    for (const line of lines) {
      if (line.trim().startsWith('- ')) {
        foundList = true
        listLines.push(line.trim())
      } else if (foundList) {
        break
      }
    }
    
    if (listLines.length > 0) {
      return listLines.join('\n')
    }
    
    const chineseMatch = text.match(/[\u4e00-\u9fff].*$/s)
    if (chineseMatch) {
      return chineseMatch[0].trim()
    }
    
    return text
  }

  const generateSuggestion = async () => {
    setIsLoading(true)
    setError('')

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '生成建议' },
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
        const extracted = extractList(fullContent)
        
        if (extracted) {
          setSuggestion(extracted)
        } else {
          setError('生成失败，请重试')
        }
      },
    })
  }

  // 解析建议列表
  const parseSuggestions = (content: string) => {
    return content
      .split('\n')
      .filter(line => line.trim().startsWith('- '))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0)
  }

  return (
    <div className="space-y-4">
      {/* 加载状态 */}
      {isLoading && (
        <Card size="sm" className="border-indigo-200 dark:border-indigo-800">
          <CardContent className="py-6">
            <div className="flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
              <p className="text-sm font-medium text-muted-foreground">正在生成学习建议...</p>
            </div>
            {/* 警告提示 */}
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/30 px-3 py-2 mt-4">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="text-[12px] text-amber-700 dark:text-amber-400">
                请勿关闭弹窗或切换页面，以免生成中断
              </span>
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
        <Card size="sm" className="overflow-hidden border-indigo-200 dark:border-indigo-800 shadow-md">
          <CardHeader className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 text-white py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              今日学习建议
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-3">
            <div className="space-y-3">
              {parseSuggestions(suggestion.content).map((item, i) => (
                <div 
                  key={i} 
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-gradient-to-r from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/20 dark:to-violet-950/20 hover:from-indigo-100/70 hover:to-violet-100/70 dark:hover:from-indigo-900/30 dark:hover:to-violet-900/30 transition-colors"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 mt-0.5">
                    <span className="text-[11px] font-bold text-white">{i + 1}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-foreground">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(suggestion.createdAt).toLocaleDateString('zh-CN')} 生成
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={generateSuggestion}
                disabled={isLoading}
                className="h-7 text-xs text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400"
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
        <Card size="sm" className="border-dashed border-indigo-200 dark:border-indigo-800">
          <CardContent className="py-10">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/50 dark:to-violet-900/50">
                  <Sparkles className="h-7 w-7 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">获取个性化学习建议</p>
                <p className="text-xs text-muted-foreground mt-1">AI 将根据你的学习数据生成建议</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 生成按钮 */}
      {!suggestion && (
        <Button 
          onClick={generateSuggestion} 
          disabled={isLoading} 
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-md hover:shadow-lg transition-all"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              生成中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              生成今日建议
            </span>
          )}
        </Button>
      )}
    </div>
  )
}
