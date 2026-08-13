import {
  parseWordsPlanRecommendationV2,
  type WordsPlanRecommendationV2,
} from '@/ai/structuredOutputs'
import type { LexiWordsStudyMode } from '@/contracts/lexiCrossProduct'
import { STORAGE_PREFIX } from '@/lib/constants'
import { isLocalDate } from '@/lib/localDate'
import type { TrackerContentCloudMode } from '@/sync/trackerContentCloudPolicy'

export const WORDS_PLAN_RECOMMENDATION_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000
export const WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY =
  `${STORAGE_PREFIX}:wordsPlanRecommendationDrafts:v1`

const DRAFT_VERSION = 1
const MAX_DRAFTS = 8

export interface WordsPlanRecommendationDraftForm {
  targetDate: string
  planTitle: string
  targetTime: string
  targetCount: number
  targetDuration: number
  studyMode: LexiWordsStudyMode
  cloudMode: TrackerContentCloudMode
}

export interface WordsPlanRecommendationDraft {
  version: typeof DRAFT_VERSION
  scopeKey: string
  sourcePlanId: string | null
  generatedAt: string
  updatedAt: string
  expiresAt: string
  recommendation: WordsPlanRecommendationV2
  form: WordsPlanRecommendationDraftForm
}

interface DraftIdentity {
  scopeKey: string
  sourcePlanId: string | null
}

interface SaveDraftInput extends DraftIdentity {
  generatedAt: string
  recommendation: WordsPlanRecommendationV2
  form: WordsPlanRecommendationDraftForm
  storage?: Storage | null
  now?: Date
}

interface ReadDraftInput extends DraftIdentity {
  storage?: Storage | null
  now?: Date
}

function browserSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function resolveStorage(storage: Storage | null | undefined): Storage | null {
  return storage === undefined ? browserSessionStorage() : storage
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  return Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => expected.has(key))
}

function parseIsoTimestamp(value: unknown): { value: string; time: number } | null {
  if (typeof value !== 'string') return null
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) return null
  return { value, time }
}

function validScopeKey(value: string): boolean {
  return value.length > 0 && value.length <= 240
}

function validSourcePlanId(value: string | null): boolean {
  return value === null || (value.length > 0 && value.length <= 160)
}

function parseForm(value: unknown): WordsPlanRecommendationDraftForm | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    'targetDate',
    'planTitle',
    'targetTime',
    'targetCount',
    'targetDuration',
    'studyMode',
    'cloudMode',
  ])) return null

  if (!isLocalDate(value.targetDate)) return null
  if (
    typeof value.planTitle !== 'string'
    || !value.planTitle.trim()
    || value.planTitle.length > 60
  ) return null
  if (
    typeof value.targetTime !== 'string'
    || (value.targetTime !== '' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.targetTime))
  ) return null
  if (
    !Number.isInteger(value.targetCount)
    || Number(value.targetCount) < 1
    || Number(value.targetCount) > 1_000
  ) return null
  if (
    !Number.isInteger(value.targetDuration)
    || Number(value.targetDuration) < 5
    || Number(value.targetDuration) > 180
  ) return null
  if (value.studyMode !== 'mixed' && value.studyMode !== 'review' && value.studyMode !== 'new') {
    return null
  }
  if (value.cloudMode !== 'local' && value.cloudMode !== 'cloud') return null

  return {
    targetDate: value.targetDate,
    planTitle: value.planTitle,
    targetTime: value.targetTime,
    targetCount: Number(value.targetCount),
    targetDuration: Number(value.targetDuration),
    studyMode: value.studyMode,
    cloudMode: value.cloudMode,
  }
}

