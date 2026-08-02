import { describe, expect, it } from 'vitest'

import {
  ACTIVITY_LEDGER_STORAGE_KEY,
  LOCAL_MUTATION_JOURNAL_KEY,
  LOCAL_MUTATION_JOURNAL_SCHEMA_VERSION,
  createEntityCollectionPatch,
  createStateFieldsPatch,
  markLocalMutationCommitted,
  prepareLocalMutation,
  readPendingLocalMutation,
  recoverPendingLocalMutation,
  runLocalMutation,
  type LocalMutationJournalV1,
  type LocalMutationPatch,
  type StorageLike,
} from './localMutationJournal'

const WORDS_KEY = 'ielts-tracker:wordRecords'
const ACHIEVEMENTS_KEY = 'ielts-tracker:achievements'
const STREAK_KEY = 'ielts-tracker:streakData'

interface StorageOperation {
  type: 'set' | 'remove'
  key: string
}

class FaultInjectingStorage implements StorageLike {
  private readonly values = new Map<string, string>()
  private readonly remainingSetFailures = new Map<string, number>()

  readonly operations: StorageOperation[] = []
  beforeSet?: (key: string, value: string) => void

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.operations.push({ type: 'set', key })
    this.beforeSet?.(key, value)

    const remaining = this.remainingSetFailures.get(key) ?? 0
    if (remaining > 0) {
      if (remaining !== Number.POSITIVE_INFINITY) {
        this.remainingSetFailures.set(key, remaining - 1)
      }
      throw new DOMException('simulated quota limit', 'QuotaExceededError')
    }

    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.operations.push({ type: 'remove', key })
    this.values.delete(key)
  }

  seed(key: string, value: string): void {
    this.values.set(key, value)
  }

  failNextSet(key: string): void {
    this.remainingSetFailures.set(key, 1)
  }

  failEverySet(key: string): void {
    this.remainingSetFailures.set(key, Number.POSITIVE_INFINITY)
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function serializeState(state: Record<string, unknown>): string {
  return JSON.stringify({ state, version: 1 })
}

function seedState(
  storage: FaultInjectingStorage,
  key: string,
  state: Record<string, unknown>,
): void {
  storage.seed(key, serializeState(state))
}

function writeState(
  storage: FaultInjectingStorage,
  key: string,
  state: Record<string, unknown>,
): void {
  storage.setItem(key, serializeState(state))
}

function readState(storage: StorageLike, key: string): Record<string, unknown> {
  const raw = storage.getItem(key)
  if (raw === null) return {}
  return (JSON.parse(raw) as { state: Record<string, unknown> }).state
}

function transactionFor(patches: LocalMutationPatch[]): LocalMutationJournalV1 {
  return {
    schemaVersion: LOCAL_MUTATION_JOURNAL_SCHEMA_VERSION,
    transactionId: 'tx-journal-test',
    ownerId: 'tab-journal-test',
    action: 'word.update',
    phase: 'prepared',
    createdAt: '2026-08-01T00:00:00.000Z',
    patches: clone(patches),
  }
}

interface MutationFixture {
  transaction: LocalMutationJournalV1
  beforeSteps: Array<{ key: string; state: Record<string, unknown> }>
  targetSteps: Array<{ key: string; state: Record<string, unknown> }>
}

function createThreeStoreFixture(storage: FaultInjectingStorage): MutationFixture {
  const beforeWord = {
    id: 'word-1',
    date: '2026-08-01',
    category: 'academic',
    count: 5,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
  const targetWord = {
    ...beforeWord,
    count: 10,
    updatedAt: '2026-08-01T00:05:00.000Z',
  }
  const untouchedWord = {
    ...beforeWord,
    id: 'word-untouched',
    count: 3,
  }

  const beforeSteps = [
    {
      key: WORDS_KEY,
      state: { records: [beforeWord, untouchedWord], localView: 'keep' },
    },
    {
      key: ACHIEVEMENTS_KEY,
      state: { totalXP: 20, level: 1, unlockedBadges: ['first-word'] },
    },
    {
      key: STREAK_KEY,
      state: {
        currentStreak: 1,
        longestStreak: 2,
        lastActiveDate: '2026-08-01',
        heatmapData: { '2026-08-01': 1 },
      },
    },
  ] satisfies MutationFixture['beforeSteps']
  const targetSteps = [
    {
      key: WORDS_KEY,
      state: { records: [targetWord, untouchedWord], localView: 'keep' },
    },
    {
      key: ACHIEVEMENTS_KEY,
      state: { totalXP: 23, level: 1, unlockedBadges: ['first-word'] },
    },
    {
      key: STREAK_KEY,
      state: {
        currentStreak: 1,
        longestStreak: 2,
        lastActiveDate: '2026-08-01',
        heatmapData: { '2026-08-01': 2 },
      },
    },
  ] satisfies MutationFixture['targetSteps']

  for (const step of beforeSteps) seedState(storage, step.key, step.state)

  const patches: LocalMutationPatch[] = [
    createEntityCollectionPatch({
      storage,
      storageKey: WORDS_KEY,
      collection: 'records',
      changes: [{
        id: beforeWord.id,
        before: beforeWord,
        beforeIndex: 0,
        expectedAfter: targetWord,
      }],
    }),
    createStateFieldsPatch({
      storage,
      storageKey: ACHIEVEMENTS_KEY,
      beforeState: beforeSteps[1].state,
      expectedAfterState: targetSteps[1].state,
      fields: ['totalXP', 'level'],
    }),
    createStateFieldsPatch({
      storage,
      storageKey: STREAK_KEY,
      beforeState: beforeSteps[2].state,
      expectedAfterState: targetSteps[2].state,
      fields: ['currentStreak', 'longestStreak', 'lastActiveDate', 'heatmapData'],
    }),
  ]

  return { transaction: transactionFor(patches), beforeSteps, targetSteps }
}

function applyTargetSteps(
  storage: FaultInjectingStorage,
  fixture: MutationFixture,
  count = fixture.targetSteps.length,
): void {
  for (const step of fixture.targetSteps.slice(0, count)) {
    writeState(storage, step.key, step.state)
  }
}

function expectStates(
  storage: StorageLike,
  steps: Array<{ key: string; state: Record<string, unknown> }>,
): void {
  for (const step of steps) expect(readState(storage, step.key)).toEqual(step.state)
}

describe('local mutation journal fault recovery', () => {
  it.each([
    ['first', 1],
    ['middle', 2],
    ['last', 3],
  ])('rolls a prepared transaction back after the %s partial-write boundary', (_, written) => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    prepareLocalMutation(fixture.transaction, storage)
    applyTargetSteps(storage, fixture, written)

    const report = recoverPendingLocalMutation(storage, '2026-08-01T01:00:00.000Z')

    expect(report).toMatchObject({
      status: 'rolled-back',
      transactionId: fixture.transaction.transactionId,
      requiresLedgerRebuild: false,
    })
    expectStates(storage, fixture.beforeSteps)
    expect(storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()
  })

  it('can retry startup recovery after recovery itself is interrupted', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    prepareLocalMutation(fixture.transaction, storage)
    applyTargetSteps(storage, fixture)
    storage.failNextSet(ACHIEVEMENTS_KEY)

    const interrupted = recoverPendingLocalMutation(storage, '2026-08-01T01:00:00.000Z')

    expect(interrupted.status).toBe('failed')
    expect(readPendingLocalMutation(storage)?.transactionId).toBe(fixture.transaction.transactionId)
    expect(readState(storage, STREAK_KEY)).toEqual(fixture.beforeSteps[2].state)
    expect(readState(storage, ACHIEVEMENTS_KEY)).toEqual(fixture.targetSteps[1].state)

    const retried = recoverPendingLocalMutation(storage, '2026-08-01T01:01:00.000Z')
    expect(retried.status).toBe('rolled-back')
    expectStates(storage, fixture.beforeSteps)
    expect(storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()

    const repeated = recoverPendingLocalMutation(storage, '2026-08-01T01:02:00.000Z')
    expect(repeated).toMatchObject({ status: 'none', requiresLedgerRebuild: false })
    expectStates(storage, fixture.beforeSteps)
  })

  it('preserves a committed target and requests a disposable-ledger rebuild', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    storage.seed(ACTIVITY_LEDGER_STORAGE_KEY, '{"state":{"events":["stale"]},"version":1}')
    prepareLocalMutation(fixture.transaction, storage)
    applyTargetSteps(storage, fixture)
    markLocalMutationCommitted(fixture.transaction, storage)

    const report = recoverPendingLocalMutation(storage, '2026-08-01T02:00:00.000Z')

    expect(report).toMatchObject({
      status: 'committed-cleanup',
      transactionId: fixture.transaction.transactionId,
      requiresLedgerRebuild: true,
    })
    expectStates(storage, fixture.targetSteps)
    expect(storage.getItem(ACTIVITY_LEDGER_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()

    expect(recoverPendingLocalMutation(storage, '2026-08-01T02:01:00.000Z').status).toBe('none')
    expectStates(storage, fixture.targetSteps)
  })

  it('never commits or removes a journal marker owned by another tab', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    prepareLocalMutation(fixture.transaction, storage)

    const foreign = {
      ...fixture.transaction,
      transactionId: 'tx-foreign-tab',
      ownerId: 'tab-foreign',
    }
    storage.seed(LOCAL_MUTATION_JOURNAL_KEY, JSON.stringify(foreign))

    expect(() => markLocalMutationCommitted(fixture.transaction, storage)).toThrow(
      '事务检查点归属已经变化',
    )
    expect(readPendingLocalMutation(storage)).toEqual(foreign)
  })

  it('stops on an unknown concurrent value and leaves the journal for manual recovery', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    const wordPatch = fixture.transaction.patches[0]
    const transaction = transactionFor([wordPatch])
    prepareLocalMutation(transaction, storage)

    const concurrentState = clone(fixture.targetSteps[0].state)
    const records = concurrentState.records as Array<Record<string, unknown>>
    records[0] = { ...records[0], count: 999, note: 'written by another tab' }
    writeState(storage, WORDS_KEY, concurrentState)

    const report = recoverPendingLocalMutation(storage, '2026-08-01T03:00:00.000Z')

    expect(report).toMatchObject({
      status: 'conflict',
      transactionId: transaction.transactionId,
      requiresLedgerRebuild: false,
    })
    expect(report.detail).toContain(`${WORDS_KEY}.records:word-1`)
    expect(readState(storage, WORDS_KEY)).toEqual(concurrentState)
    expect(readPendingLocalMutation(storage)?.transactionId).toBe(transaction.transactionId)
  })

  it('treats an absent fresh-store key as the implicit default before state', () => {
    const storage = new FaultInjectingStorage()
    const beforeState = { totalXP: 0, level: 1 }
    const targetState = { totalXP: 5, level: 1 }
    const transaction = transactionFor([createStateFieldsPatch({
      storage,
      storageKey: ACHIEVEMENTS_KEY,
      beforeState,
      expectedAfterState: targetState,
      fields: ['totalXP', 'level'],
    })])

    prepareLocalMutation(transaction, storage)
    expect(recoverPendingLocalMutation(storage).status).toBe('rolled-back')
    expect(storage.getItem(ACHIEVEMENTS_KEY)).toBeNull()

    const appliedStorage = new FaultInjectingStorage()
    const appliedTransaction = transactionFor([createStateFieldsPatch({
      storage: appliedStorage,
      storageKey: ACHIEVEMENTS_KEY,
      beforeState,
      expectedAfterState: targetState,
      fields: ['totalXP', 'level'],
    })])
    prepareLocalMutation(appliedTransaction, appliedStorage)
    writeState(appliedStorage, ACHIEVEMENTS_KEY, targetState)

    expect(recoverPendingLocalMutation(appliedStorage).status).toBe('rolled-back')
    expect(appliedStorage.getItem(ACHIEVEMENTS_KEY)).toBeNull()
  })

  it('restores the persisted legacy shape instead of merged in-memory defaults', () => {
    const storage = new FaultInjectingStorage()
    seedState(storage, ACHIEVEMENTS_KEY, { totalXP: 0 })
    const originalRaw = storage.getItem(ACHIEVEMENTS_KEY)
    const transaction = transactionFor([createStateFieldsPatch({
      storage,
      storageKey: ACHIEVEMENTS_KEY,
      beforeState: { totalXP: 0, level: 1 },
      expectedAfterState: { totalXP: 5, level: 1 },
      fields: ['totalXP', 'level'],
    })])

    expect(transaction.patches[0]).toMatchObject({
      kind: 'state-fields',
      fields: [
        { field: 'totalXP', before: { exists: true, value: 0 } },
        { field: 'level', before: { exists: false } },
      ],
    })
    prepareLocalMutation(transaction, storage)
    writeState(storage, ACHIEVEMENTS_KEY, { totalXP: 5, level: 1 })

    expect(recoverPendingLocalMutation(storage).status).toBe('rolled-back')
    expect(storage.getItem(ACHIEVEMENTS_KEY)).toBe(originalRaw)
  })

  it('does not start canonical writes when the journal cannot be persisted', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    storage.failEverySet(LOCAL_MUTATION_JOURNAL_KEY)
    let canonicalWrites = 0
    let postCommitWrites = 0

    const result = runLocalMutation(
      fixture.transaction,
      () => {
        canonicalWrites += 1
        applyTargetSteps(storage, fixture)
      },
      () => {
        postCommitWrites += 1
      },
      storage,
    )

    expect(result).toMatchObject({ ok: false, committed: false })
    expect(result.error?.name).toBe('QuotaExceededError')
    expect(canonicalWrites).toBe(0)
    expect(postCommitWrites).toBe(0)
    expectStates(storage, fixture.beforeSteps)
    expect(storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()
  })

  it('removes the rebuildable ledger and retries a quota-limited journal write', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    storage.seed(ACTIVITY_LEDGER_STORAGE_KEY, 'x'.repeat(100_000))
    storage.beforeSet = (key) => {
      if (key === LOCAL_MUTATION_JOURNAL_KEY && storage.getItem(ACTIVITY_LEDGER_STORAGE_KEY)) {
        throw new DOMException('journal does not fit beside ledger', 'QuotaExceededError')
      }
    }
    let postCommitWrites = 0

    const result = runLocalMutation(
      fixture.transaction,
      () => applyTargetSteps(storage, fixture),
      () => {
        postCommitWrites += 1
      },
      storage,
    )

    expect(result).toEqual({ ok: true, committed: true })
    expect(postCommitWrites).toBe(1)
    expectStates(storage, fixture.targetSteps)
    expect(storage.getItem(ACTIVITY_LEDGER_STORAGE_KEY)).toBeNull()
    expect(storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()
    expect(storage.operations).toContainEqual({ type: 'remove', key: ACTIVITY_LEDGER_STORAGE_KEY })
    expect(storage.operations.filter(
      (operation) => operation.type === 'set' && operation.key === LOCAL_MUTATION_JOURNAL_KEY,
    )).toHaveLength(3)
  })

  it('rolls canonical data back when the commit marker cannot be written', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)
    let journalWrites = 0
    storage.beforeSet = (key) => {
      if (key !== LOCAL_MUTATION_JOURNAL_KEY) return
      journalWrites += 1
      if (journalWrites === 2) {
        throw new DOMException('commit marker failed', 'QuotaExceededError')
      }
    }

    const result = runLocalMutation(
      fixture.transaction,
      () => applyTargetSteps(storage, fixture),
      () => undefined,
      storage,
    )

    expect(result).toMatchObject({ ok: false, committed: false })
    expectStates(storage, fixture.beforeSteps)
    expect(storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()
  })

  it('keeps a committed marker when the shadow post-write fails', () => {
    const storage = new FaultInjectingStorage()
    const fixture = createThreeStoreFixture(storage)

    const result = runLocalMutation(
      fixture.transaction,
      () => applyTargetSteps(storage, fixture),
      () => {
        throw new Error('shadow ledger persistence failed')
      },
      storage,
    )

    expect(result).toMatchObject({ ok: true, committed: true })
    expect(result.error?.message).toContain('shadow ledger')
    expect(readPendingLocalMutation(storage)?.phase).toBe('committed')
    expectStates(storage, fixture.targetSteps)

    const report = recoverPendingLocalMutation(storage, '2026-08-01T04:00:00.000Z')
    expect(report).toMatchObject({ status: 'committed-cleanup', requiresLedgerRebuild: true })
    expectStates(storage, fixture.targetSteps)
    expect(storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)).toBeNull()
  })

  it('stores only changed entities and fields instead of copying unrelated large collections', () => {
    const storage = new FaultInjectingStorage()
    const changedBefore = { id: 'word-changed', count: 1, note: 'small' }
    const changedAfter = { ...changedBefore, count: 2 }
    const unrelatedRecords = Array.from({ length: 250 }, (_, index) => ({
      id: `word-unrelated-${index}`,
      count: index,
      note: `UNRELATED_LARGE_MARKER_${index}_${'x'.repeat(400)}`,
    }))
    seedState(storage, WORDS_KEY, {
      records: [changedBefore, ...unrelatedRecords],
      unrelatedIndex: unrelatedRecords,
    })
    seedState(storage, ACHIEVEMENTS_KEY, {
      totalXP: 10,
      level: 1,
      unlockedBadges: Array.from(
        { length: 250 },
        (_, index) => `UNRELATED_BADGE_MARKER_${index}_${'y'.repeat(200)}`,
      ),
    })

    const transaction = transactionFor([
      createEntityCollectionPatch({
        storage,
        storageKey: WORDS_KEY,
        collection: 'records',
        changes: [{
          id: changedBefore.id,
          before: changedBefore,
          beforeIndex: 0,
          expectedAfter: changedAfter,
        }],
      }),
      createStateFieldsPatch({
        storage,
        storageKey: ACHIEVEMENTS_KEY,
        beforeState: readState(storage, ACHIEVEMENTS_KEY),
        expectedAfterState: {
          ...readState(storage, ACHIEVEMENTS_KEY),
          totalXP: 11,
          level: 2,
        },
        fields: ['totalXP', 'level'],
      }),
    ])

    prepareLocalMutation(transaction, storage)
    const rawJournal = storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)!
    const rawWords = storage.getItem(WORDS_KEY)!
    const persisted = readPendingLocalMutation(storage)!

    expect(rawJournal).not.toContain('UNRELATED_LARGE_MARKER')
    expect(rawJournal).not.toContain('UNRELATED_BADGE_MARKER')
    expect(rawJournal.length).toBeLessThan(rawWords.length / 20)
    expect(persisted.patches[0]).toMatchObject({
      kind: 'entity-collection',
      changes: [{ id: changedBefore.id }],
    })
    expect(persisted.patches[1]).toMatchObject({
      kind: 'state-fields',
      fields: [{ field: 'totalXP' }, { field: 'level' }],
    })
  })
})
