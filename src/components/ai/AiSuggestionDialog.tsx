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

  // 从内容中提取列表部分
  const extractList = (text: string): string => {
    // 找到第一个 "- " 的位置
    const listStart = text.indexOf('\n- ')
    if (listStart !== -1) {
      // 从 "- " 开始提取
      return text.substring(listStart + 1).trim()
    }
    
    // 如果没有 "\n- "，尝试找行首的 "- "
    const lines = text.split('\n')
    const listLines: string[] = []
    let foundList = false
    
    for (const line of lines) {
      if (line.trim().startsWith('- ')) {
        foundList = true
        listLines.push(line.trim())
      } else if (foundList) {
        // 如果已经找到列表，遇到非列表行就停止
        break
      }
    }
    
    if (listLines.length > 0) {
      return listLines.join('\n')
    }
    
    // 最后尝试找中文内容
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
