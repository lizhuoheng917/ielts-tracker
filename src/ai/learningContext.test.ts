import { describe, expect, it } from 'vitest'
import type { LearningContextSource } from './learningContext'
import { buildLearningContextSnapshot } from './learningContext'
import { DEFAULT_AI_PRIVACY_PREFERENCES } from '@/stores/aiPrivacyStore'

const NOW = new Date(2026, 7, 1, 12, 0, 0)

function createSource(): LearningContextSource {
  return {
    wordRecords: [
      {
        id: 'word-new',
        date: '2026-08-01',
        category: 'academic',
        count: 20,
        note: 'secret-word-note',
        createdAt: '2026-08-01T01:00:00.000Z',
        updatedAt: '2026-08-01T01:00:00.000Z',
      },
      {
        id: 'word-old',
        date: '2026-04-01',
        category: 'academic',
        count: 999,
        note: 'old-secret-note',
        createdAt: '2026-04-01T01:00:00.000Z',
        updatedAt: '2026-04-01T01:00:00.000Z',
      },
    ],
    practiceRecords: [{
      id: 'practice-1',
      date: '2026-07-31',
      type: 'listening',
      duration: 30,
      score: 6.5,
      note: 'secret-practice-note',
      topic: 'secret-topic',
      createdAt: '2026-07-31T01:00:00.000Z',
      updatedAt: '2026-07-31T01:00:00.000Z',
    }],
    timerRecords: [{
      id: 'timer-1',
      date: '2026-07-31',
      subject: 'reading',
      duration: 90,
      note: 'secret-timer-note',
      createdAt: '2026-07-31T02:00:00.000Z',
      updatedAt: '2026-07-31T02:00:00.000Z',
    }],
    plans: [{
      id: 'plan-1',
      title: 'secret-plan-title',
      description: 'secret-plan-description',
      category: 'listening',
      frequency: 'daily',
      isActive: true,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }],
    planExecutions: [{ id: 'execution-1', planId: 'plan-1', date: '2026-07-31', isCompleted: true }],
    diaryEntries: [{
      id: 'diary-1',
      date: '2026-07-31',
      mood: 'good',
      content: 'private diary content',
      createdAt: '2026-07-31T03:00:00.000Z',
      updatedAt: '2026-07-31T03:00:00.000Z',
    }],
    aiArtifacts: [{
      repositorySchemaVersion: 2,
      recordId: 'report-1',
      productId: 'tracker',
      kind: 'learning_analysis',
      outputSchemaVersion: 'legacy_text',
      title: 'analysis',
      content: { markdown: 'private prior ai content' },
      markdownProjection: 'private prior ai content',
      createdAt: '2026-07-31T04:00:00.000Z',
      savedAt: '2026-07-31T04:00:00.000Z',
      dataAsOf: '2026-07-31T04:00:00.000Z',
      source: 'legacy_import',
      provenance: {},
      warnings: [],
      owner: { scope: 'local' },
      retention: { policy: 'manual' },
    }],
    streak: {
      currentStreak: 2,
      longestStreak: 4,
      heatmapData: { '2026-07-31': 2, '2026-08-01': 1 },
    },
    achievement: { totalXP: 80, level: 1, levelName: '雅思新手' },
  }
}

