import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { replayActivityLedger } from '@/data/activityLedger'
import {
  LOCAL_MUTATION_JOURNAL_KEY,
  createLocalMutation,
  markLocalMutationCommitted,
  prepareLocalMutation,
} from '@/data/localMutationJournal'
import { toLocalDate } from '@/lib/localDate'
import type {
  PlanExecution,
  PracticeRecord,
  StudyPlan,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import type { TrackerPhase4bLocalSnapshot } from '@/sync/trackerPhase4bRecordSync'
import {
  DEFAULT_DASHBOARD_CARD_ORDER,
  DEFAULT_DASHBOARD_CARD_VISIBILITY,
} from '@/features/dashboard/dashboardLayout'

const PLAN_STORAGE_KEY = 'ielts-tracker:studyPlans'
const PRACTICE_STORAGE_KEY = 'ielts-tracker:practiceRecords'
const TIMER_STORAGE_KEY = 'ielts-tracker:timerRecords'
const WORD_STORAGE_KEY = 'ielts-tracker:wordRecords'
const OCCURRED_AT = '2026-08-03T08:00:00.000Z'

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
      throw new DOMException(`simulated write failure for ${key}`, 'QuotaExceededError')
    }
    this.values.set(key, value)
  }

  failNextWriteForKey(key: string) {
    this.failingKey = key
  }
}

const memoryStorage = new MemoryStorage()

let ensureActivityLedgerInitialized:
  typeof import('@/data/activityLedgerBootstrap').ensureActivityLedgerInitialized
let installTrackerPhase4bStoreSnapshot:
  typeof import('@/sync/trackerPhase4bStoreAdapter').installTrackerPhase4bStoreSnapshot
let readTrackerPhase4bStoreSnapshot:
  typeof import('@/sync/trackerPhase4bStoreAdapter').readTrackerPhase4bStoreSnapshot
let trackerPhase4bSnapshotFingerprint:
  typeof import('@/sync/trackerPhase4bStoreAdapter').trackerPhase4bSnapshotFingerprint
let useAchievementStore: typeof import('@/stores/achievementStore').useAchievementStore
let useActivityLedgerStore: typeof import('@/stores/activityLedgerStore').useActivityLedgerStore
let useDailyCheckinStore: typeof import('@/stores/dailyCheckinStore').useDailyCheckinStore
let useDiaryStore: typeof import('@/stores/diaryStore').useDiaryStore
let usePlanStore: typeof import('@/stores/planStore').usePlanStore
let usePracticeStore: typeof import('@/stores/practiceStore').usePracticeStore
let useSettingsStore: typeof import('@/stores/settingsStore').useSettingsStore
let useStreakStore: typeof import('@/stores/streakStore').useStreakStore
let useTimerStore: typeof import('@/stores/timerStore').useTimerStore
let useWordStore: typeof import('@/stores/wordStore').useWordStore

function plan(id = 'plan-remote'): StudyPlan {
  return {
    id,
    title: '每日阅读复盘',
    description: '完成一组阅读并整理错因',
    category: 'reading',
    frequency: 'daily',
    targetTime: '08:30',
    targetDuration: 30,
    targetCount: 1,
    isActive: true,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-03T07:55:00.000Z',
  }
}

function execution(planId = 'plan-remote'): PlanExecution {
  return {
    id: `execution:${planId}:2026-08-03`,
    planId,
    date: '2026-08-03',
    isCompleted: true,
    actualDuration: 28,
    actualCount: 1,
    note: '已完成并复盘',
    updatedAt: '2026-08-03T07:56:00.000Z',
  }
}

function practice(id = 'practice-remote'): PracticeRecord {
  return {
    id,
    type: 'writing',
    date: '2026-08-03',
    topic: 'Task 2 模考',
    duration: 60,
    score: 7.5,
    note: '检查论证衔接',
    createdAt: '2026-08-03T06:00:00.000Z',
    updatedAt: '2026-08-03T07:57:00.000Z',
  }
}

