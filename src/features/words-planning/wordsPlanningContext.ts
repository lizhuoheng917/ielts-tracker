import {
  LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
  type LexiWordsPlanningContextV1,
} from '@/contracts/lexiCrossProduct'
import { isLocalDate } from '@/lib/localDate'

export type WordsPlanningContextInvoker = (input: {
  expectedUserId: string
  targetDate: string
  timeZone: string
}) => Promise<unknown>

export interface WordsExecutionProgress {
  plannedWords: number
  completedWords: number
  remainingWords: number
  completionRate: number | null
  plannedNewWords: number
  completedNewWords: number
  plannedReviewWords: number
  completedReviewWords: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function count(value: Record<string, unknown>, key: string): number {
  const candidate = value[key]
  if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0) {
    throw new Error(`Lexi Words planning context ${key} is invalid`)
  }
  return candidate
}

export function parseWordsPlanningContext(
  value: unknown,
  expectedTargetDate: string,
  expectedTimeZone: string,
): LexiWordsPlanningContextV1 {
  if (!isLocalDate(expectedTargetDate) || !expectedTimeZone.trim() || !isRecord(value)) {
    throw new Error('Lexi Words planning context is invalid')
  }
  if (!hasExactKeys(value, [
    'contractVersion',
    'product',
    'coverage',
    'targetDate',
    'timeZone',
    'generatedAt',
    'inventory',
    'recent7Days',
    'targetDay',
  ])) {
    throw new Error('Lexi Words planning context contains unsupported fields')
  }
  if (
    value.contractVersion !== LEXI_CROSS_PRODUCT_CONTRACT_VERSION
    || value.product !== 'words'
    || value.coverage !== 'cloud_data_only'
    || value.targetDate !== expectedTargetDate
    || value.timeZone !== expectedTimeZone
    || typeof value.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !isRecord(value.inventory)
    || !isRecord(value.recent7Days)
    || !isRecord(value.targetDay)
  ) {
    throw new Error('Lexi Words planning context does not match the requested contract')
  }

  const inventorySource = value.inventory
  const recentSource = value.recent7Days
  const targetSource = value.targetDay
  if (!hasExactKeys(inventorySource, [
    'activeWordbooks',
    'activeWords',
    'newWords',
    'learningWords',
    'availableNewWords',
    'masteredWords',
    'dueNowWords',
    'dueByTargetWords',
  ]) || !hasExactKeys(recentSource, [
    'activeDays',
    'attempts',
    'passed',
    'durationMs',
    'uniqueWordsStudied',
    'wordStudyTouches',
  ]) || !hasExactKeys(targetSource, [
    'attempts',
    'passed',
    'durationMs',
    'plannedNewWords',
    'plannedReviewWords',
    'completedNewWords',
    'completedReviewWords',
  ])) {
    throw new Error('Lexi Words planning context contains unsupported nested fields')
  }

  const inventory = {
    activeWordbooks: count(inventorySource, 'activeWordbooks'),
    activeWords: count(inventorySource, 'activeWords'),
    newWords: count(inventorySource, 'newWords'),
    learningWords: count(inventorySource, 'learningWords'),
    availableNewWords: count(inventorySource, 'availableNewWords'),
    masteredWords: count(inventorySource, 'masteredWords'),
    dueNowWords: count(inventorySource, 'dueNowWords'),
    dueByTargetWords: count(inventorySource, 'dueByTargetWords'),
  }
  const recent7Days = {
    activeDays: count(recentSource, 'activeDays'),
    attempts: count(recentSource, 'attempts'),
    passed: count(recentSource, 'passed'),
    durationMs: count(recentSource, 'durationMs'),
    uniqueWordsStudied: count(recentSource, 'uniqueWordsStudied'),
    wordStudyTouches: count(recentSource, 'wordStudyTouches'),
  }
  const targetDay = {
    attempts: count(targetSource, 'attempts'),
    passed: count(targetSource, 'passed'),
    durationMs: count(targetSource, 'durationMs'),
    plannedNewWords: count(targetSource, 'plannedNewWords'),
    plannedReviewWords: count(targetSource, 'plannedReviewWords'),
    completedNewWords: count(targetSource, 'completedNewWords'),
    completedReviewWords: count(targetSource, 'completedReviewWords'),
  }

  if (
    inventory.newWords + inventory.learningWords + inventory.masteredWords !== inventory.activeWords
    || inventory.availableNewWords !== inventory.newWords + inventory.learningWords
    || inventory.dueNowWords > inventory.dueByTargetWords
    || inventory.dueByTargetWords > inventory.masteredWords
    || recent7Days.activeDays > 7
    || recent7Days.passed > recent7Days.attempts
    || recent7Days.uniqueWordsStudied > recent7Days.wordStudyTouches
    || targetDay.passed > targetDay.attempts
    || targetDay.completedNewWords > targetDay.plannedNewWords
    || targetDay.completedReviewWords > targetDay.plannedReviewWords
  ) {
    throw new Error('Lexi Words planning context counts are inconsistent')
  }

  return {
    contractVersion: LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
    product: 'words',
    coverage: 'cloud_data_only',
    targetDate: expectedTargetDate,
    timeZone: expectedTimeZone,
    generatedAt: value.generatedAt,
    inventory,
    recent7Days,
    targetDay,
  }
}

