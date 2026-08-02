import type { StudyPlan } from '@/lib/types'

import type { AiCommandContext, AiCommandDraft } from './contracts'
import { parsePlanDraftV2, type PlanDraftV2 } from './structuredOutputs'

export type PlanCreateCommandPayload = Record<string, unknown> & PlanDraftV2['plans'][number]
export type PlanCreateCommandDraft = AiCommandDraft<PlanCreateCommandPayload>

export interface CreatePlanCommandDraftsOptions {
  context: Omit<AiCommandContext, 'generatedAt' | 'expiresAt'>
  now?: Date
  expiresInMs?: number
  createId?: () => string
}

function createId(): string {
  return crypto.randomUUID()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key))
}

function boundedText(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isIsoDate(value: unknown): value is string {
  return boundedText(value, 64) && Number.isFinite(Date.parse(value))
}

export function parsePlanCreateCommandPayload(value: unknown): PlanCreateCommandPayload {
  const plan = parsePlanDraftV2({
    schemaVersion: 2,
    kind: 'plan_draft',
    title: '计划草稿',
    summary: '等待用户确认后写入计划',
    plans: [value],
    evidence: [],
    limitations: [],
  }).plans[0]
  return { ...plan } as PlanCreateCommandPayload
}

export function parsePlanCreateCommandDraft(value: unknown): PlanCreateCommandDraft {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion',
    'draftId',
    'runId',
    'action',
    'targetScope',
    'payload',
    'idempotencyKey',
    'context',
    'confirmation',
    'createdAt',
    'updatedAt',
  ])) throw new Error('Invalid plan command draft')
  if (
    value.schemaVersion !== 1
    || !boundedText(value.draftId, 128)
    || !boundedText(value.runId, 128)
    || value.action !== 'plan.create'
    || value.targetScope !== 'plans'
    || value.idempotencyKey !== `tracker-plan-create:${value.draftId}`
    || !isIsoDate(value.createdAt)
    || !isIsoDate(value.updatedAt)
  ) throw new Error('Invalid plan command draft')

  const context = value.context
  if (!isRecord(context) || !hasExactKeys(context, [
    'snapshotId',
    'contextHash',
    'sourceRevision',
    'routeMode',
    'accountScopeId',
    'generatedAt',
    'expiresAt',
  ])) throw new Error('Invalid plan command context')
  if (
    !boundedText(context.snapshotId, 128)
    || !boundedText(context.contextHash, 128)
    || !boundedText(context.sourceRevision, 128)
    || (context.routeMode !== 'managed' && context.routeMode !== 'custom')
    || !boundedText(context.accountScopeId, 256)
    || !isIsoDate(context.generatedAt)
    || !isIsoDate(context.expiresAt)
  ) throw new Error('Invalid plan command context')

  const confirmation = value.confirmation
  if (!isRecord(confirmation)) throw new Error('Invalid plan command confirmation')
  const confirmationKeys = confirmation.status === 'confirmed'
    ? ['required', 'status', 'confirmedAt']
    : ['required', 'status']
  if (
    !hasExactKeys(confirmation, confirmationKeys)
    || confirmation.required !== true
    || !['pending', 'confirmed', 'rejected'].includes(String(confirmation.status))
    || (confirmation.status === 'confirmed' && !isIsoDate(confirmation.confirmedAt))
  ) throw new Error('Invalid plan command confirmation')

  return {
    ...value,
    payload: parsePlanCreateCommandPayload(value.payload),
  } as PlanCreateCommandDraft
}

export function createPlanCommandDrafts(
  value: PlanDraftV2,
  runId: string,
  options: CreatePlanCommandDraftsOptions,
): PlanCreateCommandDraft[] {
  const content = parsePlanDraftV2(value)
  const generatedAt = options.now ?? new Date()
  const now = generatedAt.toISOString()
  const expiresAt = new Date(
    generatedAt.getTime() + (options.expiresInMs ?? 24 * 60 * 60 * 1_000),
  ).toISOString()
  const nextId = options.createId ?? createId
  return content.plans.map((plan) => {
    const draftId = nextId()
    return parsePlanCreateCommandDraft({
      schemaVersion: 1,
      draftId,
      runId,
      action: 'plan.create',
      targetScope: 'plans',
      payload: { ...plan } as PlanCreateCommandPayload,
      idempotencyKey: `tracker-plan-create:${draftId}`,
      context: {
        ...options.context,
        generatedAt: now,
        expiresAt,
      },
      confirmation: { required: true, status: 'pending' },
      createdAt: now,
      updatedAt: now,
    })
  })
}

export function planCommandPayloadToStudyPlan(
  value: unknown,
): Omit<StudyPlan, 'id' | 'createdAt' | 'updatedAt'> {
  const payload = parsePlanCreateCommandPayload(value)
  return {
    title: payload.title,
    description: payload.description,
    category: payload.category,
    frequency: payload.frequency,
    weekDays: payload.frequency === 'weekly' ? [...payload.weekDays] : undefined,
    targetTime: payload.targetTime ?? undefined,
    targetDuration: payload.targetDuration ?? undefined,
    targetCount: payload.targetCount ?? undefined,
    isActive: true,
  }
}