function parseDraft(value: unknown, nowTime: number): WordsPlanRecommendationDraft | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    'version',
    'scopeKey',
    'sourcePlanId',
    'generatedAt',
    'updatedAt',
    'expiresAt',
    'recommendation',
    'form',
  ])) return null
  if (value.version !== DRAFT_VERSION) return null
  if (typeof value.scopeKey !== 'string' || !validScopeKey(value.scopeKey)) {
    return null
  }
  if (
    value.sourcePlanId !== null
    && (typeof value.sourcePlanId !== 'string' || !validSourcePlanId(value.sourcePlanId))
  ) return null

  const generatedAt = parseIsoTimestamp(value.generatedAt)
  const updatedAt = parseIsoTimestamp(value.updatedAt)
  const expiresAt = parseIsoTimestamp(value.expiresAt)
  if (!generatedAt || !updatedAt || !expiresAt) return null
  if (expiresAt.time !== generatedAt.time + WORDS_PLAN_RECOMMENDATION_DRAFT_TTL_MS) return null
  if (updatedAt.time < generatedAt.time || updatedAt.time > expiresAt.time || nowTime >= expiresAt.time) {
    return null
  }

  let recommendation: WordsPlanRecommendationV2
  try {
    recommendation = parseWordsPlanRecommendationV2(value.recommendation)
  } catch {
    return null
  }
  const form = parseForm(value.form)
  if (!form || form.targetDate !== recommendation.targetDate) return null

  return {
    version: DRAFT_VERSION,
    scopeKey: value.scopeKey,
    sourcePlanId: value.sourcePlanId,
    generatedAt: generatedAt.value,
    updatedAt: updatedAt.value,
    expiresAt: expiresAt.value,
    recommendation,
    form,
  }
}

function readValidDrafts(storage: Storage, nowTime: number): WordsPlanRecommendationDraft[] {
  const raw = storage.getItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY)
  if (!raw) return []
  let values: unknown
  try {
    values = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(values)) return []
  return values
    .map((value) => parseDraft(value, nowTime))
    .filter((value): value is WordsPlanRecommendationDraft => Boolean(value))
    .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))
    .slice(-MAX_DRAFTS)
}

function rawStorageHasValue(storage: Storage): boolean {
  return storage.getItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY) !== null
}

function persistDrafts(storage: Storage, drafts: WordsPlanRecommendationDraft[]): void {
  if (drafts.length === 0) {
    storage.removeItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY)
    return
  }
  storage.setItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY, JSON.stringify(drafts))
}

function sameIdentity(draft: WordsPlanRecommendationDraft, identity: DraftIdentity): boolean {
  return draft.scopeKey === identity.scopeKey && draft.sourcePlanId === identity.sourcePlanId
}

export function readWordsPlanRecommendationDraft({
  scopeKey,
  sourcePlanId,
  storage: requestedStorage,
  now = new Date(),
}: ReadDraftInput): WordsPlanRecommendationDraft | null {
  const storage = resolveStorage(requestedStorage)
  if (!storage) return null
  try {
    const hadStoredValue = rawStorageHasValue(storage)
    const drafts = readValidDrafts(storage, now.getTime())
    if (hadStoredValue) persistDrafts(storage, drafts)
    return drafts.findLast((draft) => sameIdentity(draft, { scopeKey, sourcePlanId })) ?? null
  } catch {
    return null
  }
}

export function saveWordsPlanRecommendationDraft({
  scopeKey,
  sourcePlanId,
  generatedAt,
  recommendation,
  form,
  storage: requestedStorage,
  now = new Date(),
}: SaveDraftInput): boolean {
  const storage = resolveStorage(requestedStorage)
  if (!storage || !validScopeKey(scopeKey) || !validSourcePlanId(sourcePlanId)) return false
  const generated = parseIsoTimestamp(generatedAt)
  if (!generated || now.getTime() >= generated.time + WORDS_PLAN_RECOMMENDATION_DRAFT_TTL_MS) {
    return false
  }

  const candidate = parseDraft({
    version: DRAFT_VERSION,
    scopeKey,
    sourcePlanId,
    generatedAt: generated.value,
    updatedAt: now.toISOString(),
    expiresAt: new Date(generated.time + WORDS_PLAN_RECOMMENDATION_DRAFT_TTL_MS).toISOString(),
    recommendation,
    form,
  }, now.getTime())
  if (!candidate) return false

  try {
    const drafts = readValidDrafts(storage, now.getTime())
      .filter((draft) => !sameIdentity(draft, candidate))
    drafts.push(candidate)
    persistDrafts(storage, drafts.slice(-MAX_DRAFTS))
    return true
  } catch {
    return false
  }
}

export function clearWordsPlanRecommendationDraft({
  scopeKey,
  sourcePlanId,
  storage: requestedStorage,
  now = new Date(),
}: ReadDraftInput): void {
  const storage = resolveStorage(requestedStorage)
  if (!storage) return
  try {
    const drafts = readValidDrafts(storage, now.getTime())
      .filter((draft) => !sameIdentity(draft, { scopeKey, sourcePlanId }))
    persistDrafts(storage, drafts)
  } catch {
    // A temporary draft must never block the plan workflow.
  }
}
