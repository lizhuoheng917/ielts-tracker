import { describe, expect, it } from 'vitest'

import type {
  PlanExecution,
  PracticeRecord,
  StudyPlan,
  TimerRecord,
} from '@/lib/types'
import {
  canonicalizeTrackerPhase4bRemoteEntities,
  createTrackerPhase4bPayload,
  diffTrackerPhase4bLocalEntities,
  materializeTrackerPhase4bLocalEntities,
  parseTrackerPhase4bLocalSnapshot,
  parseTrackerPhase4bPayload,
  parseTrackerPhase4bRemoteEntity,
  planTrackerPhase4bReconciliation,
  sortTrackerPhase4bOperationIntents,
  trackerPhase4bExecutionBusinessKey,
  trackerPhase4bUtf8Bytes,
  TRACKER_PHASE4B_UTF8_LIMITS,
  type TrackerPhase4bLocalEntity,
  type TrackerPhase4bLocalSnapshot,
  type TrackerPhase4bOperationIntent,
  type TrackerPhase4bRemoteEntity,
} from './trackerPhase4bRecordSync'

const t0 = '2026-08-03T00:00:00.000Z'
const t1 = '2026-08-03T01:00:00.000Z'
const t2 = '2026-08-03T02:00:00.000Z'
const t3 = '2026-08-03T03:00:00.000Z'

function plan(id = 'plan-1', updatedAt = t1): StudyPlan {
  return {
    id,
    title: '每天阅读训练',
    description: '完成一套阅读并复盘',
    category: 'reading',
    frequency: 'weekly',
    weekDays: [5, 1, 5, 3],
    targetTime: '08:30',
    targetDuration: 30,
    targetCount: 1,
    isActive: true,
    createdAt: t0,
    updatedAt,
  }
}

