import { useEffect } from 'react'
import { Clock3, Gauge, Loader2 } from 'lucide-react'

import {
  formatManagedAiQuotaResetAt,
  type ManagedAiQuotaState,
  useManagedAiQuota,
} from '@/ai/managedAiQuota'
import type { ManagedAiPurpose } from '@/ai/gateway'
import { useAuth } from '@/auth/authContext'
import { cn } from '@/lib/utils'

interface AiQuotaNoticeProps {
  purpose: ManagedAiPurpose
  active?: boolean
  /** A gateway request has been submitted; the displayed quota may be stale until it settles. */
  pending?: boolean
  onStateChange?: (state: ManagedAiQuotaState) => void
  /** Admission units consumed by the action currently shown in the dialog. */
  costUnits?: 1 | 2
  className?: string
}

/** A compact, truthful quota reminder shared by every managed-AI dialog. */
export function AiQuotaNotice({
  purpose,
  active = true,
  pending = false,
  onStateChange,
  costUnits = 1,
  className,
}: AiQuotaNoticeProps) {
  const { status: authStatus } = useAuth()
  const canReadQuota = active && authStatus === 'signed-in'
  const { state } = useManagedAiQuota(purpose, canReadQuota)
  useEffect(() => {
    onStateChange?.(state)
  }, [onStateChange, state])
  if (!canReadQuota || state.status === 'idle') return null

  if (state.status === 'unavailable') {
    return (
      <div
        className={cn('flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground', className)}
        role="status"
        aria-live="polite"
      >
        <Gauge className="size-3.5 shrink-0" aria-hidden="true" />
        暂时无法读取今日 AI 使用次数，不影响本次生成。
      </div>
    )
  }

  const quota = state.quota
  if (!quota) {
    return (
      <div
        className={cn('flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground', className)}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        正在读取今日 AI 使用次数…
      </div>
    )
  }

  if (!quota.enabled) {
    return (
      <div
        className={cn('flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200', className)}
        role="status"
        aria-live="polite"
      >
        <Gauge className="size-3.5 shrink-0" aria-hidden="true" />
        当前 AI 功能暂未开放。
      </div>
    )
  }

  const resetTime = quota.resetAt ? formatManagedAiQuotaResetAt(quota.resetAt) : null
  if (quota.remainingRequests !== null && quota.remainingRequests < costUnits) {
    return (
      <div
        className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200', className)}
        role="status"
        aria-live="polite"
      >
        <Gauge className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{costUnits === 2 && quota.remainingRequests === 1 ? '剩余额度不足以进行深度分析。' : '今日 AI 额度已用完。'}</span>
        {resetTime && (
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" aria-hidden="true" />
            于本地时间 {resetTime} 重置
          </span>
        )}
      </div>
    )
  }
  if (pending) {
    return (
      <div
        className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-primary/15 bg-primary/[0.045] px-3 py-2 text-xs text-muted-foreground', className)}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <span>请求已提交，额度仅临时占用；生成失败会自动恢复。</span>
        {resetTime && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span aria-hidden="true">·</span>
            <Clock3 className="size-3" aria-hidden="true" />
            于本地时间 {resetTime} 重置
          </span>
        )}
      </div>
    )
  }
  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-primary/15 bg-primary/[0.045] px-3 py-2 text-xs text-muted-foreground', className)}
      role="status"
      aria-live="polite"
    >
      {state.status === 'loading'
        ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        : <Gauge className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
      <span>
        今日还可使用 <strong className="font-semibold text-foreground">{quota.remainingRequests}</strong> / {quota.dailyRequestLimit} 个额度单位
      </span>
      {costUnits === 2 && <span className="font-medium text-primary">· 本次深度分析占 2 个单位</span>}
      <span>· 仅成功结果计入额度</span>
      {resetTime && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <span aria-hidden="true">·</span>
          <Clock3 className="size-3" aria-hidden="true" />
          于本地时间 {resetTime} 重置
        </span>
      )}
      {state.status === 'loading' && <span className="text-muted-foreground">更新中</span>}
    </div>
  )
}
