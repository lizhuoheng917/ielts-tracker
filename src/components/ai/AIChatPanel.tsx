import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Sparkles, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AILoadingState } from './AILoadingState'
import { AIConfirmCard, type AIAction } from './AIConfirmCard'
import { streamAIChat, type AIMessage } from '@/lib/aiService'
import ReactMarkdown from 'react-markdown'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: AIAction[]
  actionsConfirmed?: boolean
}

interface AIChatPanelProps {
  systemPrompt: string
  placeholder?: string
  onActionConfirm?: (action: AIAction) => void
  onReportGenerated?: (content: string) => void
  loadingText?: string
  className?: string
  initialQuery?: string
  suggestions?: string[]
}

export function AIChatPanel({
  systemPrompt,
  placeholder = '输入消息...',
  onActionConfirm,
  onReportGenerated,
  loadingText,
  className,
  initialQuery,
  suggestions,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isUserScrolledUp = useRef(false)

  const scrollToBottom = (force = false) => {
    const container = messagesContainerRef.current
    if (container) {
      if (force) {
        isUserScrolledUp.current = false
      }
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
    }
  }

  // 检测用户是否手动向上滚动
  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const threshold = 60
    isUserScrolledUp.current =
      container.scrollHeight - container.scrollTop - container.clientHeight > threshold
  }

  useEffect(() => {
    // 仅在用户未手动上滑时自动滚动
    if (!isUserScrolledUp.current) {
      scrollToBottom()
    }
  }, [messages])

  // 自动调整 textarea 高度
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }, [input])

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setError('')
    scrollToBottom(true) // 用户发消息时强制滚到底

    // 构建 API 消息（基于最新状态）
    const currentMessages = messages
    const apiMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...currentMessages.map((m) => ({ role: m.role, content: m.content }) as AIMessage),
      { role: 'user', content: trimmed },
    ]

    const assistantMsgId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '' },
    ])

    let fullContent = ''

    await streamAIChat(apiMessages, {
      onContent: (content) => {
        fullContent = content
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content } : m
          )
        )
      },
      onError: (err) => {
        setError(err)
        setIsLoading(false)
      },
      onDone: () => {
        setIsLoading(false)
        // 如果内容长度超过100字符，通知父组件生成了报告
        if (fullContent.length > 100 && onReportGenerated) {
          onReportGenerated(fullContent)
        }
        // 尝试解析 actions（简化版：从内容中提取 [ACTION:...] 标记）
        const actions = parseActionsFromContent(fullContent)
        if (actions.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, actions } : m
            )
          )
        }
      },
    })
  }, [isLoading, messages, systemPrompt, onReportGenerated])

  const handleSend = useCallback(() => {
    sendMessage(input)
  }, [input, sendMessage])

  // 自动发送初始查询
  const hasAutoSent = useRef(false)
  useEffect(() => {
    if (initialQuery && !hasAutoSent.current && messages.length === 0) {
      hasAutoSent.current = true
      sendMessage(initialQuery)
    }
  }, [initialQuery, messages.length, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleActionConfirm = (msgId: string, action: AIAction) => {
    onActionConfirm?.(action)
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.actions) return m
        const remaining = m.actions.filter((a) => a.id !== action.id)
        return { ...m, actions: remaining.length > 0 ? remaining : undefined }
      })
    )
  }

  return (
    <div className={cn('flex flex-col flex-1 min-h-0', className)}>
      {/* 消息列表 */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 px-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
            <Sparkles className="h-8 w-8 mb-2 text-indigo-400" />
            <p className="text-sm">AI 助手已就绪</p>
            <p className="text-xs mt-1">开始对话吧</p>
            {suggestions && suggestions.length > 0 && (
              <div className="mt-4 w-full max-w-[90%] space-y-2">
                <p className="text-xs text-muted-foreground/70 text-center">试试这样问：</p>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border/50 bg-background hover:bg-accent hover:border-accent transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}

            <div className={cn(
              'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-muted text-foreground'
            )}>
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                    <ReactMarkdown>{stripActionTags(msg.content)}</ReactMarkdown>
                  </div>
                ) : (
                  <AILoadingState text={loadingText} />
                )
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* AI 建议操作卡片 */}
              {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && !msg.actionsConfirmed && (
                <div className="mt-3 space-y-2 border-t border-border/50 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">AI 建议操作</p>
                  {msg.actions.map((action) => (
                    <AIConfirmCard
                      key={action.id}
                      action={action}
                      onConfirm={() => handleActionConfirm(msg.id, action)}
                      onReject={() => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === msg.id
                              ? { ...m, actions: m.actions?.filter((a) => a.id !== action.id) }
                              : m
                          )
                        )
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div className="border-t pt-3 mt-2">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="shrink-0 h-[44px] w-[44px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1.5 text-center">
          Enter 发送，Shift+Enter 换行
        </p>
      </div>
    </div>
  )
}

// 从 AI 回复中解析建议操作（简化版：查找 [ACTION:...] 标记）
/** 从 AI 回复中剥离 [ACTION:...]...[/ACTION] 标签，避免在消息气泡中显示原始标记 */
function stripActionTags(content: string): string {
  return content
    // 先移除完整的 [ACTION:...]...[/ACTION] 标签
    .replace(/\[ACTION:\w+\][\s\S]*?\[\/ACTION\]/g, '')
    // 再移除未关闭的 [ACTION:...] 标签（流式生成中可能出现）
    .replace(/\[ACTION:\w+\][\s\S]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseActionsFromContent(content: string): AIAction[] {
  const actions: AIAction[] = []
  const regex = /\[ACTION:(\w+)\]([\s\S]*?)\[\/ACTION\]/g
  let match
  let id = 0
  while ((match = regex.exec(content)) !== null) {
    const type = match[1] as AIAction['type']
    const body = match[2].trim()
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    const title = lines[0] || '建议操作'
    const description = lines.slice(1).join('\n') || ''
    actions.push({
      id: `action-${id++}`,
      type,
      title,
      description,
    })
  }
  return actions
}
