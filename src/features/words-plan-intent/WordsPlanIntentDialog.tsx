import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CalendarDays, Send, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
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
import type { LexiWordsStudyMode } from '@/contracts/lexiCrossProduct'
import { addLocalDays, isLocalDate, toLocalDate } from '@/lib/localDate'
import type { StudyPlan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { createWordsPlanIntent } from './wordsPlanIntent'

const MODE_LABELS: Record<LexiWordsStudyMode, string> = {
  mixed: '智能混合',
  review: '仅复习',
  new: '仅新词',
}

type Props = {
  open: boolean
  plan: StudyPlan | null
  userId: string | null
  wordsUrl: string | null
  preview?: boolean
  onOpenChange: (open: boolean) => void
}

function defaultTargetDate(plan: StudyPlan | null, today: string, lastDate: string): string {
  const scheduled = plan?.frequency === 'once' ? plan.scheduledDate : undefined
  return isLocalDate(scheduled) && scheduled >= today && scheduled <= lastDate ? scheduled : today
}

function defaultTargetCount(plan: StudyPlan | null): number {
  return Number.isSafeInteger(plan?.targetCount) && Number(plan?.targetCount) >= 1 && Number(plan?.targetCount) <= 1_000
    ? Number(plan?.targetCount)
    : 20
}

function newOperationId() {
  return crypto.randomUUID()
}

export function WordsPlanIntentDialog({
  open,
  plan,
  userId,
  wordsUrl,
  preview = false,
  onOpenChange,
}: Props) {
  const today = toLocalDate()
  const lastDate = addLocalDays(today, 29)
  const [targetDate, setTargetDate] = useState(today)
  const [targetCount, setTargetCount] = useState('20')
  const [studyMode, setStudyMode] = useState<LexiWordsStudyMode>('mixed')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const operationIdRef = useRef(newOperationId())
  const submittedFingerprintRef = useRef('')

  useEffect(() => {
    if (!open) return
    setTargetDate(defaultTargetDate(plan, today, lastDate))
    setTargetCount(String(defaultTargetCount(plan)))
    setStudyMode('mixed')
    setSaving(false)
    setError('')
    setSent(false)
    operationIdRef.current = newOperationId()
    submittedFingerprintRef.current = ''
  }, [lastDate, open, plan, today])

  const parsedCount = Number(targetCount)
  const dateInvalid = !isLocalDate(targetDate) || targetDate < today || targetDate > lastDate
  const countInvalid = !Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 1_000
  const canSubmit = Boolean(plan && !saving && !sent && !dateInvalid && !countInvalid && (userId || preview))
  const dateLabel = useMemo(() => {
    if (!isLocalDate(targetDate)) return '日期待确认'
    if (targetDate === today) return '今天'
    const [, month, day] = targetDate.split('-').map(Number)
    return `${month} 月 ${day} 日`
  }, [targetDate, today])

  const submit = async () => {
    if (!plan || !canSubmit) return
    const fingerprint = JSON.stringify({ targetDate, targetCount: parsedCount, studyMode, sourceRef: plan.id })
    if (submittedFingerprintRef.current && submittedFingerprintRef.current !== fingerprint) {
      operationIdRef.current = newOperationId()
    }
    submittedFingerprintRef.current = fingerprint
    setSaving(true)
    setError('')
    try {
      if (!preview) {
        await createWordsPlanIntent({
          userId: userId!,
          operationId: operationIdRef.current,
          targetDate,
          targetCount: parsedCount,
          studyMode,
          sourceRef: plan.id,
        })
      }
      setSent(true)
    } catch {
      setError('暂时无法确认发送状态。可先到 Words 查看；若未出现，保持当前内容重试也不会生成重复记录。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen) }}>
      <DialogContent className="flex max-h-[90dvh] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(92vw,34rem)]">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 md:px-6 md:py-5">
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5 text-primary" aria-hidden="true" />
            发送到 Words
          </DialogTitle>
          <DialogDescription className="leading-5">
            发送一条待确认的学习意图；Words 不会自动改动你的词书或进度。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-5 md:px-6">
          {sent ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">计划意图已送达</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {dateLabel} · {parsedCount} 词 · {MODE_LABELS[studyMode]}。请在 Words 选择词书并确认。
                    </p>
                  </div>
                </div>
              </div>
              {wordsUrl && (
                <a href={wordsUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants(), 'w-full')}>
                  打开 Words 查看
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-surface-subtle p-4">
                <p className="text-xs font-medium text-muted-foreground">当前 Tracker 计划</p>
                <p className="mt-1 break-words font-semibold text-foreground">{plan?.title || '词汇学习计划'}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  标题和备注不会发送；仅发送下方日期、词数、模式和不含正文的计划引用。
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="words-plan-date">目标日期</Label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="words-plan-date"
                      type="date"
                      min={today}
                      max={lastDate}
                      value={targetDate}
                      onChange={(event) => setTargetDate(event.target.value)}
                      disabled={saving}
                      className="pl-9"
                      aria-invalid={dateInvalid}
                    />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">最多提前 29 天发送，届时再由你确认。</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="words-plan-count">目标词数</Label>
                  <Input
                    id="words-plan-count"
                    type="number"
                    min={1}
                    max={1000}
                    inputMode="numeric"
                    value={targetCount}
                    onChange={(event) => setTargetCount(event.target.value)}
                    disabled={saving}
                    aria-invalid={countInvalid}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="words-plan-mode">学习模式</Label>
                  <Select value={studyMode} onValueChange={(value) => setStudyMode(value as LexiWordsStudyMode)} disabled={saving}>
                    <SelectTrigger id="words-plan-mode" className="w-full"><SelectValue>{MODE_LABELS[studyMode]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mixed">智能混合</SelectItem>
                      <SelectItem value="review">仅复习</SelectItem>
                      <SelectItem value="new">仅新词</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!userId && !preview && (
                <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200" role="status">
                  请先登录同一个 Lexi 账号，再发送到 Words。
                </p>
              )}
              {error && <p className="text-sm leading-5 text-destructive" role="alert">{error}</p>}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-4 py-4 md:px-6">
          {sent ? (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">完成</Button>
          ) : (
            <div className="grid w-full gap-2 sm:grid-cols-[auto_1fr]">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full">暂不发送</Button>
              <Button type="button" onClick={() => void submit()} disabled={!canSubmit} className="w-full">
                {saving ? '正在发送…' : '发送计划意图'}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
