import {
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  TimerOff,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  LexiCrossProductHandoffStatus,
  LexiCrossProductHandoffV1,
} from '@/contracts/lexiCrossProduct'
import { cn } from '@/lib/utils'

const RECEIPT_PRESENTATION: Record<LexiCrossProductHandoffStatus, {
  label: string
  description: string
  className: string
  icon: typeof Clock3
}> = {
  pending: {
    label: '等待 Words 确认',
    description: '计划已送达，待你在 Words 选择词书并确认。',
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    icon: Clock3,
  },
  accepted: {
    label: 'Words 已接收',
    description: 'Words 已确认采用；具体词书与单词仍由 Words 管理。',
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Words 未采用',
    description: 'Words 未采用这次发送；可在词汇中心调整后重新发送。',
    className: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: XCircle,
  },
  expired: {
    label: '发送已过期',
    description: 'Words 未在有效期内处理；可在词汇中心重新发送。',
    className: 'border-border bg-muted/60 text-muted-foreground',
    icon: TimerOff,
  },
}

function formatReceiptTime(receipt: LexiCrossProductHandoffV1): string {
  const value = receipt.resolvedAt ?? receipt.createdAt
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed)
  return `${receipt.status === 'pending' ? '发送于' : '更新于'} ${formatted}`
}

export function WordsPlanReceiptBadge({
  receipt,
  className,
}: {
  receipt: LexiCrossProductHandoffV1 | null | undefined
  className?: string
}) {
  if (!receipt) return null
  const presentation = RECEIPT_PRESENTATION[receipt.status]
  const Icon = presentation.icon
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', presentation.className, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {presentation.label}
    </Badge>
  )
}

export function WordsPlanReceiptStatus({
  receipt,
  loading = false,
  error = '',
  onRefresh,
  className,
}: {
  receipt: LexiCrossProductHandoffV1 | null | undefined
  loading?: boolean
  error?: string
  onRefresh?: () => void
  className?: string
}) {
  const presentation = receipt ? RECEIPT_PRESENTATION[receipt.status] : null
  return (
    <div className={cn('rounded-xl border border-border/75 bg-background/70 px-3 py-2.5', className)}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Words 回执</span>
            {receipt && <WordsPlanReceiptBadge receipt={receipt} />}
            {!receipt && !loading && !error && (
              <Badge variant="outline" className="border-border bg-muted/40 text-xs text-muted-foreground">
                暂无近期回执
              </Badge>
            )}
            {loading && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                更新中
              </span>
            )}
          </div>
          <p className={cn(
            'mt-1 text-xs leading-5',
            error ? 'text-amber-800 dark:text-amber-200' : 'text-muted-foreground',
          )}>
            {error || presentation?.description || '目前没有可显示的 Words 确认结果；如需继续，可重新发送。'}
            {receipt && <span className="ml-1 whitespace-nowrap">{formatReceiptTime(receipt)}</span>}
          </p>
        </div>
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            disabled={loading}
            className="shrink-0 text-muted-foreground"
            aria-label="刷新 Words 确认状态"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}
