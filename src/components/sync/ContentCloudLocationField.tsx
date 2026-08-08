import { useEffect } from 'react'
import { Cloud, HardDrive, LoaderCircle, RefreshCw } from 'lucide-react'

import { useAuth } from '@/auth/authContext'
import { cn } from '@/lib/utils'
import type { TrackerPhase4bEntityKind } from '@/sync/trackerPhase4bRecordSync'
import {
  readableTrackerContentCloudFailure,
  requestTrackerContentCloudPolicyRefresh,
  requestTrackerContentCloudSync,
  trackerContentCloudFailure,
  trackerContentCloudFirstFailureId,
  trackerContentCloudQuotaHasCapacity,
  trackerContentCloudTransferState,
  type TrackerContentCloudMode,
  type TrackerContentCloudSelectableKind,
  useTrackerContentCloudPolicyStore,
} from '@/sync/trackerContentCloudPolicy'

const EMPTY_POLICY_REFRESH = {
  phase: 'idle' as const,
  lastCheckedAt: null,
  lastErrorAt: null,
}

interface ContentCloudLocationFieldProps {
  entityKind: TrackerContentCloudSelectableKind
  entityId?: string | null
  value: TrackerContentCloudMode
  onValueChange: (value: TrackerContentCloudMode) => void
  disabled?: boolean
  /** Use the compact control when several selectable records share one view. */
  variant?: 'default' | 'compact'
  /** Plans use this for their dependent execution-record quota and failures. */
  relatedContent?: {
    entityKind: TrackerPhase4bEntityKind
    label: string
    unit: string
    count: number
    entityIds?: readonly string[]
  }
}

function quotaText(
  label: string,
  unit: string,
  quota: { remaining: number | null } | null,
): string | null {
  if (!quota) return null
  if (quota.remaining === null) return `${label}不设上限`
  return quota.remaining > 0
    ? `${label}还可上传 ${quota.remaining}${unit}`
    : `${label}额度已用完`
}

function quotaDescription(input: {
  entityKind: TrackerContentCloudSelectableKind
  quota: { remaining: number | null } | null
  relatedContent?: ContentCloudLocationFieldProps['relatedContent']
  relatedQuota: { remaining: number | null } | null
}): string | null {
  const own = quotaText(input.entityKind === 'study_plan' ? '计划' : '云端内容', '项', input.quota)
  const related = input.relatedContent
    ? quotaText(input.relatedContent.label, input.relatedContent.unit, input.relatedQuota)
    : null
  const planned = input.relatedContent && input.relatedContent.count > 0
    ? `本计划将同步 ${input.relatedContent.count}${input.relatedContent.unit}`
    : null
  return [own, related, planned].filter(Boolean).join('；') || null
}

/**
 * A compact, shared editor field. It only changes the form selection; the
 * parent saves the learner record first and then commits the cloud choice so
 * a failed local write never creates a phantom cloud operation.
 */