async function invokeWordsPlanningContextRpc(input: {
  expectedUserId: string
  targetDate: string
  timeZone: string
}): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) throw new Error('Lexi Words planning context is not configured')

  const { data, error } = await supabase.rpc('lexi_get_words_planning_context', {
    p_expected_user_id: input.expectedUserId,
    p_target_date: input.targetDate,
    p_time_zone: input.timeZone,
  })
  if (error) throw new Error('Lexi Words planning context is unavailable')
  return data
}

export async function loadWordsPlanningContext(
  userId: string,
  targetDate: string,
  timeZone: string,
  invoke: WordsPlanningContextInvoker = invokeWordsPlanningContextRpc,
): Promise<LexiWordsPlanningContextV1> {
  if (
    !userId.trim()
    || !isLocalDate(targetDate)
    || !timeZone.trim()
    || new TextEncoder().encode(timeZone).length > 64
  ) {
    throw new Error('Lexi Words planning context request is invalid')
  }
  return parseWordsPlanningContext(await invoke({
    expectedUserId: userId,
    targetDate,
    timeZone,
  }), targetDate, timeZone)
}

export function createWordsPlanningContextPreview(
  targetDate: string,
  timeZone = 'Asia/Shanghai',
): LexiWordsPlanningContextV1 {
  return {
    contractVersion: LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
    product: 'words',
    coverage: 'cloud_data_only',
    targetDate,
    timeZone,
    generatedAt: new Date().toISOString(),
    inventory: {
      activeWordbooks: 3,
      activeWords: 1_286,
      newWords: 184,
      learningWords: 316,
      availableNewWords: 500,
      masteredWords: 786,
      dueNowWords: 28,
      dueByTargetWords: 35,
    },
    recent7Days: {
      activeDays: 5,
      attempts: 186,
      passed: 151,
      durationMs: 102 * 60 * 1_000,
      uniqueWordsStudied: 74,
      wordStudyTouches: 96,
    },
    targetDay: {
      attempts: 42,
      passed: 36,
      durationMs: 24 * 60 * 1_000,
      plannedNewWords: 12,
      plannedReviewWords: 18,
      completedNewWords: 4,
      completedReviewWords: 8,
    },
  }
}

/** Derives display-only progress without storing another cross-product snapshot. */
export function describeWordsExecutionProgress(
  context: LexiWordsPlanningContextV1,
): WordsExecutionProgress {
  const plannedWords = context.targetDay.plannedNewWords + context.targetDay.plannedReviewWords
  const completedWords = context.targetDay.completedNewWords + context.targetDay.completedReviewWords
  return {
    plannedWords,
    completedWords,
    remainingWords: Math.max(0, plannedWords - completedWords),
    completionRate: plannedWords > 0
      ? Math.round(completedWords / plannedWords * 100)
      : null,
    plannedNewWords: context.targetDay.plannedNewWords,
    completedNewWords: context.targetDay.completedNewWords,
    plannedReviewWords: context.targetDay.plannedReviewWords,
    completedReviewWords: context.targetDay.completedReviewWords,
  }
}