function timer(id = 'timer-remote'): TimerRecord {
  return {
    id,
    subject: 'listening',
    date: '2026-08-03',
    duration: 1_800,
    note: '精听 Section 3',
    createdAt: '2026-08-03T06:30:00.000Z',
    updatedAt: '2026-08-03T07:58:00.000Z',
  }
}

function word(id = 'word-remote'): WordRecord {
  return {
    id,
    date: '2026-08-03',
    category: '学术词汇',
    subCategory: '教育',
    count: 20,
    note: '搭配复习',
    createdAt: '2026-08-03T06:45:00.000Z',
    updatedAt: '2026-08-03T07:59:00.000Z',
  }
}

function snapshot(overrides: Partial<TrackerPhase4bLocalSnapshot> = {}): TrackerPhase4bLocalSnapshot {
  return {
    studyPlans: [plan()],
    planExecutions: [execution()],
    practiceRecords: [practice()],
    timerRecords: [timer()],
    wordRecords: [word()],
    ...overrides,
  }
}

function emptySnapshot(): TrackerPhase4bLocalSnapshot {
  return {
    studyPlans: [],
    planExecutions: [],
    practiceRecords: [],
    timerRecords: [],
    wordRecords: [],
  }
}

function readPersistedState(key: string): Record<string, unknown> {
  const raw = localStorage.getItem(key)
  if (!raw) throw new Error(`Missing persisted state for ${key}`)
  return (JSON.parse(raw) as { state: Record<string, unknown> }).state
}

beforeAll(async () => {
  vi.stubGlobal('localStorage', memoryStorage)
  let uuidCounter = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => (
      `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`
    ),
  })

  ;({ ensureActivityLedgerInitialized } = await import('@/data/activityLedgerBootstrap'))
  ;({ useAchievementStore } = await import('@/stores/achievementStore'))
  ;({ useActivityLedgerStore } = await import('@/stores/activityLedgerStore'))
  ;({ useDailyCheckinStore } = await import('@/stores/dailyCheckinStore'))
  ;({ useDiaryStore } = await import('@/stores/diaryStore'))
  ;({ usePlanStore } = await import('@/stores/planStore'))
  ;({ usePracticeStore } = await import('@/stores/practiceStore'))
  ;({ useSettingsStore } = await import('@/stores/settingsStore'))
  ;({ useStreakStore } = await import('@/stores/streakStore'))
  ;({ useTimerStore } = await import('@/stores/timerStore'))
  ;({ useWordStore } = await import('@/stores/wordStore'))
  ;({
    installTrackerPhase4bStoreSnapshot,
    readTrackerPhase4bStoreSnapshot,
    trackerPhase4bSnapshotFingerprint,
  } = await import('@/sync/trackerPhase4bStoreAdapter'))
})

beforeEach(() => {
  localStorage.clear()
  usePlanStore.setState({
    plans: [],
    executions: [],
    aiCommandReceipts: [],
    mutationRevision: 0,
  })
  usePracticeStore.setState({ records: [], mutationRevision: 0 })
  useTimerStore.setState({
    records: [],
    mutationRevision: 0,
    status: 'idle',
    mode: 'countdown',
    subject: 'general',
    presetMinutes: 25,
    remainingSeconds: 0,
    elapsedSeconds: 0,
    startedAt: undefined,
  })
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
  useSettingsStore.setState({
    examDate: undefined,
    showExamCountdown: true,
    showAiSuggestions: true,
    showWordsDailySummary: true,
    dashboardCardOrder: [...DEFAULT_DASHBOARD_CARD_ORDER],
    dashboardCardVisibility: { ...DEFAULT_DASHBOARD_CARD_VISIBILITY },
    theme: 'light',
    lastCheckinDate: undefined,
  })
  useDailyCheckinStore.setState({ migrationVersion: 1, awards: [] })
  useDiaryStore.setState({ entries: [] })
  useWordStore.setState({ records: [], mutationRevision: 0 })
  useActivityLedgerStore.setState({ schemaVersion: 1, baseline: null, events: [] })
  ensureActivityLedgerInitialized('2026-08-03T00:00:00.000Z')
})

