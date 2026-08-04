import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react'

import type { AiCommandReceipt, AiContextSnapshotV1 } from '@/ai/contracts'
import { AiGatewayError } from '@/ai/gateway'
import {
  learnerAiTaskCoordinator,
  learnerAiTaskKey,
  learnerAiTaskScopeKey,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import {
  createPlanCommandDrafts,
  parsePlanCreateCommandDraft,
} from '@/ai/planCommands'
import { parsePlanDraftV2, type PlanDraftV2 } from '@/ai/structuredOutputs'
import { useAuth } from '@/auth/authContext'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useChatStore, type ChatMessageRecord } from '@/stores/chatStore'
import { usePlanStore } from '@/stores/planStore'
import {
  setTrackerContentCloudLocation,
  type TrackerContentCloudMode,
} from '@/sync/trackerContentCloudPolicy'

import { AIConfirmCard } from './AIConfirmCard'
import { AILoadingState } from './AILoadingState'
import { AiQuotaNotice } from './AiQuotaNotice'
import { SafeAIContent } from './SafeAIContent'

interface AIChatPanelProps {
  createSnapshot: () => AiContextSnapshotV1
  placeholder?: string
  loadingText?: string
  className?: string
  initialQuery?: string
  suggestions?: string[]
  chatContext?: string
  quotaActive?: boolean
}

const MAX_USER_MESSAGE_LENGTH = 1_200
const MAX_GATEWAY_USER_INPUT_LENGTH = 2_000

function managedAccountScopeId(userId?: string): string {
  return `managed:${userId || 'signed-out'}`
}

