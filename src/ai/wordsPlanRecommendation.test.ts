import { describe, expect, it, vi } from 'vitest'

import type { LexiWordsPlanningContextV1 } from '@/contracts/lexiCrossProduct'
import type { StudyPlan } from '@/lib/types'
import type { AiGateway } from './gateway'
import {
  assertWordsPlanRecommendationMatchesContext,
  buildWordsPlanRecommendationSnapshot,
} from './wordsPlanRecommendation'
import { generateWordsPlanRecommendation } from './generateWordsPlanRecommendation'

const NOW = new Date('2026-08-13T04:00:00.000Z')

function plan(input: Partial<StudyPlan> = {}): StudyPlan {
  return {
    id: 'vocabulary-plan',
    title: '雅思词汇',
    category: 'vocabulary',
    frequency: 'once',
    scheduledDate: '2026-08-13',
    targetDuration: 30,
    targetCount: 24,
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...input,
  }
}

function words(): LexiWordsPlanningContextV1 {
  return {
    contractVersion: 1,
    product: 'words',
    coverage: 'cloud_data_only',
    targetDate: '2026-08-13',
    timeZone: 'Asia/Shanghai',
    generatedAt: '2026-08-13T03:59:50.000Z',
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
      durationMs: 6_120_000,
      uniqueWordsStudied: 74,
      wordStudyTouches: 96,
    },
    targetDay: {
      attempts: 42,
      passed: 36,
      durationMs: 1_440_000,
      plannedNewWords: 12,
      plannedReviewWords: 18,
      completedNewWords: 4,
      completedReviewWords: 8,
    },
  }
}