function execution(
  id = 'execution-1',
  isCompleted = true,
  updatedAt: string | null = t1,
): PlanExecution {
  return {
    id,
    planId: 'plan-1',
    date: '2026-08-03',
    isCompleted,
    actualDuration: 28,
    actualCount: 1,
    note: '完成',
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function practice(id = 'practice-1', updatedAt = t1): PracticeRecord {
  return {
    id,
    type: 'reading',
    date: '2026-08-03',
    topic: '剑桥雅思 15 Test 3',
    duration: 60,
    score: 7.5,
    note: '定位题偏慢',
    createdAt: t0,
    updatedAt,
  }
}

function timer(id = 'timer-1', updatedAt = t1): TimerRecord {
  return {
    id,
    subject: 'listening',
    date: '2026-08-03',
    duration: 1_531,
    note: '精听 Section 3',
    createdAt: t0,
    updatedAt,
  }
}

function snapshot(overrides: Partial<TrackerPhase4bLocalSnapshot> = {}): TrackerPhase4bLocalSnapshot {
  return {
    studyPlans: [plan()],
    planExecutions: [execution()],
    practiceRecords: [practice()],
    timerRecords: [timer()],
    ...overrides,
  }
}

function localEntities(
  overrides: Partial<TrackerPhase4bLocalSnapshot> = {},
  observedAt = t2,
): TrackerPhase4bLocalEntity[] {
  return materializeTrackerPhase4bLocalEntities(
    parseTrackerPhase4bLocalSnapshot(snapshot(overrides)),
    observedAt,
  )
}

function remoteFromLocal(
  local: TrackerPhase4bLocalEntity,
  options: {
    entityId?: string
    version?: number
    cursor?: number
    updatedAt?: string
    deletedAt?: string | null
  } = {},
): TrackerPhase4bRemoteEntity {
  return parseTrackerPhase4bRemoteEntity({
    entityKind: local.entityKind,
    entityId: options.entityId ?? local.entityId,
    version: options.version ?? 1,
    cursor: options.cursor ?? 1,
    payload: local.payload,
    deletedAt: options.deletedAt ?? null,
    updatedAt: options.updatedAt ?? local.updatedAt,
  })
}

function entity(
  entities: readonly TrackerPhase4bLocalEntity[],
  kind: TrackerPhase4bLocalEntity['entityKind'],
): TrackerPhase4bLocalEntity {
  return entities.find((candidate) => candidate.entityKind === kind)!
}

describe('Phase 4B strict snapshot and compact payload parsing', () => {
  it('parses the four canonical record classes and keeps mock tests separate from timer seconds', () => {
    const parsed = parseTrackerPhase4bLocalSnapshot(snapshot({
      practiceRecords: [{ ...practice(), score: 0 }],
    }))
    const materialized = materializeTrackerPhase4bLocalEntities(parsed, t2)
    const mock = entity(materialized, 'practice_record')
    const timed = entity(materialized, 'timer_record')

    expect(parsed.studyPlans[0].weekDays).toEqual([1, 3, 5])
    expect(mock.payload).toMatchObject({ type: 'reading', duration: 60 })
    expect(mock.payload).not.toHaveProperty('score')
    expect(timed.payload).toMatchObject({ subject: 'listening', duration: 1_531 })
    expect(mock.payload).not.toHaveProperty('id')
    expect(mock.payload).not.toHaveProperty('updatedAt')
  })

  it('keeps only allowlisted payload fields and rejects extra remote fields', () => {
    const source = { ...practice(), apiKey: 'must-not-upload', totalXP: 900 }
    const payload = createTrackerPhase4bPayload('practice_record', source)

    expect(payload).not.toHaveProperty('apiKey')
    expect(payload).not.toHaveProperty('totalXP')
    expect(() => parseTrackerPhase4bPayload('practice_record', {
      ...payload,
      apiKey: 'must-not-install',
    })).toThrow('unsupported field apiKey')
  })

  it('applies UTF-8 byte limits without truncating multibyte learner text', () => {
    const oversized = '雅'.repeat(Math.floor(TRACKER_PHASE4B_UTF8_LIMITS.note / 3) + 1)
    expect(trackerPhase4bUtf8Bytes(oversized)).toBeGreaterThan(TRACKER_PHASE4B_UTF8_LIMITS.note)
    expect(() => createTrackerPhase4bPayload('timer_record', {
      ...timer(),
      note: oversized,
    })).toThrow('exceeds 4096 UTF-8 bytes')
  })

  it.each([
    ['bad plan category', () => parseTrackerPhase4bPayload('study_plan', {
      ...createTrackerPhase4bPayload('study_plan', plan()),
      category: 'grammar',
    })],
    ['fake calendar date', () => parseTrackerPhase4bPayload('plan_execution', {
      ...createTrackerPhase4bPayload('plan_execution', execution()),
      date: '2026-99-99',
    })],
    ['score above IELTS maximum', () => parseTrackerPhase4bPayload('practice_record', {
      ...createTrackerPhase4bPayload('practice_record', practice()),
      score: 9.5,
    })],
    ['negative timer seconds', () => parseTrackerPhase4bPayload('timer_record', {
      ...createTrackerPhase4bPayload('timer_record', timer()),
      duration: -1,
    })],
  ])('rejects %s', (_label, parse) => {
    expect(parse).toThrow()
  })

  it('rejects two random execution ids for one plan/date business key', () => {
    expect(() => parseTrackerPhase4bLocalSnapshot(snapshot({
      planExecutions: [execution('execution-a'), execution('execution-b')],
    }))).toThrow('duplicates the planId/date business key')
    expect(trackerPhase4bExecutionBusinessKey(execution())).toBe(
      'plan-1\u001f2026-08-03',
    )
  })

  it('uses persisted execution updatedAt and adds an observation fallback only for legacy rows', () => {
    const modern = entity(localEntities(), 'plan_execution')
    const legacy = entity(localEntities({
      planExecutions: [execution('legacy-execution', true, null)],
    }, t3), 'plan_execution')

    expect(modern).toMatchObject({ updatedAt: t1, updatedAtSource: 'record' })
    expect(modern.payload).not.toHaveProperty('updatedAt')
    expect(legacy).toMatchObject({ updatedAt: t3, updatedAtSource: 'observed' })
    expect(legacy.payload).not.toHaveProperty('updatedAt')
  })
})

describe('Phase 4B baseline diff and dependency ordering', () => {
  it('uses numeric baseVersion zero for new rows and orders a new plan before its execution', () => {
    const diff = diffTrackerPhase4bLocalEntities([], localEntities({
      practiceRecords: [],
      timerRecords: [],
    }), t3)

    expect(diff.operations.map((operation) => [
      operation.entityKind,
      operation.action,
      operation.baseVersion,
    ])).toEqual([
      ['study_plan', 'upsert', 0],
      ['plan_execution', 'upsert', 0],
    ])
  })

  it('orders execution deletes before their parent plan delete', () => {
    const baseline = localEntities({ practiceRecords: [], timerRecords: [] })
      .map((item, index) => remoteFromLocal(item, { version: index + 4 }))
    const diff = diffTrackerPhase4bLocalEntities(baseline, [], t3)

    expect(diff.operations.map((operation) => [operation.entityKind, operation.action]))
      .toEqual([
        ['plan_execution', 'delete'],
        ['study_plan', 'delete'],
      ])
  })

  it('updates the canonical remote execution id when local random id differs for the same business key', () => {
    const local = entity(localEntities({
      planExecutions: [execution('local-random-id', false, t2)],
      practiceRecords: [],
      timerRecords: [],
    }), 'plan_execution')
    const baselineLocal = entity(localEntities({
      planExecutions: [execution('remote-random-id', true, t1)],
      practiceRecords: [],
      timerRecords: [],
    }), 'plan_execution')
    const baseline = remoteFromLocal(baselineLocal, { entityId: 'remote-random-id', version: 7 })

    const diff = diffTrackerPhase4bLocalEntities([baseline], [local], t3)

    expect(diff.operations).toEqual([expect.objectContaining({
      entityKind: 'plan_execution',
      entityId: 'remote-random-id',
      action: 'upsert',
      baseVersion: 7,
    })])
  })

  it('requires a choice instead of silently restoring a cloud tombstone', () => {
    const local = entity(localEntities(), 'practice_record')
    const tombstone = remoteFromLocal(local, {
      version: 4,
      deletedAt: t2,
      updatedAt: t2,
    })
    const diff = diffTrackerPhase4bLocalEntities([tombstone], [local], t3)

    expect(diff.operations).toEqual([])
    expect(diff.restoreRequired).toEqual([{
      entityKind: 'practice_record',
      entityId: local.entityId,
      reason: 'cloud_tombstone_requires_explicit_restore',
    }])
  })

  it('collapses duplicate remote execution ids by completion first and emits a loser tombstone', () => {
    const base = entity(localEntities(), 'plan_execution')
    const completedOlder = remoteFromLocal(base, {
      entityId: 'completed-older',
      version: 3,
      cursor: 3,
      updatedAt: t1,
    })
    const pendingNewerLocal = entity(localEntities({
      planExecutions: [execution('pending-newer', false, t2)],
    }), 'plan_execution')
    const pendingNewer = remoteFromLocal(pendingNewerLocal, {
      entityId: 'pending-newer',
      version: 4,
      cursor: 4,
      updatedAt: t2,
    })

    const result = canonicalizeTrackerPhase4bRemoteEntities(
      [pendingNewer, completedOlder],
      t3,
    )

    expect(result.entities[0].entityId).toBe('completed-older')
    expect(result.cleanupOperations).toEqual([expect.objectContaining({
      entityId: 'pending-newer',
      action: 'delete',
      baseVersion: 4,
    })])
  })

  it('chooses the newest server row when duplicate executions are both completed', () => {
    const base = entity(localEntities(), 'plan_execution')
    const older = remoteFromLocal(base, { entityId: 'older', updatedAt: t1 })
    const newer = remoteFromLocal(base, { entityId: 'newer', updatedAt: t2, version: 2 })

    expect(canonicalizeTrackerPhase4bRemoteEntities([older, newer], t3).entities[0].entityId)
      .toBe('newer')
  })

  it('exports a stable dependency sorter independent of input order', () => {
    const operations: TrackerPhase4bOperationIntent[] = [
      { entityKind: 'study_plan', entityId: 'p', action: 'delete', baseVersion: 1, occurredAt: t3 },
      { entityKind: 'plan_execution', entityId: 'e', action: 'upsert', baseVersion: 0, occurredAt: t3, payload: createTrackerPhase4bPayload('plan_execution', execution()) },
      { entityKind: 'plan_execution', entityId: 'e-old', action: 'delete', baseVersion: 1, occurredAt: t3 },
      { entityKind: 'study_plan', entityId: 'p-new', action: 'upsert', baseVersion: 0, occurredAt: t3, payload: createTrackerPhase4bPayload('study_plan', plan()) },
    ]

    expect(sortTrackerPhase4bOperationIntents(operations).map((operation) => (
      `${operation.action}:${operation.entityKind}`
    ))).toEqual([
      'delete:plan_execution',
      'upsert:study_plan',
      'delete:study_plan',
      'upsert:plan_execution',
    ])
  })
})

describe('Phase 4B LWW and deletion reconciliation', () => {
  it('installs a one-sided remote edit and uploads a one-sided local edit', () => {
    const original = entity(localEntities(), 'study_plan')
    const baseline = remoteFromLocal(original, { version: 1, updatedAt: t1 })
    const remoteEdited = remoteFromLocal({
      ...original,
      payload: { ...original.payload, title: '云端标题' },
      updatedAt: t2,
    } as TrackerPhase4bLocalEntity, { version: 2, updatedAt: t2 })
    const localEdited = {
      ...original,
      payload: { ...original.payload, title: '本机标题' },
      updatedAt: t2,
    } as TrackerPhase4bLocalEntity

    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: original },
      remote: remoteEdited,
    }).action).toBe('install_remote_upsert')
    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: localEdited },
      remote: baseline,
    })).toMatchObject({
      action: 'upload_upsert',
      operation: { baseVersion: 1 },
    })
  })

  it('uses record timestamps for ordinary concurrent LWW and remote wins exact ties', () => {
    const original = entity(localEntities(), 'practice_record')
    const baseline = remoteFromLocal(original, { version: 1, updatedAt: t0 })
    const localNewer = {
      ...original,
      payload: { ...original.payload, note: '本机更新' },
      updatedAt: t3,
    } as TrackerPhase4bLocalEntity
    const remoteOlder = remoteFromLocal({
      ...original,
      payload: { ...original.payload, note: '云端更新' },
      updatedAt: t2,
    } as TrackerPhase4bLocalEntity, { version: 2, updatedAt: t2 })

    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: localNewer },
      remote: remoteOlder,
    }).action).toBe('upload_upsert')

    const tiedRemote = { ...remoteOlder, updatedAt: t3 }
    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: localNewer },
      remote: tiedRemote,
    }).action).toBe('install_remote_upsert')
  })

  it('prefers a completed execution across different random ids before timestamps', () => {
    const localCompleted = entity(localEntities({
      planExecutions: [execution('local-complete', true, t1)],
    }), 'plan_execution')
    const baseline = remoteFromLocal({
      ...localCompleted,
      payload: { ...localCompleted.payload, isCompleted: false },
      updatedAt: t0,
    } as TrackerPhase4bLocalEntity, { entityId: 'remote-pending', updatedAt: t0 })
    const remotePending = remoteFromLocal({
      ...localCompleted,
      payload: { ...localCompleted.payload, isCompleted: false },
      updatedAt: t3,
    } as TrackerPhase4bLocalEntity, {
      entityId: 'remote-pending',
      version: 2,
      updatedAt: t3,
    })

    const result = planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: localCompleted },
      remote: remotePending,
    })

    expect(result).toMatchObject({
      action: 'upload_upsert',
      operation: { entityId: 'remote-pending', baseVersion: 2 },
    })
  })

  it('keeps a legacy completed local execution when both sides completed but local has no source time', () => {
    const legacyLocal = entity(localEntities({
      planExecutions: [execution('legacy-local', true, null)],
    }, t1), 'plan_execution')
    const baseline = remoteFromLocal({
      ...legacyLocal,
      payload: { ...legacyLocal.payload, note: '旧基线' },
    } as TrackerPhase4bLocalEntity, { entityId: 'remote-id', updatedAt: t0 })
    const remoteNewer = remoteFromLocal({
      ...legacyLocal,
      payload: { ...legacyLocal.payload, note: '云端较新' },
      updatedAt: t3,
    } as TrackerPhase4bLocalEntity, {
      entityId: 'remote-id',
      version: 2,
      updatedAt: t3,
    })

    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: legacyLocal },
      remote: remoteNewer,
    }).action).toBe('upload_upsert')
  })

  it('never restores a remote tombstone without a choice, but installs a remote-only delete', () => {
    const local = entity(localEntities(), 'timer_record')
    const baseline = remoteFromLocal(local, { updatedAt: t0 })
    const remoteDelete = remoteFromLocal(local, {
      version: 2,
      deletedAt: t2,
      updatedAt: t2,
    })
    const localEdited = {
      ...local,
      payload: { ...local.payload, note: '本机又编辑了' },
      updatedAt: t3,
    } as TrackerPhase4bLocalEntity

    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: localEdited },
      remote: remoteDelete,
    }).action).toBe('restore_choice')
    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: local },
      remote: remoteDelete,
    }).action).toBe('install_remote_delete')
  })

  it('uses LWW between a local delete and a concurrent remote edit', () => {
    const local = entity(localEntities(), 'practice_record')
    const baseline = remoteFromLocal(local, { updatedAt: t0 })
    const remoteEdit = remoteFromLocal({
      ...local,
      payload: { ...local.payload, note: '云端改动' },
      updatedAt: t2,
    } as TrackerPhase4bLocalEntity, { version: 2, updatedAt: t2 })

    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: null, deletedAt: t3 },
      remote: remoteEdit,
    }).action).toBe('upload_delete')
    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: null, deletedAt: t1 },
      remote: remoteEdit,
    }).action).toBe('install_remote_upsert')
  })

  it('requires a snapshot when a previously baselined remote row vanishes without a tombstone', () => {
    const local = entity(localEntities(), 'study_plan')
    const baseline = remoteFromLocal(local)
    expect(planTrackerPhase4bReconciliation({
      baseline,
      local: { entity: local },
      remote: null,
    }).action).toBe('snapshot_required')
  })
})