describe('Phase 4B canonical store adapter', () => {
  it('reads one validated snapshot from all five canonical stores', () => {
    const desired = snapshot()
    usePlanStore.setState({
      plans: desired.studyPlans,
      executions: desired.planExecutions,
      mutationRevision: 3,
    })
    usePracticeStore.setState({ records: desired.practiceRecords, mutationRevision: 4 })
    useTimerStore.setState({ records: desired.timerRecords, mutationRevision: 5 })
    useWordStore.setState({ records: desired.wordRecords, mutationRevision: 6 })

    expect(readTrackerPhase4bStoreSnapshot()).toEqual(desired)
  })

  it('returns stale and does not overwrite a concurrent local modification', async () => {
    const before = readTrackerPhase4bStoreSnapshot()
    const localPlan = plan('plan-local-newer')
    usePlanStore.setState({ plans: [localPlan], mutationRevision: 1 })

    const result = await installTrackerPhase4bStoreSnapshot({
      expectedFingerprint: trackerPhase4bSnapshotFingerprint(before),
      snapshot: snapshot(),
      occurredAt: OCCURRED_AT,
    })

    expect(result.status).toBe('stale')
    expect(result.snapshot.studyPlans).toEqual([localPlan])
    expect(readTrackerPhase4bStoreSnapshot().studyPlans).toEqual([localPlan])
    expect(useActivityLedgerStore.getState().events).toHaveLength(0)
    expect(useAchievementStore.getState().totalXP).toBe(0)
  })

  it('installs all five record classes atomically and keeps ledger, XP and streak projections aligned', async () => {
    const desired = snapshot()
    const before = readTrackerPhase4bStoreSnapshot()

    const result = await installTrackerPhase4bStoreSnapshot({
      expectedFingerprint: trackerPhase4bSnapshotFingerprint(before),
      snapshot: desired,
      occurredAt: OCCURRED_AT,
    })

    expect(result).toEqual({ status: 'installed', snapshot: desired })
    expect(readTrackerPhase4bStoreSnapshot()).toEqual(desired)
    expect(readPersistedState(PLAN_STORAGE_KEY)).toMatchObject({
      plans: desired.studyPlans,
      executions: desired.planExecutions,
      mutationRevision: 1,
    })
    expect(readPersistedState(PRACTICE_STORAGE_KEY)).toMatchObject({
      records: desired.practiceRecords,
      mutationRevision: 1,
    })
    expect(readPersistedState(TIMER_STORAGE_KEY)).toMatchObject({
      records: desired.timerRecords,
      mutationRevision: 1,
    })
    expect(readPersistedState(WORD_STORAGE_KEY)).toMatchObject({
      records: desired.wordRecords,
      mutationRevision: 1,
    })

    const ledger = useActivityLedgerStore.getState()
    expect(ledger.events.map((event) => event.entityKind)).toEqual([
      'plan_execution',
      'practice_record',
      'timer_record',
      'word_record',
    ])
    expect(useAchievementStore.getState().totalXP).toBeGreaterThan(0)
    expect(useStreakStore.getState().heatmapData['2026-08-03']).toBe(4)
    if (!ledger.baseline) throw new Error('Activity ledger was not initialized')
    const replayed = replayActivityLedger({
      schemaVersion: ledger.schemaVersion,
      baseline: ledger.baseline,
      events: ledger.events,
    }, toLocalDate())
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
  })

  it('returns unchanged on repeated installation without adding ledger events or XP twice', async () => {
    const desired = snapshot()
    const first = await installTrackerPhase4bStoreSnapshot({
      expectedFingerprint: trackerPhase4bSnapshotFingerprint(readTrackerPhase4bStoreSnapshot()),
      snapshot: desired,
      occurredAt: OCCURRED_AT,
    })
    expect(first.status).toBe('installed')
    const eventCount = useActivityLedgerStore.getState().events.length
    const totalXP = useAchievementStore.getState().totalXP
    const streak = { ...useStreakStore.getState().heatmapData }

    const second = await installTrackerPhase4bStoreSnapshot({
      expectedFingerprint: trackerPhase4bSnapshotFingerprint(readTrackerPhase4bStoreSnapshot()),
      snapshot: desired,
      occurredAt: OCCURRED_AT,
    })

    expect(second.status).toBe('unchanged')
    expect(useActivityLedgerStore.getState().events).toHaveLength(eventCount)
    expect(useAchievementStore.getState().totalXP).toBe(totalXP)
    expect(useStreakStore.getState().heatmapData).toEqual(streak)
  })

  it('rebuilds the disposable ledger before continuing after a committed marker recovery', async () => {
    useAchievementStore.setState({ totalXP: 125, level: 2 })
    useStreakStore.setState({
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: '2026-08-03',
      heatmapData: { '2026-08-03': 2 },
    })
    expect(useActivityLedgerStore.getState().baseline?.achievements.totalXP).toBe(0)

    const interrupted = createLocalMutation({
      action: 'sync.merge',
      patches: [],
      createdAt: '2026-08-03T07:59:00.000Z',
    })
    prepareLocalMutation(interrupted)
    markLocalMutationCommitted(interrupted)

    const current = readTrackerPhase4bStoreSnapshot()
    const result = await installTrackerPhase4bStoreSnapshot({
      expectedFingerprint: trackerPhase4bSnapshotFingerprint(current),
      snapshot: current,
      occurredAt: OCCURRED_AT,
    })

    expect(result.status).toBe('unchanged')
    expect(localStorage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()
    const ledger = useActivityLedgerStore.getState()
    expect(ledger.events).toEqual([])
    expect(ledger.baseline).toMatchObject({
      capturedAt: OCCURRED_AT,
      source: 'recovery',
      achievements: {
        totalXP: useAchievementStore.getState().totalXP,
        level: useAchievementStore.getState().level,
      },
      streak: {
        currentStreak: useStreakStore.getState().currentStreak,
        longestStreak: useStreakStore.getState().longestStreak,
        lastActiveDate: useStreakStore.getState().lastActiveDate,
        heatmapData: useStreakStore.getState().heatmapData,
      },
    })
  })

  it('rolls every canonical store and projection back when a transaction write fails', async () => {
    const before = emptySnapshot()
    memoryStorage.failNextWriteForKey(PRACTICE_STORAGE_KEY)

    await expect(installTrackerPhase4bStoreSnapshot({
      expectedFingerprint: trackerPhase4bSnapshotFingerprint(before),
      snapshot: snapshot(),
      occurredAt: OCCURRED_AT,
    })).rejects.toThrow('云端学习数据未能完整写入本机')

    expect(readTrackerPhase4bStoreSnapshot()).toEqual(before)
    expect(readPersistedState(PLAN_STORAGE_KEY)).toMatchObject({
      plans: [],
      executions: [],
      mutationRevision: 0,
    })
    expect(readPersistedState(PRACTICE_STORAGE_KEY)).toMatchObject({
      records: [],
      mutationRevision: 0,
    })
    expect(readPersistedState(TIMER_STORAGE_KEY)).toMatchObject({
      records: [],
      mutationRevision: 0,
    })
    expect(readPersistedState(WORD_STORAGE_KEY)).toMatchObject({
      records: [],
      mutationRevision: 0,
    })
    expect(useActivityLedgerStore.getState().events).toHaveLength(0)
    expect(useAchievementStore.getState().totalXP).toBe(0)
    expect(useStreakStore.getState()).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: '',
      heatmapData: {},
    })
    expect(localStorage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()
  })
})
