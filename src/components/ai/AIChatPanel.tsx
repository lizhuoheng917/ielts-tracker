import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Sparkles, AlertCircle, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AILoadingState } from './AILoadingState'
import { useChatStore, type ChatMessageRecord } from '@/stores/chatStore'
import { AIConfirmCard, type AIAction } from './AIConfirmCard'
import { streamAIChat, type AIMessage } from '@/lib/aiService'
import ReactMarkdown from 'react-markdown'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: AIAction[]
  actionsConfirmed?: boolean
  /** 消息状态：undefined=正常 done，'error'=生成失败 */
  status?: 'error'
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
  /** 用于区分不同页面的对话上下文，如 'plans'、'practice' */
  chatContext?: string
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
  chatContext,
}: AIChatPanelProps) {
  const chatKey = chatContext || 'default'
  const getStoreMessages = useChatStore((s) => s.getMessages)
  const chatSetMessages = useChatStore((s) => s.setMessages)
  const chatClearMessages = useChatStore((s) => s.clearMessages)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const isHydrated = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // 组件卸载时中止进行中的流式请求并清理定时器
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      clearTimeout(syncTimeoutRef.current)
    }
  }, [])

  // 首次挂载时从 store 恢复历史消息
  useEffect(() => {
    if (!isHydrated.current) {
      const stored = getStoreMessages(chatKey)
      if (stored.length > 0) {
        isHydrated.current = true
        setMessages(stored.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          // 恢复 actions
          actions: m.actions?.map((a) => ({
            id: a.id,
            type: a.type as AIAction['type'],
            title: a.title,
            description: a.description,
          })),
          // streaming 状态说明上次生成未完成，标记为 error；error 直接保留
          status: m.status === 'error' || m.status === 'streaming' ? 'error' : undefined,
        })))
      } else {
        isHydrated.current = true
      }
    }
  }, [chatKey, getStoreMessages])

  // 消息变化时同步到 store（防抖：流式生成期间不频繁写入 localStorage）
  useEffect(() => {
    if (isHydrated.current && messages.length > 0) {
      clearTimeout(syncTimeoutRef.current)
      const doSync = () => {
        const records: ChatMessageRecord[] = messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date().toISOString(),
          status: isLoading && m.role === 'assistant' && !m.content ? 'streaming' : 'done',
          actions: m.actions?.map((a) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            description: a.description,
          })),
        }))
        chatSetMessages(chatKey, records)
      }
      // 非加载状态立即同步；加载中（流式生成）延迟 500ms
      if (isLoading) {
        syncTimeoutRef.current = setTimeout(doSync, 500)
      } else {
        doSync()
      }
    }
    return () => clearTimeout(syncTimeoutRef.current)
  }, [messages, chatKey, chatSetMessages, isLoading])

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

    // 创建新的 AbortController 并在开始前中止上一次的
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

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
        abortRef.current = null
        // 标记消息为生成失败
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: m.content || '', status: 'error' }
              : m
          )
        )
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
    }, { signal: controller.signal })
  }, [isLoading, messages, systemPrompt, onReportGenerated])

  const handleSend = useCallback(() => {
    sendMessage(input)
  }, [input, sendMessage])

  // 自动发送初始查询：仅在 chatStore 中没有任何历史消息时才发送
  useEffect(() => {
    if (
      initialQuery &&
      isHydrated.current &&
      messages.length === 0 &&
      getStoreMessages(chatKey).length === 0
    ) {
      sendMessage(initialQuery)
    }
  }, [initialQuery, messages.length, sendMessage, chatKey, getStoreMessages])

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
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-scroll space-y-4 px-1" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }} tabIndex={0}>
        {/* 历史消息提示 */}
        {getStoreMessages(chatKey).length > 0 && messages.length > 0 && !isLoading && (
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-[10px] text-muted-foreground/60">已恢复历史对话</span>
            <button
              onClick={() => {
                chatClearMessages(chatKey)
                setMessages([])
              }}
              className="text-[10px] text-muted-foreground/40 hover:text-destructive/70 transition-colors flex items-center gap-0.5"
            >
              <Trash2 className="h-2.5 w-2.5" />
              清除
            </button>
          </div>
        )}
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
                    <ReactMarkdown>{stripActionTags(msg.content, isLoading)}</ReactMarkdown>
                  </div>
                ) : msg.status === 'error' ? (
                  <div className="flex items-center gap-1.5 text-destructive text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>生成失败，请重试</span>
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

// 从 AI 回复中剥离 [ACTION:...]...[/ACTION] 标签，避免在消息气泡中显示原始标记
function stripActionTags(content: string, streaming = false): string {
  let result = content
    // 先移除完整的 [ACTION:...]...[/ACTION] 标签
    .replace(/\[ACTION:\w+\][\s\S]*?\[\/ACTION\]/g, '')
  // 流式生成期间不移除未关闭的标签，避免正常内容被误删导致闪烁
  if (!streaming) {
    result = result
      // 再移除未关闭的 [ACTION:...] 标签
      .replace(/\[ACTION:\w+\][\s\S]*/g, '')
  }
  return result
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
