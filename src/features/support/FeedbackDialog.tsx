import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileWarning,
  LoaderCircle,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { useAuth } from '@/auth/authContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  confirmProductSupportTicketResolved,
  getMyProductSupportTicket,
  listMyProductSupportTickets,
  mapProductSupportError,
  reopenProductSupportTicket,
  replyToMyProductSupportTicket,
  submitProductSupportTicket,
} from './supportApi'
import {
  collectTrackerSupportDiagnostics,
  supportDiagnosticsPreview,
} from './supportDiagnostics'
import {
  emptySupportTicketDraft,
  supportCategoryOptions,
  supportImpactOptions,
  supportStatusLabels,
  type SupportTicket,
  type SupportTicketDetail,
  type SupportTicketDraft,
  type SupportTicketStatus,
} from './supportTypes'
import {
  canPersistSupportDraft,
  guestSupportDraftStorageKey,
  legacySupportDraftStorageKey,
  supportDraftClaimKey,
  trackerSupportDraftStorageKey,
} from './supportDraftStorage'

export type FeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: string
  theme: 'light' | 'dark' | 'system'
  onRequestLogin?: () => void
}

function requestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `tracker-feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readDraft(storageKey: string, claimGuestDraft = false): SupportTicketDraft {
  const fallback = emptySupportTicketDraft(requestId())
  try {
    let serialized = localStorage.getItem(storageKey)
    if (!serialized && storageKey === guestSupportDraftStorageKey) {
      serialized = localStorage.getItem(legacySupportDraftStorageKey)
      if (serialized) {
        localStorage.setItem(storageKey, serialized)
        localStorage.removeItem(legacySupportDraftStorageKey)
      }
    }
    if (!serialized && claimGuestDraft && sessionStorage.getItem(supportDraftClaimKey) === 'pending') {
      serialized = localStorage.getItem(guestSupportDraftStorageKey)
      if (serialized) {
        localStorage.setItem(storageKey, serialized)
        localStorage.removeItem(guestSupportDraftStorageKey)
      }
      sessionStorage.removeItem(supportDraftClaimKey)
    }
    const parsed = JSON.parse(serialized || 'null') as Partial<SupportTicketDraft> | null
    if (!parsed || typeof parsed !== 'object') return fallback
    const category = supportCategoryOptions.some(option => option.id === parsed.category)
      ? parsed.category!
      : fallback.category
    const impact = supportImpactOptions.some(option => option.id === parsed.impact)
      ? parsed.impact!
      : fallback.impact
    return {
      ...fallback,
      ...parsed,
      category,
      impact,
      clientRequestId: typeof parsed.clientRequestId === 'string' && parsed.clientRequestId
        ? parsed.clientRequestId
        : fallback.clientRequestId,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : fallback.savedAt,
    }
  } catch {
    return fallback
  }
}

function formatTime(value: string): string {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function categoryLabel(ticket: SupportTicket): string {
  return supportCategoryOptions.find(option => option.id === ticket.category)?.label || '其他问题'
}

function statusBadgeVariant(status: SupportTicketStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'waiting_user') return 'outline'
  if (status === 'resolved' || status === 'closed') return 'secondary'
  if (status === 'new') return 'default'
  return 'outline'
}

function ticketSummary(ticket: SupportTicket): string {
  return `${categoryLabel(ticket)} · #${ticket.displayNo}`
}

function mergeTicket(tickets: SupportTicket[], ticket: SupportTicket): SupportTicket[] {
  const withoutUpdated = tickets.filter(item => item.id !== ticket.id)
  return [ticket, ...withoutUpdated].sort((left, right) =>
    (right.lastActivityAt || right.createdAt).localeCompare(left.lastActivityAt || left.createdAt),
  )
}