function snapshot() {
  const sourcePlan = plan()
  const pastVocabularyPlan = plan({
    id: 'past-vocabulary-plan',
    scheduledDate: '2026-08-08',
    targetCount: 36,
    isActive: false,
  })
  return buildWordsPlanRecommendationSnapshot({
    sourcePlan,
    plans: [sourcePlan, pastVocabularyPlan, plan({ id: 'reading-plan', category: 'reading', targetDuration: 45 })],
    planExecutions: [
      {
        id: 'execution-vocabulary',
        planId: sourcePlan.id,
        date: '2026-08-13',
        isCompleted: true,
        actualDuration: 22,
        actualCount: 24,
      },
      {
        id: 'execution-past-vocabulary',
        planId: pastVocabularyPlan.id,
        date: '2026-08-08',
        isCompleted: false,
        actualCount: 18,
      },
    ],
    wordRecords: [{
      id: 'words-1',
      date: '2026-08-12',
      category: 'IELTS',
      count: 20,
      createdAt: '2026-08-12T01:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    }],
    practiceRecords: [{
      id: 'practice-1',
      type: 'reading',
      date: '2026-08-11',
      duration: 30,
      createdAt: '2026-08-11T01:00:00.000Z',
      updatedAt: '2026-08-11T01:00:00.000Z',
    }],
    timerRecords: [{
      id: 'timer-1',
      subject: 'listening',
      date: '2026-08-10',
      duration: 1_200,
      createdAt: '2026-08-10T01:00:00.000Z',
      updatedAt: '2026-08-10T01:00:00.000Z',
    }],
    words: words(),
  }, { now: NOW, createId: () => 'words-plan-snapshot-1' })
}

function recommendation() {
  return {
    schemaVersion: 2 as const,
    kind: 'words_plan_recommendation' as const,
    targetDate: '2026-08-13',
    studyMode: 'mixed' as const,
    targetCount: 30,
    reviewWords: 18,
    newWords: 12,
    estimatedMinutes: 25,
    confidence: 'medium' as const,
    summary: '先处理到期复习，再加入适量新词。',
    evidence: ['目标日前有 35 个到期词。', '近 7 天 Words 活跃 5 天。'],
    risks: ['当天仍有其他计划负荷。'],
    limitations: ['Words 仅覆盖已经同步到云端的数据。'],
  }
}

describe('Words plan recommendation', () => {
  it('builds a compact numeric-only, purpose-limited snapshot without content text', () => {
    const value = snapshot()
    expect(value).toMatchObject({
      purpose: 'words_plan_recommendation',
      scopes: ['learning.summary', 'plans.summary', 'words.planning.summary'],
      privateScopes: [],
      data: {
        sourcePlan: { currentTargetCount: 24, targetDurationMinutes: 30 },
        tracker: {
          vocabularyHistory30Days: {
            planCount: 2,
            activePlanCount: 1,
            plansWithTargetCount: 2,
            medianTargetCount: 30,
            recordedExecutions: 2,
            completedExecutions: 1,
            recordedCompletionRate: 50,
            actualWordsLogged: 42,
            pairedExecutionCount: 2,
            pairedPlannedWords: 60,
            pairedActualWords: 42,
            targetAttainmentRate: 70,
            calibrationDirection: 'insufficient',
            baselineTargetCount: 24,
            calibratedTargetCount: null,
          },
          targetDay: { scheduledPlanCount: 2, completedPlanCount: 1 },
        },
        words: { recommendationBounds: { minimumReviewWords: 8, maximumReviewWords: 43, minimumNewWords: 4, maximumNewWords: 504, maximumTotalWords: 547 } },
      },
    })
    expect(JSON.stringify(value)).not.toMatch(/雅思词汇|title|description|meaning|note/)
  })

  it('supports direct AI generation without persisting a Tracker source plan', () => {
    const virtualSourcePlan = plan({ id: 'words-hub-direct-ai', title: '', targetCount: undefined })
    const value = buildWordsPlanRecommendationSnapshot({
      sourcePlan: virtualSourcePlan,
      plans: [],
      planExecutions: [],
      wordRecords: [],
      practiceRecords: [],
      timerRecords: [],
      words: words(),
    }, { now: NOW, createId: () => 'direct-words-plan-snapshot' })

    expect(value.data.sourcePlan.currentTargetCount).toBeNull()
    expect(value.data.tracker.vocabularyHistory30Days).toMatchObject({
      planCount: 0,
      medianTargetCount: null,
      recordedExecutions: 0,
    })
  })

  it('rejects recommendations that drift from the date or computed capacity', () => {
    const value = snapshot()
    expect(() => assertWordsPlanRecommendationMatchesContext(recommendation(), value.data)).not.toThrow()
    expect(() => assertWordsPlanRecommendationMatchesContext({
      ...recommendation(),
      targetDate: '2026-08-14',
    }, value.data)).toThrow(/target date/)
    expect(() => assertWordsPlanRecommendationMatchesContext({
      ...recommendation(),
      targetCount: 55,
      reviewWords: 44,
      newWords: 11,
    }, value.data)).toThrow(/bounds/)
  })

  it('reduces the maximum total after repeated low target attainment', () => {
    const sourcePlan = plan({ targetCount: 30 })
    const historyPlan = plan({ id: 'history-plan', targetCount: 30 })
    const value = buildWordsPlanRecommendationSnapshot({
      sourcePlan,
      plans: [sourcePlan, historyPlan],
      planExecutions: [
        { id: 'low-1', planId: historyPlan.id, date: '2026-08-10', isCompleted: true, actualCount: 15 },
        { id: 'low-2', planId: historyPlan.id, date: '2026-08-11', isCompleted: true, actualCount: 15 },
        { id: 'low-3', planId: historyPlan.id, date: '2026-08-12', isCompleted: true, actualCount: 12 },
      ],
      wordRecords: [],
      practiceRecords: [],
      timerRecords: [],
      words: words(),
    }, { now: NOW })

    expect(value.data.tracker.vocabularyHistory30Days).toMatchObject({
      pairedExecutionCount: 3,
      pairedPlannedWords: 90,
      pairedActualWords: 42,
      targetAttainmentRate: 46.7,
      calibrationDirection: 'reduce',
      baselineTargetCount: 30,
      calibratedTargetCount: 24,
    })
    expect(value.data.words.recommendationBounds.maximumTotalWords).toBe(24)
    expect(() => assertWordsPlanRecommendationMatchesContext({
      ...recommendation(),
      targetCount: 25,
      reviewWords: 18,
      newWords: 7,
    }, value.data)).toThrow(/bounds/)
  })

  it('ignores executions that predate the current plan target revision', () => {
    const sourcePlan = plan({ targetCount: 30 })
    const revisedPlan = plan({
      id: 'revised-plan',
      targetCount: 100,
      updatedAt: '2026-08-12T08:00:00.000Z',
    })
    const value = buildWordsPlanRecommendationSnapshot({
      sourcePlan,
      plans: [sourcePlan, revisedPlan],
      planExecutions: [
        { id: 'before-revision', planId: revisedPlan.id, date: '2026-08-10', isCompleted: true, actualCount: 20 },
        { id: 'after-revision', planId: revisedPlan.id, date: '2026-08-12', isCompleted: true, actualCount: 20 },
      ],
      wordRecords: [],
      practiceRecords: [],
      timerRecords: [],
      words: words(),
    }, { now: NOW })

    expect(value.data.tracker.vocabularyHistory30Days).toMatchObject({
      pairedExecutionCount: 1,
      pairedPlannedWords: 100,
      pairedActualWords: 20,
      calibrationDirection: 'insufficient',
    })
  })

  it('rejects an impossible daily floor before contacting AI', () => {
    const sourcePlan = plan()
    const impossibleWords = words()
    impossibleWords.targetDay = {
      ...impossibleWords.targetDay,
      plannedNewWords: 600,
      plannedReviewWords: 500,
      completedNewWords: 600,
      completedReviewWords: 500,
    }
    expect(() => buildWordsPlanRecommendationSnapshot({
      sourcePlan,
      plans: [sourcePlan],
      planExecutions: [],
      wordRecords: [],
      practiceRecords: [],
      timerRecords: [],
      words: impossibleWords,
    }, { now: NOW })).toThrow(/plan intent limit/)
  })

  it('uses the managed read-only gateway and never mutates either product', async () => {
    const value = snapshot()
    const execute = vi.fn(async (request) => ({
      ok: true as const,
      run: {
        runId: 'run-1',
        requestId: request.requestId,
        productId: 'tracker' as const,
        purpose: request.purpose,
        status: 'succeeded' as const,
        idempotencyKey: request.idempotencyKey,
        snapshotId: request.snapshot.snapshotId,
        contextHash: request.snapshot.contextHash,
        createdAt: NOW.toISOString(),
        completedAt: NOW.toISOString(),
      },
      artifact: {
        schemaVersion: 1 as const,
        outputSchemaVersion: 2 as const,
        artifactId: 'artifact-1',
        runId: 'run-1',
        kind: 'words_plan_recommendation' as const,
        status: 'final' as const,
        content: recommendation(),
        createdAt: NOW.toISOString(),
        dataAsOf: value.dataAsOf,
        contextHash: value.contextHash,
      },
      warnings: [],
    }))
    const result = await generateWordsPlanRecommendation(value, {
      managedGateway: { execute } as AiGateway,
      createId: () => '123e4567-e89b-42d3-a456-426614174000',
    })
    expect(result).toEqual(recommendation())
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'words_plan_recommendation',
      userInput: '',
      snapshot: value,
    }))
  })
})
