import type { AnyTrackerPhase4bPayload } from '@/sync/trackerPhase4bRecordSync'

export type TrackerPlanCloudTransferDirection = 'uploading' | 'removing'

export interface TrackerPlanCloudTransferBundleItem {
  entityId: string
  payload: AnyTrackerPhase4bPayload
  baseVersion: number
}

export interface TrackerPlanCloudTransferBundle {
  plan: TrackerPlanCloudTransferBundleItem
  executions: TrackerPlanCloudTransferBundleItem[]
}

export interface TrackerPlanCloudTransferReceipt {
  status: 'applied' | 'duplicate' | 'rejected' | 'epoch_mismatch' | 'disabled'
  operationId: string
  accountEpoch: number
  reason: string | null
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`)
  return value
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`)
  }
  return value
}

function assertMetadataOnly(value: unknown, label: string): void {
  const metadata = record(value, label)
  if (
    Object.prototype.hasOwnProperty.call(metadata, 'payload')
    || Object.prototype.hasOwnProperty.call(metadata, 'title')
    || Object.prototype.hasOwnProperty.call(metadata, 'note')
    || Object.prototype.hasOwnProperty.call(metadata, 'description')
  ) {
    throw new Error(`${label} must not contain learner content.`)
  }
  string(metadata.entityId, `${label}.entityId`)
  integer(metadata.version, `${label}.version`)
}

/**
 * Paired plan endpoints deliberately return receipt metadata, never plan
 * titles, notes, execution dates, or any other learner-authored content.
 */
export function parseTrackerPlanCloudTransferReceipt(value: unknown): TrackerPlanCloudTransferReceipt {
  const result = record(value, 'plan cloud transfer receipt')
  const status = result.status
  if (!['applied', 'duplicate', 'rejected', 'epoch_mismatch', 'disabled'].includes(String(status))) {
    throw new Error('plan cloud transfer receipt.status is unsupported.')
  }
  if (result.plan !== undefined && result.plan !== null) assertMetadataOnly(result.plan, 'plan cloud transfer receipt.plan')
  if (result.executions !== undefined && result.executions !== null) {
    if (!Array.isArray(result.executions)) throw new Error('plan cloud transfer receipt.executions must be an array.')
    result.executions.forEach((item, index) => assertMetadataOnly(item, `plan cloud transfer receipt.executions[${index}]`))
  }
  return {
    status: status as TrackerPlanCloudTransferReceipt['status'],
    operationId: string(result.operationId, 'plan cloud transfer receipt.operationId'),
    accountEpoch: integer(result.accountEpoch, 'plan cloud transfer receipt.accountEpoch'),
    reason: result.reason === undefined || result.reason === null
      ? null
      : string(result.reason, 'plan cloud transfer receipt.reason'),
  }
}
