import {
  LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
  LEXI_CROSS_PRODUCT_LIMITS,
  type LexiCrossProductHandoffStatus,
  type LexiCrossProductHandoffV1,
  type LexiWordsStudyMode,
} from '@/contracts/lexiCrossProduct'
import { isLocalDate } from '@/lib/localDate'

export type WordsPlanReceiptInvoker = (input: {
  expectedUserId: string
  sourceProduct: 'tracker'
  sourceRefs: string[]
}) => Promise<unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STUDY_MODES = new Set<LexiWordsStudyMode>(['mixed', 'review', 'new'])
const STATUSES = new Set<LexiCrossProductHandoffStatus>(['pending', 'accepted', 'rejected', 'expired'])
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
  'targetContainerId',
  'sourceRef',
  'createdAt',
  'expiresAt',
  'resolvedAt',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime())
}

function boundedText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is invalid`)
  }
  const normalized = value.trim()
  if (new TextEncoder().encode(normalized).byteLength > LEXI_CROSS_PRODUCT_LIMITS.referenceBytes) {
    throw new Error(`${label} is too long`)
  }
  return normalized
}

function optionalBoundedText(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : boundedText(value, label)
}

function normalizeSourceRefs(sourceRefs: readonly string[]): string[] {
  if (!Array.isArray(sourceRefs)) throw new Error('Words plan receipt references are invalid')
  const normalized = [...new Set(sourceRefs.map(sourceRef => boundedText(sourceRef, 'Words plan receipt reference')))]
  if (normalized.length > 50) throw new Error('Words plan receipt request exceeds the batch limit')
  return normalized
}

/** Strictly validates one owner-scoped plan receipt returned by Supabase. */
export function parseWordsPlanReceipt(
  value: unknown,
  expectedSourceRefs: ReadonlySet<string>,
): LexiCrossProductHandoffV1 {
  if (!isRecord(value)) throw new Error('Words plan receipt response is invalid')
  const status = value.status as LexiCrossProductHandoffStatus
  const studyMode = value.studyMode as LexiWordsStudyMode
  const sourceRef = boundedText(value.sourceRef, 'Words plan receipt reference')
  const targetContainerId = optionalBoundedText(value.targetContainerId, 'Words target container')
  const createdAt = new Date(String(value.createdAt || '')).getTime()
  const expiresAt = new Date(String(value.expiresAt || '')).getTime()
  const resolvedAt = value.resolvedAt === undefined
    ? undefined
    : new Date(String(value.resolvedAt || '')).getTime()
  const maxLifetimeDays = status === 'pending'
    ? LEXI_CROSS_PRODUCT_LIMITS.pendingRetentionDays
    : LEXI_CROSS_PRODUCT_LIMITS.pendingRetentionDays + LEXI_CROSS_PRODUCT_LIMITS.resolvedRetentionDays

  if (
    Object.keys(value).some(key => !RESPONSE_FIELDS.has(key))
    || value.contractVersion !== LEXI_CROSS_PRODUCT_CONTRACT_VERSION
    || !UUID_PATTERN.test(String(value.operationId || ''))
    || value.sourceProduct !== 'tracker'
    || value.targetProduct !== 'words'
    || value.kind !== 'plan_intent'
    || !STATUSES.has(status)
    || !expectedSourceRefs.has(sourceRef)
    || !isLocalDate(value.targetDate)
    || !Number.isSafeInteger(value.targetCount)
    || Number(value.targetCount) < 1
    || Number(value.targetCount) > 1_000
    || !STUDY_MODES.has(studyMode)
    || !isIsoTimestamp(value.createdAt)
    || !isIsoTimestamp(value.expiresAt)
    || expiresAt <= createdAt
    || expiresAt - createdAt > maxLifetimeDays * 24 * 60 * 60 * 1_000 + 60_000
    || (status === 'pending' && value.resolvedAt !== undefined)
    || (status !== 'pending' && (!isIsoTimestamp(value.resolvedAt) || resolvedAt! < createdAt))
    || (status !== 'pending' && resolvedAt! >= expiresAt)
  ) {
    throw new Error('Words plan receipt response does not match the request')
  }

  return {
    contractVersion: LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
    operationId: value.operationId as string,
    sourceProduct: 'tracker',
    targetProduct: 'words',
    kind: 'plan_intent',
    status,
    targetDate: value.targetDate as string,
    targetCount: value.targetCount as number,
    studyMode,
    ...(targetContainerId ? { targetContainerId } : {}),
    sourceRef,
    createdAt: value.createdAt as string,
    expiresAt: value.expiresAt as string,
    ...(value.resolvedAt ? { resolvedAt: value.resolvedAt as string } : {}),
  }
}

export function parseWordsPlanReceipts(
  value: unknown,
  sourceRefs: readonly string[],
): Map<string, LexiCrossProductHandoffV1> {
  const normalizedSourceRefs = normalizeSourceRefs(sourceRefs)
  if (!Array.isArray(value)) throw new Error('Words plan receipt response is invalid')
  if (value.length > normalizedSourceRefs.length) {
    throw new Error('Words plan receipt response exceeds the requested plan count')
  }
  const expectedSourceRefs = new Set(normalizedSourceRefs)
  const receipts = new Map<string, LexiCrossProductHandoffV1>()
  value.forEach((candidate) => {
    const receipt = parseWordsPlanReceipt(candidate, expectedSourceRefs)
    if (!receipt.sourceRef || receipts.has(receipt.sourceRef)) {
      throw new Error('Words plan receipt response contains duplicate plans')
    }
    receipts.set(receipt.sourceRef, receipt)
  })
  return receipts
}

async function invokeListWordsPlanReceipts(input: {
  expectedUserId: string
  sourceProduct: 'tracker'
  sourceRefs: string[]
}): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) throw new Error('Lexi account service is not configured')

  const before = await supabase.auth.getSession()
  if (before.error || before.data.session?.user.id !== input.expectedUserId) {
    throw new Error('Lexi account changed before plan receipt read')
  }
  const { data, error } = await supabase.rpc('lexi_list_cross_product_plan_receipts', {
    p_expected_user_id: input.expectedUserId,
    p_source_product: input.sourceProduct,
    p_source_refs: input.sourceRefs,
  })
  if (error) throw new Error('Words plan receipts are unavailable')
  const after = await supabase.auth.getSession()
  if (after.error || after.data.session?.user.id !== input.expectedUserId) {
    throw new Error('Lexi account changed after plan receipt read')
  }
  return data
}

export async function listWordsPlanReceipts(
  input: { userId: string; sourceRefs: readonly string[] },
  invoke: WordsPlanReceiptInvoker = invokeListWordsPlanReceipts,
): Promise<Map<string, LexiCrossProductHandoffV1>> {
  const userId = input.userId.trim()
  const sourceRefs = normalizeSourceRefs(input.sourceRefs)
  if (!userId) throw new Error('Words plan receipt account is invalid')
  if (sourceRefs.length === 0) return new Map()

  const response = await invoke({
    expectedUserId: userId,
    sourceProduct: 'tracker',
    sourceRefs,
  })
  return parseWordsPlanReceipts(response, sourceRefs)
}

export function createPreviewWordsPlanReceipt(
  sourceRef: string,
  status: LexiCrossProductHandoffStatus = 'pending',
): LexiCrossProductHandoffV1 {
  const now = Date.now()
  const createdAt = new Date(now - 20 * 60 * 1_000).toISOString()
  const terminal = status !== 'pending'
  return {
    contractVersion: LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
    operationId: '90000000-0000-4000-8000-000000000001',
    sourceProduct: 'tracker',
    targetProduct: 'words',
    kind: 'plan_intent',
    status,
    targetDate: new Date().toISOString().slice(0, 10),
    targetCount: 24,
    studyMode: 'mixed',
    sourceRef,
    createdAt,
    expiresAt: new Date(now + (terminal ? 7 : 30) * 24 * 60 * 60 * 1_000).toISOString(),
    ...(terminal ? { resolvedAt: new Date(now - 5 * 60 * 1_000).toISOString() } : {}),
  }
}
