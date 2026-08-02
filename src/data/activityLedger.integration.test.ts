import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createBackfillLedger,
  replayActivityLedger,
  type ActivityLedgerSnapshot,
} from '@/data/activityLedger'
import { BackupApplyError, createBackupV3, importBackupJson } from '@/data/backupService'
import type { BackupDataV3 } from '@/data/backupTypes'
import {
  LOCAL_MUTATION_JOURNAL_KEY,
  createLocalMutation,
  prepareLocalMutation,
  readPendingLocalMutation,
} from '@/data/localMutationJournal'
import { addLocalDays, toLocalDate } from '@/lib/localDate'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  private failingKey: string | null = null

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
    this.failingKey = null
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    if (this.failingKey === key) {
      this.failingKey = null
      throw new DOMException('simulated quota limit', 'QuotaExceededError')
    }
    this.values.set(key, value)
  }

  failNextWriteForKey(key: string) {
    this.failingKey = key
  }
}

const memoryStorage = new MemoryStorage()

let useAchievementStore: typeof import('@/stores/achievementStore').useAchievementStore
let useActivityLedgerStore: typeof import('@/stores/activityLedgerStore').useActivityLedgerStore
let useAiArtifactStore: typeof import('@/stores/aiArtifactStore').useAiArtifactStore
let useAIStore: typeof import('@/stores/aiStore').useAIStore
let activityLedgerMaxEvents: number
let useDailyCheckinStore: typeof import('@/stores/dailyCheckinStore').useDailyCheckinStore
let useDiaryStore: typeof import('@/stores/diaryStore').useDiaryStore
let usePlanStore: typeof import('@/stores/planStore').usePlanStore
let usePracticeStore: typeof import('@/stores/practiceStore').usePracticeStore
let useSettingsStore: typeof import('@/stores/settingsStore').useSettingsStore
let useStreakStore: typeof import('@/stores/streakStore').useStreakStore
let useTimerStore: typeof import('@/stores/timerStore').useTimerStore
let useWordStore: typeof import('@/stores/wordStore').useWordStore
let ensureActivityLedgerInitialized:
  typeof import('@/data/activityLedgerBootstrap').ensureActivityLedgerInitialized
let rebuildActivityLedger:
  typeof import('@/data/activityLedgerBootstrap').rebuildActivityLedger
let ensureDailyCheckinAwardsInitialized:
  typeof import('@/data/dailyCheckinBootstrap').ensureDailyCheckinAwardsInitialized
let browserBackupAdapter: typeof import('@/data/browserBackupAdapter').browserBackupAdapter

beforeAll(async () => {
  vi.stubGlobal('localStorage', memoryStorage)
  let uuidCounter = 0
  vi.stubGlobal('crypto', { randomUUID: () => `test-uuid-${++uuidCounter}` })

  ;({ useAchievementStore } = await import('@/stores/achievementStore'))
  ;({ useAiArtifactStore } = await import('@/stores/aiArtifactStore'))
  ;({ useAIStore } = await import('@/stores/aiStore'))
  ;({
    useActivityLedgerStore,
    ACTIVITY_LEDGER_MAX_EVENTS: activityLedgerMaxEvents,
  } = await import('@/stores/activityLedgerStore'))
  ;({ useDailyCheckinStore } = await import('@/stores/dailyCheckinStore'))
  ;({ useDiaryStore } = await import('@/stores/diaryStore'))
  ;({ usePlanStore } = await import('@/stores/planStore'))
  ;({ usePracticeStore } = await import('@/stores/practiceStore'))
  ;({ useSettingsStore } = await import('@/stores/settingsStore'))
  ;({ useStreakStore } = await import('@/stores/streakStore'))
  ;({ useTimerStore } = await import('@/stores/timerStore'))
  ;({ useWordStore } = await import('@/stores/wordStore'))
  ;({ ensureActivityLedgerInitialized, rebuildActivityLedger } = await import(
    '@/data/activityLedgerBootstrap'
  ))
  ;({ ensureDailyCheckinAwardsInitialized } = await import('@/data/dailyCheckinBootstrap'))
  ;({ browserBackupAdapter } = await import('@/data/browserBackupAdapter'))
})