export function FeedbackDialog({
  open,
  onOpenChange,
  page,
  theme,
  onRequestLogin,
}: FeedbackDialogProps) {
  const { status: authStatus, user } = useAuth()
  const authenticated = authStatus === 'signed-in' && Boolean(user?.id)
  const titleId = useId()
  const submitTitleId = useId()
  const { current: initialDraftKey } = useRef(trackerSupportDraftStorageKey(user?.id, authenticated))
  const [tab, setTab] = useState<'submit' | 'mine'>('submit')
  const [draft, setDraft] = useState(() => readDraft(initialDraftKey, authenticated))
  const [draftLoadedStorageKey, setDraftLoadedStorageKey] = useState(initialDraftKey)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccessNo, setSubmitSuccessNo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [ticketCursor, setTicketCursor] = useState<{ lastActivityAt: string; id: string } | null>(null)
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketsLoadingMore, setTicketsLoadingMore] = useState(false)
  const [ticketsError, setTicketsError] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [ticketDetail, setTicketDetail] = useState<SupportTicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [reopenBody, setReopenBody] = useState('')
  const loadedDraftStorageKey = useRef(initialDraftKey)
  const ticketCursorRef = useRef<{ lastActivityAt: string; id: string } | null>(null)
  const ticketsRequestSequence = useRef(0)
  const detailRequestSequence = useRef(0)

  const draftStorageKey = trackerSupportDraftStorageKey(user?.id, authenticated)
  const diagnostics = useMemo(() => collectTrackerSupportDiagnostics({
    page,
    theme,
    currentFlow: tab === 'mine' ? 'support.my_feedback' : 'support.submit',
  }), [page, tab, theme])
  const isDetailedCategory = draft.category === 'bug' || draft.category === 'sync'

  useEffect(() => {
    if (loadedDraftStorageKey.current === draftStorageKey) return
    loadedDraftStorageKey.current = draftStorageKey
    setDraft(readDraft(draftStorageKey, authenticated))
    setDraftLoadedStorageKey(draftStorageKey)
    setSubmitError('')
    setSubmitSuccessNo('')
  }, [authenticated, draftStorageKey])

  useEffect(() => {
    // Do not write the prior user's in-memory draft into the next account's
    // storage key during the one render where authentication has just changed.
    if (!canPersistSupportDraft(draftLoadedStorageKey, draftStorageKey)) return
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify({
        ...draft,
        savedAt: new Date().toISOString(),
      }))
    } catch {
      // The form stays usable in private storage-restricted browser sessions.
    }
  }, [draft, draftLoadedStorageKey, draftStorageKey])

  useEffect(() => {
    if (isDetailedCategory) return
    setDetailsOpen(false)
  }, [isDetailedCategory])

  useEffect(() => {
    if (open) return
    ticketsRequestSequence.current += 1
    detailRequestSequence.current += 1
  }, [open])

  const loadTickets = useCallback(async (append = false) => {
    if (!authenticated) {
      setTickets([])
      setTicketCursor(null)
      ticketCursorRef.current = null
      setTicketsError('')
      return
    }

    const sequence = ++ticketsRequestSequence.current
    if (append) setTicketsLoadingMore(true)
    else setTicketsLoading(true)
    setTicketsError('')
    try {
      const result = await listMyProductSupportTickets({
        limit: 20,
        beforeActivityAt: append ? ticketCursorRef.current?.lastActivityAt : null,
        beforeId: append ? ticketCursorRef.current?.id : null,
      })
      if (sequence !== ticketsRequestSequence.current) return
      setTickets(previous => {
        if (!append) return result.tickets
        const known = new Set(previous.map(ticket => ticket.id))
        return [...previous, ...result.tickets.filter(ticket => !known.has(ticket.id))]
      })
      setTicketCursor(result.nextCursor)
      ticketCursorRef.current = result.nextCursor
    } catch (error) {
      if (sequence === ticketsRequestSequence.current) setTicketsError(mapProductSupportError(error).message)
    } finally {
      if (sequence === ticketsRequestSequence.current) {
        if (append) setTicketsLoadingMore(false)
        else setTicketsLoading(false)
      }
    }
  }, [authenticated])

  useEffect(() => {
    if (!open || tab !== 'mine' || !authenticated) return
    void loadTickets(false)
  }, [authenticated, loadTickets, open, tab])

  const updateDraft = <Key extends keyof SupportTicketDraft>(key: Key, value: SupportTicketDraft[Key]) => {
    setDraft(current => ({
      ...current,
      [key]: value,
      savedAt: new Date().toISOString(),
    }))
    setSubmitError('')
    setSubmitSuccessNo('')
  }

  const requestLogin = () => {
    try {
      sessionStorage.setItem(supportDraftClaimKey, 'pending')
    } catch {
      // The guest draft remains available in this browser even if handoff state cannot persist.
    }
    onRequestLogin?.()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    if (!authenticated) {
      setSubmitError('请先登录 Lexi 账号，再提交问题反馈。')
      return
    }
    if (!navigator.onLine) {
      setSubmitError('当前处于离线状态，请恢复网络后再提交。')
      return
    }
    const title = draft.title.trim()
    const description = draft.description.trim()
    if (title.length < 4) {
      setSubmitError('请用至少 4 个字概括问题。')
      return
    }
    if (description.length < 10) {
      setSubmitError('请补充至少 10 个字的详细描述。')
      return
    }

    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccessNo('')
    try {
      const detail = await submitProductSupportTicket({
        category: draft.category,
        impact: draft.impact,
        title,
        description,
        reproduction: draft.reproduction.trim(),
        expected: draft.expected.trim(),
        actual: draft.actual.trim(),
        includeDiagnostics: draft.includeDiagnostics,
        diagnostics: draft.includeDiagnostics ? diagnostics : null,
        sourcePage: diagnostics.page,
        buildSha: diagnostics.buildSha,
        clientRequestId: draft.clientRequestId,
      })
      setTickets(previous => mergeTicket(previous, detail.ticket))
      setSubmitSuccessNo(detail.ticket.displayNo)
      setDraft(emptySupportTicketDraft(requestId()))
      setDetailsOpen(false)
      setDiagnosticsOpen(false)
    } catch (error) {
      setSubmitError(mapProductSupportError(error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const openTicket = async (ticketId: string) => {
    if (actionBusy) return
    const sequence = ++detailRequestSequence.current
    setSelectedTicketId(ticketId)
    setTicketDetail(null)
    setDetailError('')
    setDetailLoading(true)
    setReplyBody('')
    setReopenBody('')
    try {
      const detail = await getMyProductSupportTicket(ticketId)
      if (sequence !== detailRequestSequence.current) return
      setTicketDetail(detail)
      setTickets(previous => mergeTicket(previous, detail.ticket))
    } catch (error) {
      if (sequence === detailRequestSequence.current) setDetailError(mapProductSupportError(error).message)
    } finally {
      if (sequence === detailRequestSequence.current) setDetailLoading(false)
    }
  }

  const backToTickets = () => {
    detailRequestSequence.current += 1
    setSelectedTicketId(null)
    setTicketDetail(null)
    setDetailError('')
    setReplyBody('')
    setReopenBody('')
  }

  const applyTicketDetail = (detail: SupportTicketDetail) => {
    setTicketDetail(detail)
    setTickets(previous => mergeTicket(previous, detail.ticket))
  }

  const reply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticketDetail || !replyBody.trim() || actionBusy) return
    setActionBusy(true)
    setDetailError('')
    try {
      applyTicketDetail(await replyToMyProductSupportTicket(ticketDetail.ticket.id, replyBody.trim()))
      setReplyBody('')
    } catch (error) {
      setDetailError(mapProductSupportError(error).message)
    } finally {
      setActionBusy(false)
    }
  }

  const confirmResolved = async () => {
    if (!ticketDetail || actionBusy) return
    setActionBusy(true)
    setDetailError('')
    try {
      applyTicketDetail(await confirmProductSupportTicketResolved(ticketDetail.ticket.id))
    } catch (error) {
      setDetailError(mapProductSupportError(error).message)
    } finally {
      setActionBusy(false)
    }
  }

  const reopen = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticketDetail || !reopenBody.trim() || actionBusy) return
    setActionBusy(true)
    setDetailError('')
    try {
      applyTicketDetail(await reopenProductSupportTicket(ticketDetail.ticket.id, reopenBody.trim()))
      setReopenBody('')
    } catch (error) {
      setDetailError(mapProductSupportError(error).message)
    } finally {
      setActionBusy(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (submitting || actionBusy)) return
    onOpenChange(nextOpen)
  }

  const selectedTicket = ticketDetail?.ticket
  const timeline = selectedTicket
    ? [
        ...ticketDetail.messages.map(message => ({ type: 'message' as const, value: message })),
        ...ticketDetail.events.map(event => ({ type: 'event' as const, value: event })),
      ].sort((left, right) => left.value.createdAt.localeCompare(right.value.createdAt))
    : []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="bottom-0 left-0 top-auto max-h-[92dvh] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-b-none rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[min(88dvh,56rem)] sm:max-h-[88dvh] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
      >
        <DialogHeader className="border-b border-border/80 px-4 pb-3 pt-5 sm:px-5">
          <div className="flex items-start justify-between gap-3 pr-1">
            <div>
              <DialogTitle id={titleId} className="flex items-center gap-2 text-lg">
                <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <MessageCircleMore className="size-[18px]" />
                </span>
                问题反馈
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-lg leading-5">
                提交 Lexi Tracker 使用问题，并在这里查看处理进度。
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting || actionBusy}
              aria-label="关闭问题反馈"
              className="-mt-1 shrink-0"
            >
              <span aria-hidden="true" className="text-xl leading-none">×</span>
            </Button>
          </div>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            const nextTab = value === 'mine' ? 'mine' : 'submit'
            setTab(nextTab)
            if (nextTab !== 'mine') backToTickets()
          }}
          className="min-h-0 gap-0"
        >
          <div className="border-b border-border/80 px-4 pt-3 sm:px-5">
            <TabsList className="w-full" aria-label="问题反馈页面">
              <TabsTrigger value="submit" className="flex-1">提交反馈</TabsTrigger>
              <TabsTrigger value="mine" className="flex-1">
                我的反馈
                {tickets.some(ticket => ticket.unreadByUser) && (
                  <span className="size-1.5 rounded-full bg-primary" aria-label="有新回复" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="submit" className="min-h-0 overflow-y-auto px-4 pb-4 pt-4 sm:px-5">
            <form className="space-y-4" onSubmit={submit} aria-labelledby={submitTitleId}>
              <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p>
                  这条反馈会固定标记为 <b className="font-semibold text-foreground">Lexi Tracker</b>。诊断信息默认关闭，且不会包含账号、学习内容或本机存储数据。
                </p>
              </div>

              {!authenticated && (
                <section className="flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning-surface/45 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <UserRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">登录后可提交并查看回复</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">草稿会保留在这台设备；登录完成后重新打开反馈即可继续。</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={requestLogin} className="min-h-10 shrink-0 sm:w-auto">
                    登录账号
                  </Button>
                </section>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tracker-feedback-category">问题类型</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(value) => {
                      if (supportCategoryOptions.some(option => option.id === value)) {
                        updateDraft('category', value as SupportTicketDraft['category'])
                      }
                    }}
                  >
                    <SelectTrigger id="tracker-feedback-category" className="h-10 w-full">
                      <SelectValue>{supportCategoryOptions.find(option => option.id === draft.category)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {supportCategoryOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tracker-feedback-impact">影响程度</Label>
                  <Select
                    value={draft.impact}
                    onValueChange={(value) => {
                      if (supportImpactOptions.some(option => option.id === value)) {
                        updateDraft('impact', value as SupportTicketDraft['impact'])
                      }
                    }}
                  >
                    <SelectTrigger id="tracker-feedback-impact" className="h-10 w-full">
                      <SelectValue>{supportImpactOptions.find(option => option.id === draft.impact)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {supportImpactOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="tracker-feedback-title">一句话概括</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{draft.title.length}/120</span>
                </div>
                <Input
                  id="tracker-feedback-title"
                  value={draft.title}
                  maxLength={120}
                  onChange={(event) => updateDraft('title', event.target.value)}
                  placeholder="例如：移动端新增计划后首页没有刷新"
                  className="h-11 text-base md:text-sm"
                  aria-invalid={Boolean(submitError && draft.title.trim().length < 4)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label id={submitTitleId} htmlFor="tracker-feedback-description">详细描述</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">{draft.description.length}/8000</span>
                </div>
                <Textarea
                  id="tracker-feedback-description"
                  value={draft.description}
                  maxLength={8000}
                  rows={5}
                  onChange={(event) => updateDraft('description', event.target.value)}
                  placeholder="请说明发生了什么、在什么情况下发生，以及它对你的影响。"
                  aria-invalid={Boolean(submitError && draft.description.trim().length < 10)}
                />
              </div>

              {isDetailedCategory && (
                <section className="rounded-xl border border-border/80 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(value => !value)}
                    aria-expanded={detailsOpen}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground">补充复现信息</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">可选，但能帮助更快定位故障</span>
                    </span>
                    <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                  </button>
                  {detailsOpen && (
                    <div className="space-y-3 border-t border-border/80 p-3.5">
                      <div className="space-y-2">
                        <Label htmlFor="tracker-feedback-reproduction">复现步骤</Label>
                        <Textarea
                          id="tracker-feedback-reproduction"
                          rows={3}
                          maxLength={2000}
                          value={draft.reproduction}
                          onChange={(event) => updateDraft('reproduction', event.target.value)}
                          placeholder={'1. 打开…\n2. 点击…\n3. 出现…'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tracker-feedback-expected">期望结果</Label>
                        <Textarea
                          id="tracker-feedback-expected"
                          rows={2}
                          maxLength={2000}
                          value={draft.expected}
                          onChange={(event) => updateDraft('expected', event.target.value)}
                          placeholder="你原本希望发生什么？"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tracker-feedback-actual">实际结果</Label>
                        <Textarea
                          id="tracker-feedback-actual"
                          rows={2}
                          maxLength={2000}
                          value={draft.actual}
                          onChange={(event) => updateDraft('actual', event.target.value)}
                          placeholder="实际上发生了什么？"
                        />
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-xl border border-border/80 bg-background p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-medium text-foreground">附带脱敏诊断信息</h3>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">仅发送页面、设备环境与运行状态，不发送账号或学习内容。</p>
                    </div>
                  </div>
                  <Switch
                    checked={draft.includeDiagnostics}
                    onCheckedChange={(checked) => updateDraft('includeDiagnostics', checked)}
                    aria-label="附带脱敏诊断信息"
                  />
                </div>
                {draft.includeDiagnostics && (
                  <div className="mt-3 border-t border-border/80 pt-3">
                    <button
                      type="button"
                      onClick={() => setDiagnosticsOpen(value => !value)}
                      aria-expanded={diagnosticsOpen}
                      className="flex w-full items-center justify-between gap-3 text-left text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      查看将发送的 {supportDiagnosticsPreview(diagnostics).length} 项信息
                      <ChevronRight className={`size-4 transition-transform ${diagnosticsOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </button>
                    {diagnosticsOpen && (
                      <dl className="mt-3 grid gap-2 rounded-lg bg-muted/35 p-3 text-xs leading-5">
                        {supportDiagnosticsPreview(diagnostics).map(item => (
                          <div key={item.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                            <dt className="text-muted-foreground">{item.label}</dt>
                            <dd className="break-words text-foreground">{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
              </section>

              <div className="min-h-5" aria-live="polite" role="status">
                {submitSuccessNo && (
                  <p className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    反馈已提交，工单号 #{submitSuccessNo}。可在“我的反馈”中查看进度。
                  </p>
                )}
                {submitError && (
                  <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                    {submitError}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted-foreground">
                  {authenticated ? navigator.onLine ? '提交后可继续补充信息。' : '当前离线，草稿会保留。' : '草稿已保存在当前设备。'}
                </p>
                <Button type="submit" disabled={!authenticated || !navigator.onLine || submitting} aria-busy={submitting} className="min-h-10 w-full sm:w-auto">
                  {submitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {submitting ? '正在提交…' : '提交反馈'}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="mine" className="min-h-0 overflow-y-auto px-4 pb-4 pt-4 sm:px-5">
            {!authenticated && (
              <section className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-border/80 bg-muted/20 p-5 text-center">
                <UserRound className="size-7 text-primary" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-foreground">登录后查看反馈进度</h3>
                <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">登录后可以查看管理员回复、补充问题，或确认处理结果。</p>
                <Button type="button" className="mt-4 min-h-10" onClick={requestLogin}>登录账号</Button>
              </section>
            )}

            {authenticated && !selectedTicketId && (
              <section className="space-y-3" aria-live="polite">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">我的 Lexi Tracker 反馈</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">这里只显示从 Lexi Tracker 提交的工单。</p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void loadTickets(false)} disabled={ticketsLoading} aria-label="刷新我的反馈">
                    <RefreshCw className={ticketsLoading ? 'animate-spin' : ''} aria-hidden="true" />
                    刷新
                  </Button>
                </div>

                {ticketsLoading && !tickets.length && (
                  <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 text-sm text-muted-foreground">
                    <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
                    正在读取反馈记录…
                  </div>
                )}

                {!ticketsLoading && ticketsError && !tickets.length && (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-center">
                    <FileWarning className="mx-auto size-5 text-destructive" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-foreground">暂时无法读取反馈</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{ticketsError}</p>
                    <Button type="button" variant="outline" className="mt-3" onClick={() => void loadTickets(false)}>重新加载</Button>
                  </div>
                )}

                {!ticketsLoading && !ticketsError && !tickets.length && (
                  <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-border/80 bg-muted/20 p-5 text-center">
                    <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-foreground">还没有提交过反馈</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">遇到问题时，可切换到“提交反馈”告诉我们。</p>
                  </div>
                )}

                {tickets.length > 0 && (
                  <div className="space-y-2">
                    {tickets.map(ticket => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => void openTicket(ticket.id)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-border/80 bg-background p-3.5 text-left outline-none transition-colors hover:border-primary/25 hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={statusBadgeVariant(ticket.status)}>{supportStatusLabels[ticket.status]}</Badge>
                            {ticket.unreadByUser && <Badge variant="default">新回复</Badge>}
                          </span>
                          <strong className="mt-2 block truncate text-sm text-foreground">{ticket.title}</strong>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">{ticketSummary(ticket)} · {formatTime(ticket.lastActivityAt || ticket.createdAt)}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </button>
                    ))}
                    {ticketsError && <p className="text-xs text-destructive" role="alert">{ticketsError}</p>}
                    {ticketCursor && (
                      <Button type="button" variant="outline" className="min-h-10 w-full" onClick={() => void loadTickets(true)} disabled={ticketsLoadingMore}>
                        {ticketsLoadingMore && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                        {ticketsLoadingMore ? '正在加载…' : '加载更多'}
                      </Button>
                    )}
                  </div>
                )}
              </section>
            )}

            {authenticated && selectedTicketId && (
              <section className="space-y-4">
                <Button type="button" variant="ghost" size="sm" onClick={backToTickets} disabled={actionBusy} className="-ml-2">
                  <ChevronLeft aria-hidden="true" />
                  返回我的反馈
                </Button>

                {detailLoading && !ticketDetail && (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 text-sm text-muted-foreground">
                    <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
                    正在读取反馈详情…
                  </div>
                )}

                {!detailLoading && !ticketDetail && (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-center">
                    <FileWarning className="mx-auto size-5 text-destructive" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-foreground">无法打开这条反馈</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{detailError || '请稍后重试。'}</p>
                    <Button type="button" variant="outline" className="mt-3" onClick={() => void openTicket(selectedTicketId)}>重新加载</Button>
                  </div>
                )}

                {selectedTicket && (
                  <>
                    <article className="rounded-xl border border-border/80 bg-background p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusBadgeVariant(selectedTicket.status)}>{supportStatusLabels[selectedTicket.status]}</Badge>
                        <span className="text-xs text-muted-foreground">#{selectedTicket.displayNo} · {categoryLabel(selectedTicket)}</span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-foreground">{selectedTicket.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedTicket.description}</p>
                      {(selectedTicket.reproduction || selectedTicket.expected || selectedTicket.actual) && (
                        <dl className="mt-4 grid gap-3 border-t border-border/80 pt-4 text-sm">
                          {selectedTicket.reproduction && <div><dt className="font-medium text-foreground">复现步骤</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">{selectedTicket.reproduction}</dd></div>}
                          {selectedTicket.expected && <div><dt className="font-medium text-foreground">期望结果</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">{selectedTicket.expected}</dd></div>}
                          {selectedTicket.actual && <div><dt className="font-medium text-foreground">实际结果</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">{selectedTicket.actual}</dd></div>}
                        </dl>
                      )}
                      <footer className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/80 pt-3 text-xs text-muted-foreground">
                        <span>提交于 {formatTime(selectedTicket.createdAt)}</span>
                        {selectedTicket.diagnosticsIncluded && <span>已附脱敏诊断</span>}
                      </footer>
                    </article>

                    {selectedTicket.isDuplicate && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-surface/45 p-3.5 text-xs leading-5 text-muted-foreground">
                        <CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                        <p>这条反馈已合并处理。状态会随原工单更新，但不会展示其他用户的内容。</p>
                      </div>
                    )}

                    <section className="rounded-xl border border-border/80 bg-muted/15 p-4">
                      <h3 className="text-sm font-semibold text-foreground">处理进度与沟通</h3>
                      <div className="mt-3 space-y-2.5">
                        {timeline.length === 0 && (
                          <p className="rounded-lg border border-dashed border-border/80 bg-background px-3 py-4 text-center text-xs leading-5 text-muted-foreground">反馈已收到，管理员处理后会在这里回复。</p>
                        )}
                        {timeline.map(entry => entry.type === 'message' ? (
                          <article
                            key={`message-${entry.value.id}`}
                            className={`rounded-lg border p-3 ${entry.value.authorRole === 'admin' ? 'border-primary/20 bg-primary/5' : entry.value.authorRole === 'user' ? 'border-border/80 bg-background' : 'border-border/60 bg-muted/30'}`}
                          >
                            <header className="flex items-center justify-between gap-3 text-xs">
                              <b className="text-foreground">{entry.value.authorRole === 'admin' ? 'Lexi 管理员' : entry.value.authorRole === 'user' ? '我' : '系统'}</b>
                              <time className="shrink-0 text-muted-foreground">{formatTime(entry.value.createdAt)}</time>
                            </header>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{entry.value.body}</p>
                          </article>
                        ) : (
                          <div key={`event-${entry.value.id}`} className="flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground">
                            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" />
                            <span className="min-w-0 flex-1">{entry.value.summary || '处理状态已更新'}</span>
                            <time className="shrink-0">{formatTime(entry.value.createdAt)}</time>
                          </div>
                        ))}
                      </div>
                    </section>

                    {detailError && (
                      <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        {detailError}
                      </p>
                    )}

                    {!selectedTicket.isDuplicate && selectedTicket.status === 'resolved' && (
                      <section className="flex flex-col gap-3 rounded-xl border border-success/25 bg-success-surface/45 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">问题已经解决了吗？</h3>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">确认后工单将关闭；若问题仍存在，可以重新打开。</p>
                        </div>
                        <Button type="button" onClick={() => void confirmResolved()} disabled={actionBusy} className="min-h-10 shrink-0">
                          {actionBusy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                          {actionBusy ? '正在处理…' : '确认已解决'}
                        </Button>
                      </section>
                    )}

                    {!selectedTicket.isDuplicate && !['resolved', 'closed'].includes(selectedTicket.status) && (
                      <form className="space-y-3 rounded-xl border border-border/80 bg-background p-3.5" onSubmit={reply}>
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="tracker-feedback-reply">{selectedTicket.status === 'waiting_user' ? '补充管理员需要的信息' : '补充信息'}</Label>
                          <span className="text-xs tabular-nums text-muted-foreground">{replyBody.length}/4000</span>
                        </div>
                        <Textarea
                          id="tracker-feedback-reply"
                          rows={3}
                          maxLength={4000}
                          value={replyBody}
                          onChange={(event) => setReplyBody(event.target.value)}
                          placeholder="补充新的现象或回答管理员的问题…"
                        />
                        <div className="flex justify-end">
                          <Button type="submit" disabled={actionBusy || !replyBody.trim()} aria-busy={actionBusy}>
                            {actionBusy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                            {actionBusy ? '正在发送…' : '发送补充'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {!selectedTicket.isDuplicate && selectedTicket.status === 'resolved' && (
                      <form className="space-y-3 rounded-xl border border-warning/25 bg-warning-surface/35 p-3.5" onSubmit={reopen}>
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="tracker-feedback-reopen">问题仍然存在</Label>
                          <span className="text-xs tabular-nums text-muted-foreground">{reopenBody.length}/4000</span>
                        </div>
                        <Textarea
                          id="tracker-feedback-reopen"
                          rows={3}
                          maxLength={4000}
                          value={reopenBody}
                          onChange={(event) => setReopenBody(event.target.value)}
                          placeholder="请说明问题再次出现的情况…"
                        />
                        <div className="flex justify-end">
                          <Button type="submit" variant="outline" disabled={actionBusy || !reopenBody.trim()} aria-busy={actionBusy}>
                            {actionBusy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                            {actionBusy ? '正在处理…' : '重新打开工单'}
                          </Button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </section>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-4 py-3 sm:px-5">
          <p className="mr-auto hidden text-xs text-muted-foreground sm:block">反馈服务由 Lexi 统一管理</p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting || actionBusy} className="min-h-10 w-full sm:w-auto">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
