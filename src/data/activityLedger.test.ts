import { describe, expect, it } from 'vitest'

import {
  createActivityEffects,
  createActivityEvent,
  createBackfillLedger,
  replayActivityLedger,
  type ActivityLedgerSourceSnapshot,
} from '@/data/activityLedger'
import type { WordRecord } from '@/lib/types'

function emptySource(): ActivityLedgerSourceSnapshot {
  return {
    achievements: {
      unlockedBadges: ['first-checkin'],
      totalXP: 40,
      level: 1,
      statsViewCount: 3,
    },
    streak: {
      currentStreak: 2,
      longestStreak: 5,
      lastActiveDate: '2026-08-01',
      heatmapData: { '2026-07-31': 1, '2026-08-01': 1 },
    },
    lastCheckinDate: '2026-08-01',
    rewardedCheckinDates: ['2026-08-01'],
  }
}

function word(overrides: Partial<WordRecord> = {}): WordRecord {
  return {
    id: 'word-1',
    date: '2026-08-01',
    category: 'academic',
    count: 5,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('activity ledger backfill', () => {
  it('captures existing projections as a baseline without awarding them again', () => {
    const source = emptySource()
    // Legacy data can contain a level that does not match its XP. Backfill is
    // deliberately non-destructive and must preserve that state until a new
    // XP-bearing event is appended.
    source.achievements.level = 3
    const ledger = createBackfillLedger(source, '2026-08-01T09:00:00.000Z')
    const replayed = replayActivityLedger(ledger, '2026-08-01')

    expect(ledger.events).toEqual([])
    expect(ledger.baseline.rewardedCheckinDates).toEqual(['2026-08-01'])
    expect(replayed).toEqual({
      achievements: source.achievements,
      streak: source.streak,
      lastCheckinDate: source.lastCheckinDate,
      rewardedCheckinDates: ['2026-08-01'],
    })
  })
})

describe('activity mutation effects', () => {
  it('keeps a word create, edit across dates and delete reversible', () => {
    const created = word()
    const updated = word({ date: '2026-08-02', count: 10 })

    expect(createActivityEffects('word_record', null, created)).toEqual({
      xpDelta: 3,
      activityDeltas: [{ date: '2026-08-01', delta: 1 }],
    })
    expect(createActivityEffects('word_record', created, updated)).toEqual({
      xpDelta: 2,
      activityDeltas: [
        { date: '2026-08-01', delta: -1 },
        { date: '2026-08-02', delta: 1 },
      ],
    })
    expect(createActivityEffects('word_record', updated, null)).toEqual({
      xpDelta: -5,
      activityDeltas: [{ date: '2026-08-02', delta: -1 }],
    })
  })

  it('only counts completed plan executions as learning activity', () => {
    const pending = { id: 'execution-1', planId: 'plan-1', date: '2026-08-01', isCompleted: false }
    const completed = { ...pending, isCompleted: true }

    expect(createActivityEffects('plan_execution', null, pending).activityDeltas).toEqual([])
    expect(createActivityEffects('plan_execution', pending, completed).activityDeltas).toEqual([
      { date: '2026-08-01', delta: 1 },
    ])
    expect(createActivityEffects('plan_execution', completed, pending).activityDeltas).toEqual([
      { date: '2026-08-01', delta: -1 },
    ])
  })

  it('can award a daily checkin without double-counting a plan activity', () => {
    const checkin = { date: '2026-08-01' }

    expect(createActivityEffects('daily_checkin', null, checkin, {
      dailyCheckinXP: 10,
      recordDailyActivity: false,
    })).toEqual({ xpDelta: 10, activityDeltas: [] })
  })
})

describe('activity ledger replay', () => {
  it('recomputes the time-relative current streak when a baseline is replayed later', () => {
    const ledger = createBackfillLedger(emptySource(), '2026-08-01T09:00:00.000Z')

    const replayed = replayActivityLedger(ledger, '2026-08-02')

    expect(replayed.streak.currentStreak).toBe(0)
    expect(replayed.streak.longestStreak).toBe(5)
    expect(replayed.streak.lastActiveDate).toBe('2026-08-01')
  })

  it('applies events once per idempotency key and derives XP and streak', () => {
    const ledger = createBackfillLedger(emptySource(), '2026-08-01T09:00:00.000Z')
    const event = createActivityEvent({
      eventId: 'event-1',
      idempotencyKey: 'word:word-1:r1:created',
      entityKind: 'word_record',
      entityId: 'word-1',
      revision: 1,
      operation: 'created',
      effectiveDate: '2026-08-02',
      occurredAt: '2026-08-02T08:00:00.000Z',
      source: 'user',
      after: word({ date: '2026-08-02', count: 10 }),
    })
    ledger.events.push(event, { ...event, eventId: 'duplicate-event' })

    const replayed = replayActivityLedger(ledger, '2026-08-02')

    expect(replayed.achievements.totalXP).toBe(45)
    expect(replayed.achievements.level).toBe(1)
    expect(replayed.streak.heatmapData).toEqual({
      '2026-07-31': 1,
      '2026-08-01': 1,
      '2026-08-02': 1,
    })
    expect(replayed.streak.currentStreak).toBe(3)
    expect(replayed.streak.longestStreak).toBe(5)
    expect(replayed.rewardedCheckinDates).toEqual(['2026-08-01'])
  })
})
