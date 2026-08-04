import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  RotateCcw,
  X,
} from 'lucide-react'

import type { AiCommandReceipt } from '@/ai/contracts'
import type { PlanCreateCommandDraft } from '@/ai/planCommands'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { isLocalDate } from '@/lib/localDate'
import { cn } from '@/lib/utils'

interface AIConfirmCardProps {
  draft: PlanCreateCommandDraft
  receipt?: AiCommandReceipt
  applying?: boolean
  onConfirm: () => void
  onReject: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
  vocabulary: '词汇',
  general: '综合',
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatScheduleDate(value: string | null): string | null {
  if (!isLocalDate(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

function scheduleLabel(draft: PlanCreateCommandDraft): string {
  const payload = draft.payload
  if (payload.frequency === 'once') {
    const scheduledDate = formatScheduleDate(payload.scheduledDate)
    return scheduledDate ? `单次任务 · ${scheduledDate}` : '单次任务 · 日期待确认'
  }

  const startDate = formatScheduleDate(payload.startDate)
  const endDate = formatScheduleDate(payload.endDate)
  const dateRange = [
    startDate ? `自 ${startDate} 起` : null,
    endDate ? `至 ${endDate}` : null,
  ].filter(Boolean).join('，')

  if (payload.frequency === 'daily') {
    return `重复计划 · 每日${dateRange ? ` · ${dateRange}` : ''}`
  }

  const weekDays = payload.weekDays
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .map((day) => WEEKDAY_LABELS[day])
    .join('、')
  return `重复计划 · ${weekDays || '每周'}${dateRange ? ` · ${dateRange}` : ''}`
}

function receiptMessage(receipt: AiCommandReceipt): string {
  if (receipt.status === 'applied') return '已加入学习计划'
  if (receipt.status === 'duplicate') return '已存在，未重复添加'
  if (receipt.status === 'rejected') return '已忽略这条草稿'
  if (receipt.status === 'stale') return '草稿已过期，请重新生成'
  if (receipt.status === 'scope_mismatch') return '账号或 AI 来源已变化，请重新生成'
  return receipt.error?.message || '保存失败，请重试'
}

export function AIConfirmCard({
  draft,
  receipt,
  applying = false,
  onConfirm,
  onReject,
}: AIConfirmCardProps) {
  const payload = draft.payload
  const completed = receipt?.status === 'applied' || receipt?.status === 'duplicate'
  const rejected = receipt?.status === 'rejected'
  const blocked = receipt?.status === 'stale' || receipt?.status === 'scope_mismatch'
  const failed = receipt?.status === 'failed'
  const isFinal = completed || rejected || blocked

  return (
    <article className={cn(
      'rounded-xl border p-3.5 sm:p-4 transition-colors',
      completed && 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20',
      rejected && 'border-border bg-muted/30',
      blocked && 'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20',
      (!receipt || failed) && 'border-border bg-card',
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-sm font-semibold leading-5">{payload.title}</h4>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {CATEGORY_LABELS[payload.category] || '综合'}
            </Badge>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
            {payload.description}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-2.5 text-xs sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dt className="sr-only">执行频率</dt>
          <dd className="min-w-0 break-words">{scheduleLabel(draft)}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dt className="sr-only">时间与目标</dt>
          <dd className="min-w-0 break-words">
            {[
              payload.targetTime,
              payload.targetDuration ? `${payload.targetDuration} 分钟` : null,
              payload.targetCount ? `目标 ${payload.targetCount}` : null,
            ].filter(Boolean).join(' · ') || '时间与数量可稍后设置'}
          </dd>
        </div>
      </dl>

      {receipt && (
        <div className={cn(
          'mt-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs',
          completed && 'bg-emerald-100/70 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
          rejected && 'bg-muted text-muted-foreground',
          (blocked || failed) && 'bg-amber-100/70 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
        )} role={blocked || failed ? 'alert' : 'status'}>
          {completed ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : blocked || failed ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{receiptMessage(receipt)}</span>
        </div>
      )}

      {!isFinal && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onReject}
            disabled={applying}
            className="min-h-11 px-3 text-xs"
          >
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            忽略
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={applying}
            className="min-h-11 px-3 text-xs"
          >
            {failed ? (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {applying ? '正在保存…' : failed ? '重试保存' : '确认加入计划'}
          </Button>
        </div>
      )}
    </article>
  )
}