function stripLegacyActionTags(content: string): string {
  return content
    .replace(/\[ACTION:\w+\][\s\S]*?\[\/ACTION\]/g, '')
    .replace(/\[ACTION:\w+\][\s\S]*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatPlanDraftContent(draft: PlanDraftV2): string {
  const sections = [`## ${draft.title}`, draft.summary]
  if (draft.evidence.length > 0) {
    sections.push(`### 依据\n${draft.evidence.map((item) => `- ${item}`).join('\n')}`)
  }
  if (draft.limitations.length > 0) {
    sections.push(`### 需要注意\n${draft.limitations.map((item) => `- ${item}`).join('\n')}`)
  }
  return sections.join('\n\n')
}

function conversationMessage(message: ChatMessageRecord): string {
  const content = stripLegacyActionTags(message.content)
  const planTitles = message.planDraft?.plans.map((plan) => plan.title).join('、')
  return [content, planTitles ? `草稿计划：${planTitles}` : ''].filter(Boolean).join('\n')
}

function buildBoundedUserInput(messages: readonly ChatMessageRecord[], current: string): string {
  const currentSection = `当前请求：\n${current}`
  const historyLines = messages
    .slice(-6)
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${conversationMessage(message)}`)
    .filter((line) => line.trim().length > 3)
  if (historyLines.length === 0) return currentSection

  const historyHeader = '最近对话（只用于理解当前请求）：\n'
  const available = Math.max(
    0,
    MAX_GATEWAY_USER_INPUT_LENGTH - currentSection.length - historyHeader.length - 2,
  )
  const history = historyLines.join('\n').slice(-available)
  return `${historyHeader}${history}\n\n${currentSection}`
}

function safeRestoredMessages(
  messages: readonly ChatMessageRecord[],
  hasLiveTask: boolean,
): ChatMessageRecord[] {
  return messages.map((message) => {
    let planDraft: PlanDraftV2 | undefined
    try {
      planDraft = message.planDraft ? parsePlanDraftV2(message.planDraft) : undefined
    } catch {
      planDraft = undefined
    }
    const commandDrafts = planDraft && Array.isArray(message.commandDrafts)
      ? message.commandDrafts.flatMap((command) => {
          try {
            return [parsePlanCreateCommandDraft(command)]
          } catch {
            return []
          }
        }).slice(0, 4)
      : []
    const staleStreaming = message.status === 'streaming' && !hasLiveTask
    return {
      id: message.id,
      role: message.role,
      content: staleStreaming
        ? '浏览器已重新加载，上一条 AI 请求的结果未确认。请重新发送。'
        : stripLegacyActionTags(message.content),
      createdAt: message.createdAt,
      status: staleStreaming ? 'error' : message.status,
      ...(planDraft ? { planDraft } : {}),
      ...(commandDrafts.length > 0 ? { commandDrafts } : {}),
    }
  })
}

export function AIChatPanel({
  createSnapshot,
  placeholder = '描述你想安排的学习计划…',
  loadingText = '正在整理计划草稿',
  className,
  initialQuery,
  suggestions,
  chatContext = 'plans',
  quotaActive = true,
}: AIChatPanelProps) {
  const { user } = useAuth()
  const artifactAccess = useAiArtifactAccess()
  const getStoreMessages = useChatStore((state) => state.getMessages)
  const chatSetMessages = useChatStore((state) => state.setMessages)
  const chatClearMessages = useChatStore((state) => state.clearMessages)
  const receipts = usePlanStore((state) => state.aiCommandReceipts)
  const applyConfirmedAiPlanDraft = usePlanStore((state) => state.applyConfirmedAiPlanDraft)
  const rejectAiPlanDraft = usePlanStore((state) => state.rejectAiPlanDraft)

  const [messages, setMessages] = useState<ChatMessageRecord[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set())
  const [draftCloudModes, setDraftCloudModes] = useState<Record<string, TrackerContentCloudMode>>({})
  const [transientReceipts, setTransientReceipts] = useState<Record<string, AiCommandReceipt>>({})
  const [hydratedKey, setHydratedKey] = useState('')

  const messagesRef = useRef<ChatMessageRecord[]>([])
  const applyingRef = useRef<Set<string>>(new Set())
  const currentChatKeyRef = useRef('')
  const mountedRef = useRef(true)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isUserScrolledUp = useRef(false)
  const currentScopeId = managedAccountScopeId(user?.id)
  const chatKey = `${chatContext}:${currentScopeId}`
  currentChatKeyRef.current = chatKey
  const taskScopeKey = learnerAiTaskScopeKey(artifactAccess)
  const taskKey = taskScopeKey
    ? learnerAiTaskKey('plan_draft', taskScopeKey, chatContext)
    : null
  const { tasks } = useLearnerAiTaskState()
  const activeTask = taskKey ? tasks[taskKey] : undefined
  const isLoading = activeTask?.status === 'running' || activeTask?.status === 'stopping'

  const receiptByKey = useMemo(() => {
    const index = new Map<string, AiCommandReceipt>()
    receipts.forEach((receipt) => {
      if (!index.has(receipt.idempotencyKey)) index.set(receipt.idempotencyKey, receipt)
    })
    return index
  }, [receipts])

  useEffect(() => {
    const restored = safeRestoredMessages(getStoreMessages(chatKey), isLoading)
    setMessages(restored)
    messagesRef.current = restored
    setHydratedKey(chatKey)
  // `chatKey` is the persisted conversation boundary. Task completions write
  // through the same store directly, so a route remount hydrates the current
  // result without relying on a component that may already be gone.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatKey, getStoreMessages])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current
    if (!container) return
    if (force) isUserScrolledUp.current = false
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
  }, [])

  useEffect(() => {
    if (!isUserScrolledUp.current) scrollToBottom()
  }, [messages, receipts, scrollToBottom])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [input])

  const sendMessage = useCallback((content: string) => {
    const trimmed = content.trim().slice(0, MAX_USER_MESSAGE_LENGTH)
    if (!trimmed || isLoading) return
    if (!taskScopeKey || !taskKey || artifactAccess.status === 'locked') {
      setError(
        artifactAccess.status === 'locked' && artifactAccess.reason === 'account-mismatch'
          ? '本机学习记录属于另一个 Lexi 账号，暂时不能使用 AI 计划助手。'
          : '暂时无法安全确认本机学习记录归属，请先处理账号状态后再试。',
      )
      return
    }

    const snapshot = createSnapshot()
    const requestAccountScopeId = currentScopeId
    const history = messagesRef.current
    const userMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
      status: 'done',
    }
    const assistantMessageId = crypto.randomUUID()
    const assistantMessage: ChatMessageRecord = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
    }
    const nextMessages = [...history, userMessage, assistantMessage].slice(-10)
    messagesRef.current = nextMessages
    setMessages(nextMessages)
    try {
      chatSetMessages(chatKey, nextMessages)
    } catch {
      const message = '对话暂时无法保存到本机，本次没有发送 AI 请求。'
      const failedMessages = nextMessages.map((item) => (
        item.id === assistantMessageId ? { ...item, content: message, status: 'error' as const } : item
      ))
      messagesRef.current = failedMessages
      setMessages(failedMessages)
      setError(message)
      return
    }
    setInput('')
    setError('')
    scrollToBottom(true)

    const updateConversation = (updater: (previous: ChatMessageRecord[]) => ChatMessageRecord[]) => {
      const previous = useChatStore.getState().getMessages(chatKey)
      const next = updater(previous).slice(-10)
      try {
        useChatStore.getState().setMessages(chatKey, next)
      } catch {
        if (mountedRef.current && currentChatKeyRef.current === chatKey) {
          setError('对话暂时无法保存到本机；已生成的计划仍需逐条确认。')
        }
        return false
      }
      if (mountedRef.current && currentChatKeyRef.current === chatKey) {
        messagesRef.current = next
        setMessages(next)
      }
      return true
    }

    void learnerAiTaskCoordinator.start({
      key: taskKey,
      purpose: 'plan_draft',
      scopeKey: taskScopeKey,
      label: '学习计划草稿',
      returnPath: '/plans',
      context: { chatKey, assistantMessageId },
      request: {
        purpose: 'plan_draft',
        snapshot,
        userInput: buildBoundedUserInput(history, trimmed),
      },
      onSuccess: (result) => {
        let draft: PlanDraftV2
        try {
          draft = parsePlanDraftV2(result.content)
        } catch {
          throw new AiGatewayError('INVALID_RESPONSE', 'AI 返回的计划格式不完整，请重新生成。', true)
        }
        const runId = result.run?.runId ?? crypto.randomUUID()
        const commandDrafts = createPlanCommandDrafts(draft, runId, {
          context: {
            snapshotId: snapshot.snapshotId,
            contextHash: snapshot.contextHash,
            sourceRevision: snapshot.sourceRevision,
            routeMode: 'managed',
            accountScopeId: requestAccountScopeId,
          },
        })
        if (!updateConversation((previous) => previous.map((message) => (
          message.id === assistantMessageId
            ? {
                ...message,
                content: formatPlanDraftContent(draft),
                status: 'done',
                planDraft: draft,
                commandDrafts,
            }
          : message
        )))) {
          throw new Error('chat persistence failed')
        }
      },
    }).then((completedTask) => {
      if (completedTask.status === 'succeeded') return
      const message = completedTask.failure?.message ?? 'AI 计划暂时无法生成，请稍后重试。'
      updateConversation((previous) => previous.map((item) => (
        item.id === assistantMessageId
          ? { ...item, content: message, status: 'error' }
          : item
      )))
      if (mountedRef.current && currentChatKeyRef.current === chatKey) setError(message)
    })
  }, [artifactAccess, chatKey, chatSetMessages, createSnapshot, currentScopeId, isLoading, scrollToBottom, taskKey, taskScopeKey])

  useEffect(() => {
    if (
      initialQuery
      && hydratedKey === chatKey
      && messages.length === 0
      && getStoreMessages(chatKey).length === 0
    ) {
      void sendMessage(initialQuery)
    }
  }, [chatKey, getStoreMessages, hydratedKey, initialQuery, messages.length, sendMessage])

  const confirmDraft = useCallback(async (draft: NonNullable<ChatMessageRecord['commandDrafts']>[number]) => {
    if (applyingRef.current.has(draft.draftId)) return
    applyingRef.current.add(draft.draftId)
    setApplyingIds(new Set(applyingRef.current))
    try {
      const cloudMode = draftCloudModes[draft.draftId] ?? 'local'
      const receipt = await applyConfirmedAiPlanDraft(draft, {
        routeMode: 'managed',
        accountScopeId: currentScopeId,
      })
      // Only the first successful confirmation creates a new plan. A duplicate
      // confirmation must never overwrite an existing plan's storage choice.
      if (receipt.status === 'applied' && receipt.targetId) {
        setTrackerContentCloudLocation({
          entityKind: 'study_plan',
          entityId: receipt.targetId,
          mode: cloudMode,
        })
      }
      setTransientReceipts((current) => ({ ...current, [draft.draftId]: receipt }))
    } finally {
      applyingRef.current.delete(draft.draftId)
      setApplyingIds(new Set(applyingRef.current))
    }
  }, [applyConfirmedAiPlanDraft, currentScopeId, draftCloudModes])

  const rejectDraft = useCallback(async (draft: NonNullable<ChatMessageRecord['commandDrafts']>[number]) => {
    if (applyingRef.current.has(draft.draftId)) return
    applyingRef.current.add(draft.draftId)
    setApplyingIds(new Set(applyingRef.current))
    try {
      const receipt = await rejectAiPlanDraft(draft)
      setTransientReceipts((current) => ({ ...current, [draft.draftId]: receipt }))
    } finally {
      applyingRef.current.delete(draft.draftId)
      setApplyingIds(new Set(applyingRef.current))
    }
  }, [rejectAiPlanDraft])

  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    isUserScrolledUp.current = (
      container.scrollHeight - container.scrollTop - container.clientHeight > 60
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <AiQuotaNotice purpose="plan_draft" active={quotaActive} className="mb-2" />
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        tabIndex={0}
      >
        {messages.length > 0 && !isLoading && (
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-[10px] text-muted-foreground/60">计划草稿保存在这台设备</span>
            <button
              type="button"
              onClick={() => {
                chatClearMessages(chatKey)
                setMessages([])
                messagesRef.current = []
                setDraftCloudModes({})
              }}
              className="flex min-h-8 items-center gap-1 rounded-md px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              清除对话
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Sparkles className="mb-2 h-8 w-8 text-indigo-400" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">先说清楚你想怎么学</p>
            <p className="mt-1 max-w-xs text-xs leading-5">
              AI 只会生成草稿。分类、频率和目标会完整展示，由你逐条确认后才加入计划。
            </p>
            {suggestions && suggestions.length > 0 && (
              <div className="mt-4 w-full max-w-sm space-y-2">
                {suggestions.slice(0, 4).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className="min-h-11 w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-left text-xs leading-5 hover:border-indigo-300 hover:bg-indigo-50/60 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-2', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {message.role === 'assistant' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
            )}

            <div className={cn(
              'min-w-0 text-sm',
              message.role === 'user'
                ? 'max-w-[85%] rounded-[20px_6px_20px_20px] bg-indigo-600 px-3.5 py-2.5 text-white'
                : 'w-full max-w-[calc(100%-2.25rem)] space-y-3 rounded-[6px_20px_20px_20px] border border-indigo-200/70 bg-indigo-50/70 px-3.5 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/20',
            )}>
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              ) : message.status === 'streaming' ? (
                <AILoadingState text={loadingText} />
              ) : message.status === 'error' ? (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{message.content || '这次没有生成可用草稿，请重新发送。'}</span>
                </div>
              ) : (
                <SafeAIContent content={message.content} />
              )}

              {message.role === 'assistant' && message.commandDrafts && message.commandDrafts.length > 0 && (
                <div className="space-y-2.5 border-t border-indigo-200/70 pt-3 dark:border-indigo-900/50">
                  <div>
                    <p className="text-xs font-semibold">待确认计划</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      确认只影响当前这一项；重复点击不会创建第二份计划。
                    </p>
                  </div>
                  {message.commandDrafts.map((draft) => {
                    const receipt = transientReceipts[draft.draftId]
                      ?? receiptByKey.get(draft.idempotencyKey)
                    const cloudMode = draftCloudModes[draft.draftId] ?? 'local'
                    return (
                      <AIConfirmCard
                        key={draft.draftId}
                        draft={draft}
                        receipt={receipt}
                        applying={applyingIds.has(draft.draftId)}
                        cloudMode={cloudMode}
                        onCloudModeChange={(mode) => {
                          setDraftCloudModes((current) => ({ ...current, [draft.draftId]: mode }))
                        }}
                        onConfirm={() => confirmDraft(draft)}
                        onReject={() => rejectDraft(draft)}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {message.role === 'user' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="mt-2 border-t pt-2">
        {suggestions && suggestions.length > 0 && messages.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void sendMessage(suggestion)}
                className="min-h-9 shrink-0 rounded-full border border-border/60 bg-background px-3 text-xs text-muted-foreground hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, MAX_USER_MESSAGE_LENGTH))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage(input)
              }
            }}
            placeholder={placeholder}
            className="max-h-[120px] min-h-11 resize-none text-sm"
            rows={1}
            maxLength={MAX_USER_MESSAGE_LENGTH}
          />
          <Button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-11 w-11 shrink-0 bg-indigo-600 text-white hover:bg-indigo-700"
            aria-label="发送计划请求"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-muted-foreground/70">
          <span>Enter 发送 · Shift+Enter 换行</span>
          <span>{input.length}/{MAX_USER_MESSAGE_LENGTH}</span>
        </div>
      </div>
    </div>
  )
}
