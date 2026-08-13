import type { LexiWordsPlanningContextV1 } from '@/contracts/lexiCrossProduct'
import { getRollingDateRange } from '@/lib/statsAnalytics'
import { isLocalDate } from '@/lib/localDate'
import { canonicalizePlanExecutions } from '@/lib/planExecution'
import { isPlanScheduledForDate } from '@/lib/planView'
import type {
  PlanExecution,
  PracticeRecord,
  StudyPlan,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import type { AiContextSnapshotV1 } from './contracts'
import type { WordsPlanRecommendationV2 } from './structuredOutputs'

const MAX_SNAPSHOT_AGE_SECONDS = 300

export interface WordsPlanRecommendationSource {
  sourcePlan: StudyPlan
  plans: readonly StudyPlan[]
  planExecutions: readonly PlanExecution[]
  wordRecords: readonly WordRecord[]
  practiceRecords: readonly PracticeRecord[]
  timerRecords: readonly TimerRecord[]
  words: LexiWordsPlanningContextV1
}

export interface WordsPlanRecommendationContextDataV1 extends Record<string, unknown> {
  targetDate: string
  timeZone: string
  sourcePlan: {
    currentTargetCount: number | null
    targetDurationMinutes: number | null
  }
  tracker: {
    recent7Days: {
      startDate: string
      endDate: string
      activeDays: number
      wordRecordCount: number
      wordsLogged: number
      practiceSessions: number
      timerSessions: number
      studySeconds: number
      recordedPlanExecutions: number
      completedPlanExecutions: number
      recordedPlanCompletionRate: number | null
    }
    vocabularyHistory30Days: {
      startDate: string
      endDate: string
      planCount: number
      activePlanCount: number
      plansWithTargetCount: number
      medianTargetCount: number | null
      recordedExecutions: number
      completedExecutions: number
      recordedCompletionRate: number | null
      actualWordsLogged: number
    }
    targetDay: {
      scheduledPlanCount: number
      completedPlanCount: number
      remainingPlanCount: number
      vocabularyPlanCount: number
      nonVocabularyPlanCount: number
      plannedMinutesKnown: number
      plansWithoutDuration: number
      actualMinutesLogged: number
    }
  }
  words: {
    coverage: 'cloud_data_only'
    inventory: LexiWordsPlanningContextV1['inventory']
    recent7Days: LexiWordsPlanningContextV1['recent7Days']
    targetDay: LexiWordsPlanningContextV1['targetDay']
    recommendationBounds: {
      minimumReviewWords: number
      maximumReviewWords: number
      minimumNewWords: number
      maximumNewWords: number
    }
  }
}

export interface BuildWordsPlanRecommendationOptions {
  now?: Date
  createId?: () => string
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function isInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate
}

function boundedOptionalInteger(value: number | undefined, min: number, max: number): number | null {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
    ? Number(value)
    : null
}

function medianInteger(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function buildWordsPlanRecommendationSnapshot(
  source: WordsPlanRecommendationSource,
  options: BuildWordsPlanRecommendationOptions = {},
): AiContextSnapshotV1<WordsPlanRecommendationContextDataV1> {
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid recommendation timestamp')
  if (
    source.sourcePlan.category !== 'vocabulary'
    || source.words.product !== 'words'
    || source.words.coverage !== 'cloud_data_only'
    || !isLocalDate(source.words.targetDate)
    || !source.words.timeZone.trim()
  ) {
    throw new Error('Words plan recommendation source is invalid')
  }

  const recentRange = getRollingDateRange(7, now)
  const vocabularyHistoryRange = getRollingDateRange(30, now)
  const recentWords = source.wordRecords.filter((record) => (
    isInRange(record.date, recentRange.startDate, recentRange.endDate)
  ))
  const recentPractice = source.practiceRecords.filter((record) => (
    isInRange(record.date, recentRange.startDate, recentRange.endDate)
  ))
  const recentTimers = source.timerRecords.filter((record) => (
    isInRange(record.date, recentRange.startDate, recentRange.endDate)
  ))
  const canonicalExecutions = canonicalizePlanExecutions(source.planExecutions).executions
  const recentExecutions = canonicalExecutions.filter((record) => (
    isInRange(record.date, recentRange.startDate, recentRange.endDate)
  ))
  const completedRecentExecutions = recentExecutions.filter((record) => record.isCompleted)
  const vocabularyPlans = source.plans.filter((plan) => plan.category === 'vocabulary')
  const vocabularyPlanIds = new Set(vocabularyPlans.map((plan) => plan.id))
  const vocabularyTargetCounts = vocabularyPlans.flatMap((plan) => {
    const targetCount = boundedOptionalInteger(plan.targetCount, 1, 1_000)
    return targetCount === null ? [] : [targetCount]
  })
  const vocabularyExecutions = canonicalExecutions.filter((record) => (
    vocabularyPlanIds.has(record.planId)
    && isInRange(
      record.date,
      vocabularyHistoryRange.startDate,
      vocabularyHistoryRange.endDate,
    )
  ))
  const completedVocabularyExecutions = vocabularyExecutions.filter((record) => record.isCompleted)
  const activeDates = new Set([
    ...recentWords.map((record) => record.date),
    ...recentPractice.map((record) => record.date),
    ...recentTimers.map((record) => record.date),
    ...completedRecentExecutions.map((record) => record.date),
  ])

  const targetPlans = source.plans.filter((plan) => (
    isPlanScheduledForDate(plan, source.words.targetDate)
  ))
  const targetExecutions = canonicalExecutions.filter((record) => (
    record.date === source.words.targetDate
  ))
  const targetExecutionByPlan = new Map(targetExecutions.map((record) => [record.planId, record]))
  const completedTargetPlans = targetPlans.filter((plan) => (
    targetExecutionByPlan.get(plan.id)?.isCompleted === true
  ))

  const minimumReviewWords = source.words.targetDay.completedReviewWords
  const minimumNewWords = source.words.targetDay.completedNewWords
  if (minimumReviewWords + minimumNewWords > 1_000) {
    throw new Error('Words completed workload exceeds the plan intent limit')
  }
  const maximumReviewWords = Math.min(
    1_000,
    minimumReviewWords + source.words.inventory.dueByTargetWords,
  )
  const maximumNewWords = Math.min(
    1_000,
    minimumNewWords + source.words.inventory.availableNewWords,
  )
  if (maximumReviewWords + maximumNewWords < 1) {
    throw new Error('Words cloud data has no recommendable vocabulary')
  }

  const data: WordsPlanRecommendationContextDataV1 = {
    targetDate: source.words.targetDate,
    timeZone: source.words.timeZone,
    sourcePlan: {
      currentTargetCount: boundedOptionalInteger(source.sourcePlan.targetCount, 1, 1_000),
      targetDurationMinutes: boundedOptionalInteger(source.sourcePlan.targetDuration, 5, 180),
    },
    tracker: {
      recent7Days: {
        startDate: recentRange.startDate,
        endDate: recentRange.endDate,
        activeDays: activeDates.size,
        wordRecordCount: recentWords.length,
        wordsLogged: recentWords.reduce((total, record) => total + record.count, 0),
        practiceSessions: recentPractice.length,
        timerSessions: recentTimers.length,
        studySeconds: recentPractice.reduce((total, record) => total + record.duration * 60, 0)
          + recentTimers.reduce((total, record) => total + record.duration, 0),
        recordedPlanExecutions: recentExecutions.length,
        completedPlanExecutions: completedRecentExecutions.length,
        recordedPlanCompletionRate: recentExecutions.length > 0
          ? roundOne(completedRecentExecutions.length / recentExecutions.length * 100)
          : null,
      },
      vocabularyHistory30Days: {
        startDate: vocabularyHistoryRange.startDate,
        endDate: vocabularyHistoryRange.endDate,
        planCount: vocabularyPlans.length,
        activePlanCount: vocabularyPlans.filter((plan) => plan.isActive).length,
        plansWithTargetCount: vocabularyTargetCounts.length,
        medianTargetCount: medianInteger(vocabularyTargetCounts),
        recordedExecutions: vocabularyExecutions.length,
        completedExecutions: completedVocabularyExecutions.length,
        recordedCompletionRate: vocabularyExecutions.length > 0
          ? roundOne(completedVocabularyExecutions.length / vocabularyExecutions.length * 100)
          : null,
        actualWordsLogged: vocabularyExecutions.reduce((total, execution) => (
          total + (boundedOptionalInteger(execution.actualCount, 0, 1_000) ?? 0)
        ), 0),
      },
      targetDay: {
        scheduledPlanCount: targetPlans.length,
        completedPlanCount: completedTargetPlans.length,
        remainingPlanCount: targetPlans.length - completedTargetPlans.length,
        vocabularyPlanCount: targetPlans.filter((plan) => plan.category === 'vocabulary').length,
        nonVocabularyPlanCount: targetPlans.filter((plan) => plan.category !== 'vocabulary').length,
        plannedMinutesKnown: targetPlans.reduce((total, plan) => (
          total + (boundedOptionalInteger(plan.targetDuration, 5, 180) ?? 0)
        ), 0),
        plansWithoutDuration: targetPlans.filter((plan) => (
          boundedOptionalInteger(plan.targetDuration, 5, 180) === null
        )).length,
        actualMinutesLogged: targetExecutions.reduce((total, execution) => (
          total + (boundedOptionalInteger(execution.actualDuration, 0, 1_440) ?? 0)
        ), 0),
      },
    },
    words: {
      coverage: 'cloud_data_only',
      inventory: { ...source.words.inventory },
      recent7Days: { ...source.words.recent7Days },
      targetDay: { ...source.words.targetDay },
      recommendationBounds: {
        minimumReviewWords,
        maximumReviewWords,
        minimumNewWords,
        maximumNewWords,
      },
    },
  }

  const createdAt = now.toISOString()
  const contextHash = `words-plan-ctx-${stableHash(data)}`
  const evidenceCount = activeDates.size
    + recentExecutions.length
    + targetPlans.length
    + vocabularyPlans.length
    + vocabularyExecutions.length
    + (source.words.inventory.activeWords > 0 ? 1 : 0)
  const warnings = ['Words 数据仅覆盖已同步到云端的内容。']
  if (source.words.recent7Days.activeDays < 3 || activeDates.size < 3) {
    warnings.push('近 7 天样本较少，建议置信度应保持谨慎。')
  }
  if (vocabularyExecutions.length < 3) {
    warnings.push('近 30 天词汇计划执行样本较少，历史目标只能作为有限参考。')
  }

  return {
    schemaVersion: 1,
    snapshotId: options.createId?.() ?? crypto.randomUUID(),
    purpose: 'words_plan_recommendation',
    createdAt,
    dataAsOf: source.words.generatedAt,
    freshness: { status: 'fresh', ageSeconds: 0, maxAgeSeconds: MAX_SNAPSHOT_AGE_SECONDS },
    sourceRevision: `words-plan-recommendation-v1-${contextHash}`,
    contextHash,
    scopes: ['learning.summary', 'plans.summary', 'words.planning.summary'],
    privateScopes: [],
    quality: {
      status: source.words.inventory.activeWords === 0
        ? 'empty'
        : source.words.recent7Days.activeDays < 3 || activeDates.size < 3
          ? 'limited'
          : 'sufficient',
      recordCount: Math.min(1_000_000, evidenceCount),
      warnings,
    },
    data,
  }
}

export function assertWordsPlanRecommendationMatchesContext(
  recommendation: WordsPlanRecommendationV2,
  context: WordsPlanRecommendationContextDataV1,
): void {
  const bounds = context.words.recommendationBounds
  if (recommendation.targetDate !== context.targetDate) {
    throw new Error('Words plan recommendation target date does not match the snapshot')
  }
  if (
    recommendation.reviewWords < bounds.minimumReviewWords
    || recommendation.reviewWords > bounds.maximumReviewWords
    || recommendation.newWords < bounds.minimumNewWords
    || recommendation.newWords > bounds.maximumNewWords
  ) {
    throw new Error('Words plan recommendation exceeds the snapshot bounds')
  }
}