beforeEach(() => {
  localStorage.clear()
  useWordStore.setState({ records: [] })
  usePracticeStore.setState({ records: [] })
  useTimerStore.setState({ records: [] })
  useDiaryStore.setState({ entries: [] })
  usePlanStore.setState({ plans: [], executions: [], aiCommandReceipts: [], mutationRevision: 0 })
  useDailyCheckinStore.setState({ migrationVersion: 1, awards: [] })
  useAchievementStore.setState({
    unlockedBadges: [],
    totalXP: 0,
    level: 1,
    statsViewCount: 0,
  })
  useStreakStore.setState({
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: '',
    heatmapData: {},
  })
  useSettingsStore.setState({ lastCheckinDate: undefined })
  useActivityLedgerStore.setState({ schemaVersion: 1, baseline: null, events: [] })
  useAiArtifactStore.setState({
    artifacts: [],
    migration: { version: 1, status: 'complete', importedCount: 0 },
  })
  useAIStore.setState({
    providerPreset: 'agnes',
    apiKey: '',
    baseURL: 'https://apihub.agnes-ai.com/v1',
    model: 'agnes-2.0-flash',
  })
  ensureActivityLedgerInitialized('2026-08-01T00:00:00.000Z')
})

function replayCurrentLedger() {
  const ledger = useActivityLedgerStore.getState()
  if (!ledger.baseline) throw new Error('activity ledger was not initialized')

  return replayActivityLedger(
    {
      schemaVersion: ledger.schemaVersion,
      baseline: ledger.baseline,
      events: ledger.events,
    } satisfies ActivityLedgerSnapshot,
    toLocalDate(),
  )
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function expectReplayMatchesCurrentProjection() {
  const replayed = replayCurrentLedger()
  const achievements = useAchievementStore.getState()
  const streak = useStreakStore.getState()

  expect(replayed.achievements.totalXP).toBe(achievements.totalXP)
  expect(replayed.achievements.level).toBe(achievements.level)
  expect(replayed.streak).toEqual({
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastActiveDate: streak.lastActiveDate,
    heatmapData: streak.heatmapData,
  })
  expect(replayed.lastCheckinDate).toBe(useSettingsStore.getState().lastCheckinDate)
}

describe('activity ledger store integration', () => {
  it('initializes once, increments revisions, deduplicates and rehydrates persisted state', async () => {
    const current = useActivityLedgerStore.getState()
    const replacement = createBackfillLedger({
      achievements: {
        unlockedBadges: [],
        totalXP: 99,
        level: 1,
        statsViewCount: 0,
      },
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: '',
        heatmapData: {},
      },
      rewardedCheckinDates: [],
    }, '2026-08-01T01:00:00.000Z')

    expect(current.initialize(replacement)).toBe(false)

    const record = {
      id: 'revision-word',
      date: toLocalDate(),
      category: 'academic',
      count: 5,
      createdAt: '2026-08-01T01:00:00.000Z',
      updatedAt: '2026-08-01T01:00:00.000Z',
    }
    const first = current.append({
      entityKind: 'word_record',
      entityId: record.id,
      operation: 'created',
      occurredAt: record.createdAt,
      source: 'user',
      after: record,
    })
    const second = current.append({
      entityKind: 'word_record',
      entityId: record.id,
      operation: 'updated',
      occurredAt: '2026-08-01T02:00:00.000Z',
      source: 'user',
      before: record,
      after: { ...record, count: 10 },
    })
    const explicit = current.append({
      idempotencyKey: 'explicit-once',
      entityKind: 'word_record',
      entityId: 'explicit-word',
      operation: 'created',
      occurredAt: '2026-08-01T03:00:00.000Z',
      source: 'user',
      after: { ...record, id: 'explicit-word' },
    })
    const duplicate = current.append({
      idempotencyKey: 'explicit-once',
      entityKind: 'word_record',
      entityId: 'explicit-word',
      operation: 'created',
      occurredAt: '2026-08-01T03:00:01.000Z',
      source: 'user',
      after: { ...record, id: 'explicit-word' },
    })

    expect([first?.revision, second?.revision, explicit?.revision]).toEqual([1, 2, 1])
    expect(duplicate).toBeNull()

    const persisted = localStorage.getItem('ielts-tracker:activityLedger')
    expect(persisted).not.toBeNull()
    useActivityLedgerStore.setState({ baseline: null, events: [] })
    localStorage.setItem('ielts-tracker:activityLedger', persisted!)
    await useActivityLedgerStore.persist.rehydrate()

    expect(useActivityLedgerStore.getState().events).toHaveLength(3)
    expect(useActivityLedgerStore.getState().baseline?.achievements.totalXP).toBe(0)

    useActivityLedgerStore.getState().clear()
    expect(useActivityLedgerStore.getState().baseline).toBeNull()
    expect(useActivityLedgerStore.getState().events).toEqual([])
  })

  it('keeps canonical mutations available when shadow persistence hits quota', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const today = toLocalDate()
    memoryStorage.failNextWriteForKey('ielts-tracker:activityLedger')

    expect(() => useWordStore.getState().addRecord({
      date: today,
      category: 'academic',
      count: 10,
    })).not.toThrow()

    expect(useWordStore.getState().records).toHaveLength(1)
    expect(useAchievementStore.getState().totalXP).toBe(5)
    expect(useStreakStore.getState().heatmapData).toEqual({ [today]: 1 })
    expect(useActivityLedgerStore.getState().events).toHaveLength(1)
    expectReplayMatchesCurrentProjection()
    expect(JSON.parse(localStorage.getItem('ielts-tracker:mutationJournal')!)).toMatchObject({
      phase: 'committed',
      action: 'word.create',
    })
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })

  it('rebases a bounded event window instead of growing without limit', () => {
    const ledger = useActivityLedgerStore.getState()
    const date = toLocalDate()

    for (let index = 0; index <= activityLedgerMaxEvents; index += 1) {
      const occurredAt = new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString()
      ledger.append({
        entityKind: 'word_record',
        entityId: `bounded-${index}`,
        operation: 'created',
        occurredAt,
        source: 'user',
        after: {
          id: `bounded-${index}`,
          date,
          category: 'academic',
          count: 5,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
      })
    }

    expect(useActivityLedgerStore.getState().baseline?.source).toBe('rebase')
    expect(useActivityLedgerStore.getState().events).toHaveLength(1)
    expect(replayCurrentLedger().achievements.totalXP).toBe(
      (activityLedgerMaxEvents + 1) * 3,
    )
  })

  it('checkpoints legacy stores without rewriting their records or derived state', () => {
    const legacyDate = '2026-07-15'
    const legacyWord = {
      id: 'legacy-word',
      date: legacyDate,
      category: 'academic',
      count: 17,
      note: 'keep legacy text exactly',
      createdAt: '2026-07-15T01:00:00.000Z',
      updatedAt: '2026-07-15T01:00:00.000Z',
    }
    useWordStore.setState({ records: [legacyWord] })
    useAchievementStore.setState({ totalXP: 42, level: 3, statsViewCount: 7 })
    useStreakStore.setState({
      currentStreak: 4,
      longestStreak: 9,
      lastActiveDate: legacyDate,
      heatmapData: { [legacyDate]: 2 },
    })
    useSettingsStore.setState({ lastCheckinDate: legacyDate })
    useActivityLedgerStore.setState({ baseline: null, events: [] })

    const canonicalBefore = JSON.stringify({
      words: useWordStore.getState().records,
      achievements: {
        totalXP: useAchievementStore.getState().totalXP,
        level: useAchievementStore.getState().level,
        statsViewCount: useAchievementStore.getState().statsViewCount,
      },
      streak: {
        currentStreak: useStreakStore.getState().currentStreak,
        longestStreak: useStreakStore.getState().longestStreak,
        lastActiveDate: useStreakStore.getState().lastActiveDate,
        heatmapData: useStreakStore.getState().heatmapData,
      },
      lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
    })

    expect(ensureActivityLedgerInitialized('2026-08-01T05:00:00.000Z')).toBe(true)
    expect(ensureActivityLedgerInitialized('2026-08-01T06:00:00.000Z')).toBe(false)
    expect(JSON.stringify({
      words: useWordStore.getState().records,
      achievements: {
        totalXP: useAchievementStore.getState().totalXP,
        level: useAchievementStore.getState().level,
        statsViewCount: useAchievementStore.getState().statsViewCount,
      },
      streak: {
        currentStreak: useStreakStore.getState().currentStreak,
        longestStreak: useStreakStore.getState().longestStreak,
        lastActiveDate: useStreakStore.getState().lastActiveDate,
        heatmapData: useStreakStore.getState().heatmapData,
      },
      lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
    })).toBe(canonicalBefore)
    expect(useActivityLedgerStore.getState().events).toEqual([])
    expect(JSON.stringify(useActivityLedgerStore.getState().baseline)).not.toContain(
      'keep legacy text exactly',
    )
  })

  it('normalizes derived level and streak fields while hydrating legacy projections', async () => {
    const today = toLocalDate()
    const yesterday = addLocalDays(today, -1)
    localStorage.setItem('ielts-tracker:achievements', JSON.stringify({
      state: {
        unlockedBadges: [],
        totalXP: 100,
        level: 1,
        statsViewCount: 0,
      },
      version: 0,
    }))
    localStorage.setItem('ielts-tracker:streakData', JSON.stringify({
      state: {
        currentStreak: 0,
        longestStreak: 1,
        lastActiveDate: '2000-01-01',
        heatmapData: { [yesterday]: 1, [today]: 1 },
      },
      version: 0,
    }))

    await useAchievementStore.persist.rehydrate()
    await useStreakStore.persist.rehydrate()

    expect(useAchievementStore.getState().level).toBe(2)
    expect(useStreakStore.getState()).toMatchObject({
      currentStreak: 2,
      longestStreak: 2,
      lastActiveDate: today,
      heatmapData: { [yesterday]: 1, [today]: 1 },
    })
  })

  it('keeps word XP and activity reversible through create, move, edit and delete', () => {
    const firstDate = toLocalDate()
    const secondDate = firstDate === '2026-08-01' ? '2026-07-31' : '2026-08-01'

    useWordStore.getState().addRecord({
      date: firstDate,
      category: 'academic',
      count: 5,
    })
    const record = useWordStore.getState().records[0]

    expect(useAchievementStore.getState().totalXP).toBe(3)
    expect(useStreakStore.getState().heatmapData).toEqual({ [firstDate]: 1 })
    expectReplayMatchesCurrentProjection()

    useWordStore.getState().updateRecord(record.id, { date: secondDate, count: 10 })

    expect(useAchievementStore.getState().totalXP).toBe(5)
    expect(useStreakStore.getState().heatmapData).toEqual({ [secondDate]: 1 })
    expectReplayMatchesCurrentProjection()

    useWordStore.getState().deleteRecord(record.id)

    expect(useAchievementStore.getState().totalXP).toBe(0)
    expect(useStreakStore.getState().heatmapData).toEqual({})
    expect(useActivityLedgerStore.getState().events).toHaveLength(3)
    expectReplayMatchesCurrentProjection()
  })

  it('keeps practice minutes, timer seconds and diary entries on the same reversible ledger', () => {
    const firstDate = toLocalDate()
    const secondDate = firstDate === '2026-08-01' ? '2026-07-31' : '2026-08-01'

    usePracticeStore.getState().addRecord({
      type: 'reading',
      date: firstDate,
      duration: 1,
    })
    useTimerStore.getState().addRecord({
      subject: 'listening',
      date: firstDate,
      duration: 60,
    })
    useDiaryStore.getState().addEntry({
      date: firstDate,
      mood: 'good',
      content: 'Short reflection',
    })

    const practice = usePracticeStore.getState().records[0]
    const timer = useTimerStore.getState().records[0]
    const diary = useDiaryStore.getState().entries[0]
    expect(useAchievementStore.getState().totalXP).toBe(10)
    expect(useStreakStore.getState().heatmapData).toEqual({ [firstDate]: 3 })
    expectReplayMatchesCurrentProjection()

    usePracticeStore.getState().updateRecord(practice.id, { date: secondDate, duration: 4 })
    useTimerStore.getState().updateRecord(timer.id, { date: secondDate, duration: 240 })
    useDiaryStore.getState().updateEntry(diary.id, { date: secondDate })

    expect(useAchievementStore.getState().totalXP).toBe(12)
    expect(useStreakStore.getState().heatmapData).toEqual({ [secondDate]: 3 })
    expectReplayMatchesCurrentProjection()

    usePracticeStore.getState().deleteRecord(practice.id)
    useTimerStore.getState().deleteRecord(timer.id)
    useDiaryStore.getState().deleteEntry(diary.id)

    expect(useAchievementStore.getState().totalXP).toBe(0)
    expect(useStreakStore.getState().heatmapData).toEqual({})
    const events = useActivityLedgerStore.getState().events
    expect(events).toHaveLength(9)
    for (const entityId of [practice.id, timer.id, diary.id]) {
      expect(events.filter((event) => event.entityId === entityId).map((event) => event.revision))
        .toEqual([1, 2, 3])
    }
    expectReplayMatchesCurrentProjection()
  })

  it('awards a manual daily checkin even after another learning action', () => {
    const today = toLocalDate()
    useWordStore.getState().addRecord({ date: today, category: 'academic', count: 5 })

    expect(useSettingsStore.getState().completeDailyCheckin(today)).toBe(true)
    expect(useSettingsStore.getState().completeDailyCheckin(today)).toBe(false)
    expect(useAchievementStore.getState().totalXP).toBe(13)
    expect(useStreakStore.getState().heatmapData).toEqual({ [today]: 2 })
    expectReplayMatchesCurrentProjection()
  })

  it('unlocks continuous-learning milestones from ordinary learning activity', () => {
    const today = toLocalDate()
    for (let offset = -6; offset <= 0; offset += 1) {
      useWordStore.getState().addRecord({
        date: addLocalDays(today, offset),
        category: 'academic',
        count: 1,
      })
    }

    expect(useStreakStore.getState().currentStreak).toBe(7)
    expect(useAchievementStore.getState().unlockedBadges).toContain('streak-7')
    expectReplayMatchesCurrentProjection()
  })

  it('does not duplicate daily XP across multiple completed plans', async () => {
    const today = toLocalDate()
    const plans = usePlanStore.getState()

    await plans.setExecutionForDate({ planId: 'plan-1', date: today, isCompleted: true })
    await plans.setExecutionForDate({ planId: 'plan-2', date: today, isCompleted: true })

    expect(useAchievementStore.getState().totalXP).toBe(10)
    expect(useStreakStore.getState().heatmapData).toEqual({ [today]: 2 })
    expect(useActivityLedgerStore.getState().events.filter(
      (event) => event.entityKind === 'daily_checkin',
    )).toHaveLength(1)
    expectReplayMatchesCurrentProjection()

    await usePlanStore.getState().setExecutionForDate({
      planId: 'plan-1',
      date: today,
      isCompleted: false,
    })
    const planTwoExecution = usePlanStore.getState().executions.find(
      (execution) => execution.planId === 'plan-2',
    )!
    await usePlanStore.getState().deleteExecution(planTwoExecution.id)

    // Daily checkin XP is earned once and remains independent from later plan edits.
    expect(useAchievementStore.getState().totalXP).toBe(10)
    expect(useStreakStore.getState().heatmapData).toEqual({})
    expectReplayMatchesCurrentProjection()
  })

  it('serializes repeated completion for one plan and date into one execution', async () => {
    const today = toLocalDate()

    const results = await Promise.all([
      usePlanStore.getState().setExecutionForDate({
        planId: 'same-plan',
        date: today,
        isCompleted: true,
      }),
      usePlanStore.getState().setExecutionForDate({
        planId: 'same-plan',
        date: today,
        isCompleted: true,
      }),
    ])

    expect(results.map((result) => result.status).sort()).toEqual(['applied', 'duplicate'])
    expect(usePlanStore.getState().executions).toHaveLength(1)
    expect(useAchievementStore.getState().totalXP).toBe(10)
    expect(useStreakStore.getState().heatmapData).toEqual({ [today]: 1 })
    expect(useDailyCheckinStore.getState().awards).toHaveLength(1)
    expect(useActivityLedgerStore.getState().events.filter(
      (event) => event.entityKind === 'plan_execution',
    )).toHaveLength(1)
    expect(useActivityLedgerStore.getState().events.filter(
      (event) => event.entityKind === 'daily_checkin',
    )).toHaveLength(1)
    expectReplayMatchesCurrentProjection()
  })

  it('does not recover or overwrite a prepared non-plan transaction from another tab', async () => {
    const foreignTransaction = createLocalMutation({
      action: 'word.create',
      patches: [],
    })
    prepareLocalMutation(foreignTransaction)

    const result = await usePlanStore.getState().setExecutionForDate({
      planId: 'blocked-by-foreign-journal',
      date: toLocalDate(),
      isCompleted: true,
    })

    expect(result.status).toBe('busy')
    expect(usePlanStore.getState().executions).toEqual([])
    expect(readPendingLocalMutation()).toEqual(foreignTransaction)
    localStorage.removeItem(LOCAL_MUTATION_JOURNAL_KEY)
  })

  it('keeps one execution id across absolute completion updates and no-ops', async () => {
    const today = toLocalDate()
    const created = await usePlanStore.getState().setExecutionForDate({
      planId: 'stable-plan',
      date: today,
      isCompleted: true,
    })
    const firstId = created.targetId
    const repeatedTrue = await usePlanStore.getState().setExecutionForDate({
      planId: 'stable-plan',
      date: today,
      isCompleted: true,
    })
    const cleared = await usePlanStore.getState().setExecutionForDate({
      planId: 'stable-plan',
      date: today,
      isCompleted: false,
    })
    const repeatedFalse = await usePlanStore.getState().setExecutionForDate({
      planId: 'stable-plan',
      date: today,
      isCompleted: false,
    })

    expect(repeatedTrue.status).toBe('duplicate')
    expect(cleared).toMatchObject({ status: 'applied', targetId: firstId })
    expect(repeatedFalse).toMatchObject({ status: 'duplicate', targetId: firstId })
    expect(usePlanStore.getState().executions).toEqual([{
      id: firstId,
      planId: 'stable-plan',
      date: today,
      isCompleted: false,
    }])
    expect(useStreakStore.getState().heatmapData).toEqual({})
    expect(useAchievementStore.getState().totalXP).toBe(10)
    expect(useActivityLedgerStore.getState().events.filter(
      (event) => event.entityKind === 'plan_execution',
    )).toHaveLength(2)
    expectReplayMatchesCurrentProjection()
  })

  it.each([
    ['completed plus completed', true, true, 2, 1],
    ['completed plus pending', true, false, 1, 1],
    ['pending plus completed', false, true, 1, 0],
    ['pending plus pending', false, false, 0, 0],
  ])(
    'repairs legacy duplicate executions: %s',
    async (_, canonicalCompleted, duplicateCompleted, beforeCount, afterCount) => {
      const date = '2026-07-25'
      usePlanStore.setState({
        executions: [
          {
            id: 'canonical-execution',
            planId: 'legacy-plan',
            date,
            isCompleted: canonicalCompleted,
          },
          {
            id: 'duplicate-execution',
            planId: 'legacy-plan',
            date,
            isCompleted: duplicateCompleted,
          },
        ],
        mutationRevision: 0,
      })
      useStreakStore.setState({
        currentStreak: beforeCount > 0 ? 1 : 0,
        longestStreak: beforeCount > 0 ? 1 : 0,
        lastActiveDate: beforeCount > 0 ? date : '',
        heatmapData: beforeCount > 0 ? { [date]: beforeCount } : {},
      })
      rebuildActivityLedger('2026-08-01T04:00:00.000Z', 'import')

      const result = await usePlanStore.getState().repairDuplicatePlanExecutions()

      expect(result).toMatchObject({ status: 'applied', removedCount: 1 })
      expect(usePlanStore.getState().executions).toEqual([{
        id: 'canonical-execution',
        planId: 'legacy-plan',
        date,
        isCompleted: canonicalCompleted,
      }])
      expect(useStreakStore.getState().heatmapData).toEqual(
        afterCount > 0 ? { [date]: afterCount } : {},
      )
      expect(useActivityLedgerStore.getState().events.at(-1)).toMatchObject({
        entityId: 'duplicate-execution',
        operation: 'deleted',
        before: { id: 'duplicate-execution' },
      })
      expectReplayMatchesCurrentProjection()
    },
  )

  it('rebuilds historical completed-plan checkin guards after an import', async () => {
    const historicalDate = '2026-07-20'
    usePlanStore.setState({
      executions: [{
        id: 'historical-execution',
        planId: 'historical-plan',
        date: historicalDate,
        isCompleted: true,
      }],
    })
    useAchievementStore.setState({ totalXP: 10, level: 1 })
    useStreakStore.setState({
      currentStreak: 0,
      longestStreak: 1,
      lastActiveDate: historicalDate,
      heatmapData: { [historicalDate]: 1 },
    })
    useDailyCheckinStore.setState({ migrationVersion: 0, awards: [] })
    ensureDailyCheckinAwardsInitialized('2026-08-01T03:59:59.000Z')
    rebuildActivityLedger('2026-08-01T04:00:00.000Z', 'import')

    expect(useActivityLedgerStore.getState().baseline?.source).toBe('import')
    expect(useDailyCheckinStore.getState().hasAward(historicalDate)).toBe(true)

    await usePlanStore.getState().setExecutionForDate({
      planId: 'historical-plan',
      date: historicalDate,
      isCompleted: false,
    })
    await usePlanStore.getState().setExecutionForDate({
      planId: 'historical-plan',
      date: historicalDate,
      isCompleted: true,
    })

    expect(useAchievementStore.getState().totalXP).toBe(10)
    expect(useActivityLedgerStore.getState().events.some(
      (event) => event.entityKind === 'daily_checkin',
    )).toBe(false)
    expectReplayMatchesCurrentProjection()
  })

  it('refuses startup when canonical daily-checkin migration cannot persist', () => {
    useDailyCheckinStore.setState({ migrationVersion: 0, awards: [] })
    useSettingsStore.setState({ lastCheckinDate: '2026-07-21' })
    memoryStorage.failNextWriteForKey('ielts-tracker:dailyCheckins')

    expect(() => ensureDailyCheckinAwardsInitialized('2026-08-01T04:30:00.000Z')).toThrow()

    const persisted = JSON.parse(localStorage.getItem('ielts-tracker:dailyCheckins')!)
    expect(persisted.state).toMatchObject({ migrationVersion: 0, awards: [] })
  })

  it('rebases the shadow ledger on a successful browser backup import', () => {
    useWordStore.getState().addRecord({
      date: toLocalDate(),
      category: 'academic',
      count: 5,
    })
    expect(useActivityLedgerStore.getState().events).toHaveLength(1)

    const incoming = clone(browserBackupAdapter.read())
    incoming.words = [{
      id: 'imported-word',
      date: '2026-07-10',
      category: 'academic',
      count: 20,
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    }]
    incoming.achievements = {
      unlockedBadges: [],
      totalXP: 10,
      level: 1,
      statsViewCount: 0,
    }
    incoming.streak = {
      currentStreak: 0,
      longestStreak: 1,
      lastActiveDate: '2026-07-10',
      heatmapData: { '2026-07-10': 1 },
    }

    browserBackupAdapter.write(incoming)

    expect(useWordStore.getState().records).toEqual(incoming.words)
    expect(useActivityLedgerStore.getState().events).toEqual([])
    expect(useActivityLedgerStore.getState().baseline?.source).toBe('import')
    expect(useActivityLedgerStore.getState().baseline?.achievements.totalXP).toBe(10)
  })

  it('preserves current AI credentials and routing when importing a V3 backup', () => {
    const currentAiConfig = {
      providerPreset: 'openai-compatible' as const,
      apiKey: 'current-local-secret',
      baseURL: 'https://trusted-current.test/v1',
      model: 'trusted-current-model',
    }
    useAIStore.setState(currentAiConfig)

    const portableBackup = createBackupV3({
      read: () => browserBackupAdapter.read(),
      write: () => undefined,
    }) as ReturnType<typeof createBackupV3> & {
      data: ReturnType<typeof createBackupV3>['data'] & {
        aiPreferences?: unknown
      }
    }
    portableBackup.data.aiPreferences = {
      providerPreset: 'deepseek',
      apiKey: 'imported-secret-must-not-win',
      baseURL: 'https://attacker.invalid/v1',
      model: 'attacker-model',
    }

    importBackupJson(JSON.stringify(portableBackup), browserBackupAdapter)

    expect(useAIStore.getState()).toMatchObject(currentAiConfig)
    expect(browserBackupAdapter.read()).not.toHaveProperty('aiPreferences')
  })

  it('migrates missing daily-checkin awards before rebasing the shadow ledger', () => {
    const exportedAt = '2026-08-01T05:00:00.000Z'
    const incoming = clone(browserBackupAdapter.read())
    incoming.executions = [
      {
        id: 'imported-completed-execution',
        planId: 'imported-plan',
        date: '2026-07-20',
        isCompleted: true,
      },
    ]
    incoming.settings.lastCheckinDate = '2026-07-21'
    incoming.achievements = {
      unlockedBadges: ['first-checkin'],
      totalXP: 20,
      level: 1,
      statsViewCount: 0,
    }
    const backup = createBackupV3({
      read: () => incoming,
      write: () => undefined,
    }, exportedAt)
    delete (backup.data as { dailyCheckins?: BackupDataV3['dailyCheckins'] }).dailyCheckins

    importBackupJson(JSON.stringify(backup), browserBackupAdapter)

    expect(useDailyCheckinStore.getState().awards).toEqual([
      {
        id: '2026-07-20',
        date: '2026-07-20',
        awardedXP: 0,
        awardedAt: exportedAt,
        source: 'migration',
        sourceEntityId: 'imported-completed-execution',
      },
      {
        id: '2026-07-21',
        date: '2026-07-21',
        awardedXP: 0,
        awardedAt: exportedAt,
        source: 'migration',
      },
    ])
    expect(useAchievementStore.getState().totalXP).toBe(20)
    expect(useActivityLedgerStore.getState().events).toEqual([])
    expect(useActivityLedgerStore.getState().baseline?.source).toBe('import')
    expect(useActivityLedgerStore.getState().baseline?.rewardedCheckinDates).toEqual([
      '2026-07-20',
      '2026-07-21',
    ])
  })

  it('restores canonical browser stores when a multi-store import write fails', () => {
    useWordStore.getState().addRecord({
      date: toLocalDate(),
      category: 'academic',
      count: 5,
    })
    useAiArtifactStore.getState().importLegacyArtifacts({
      content: 'artifact that must survive rollback',
      createdAt: '2026-07-31T00:00:00.000Z',
    }, [])
    useAiArtifactStore.getState().adoptLocalArtifacts(
      '11111111-1111-4111-8111-111111111111',
    )
    const before = clone(browserBackupAdapter.read())
    const incoming: BackupDataV3 = clone(before)
    incoming.words = []
    incoming.aiArtifacts = []
    incoming.practice = [{
      id: 'incoming-practice',
      type: 'reading',
      date: '2026-07-11',
      duration: 30,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    }]
    const serialized = JSON.stringify(createBackupV3({
      read: () => incoming,
      write: () => undefined,
    }))
    // Fail after the imported artifact store has already been replaced, so the
    // transaction must restore AI artifacts as well as earlier stores.
    memoryStorage.failNextWriteForKey('ielts-tracker:achievements')

    expect(() => importBackupJson(serialized, browserBackupAdapter)).toThrow(BackupApplyError)

    expect(browserBackupAdapter.read()).toEqual(before)
    expect(useAiArtifactStore.getState().artifacts).toEqual(before.aiArtifacts)
    expect(useAiArtifactStore.getState().artifacts[0].owner.scope).toBe('account')
    // V3 intentionally excludes the rebuildable ledger, so rollback restores
    // canonical data and rebases the shadow history to a fresh checkpoint.
    expect(useActivityLedgerStore.getState().baseline?.source).toBe('import')
    expect(useActivityLedgerStore.getState().events).toEqual([])
  })

  it('ignores mutations for missing ids without changing projections', async () => {
    useWordStore.getState().updateRecord('missing', { count: 999 })
    useWordStore.getState().deleteRecord('missing')
    await usePlanStore.getState().setExecutionForDate({
      planId: 'missing',
      date: toLocalDate(),
      isCompleted: false,
    })
    await usePlanStore.getState().deleteExecution('missing')

    expect(useAchievementStore.getState().totalXP).toBe(0)
    expect(useStreakStore.getState().heatmapData).toEqual({})
    expect(useActivityLedgerStore.getState().events).toEqual([])
    expectReplayMatchesCurrentProjection()
  })
})