describe('buildLearningContextSnapshot', () => {
  it('defaults to aggregate data and never leaks record notes or private content', () => {
    const snapshot = buildLearningContextSnapshot(createSource(), {
      purpose: 'learning_analysis',
      rangeDays: 30,
      privacy: DEFAULT_AI_PRIVACY_PREFERENCES,
      now: NOW,
      createId: () => 'snapshot-default',
    })
    const serialized = JSON.stringify(snapshot)

    expect(snapshot.privateScopes).toEqual([])
    expect(snapshot.data).not.toHaveProperty('diaryExcerpts')
    expect(snapshot.data).not.toHaveProperty('priorAiArtifacts')
    expect(snapshot.data.overview).toMatchObject({ learnedWordCount: 20, completedPlanExecutionCount: 1 })
    expect(serialized).not.toContain('secret-word-note')
    expect(serialized).not.toContain('secret-practice-note')
    expect(serialized).not.toContain('secret-timer-note')
    expect(serialized).not.toContain('secret-plan-title')
    expect(serialized).not.toContain('private diary content')
    expect(serialized).not.toContain('private prior ai content')
  })

  it('includes bounded private scopes only after explicit opt-in', () => {
    const snapshot = buildLearningContextSnapshot(createSource(), {
      purpose: 'learning_analysis',
      rangeDays: 30,
      privacy: {
        defaultRangeDays: 30,
        includeDiaryExcerpts: true,
        includePriorAIArtifacts: true,
      },
      now: NOW,
      createId: () => 'snapshot-private',
    })

    expect(snapshot.privateScopes).toEqual(['diary.excerpts', 'ai_artifacts.history'])
    expect(snapshot.data.diaryExcerpts).toEqual([
      { date: '2026-07-31', mood: 'good', excerpt: 'private diary content' },
    ])
    expect(snapshot.data.priorAiArtifacts?.[0]).toMatchObject({
      content: 'private prior ai content',
      evidenceClass: 'secondary_ai_output',
    })
  })

  it('uses the selected rolling range and marks a sparse snapshot honestly', () => {
    const source = createSource()
    source.practiceRecords = []
    source.timerRecords = []
    source.planExecutions = []
    const snapshot = buildLearningContextSnapshot(source, {
      purpose: 'daily_suggestion',
      rangeDays: 7,
      privacy: DEFAULT_AI_PRIVACY_PREFERENCES,
      now: NOW,
      createId: () => 'snapshot-range',
    })

    expect(snapshot.data.range).toEqual({ days: 7, startDate: '2026-07-26', endDate: '2026-08-01' })
    expect(snapshot.data.overview.learnedWordCount).toBe(20)
    expect(snapshot.data.overview.learnedWordCount).not.toBe(1019)
    expect(snapshot.quality.status).toBe('limited')
  })

  it('uses the canonical first plan execution for counts, rate and timeline', () => {
    const source = createSource()
    source.planExecutions = [
      { id: 'canonical', planId: 'plan-1', date: '2026-07-31', isCompleted: false },
      { id: 'legacy-duplicate', planId: 'plan-1', date: '2026-07-31', isCompleted: true },
    ]

    const snapshot = buildLearningContextSnapshot(source, {
      purpose: 'learning_analysis',
      rangeDays: 30,
      privacy: DEFAULT_AI_PRIVACY_PREFERENCES,
      now: NOW,
      createId: () => 'snapshot-deduped-executions',
    })

    expect(snapshot.data.recordCounts.planExecutions).toBe(1)
    expect(snapshot.data.overview).toMatchObject({
      recordedPlanExecutionCount: 1,
      completedPlanExecutionCount: 0,
      recordedPlanCompletionRate: 0,
    })
    expect(snapshot.data.timeline.find((entry) => entry.date === '2026-07-31')?.completedPlanCount)
      .toBe(0)
    expect(source.planExecutions).toHaveLength(2)
  })

  it('keeps hashes stable for the same evidence and changes them with source data', () => {
    const source = createSource()
    const options = {
      purpose: 'plan_draft' as const,
      rangeDays: 30 as const,
      privacy: DEFAULT_AI_PRIVACY_PREFERENCES,
      now: NOW,
    }
    const first = buildLearningContextSnapshot(source, { ...options, createId: () => 'snapshot-1' })
    const second = buildLearningContextSnapshot(source, { ...options, createId: () => 'snapshot-2' })

    expect(second.contextHash).toBe(first.contextHash)
    expect(second.sourceRevision).toBe(first.sourceRevision)
    source.wordRecords = [{ ...source.wordRecords[0], count: 21 }]
    const changed = buildLearningContextSnapshot(source, { ...options, createId: () => 'snapshot-3' })
    expect(changed.contextHash).not.toBe(first.contextHash)
    expect(changed.sourceRevision).not.toBe(first.sourceRevision)
  })

  it('rejects an unsupported range', () => {
    expect(() => buildLearningContextSnapshot(createSource(), {
      purpose: 'learning_analysis',
      rangeDays: 14 as 30,
      privacy: DEFAULT_AI_PRIVACY_PREFERENCES,
      now: NOW,
    })).toThrow('Unsupported AI context range')
  })
})
