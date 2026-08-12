import {
  LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
  LEXI_CROSS_PRODUCT_LIMITS,
  type LexiCrossProductHandoffV1,
  type LexiPlanIntentRequestV1,
  type LexiWordsStudyMode,
} from '@/contracts/lexiCrossProduct'
import { addLocalDays, isLocalDate, toLocalDate } from '@/lib/localDate'

export type WordsPlanIntentInvoker = (input: {
  expectedUserId: string
  operationId: string
  request: LexiPlanIntentRequestV1
}) => Promise<unknown>

export type CreateWordsPlanIntentInput = {
  userId: string
  operationId: string
  targetDate: string
  targetCount: number
  studyMode: LexiWordsStudyMode
  sourceRef?: string
  now?: Date
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STUDY_MODES = new Set<LexiWordsStudyMode>(['mixed', 'review', 'new'])
const RESPONSE_FIELDS = new Set([
  'contractVersion',
  'operationId',
  'sourceProduct',
  'targetProduct',
  'kind',
  'status',
  'targetDate',
  'targetCount',
  'studyMode',
  'sourceRef',
  'createdAt',
  'expiresAt',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime())
}

function optionalBoundedText(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Words plan intent reference is invalid')
  }
  const normalized = value.trim()
  if (new TextEncoder().encode(normalized).byteLength > LEXI_CROSS_PRODUCT_LIMITS.referenceBytes) {
    throw new Error('Words plan intent reference is too long')
  }
  return normalized
}

/** Strictly validates the untyped JSON returned by the shared Supabase RPC. */
export function parseWordsPlanIntentHandoff(
  value: unknown,
  expected: Pick<CreateWordsPlanIntentInput, 'operationId' | 'targetDate' | 'targetCount' | 'studyMode' | 'sourceRef'>,
): LexiCrossProductHandoffV1 {
  if (!isRecord(value)) throw new Error('Words plan intent response is invalid')
  const createdAt = new Date(String(value.createdAt || '')).getTime()
  const expiresAt = new Date(String(value.expiresAt || '')).getTime()
  if (
    Object.keys(value).some(key => !RESPONSE_FIELDS.has(key))
    || value.contractVersion !== LEXI_CROSS_PRODUCT_CONTRACT_VERSION
    || value.operationId !== expected.operationId
    || value.sourceProduct !== 'tracker'
    || value.targetProduct !== 'words'
    || value.kind !== 'plan_intent'
    || value.status !== 'pending'
    || value.targetDate !== expected.targetDate
    || value.targetCount !== expected.targetCount
    || value.studyMode !== expected.studyMode
    || !UUID_PATTERN.test(String(value.operationId || ''))
    || !isLocalDate(value.targetDate)
    || !Number.isSafeInteger(value.targetCount)
    || Number(value.targetCount) < 1
    || Number(value.targetCount) > 1_000
    || !STUDY_MODES.has(value.studyMode as LexiWordsStudyMode)
    || !isIsoTimestamp(value.createdAt)
    || !isIsoTimestamp(value.expiresAt)
    || expiresAt <= createdAt
    || expiresAt - createdAt > 30 * 24 * 60 * 60 * 1_000
  ) {
    throw new Error('Words plan intent response does not match the request')
  }

  const sourceRef = optionalBoundedText(value.sourceRef)
  if ((sourceRef ?? undefined) !== (expected.sourceRef?.trim() || undefined)) {
    throw new Error('Words plan intent source reference does not match the request')
  }

  return {
    contractVersion: LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
    operationId: value.operationId,
    sourceProduct: 'tracker',
    targetProduct: 'words',
    kind: 'plan_intent',
    status: 'pending',
    targetDate: value.targetDate,
    targetCount: value.targetCount,
    studyMode: value.studyMode as LexiWordsStudyMode,
    ...(sourceRef ? { sourceRef } : {}),
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  }
}

async function invokeCreateWordsPlanIntent(input: {
  expectedUserId: string
  operationId: string
  request: LexiPlanIntentRequestV1
}): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) throw new Error('Lexi account service is not configured')

  const before = await supabase.auth.getSession()
  if (before.error || before.data.session?.user.id !== input.expectedUserId) {
    throw new Error('Lexi account changed before plan intent write')
  }
  const { data, error } = await supabase.rpc('lexi_create_cross_product_handoff', {
    p_expected_user_id: input.expectedUserId,
    p_operation_id: input.operationId,
    p_request: input.request,
  })
  if (error) throw new Error('Words plan intent is unavailable')
  const after = await supabase.auth.getSession()
  if (after.error || after.data.session?.user.id !== input.expectedUserId) {
    throw new Error('Lexi account changed after plan intent write')
  }
  return data
}

export async function createWordsPlanIntent(
  input: CreateWordsPlanIntentInput,
  invoke: WordsPlanIntentInvoker = invokeCreateWordsPlanIntent,
): Promise<LexiCrossProductHandoffV1> {
  const userId = input.userId.trim()
  const sourceRef = optionalBoundedText(input.sourceRef)
  const today = toLocalDate(input.now)
  const lastDate = addLocalDays(today, 29)
  if (
    !userId
    || !UUID_PATTERN.test(input.operationId)
    || !isLocalDate(input.targetDate)
    || input.targetDate < today
    || input.targetDate > lastDate
    || !Number.isSafeInteger(input.targetCount)
    || input.targetCount < 1
    || input.targetCount > 1_000
    || !STUDY_MODES.has(input.studyMode)
  ) {
    throw new Error('Words plan intent request is invalid')
  }

  const request: LexiPlanIntentRequestV1 = {
    sourceProduct: 'tracker',
    targetProduct: 'words',
    kind: 'plan_intent',
    targetDate: input.targetDate,
    targetCount: input.targetCount,
    studyMode: input.studyMode,
    ...(sourceRef ? { sourceRef } : {}),
  }
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > LEXI_CROSS_PRODUCT_LIMITS.requestBytes) {
    throw new Error('Words plan intent request is too large')
  }

  const value = await invoke({
    expectedUserId: userId,
    operationId: input.operationId,
    request,
  })
  return parseWordsPlanIntentHandoff(value, {
    operationId: input.operationId,
    targetDate: input.targetDate,
    targetCount: input.targetCount,
    studyMode: input.studyMode,
    ...(sourceRef ? { sourceRef } : {}),
  })
}