export function ContentCloudLocationField({
  entityKind,
  entityId,
  value,
  onValueChange,
  disabled = false,
  variant = 'default',
  relatedContent,
}: ContentCloudLocationFieldProps) {
  const { status, managedAiDataBinding } = useAuth()
  const cloudReady = status === 'signed-in' && managedAiDataBinding.status === 'bound'
  const selectiveCloudAvailability = useTrackerContentCloudPolicyStore((state) => (
    state.selectiveCloudAvailableByScope[state.activeScope]
  ))
  const quota = useTrackerContentCloudPolicyStore((state) => (
    state.quotaByScope[state.activeScope]?.[entityKind] ?? null
  ))
  const policyRefresh = useTrackerContentCloudPolicyStore((state) => (
    state.contentCloudRefreshByScope[state.activeScope] ?? null
  ))
  const relatedQuota = useTrackerContentCloudPolicyStore((state) => (
    relatedContent ? state.quotaByScope[state.activeScope]?.[relatedContent.entityKind] ?? null : null
  ))
  const failure = useTrackerContentCloudPolicyStore((state) => (
    entityId ? trackerContentCloudFailure(entityKind, entityId, state) : null
  ))
  const relatedFailureEntityId = useTrackerContentCloudPolicyStore((state) => (
    relatedContent
      ? trackerContentCloudFirstFailureId(relatedContent.entityKind, relatedContent.entityIds ?? [], state)
      : null
  ))
  const relatedFailure = useTrackerContentCloudPolicyStore((state) => (
    relatedContent && relatedFailureEntityId
      ? trackerContentCloudFailure(relatedContent.entityKind, relatedFailureEntityId, state)
      : null
  ))
  const transferState = useTrackerContentCloudPolicyStore((state) => (
    entityId
      ? trackerContentCloudTransferState(entityKind, entityId, state)
      : null
  ))
  const visibleFailure = failure ?? relatedFailure
  const failureTarget = failure
    ? { entityKind, entityId }
    : relatedFailure && relatedContent && relatedFailureEntityId
      ? { entityKind: relatedContent.entityKind, entityId: relatedFailureEntityId }
      : null
  const retryEntityId = failureTarget?.entityId ?? null
  const hasConfirmedCloudPolicy = typeof selectiveCloudAvailability === 'boolean'
  const selectiveCloudAvailable = selectiveCloudAvailability === true
  const refreshState = policyRefresh ?? EMPTY_POLICY_REFRESH
  const isCheckingPolicy = cloudReady && refreshState.phase === 'refreshing'
  const policyRefreshFailed = cloudReady && refreshState.phase === 'error'
  const quotaExhausted = value !== 'cloud' && !trackerContentCloudQuotaHasCapacity(quota)
  const relatedQuotaExhausted = value !== 'cloud'
    && Boolean(relatedContent)
    && !trackerContentCloudQuotaHasCapacity(relatedQuota, relatedContent?.count ?? 0)
  const cloudDisabled = disabled
    || !cloudReady
    || !hasConfirmedCloudPolicy
    || isCheckingPolicy
    || policyRefreshFailed
    || !selectiveCloudAvailable
    || quotaExhausted
    || relatedQuotaExhausted
  const compact = variant === 'compact'
  const locationLabelId = `content-location-${entityKind}${entityId ? `-${entityId}` : ''}`
  const quotaSummary = quotaDescription({ entityKind, quota, relatedContent, relatedQuota })

  const locationStatus = visibleFailure
    ? readableTrackerContentCloudFailure(visibleFailure.reason)
    : !cloudReady
      ? '登录并确认本机数据归属后，可选择同步云端。'
      : isCheckingPolicy && !hasConfirmedCloudPolicy
        ? '正在确认云端规则与可用额度，本机内容不会受影响。'
        : policyRefreshFailed
          ? '暂时无法确认云端规则，请刷新后再选择；本机内容不会受影响。'
          : !hasConfirmedCloudPolicy
            ? '正在等待云端规则确认，本机内容已保存。'
            : !selectiveCloudAvailable
              ? '管理员暂未开放内容上云，本机内容已保存。'
              : quotaSummary
                ?? (value === 'cloud'
                  ? '会同步到已登录设备。'
                  : '改为仅本机后，会立即请求移除云端副本。')

  const showCompactStatus = Boolean(
    visibleFailure
    || !cloudReady
    || (isCheckingPolicy && !hasConfirmedCloudPolicy)
    || policyRefreshFailed
    || !hasConfirmedCloudPolicy
    || !selectiveCloudAvailable
    || quotaExhausted
    || relatedQuotaExhausted
    || value === 'cloud',
  )

  useEffect(() => {
    if (!cloudReady) return
    requestTrackerContentCloudPolicyRefresh({ force: true, reason: 'page-enter' })
  }, [cloudReady, entityId, entityKind])

  return (
    <section
      className={cn(
        'border border-border bg-surface-subtle',
        compact ? 'space-y-1.5 rounded-lg px-2.5 py-2' : 'space-y-2 rounded-xl p-3',
      )}
      aria-labelledby={locationLabelId}
    >
      <div className={cn('flex justify-between gap-3', compact ? 'items-center' : 'items-start')}>
        <div>
          <h3 id={locationLabelId} className="text-sm font-semibold">保存位置</h3>
          {!compact && (
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground">新内容默认只保存在这台设备。</p>
          )}
        </div>
        {transferState && !visibleFailure && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" role="status">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {transferState === 'uploading' ? '等待上传' : '等待移除'}
          </span>
        )}
        {cloudReady && !transferState && (
          <button
            type="button"
            onClick={() => requestTrackerContentCloudPolicyRefresh({ force: true, reason: 'manual' })}
            disabled={disabled || isCheckingPolicy}
            className={cn(
              'inline-flex shrink-0 items-center rounded-md font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60',
              compact ? '-my-1 h-10 w-10 justify-center' : 'gap-1 px-1.5 py-1 text-xs',
            )}
            aria-label="刷新云端规则和额度"
            title="刷新云端规则和额度"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isCheckingPolicy && 'animate-spin')} aria-hidden="true" />
            {!compact && (isCheckingPolicy ? '确认中' : '刷新')}
          </button>
        )}
      </div>

      <div className={cn('grid grid-cols-2', compact ? 'gap-1.5' : 'gap-2')} role="group" aria-label="选择保存位置">
        <button
          type="button"
          aria-pressed={value === 'local'}
          disabled={disabled}
          onClick={() => onValueChange('local')}
          className={cn(
            'flex items-center rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
            compact ? 'min-h-10 justify-center gap-1.5 px-2 text-[13px]' : 'min-h-12 gap-2 px-3 text-left text-sm',
            value === 'local' ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background hover:bg-accent',
          )}
        >
          <HardDrive className={cn('shrink-0 text-primary', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden="true" />
          仅本机
        </button>
        <button
          type="button"
          aria-pressed={value === 'cloud'}
          disabled={cloudDisabled}
          onClick={() => {
            requestTrackerContentCloudPolicyRefresh({ force: true, reason: 'before-save' })
            onValueChange('cloud')
          }}
          className={cn(
            'flex items-center rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
            compact ? 'min-h-10 justify-center gap-1.5 px-2 text-[13px]' : 'min-h-12 gap-2 px-3 text-left text-sm',
            value === 'cloud' ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background hover:bg-accent',
          )}
        >
          <Cloud className={cn('shrink-0 text-primary', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden="true" />
          同步云端
        </button>
      </div>

      {(!compact || showCompactStatus) && (
        <p
          className={cn(
            'text-xs leading-4',
            visibleFailure ? 'text-destructive' : 'text-muted-foreground',
          )}
          role={visibleFailure ? 'alert' : undefined}
        >
          {locationStatus}
        </p>
      )}

      {visibleFailure && retryEntityId && failureTarget && (
        <button
          type="button"
          onClick={() => requestTrackerContentCloudSync({
            entityKind: failureTarget.entityKind,
            entityId: retryEntityId,
            immediate: true,
            retry: true,
            ...(failureTarget.entityKind === 'study_plan' && transferState ? { planTransfer: transferState } : {}),
          })}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          重新尝试
        </button>
      )}
    </section>
  )
}
