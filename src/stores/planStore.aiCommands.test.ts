import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlanCreateCommandDraft } from '@/ai/planCommands'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  failWrites = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.values.set(key, value)
  }
}

let storage: MemoryStorage
let storeModule: typeof import('./planStore')

function draft(overrides: Partial<PlanCreateCommandDraft> = {}): PlanCreateCommandDraft {
  const draftId = '123e4567-e89b-42d3-a456-426614174211'
  return {
    schemaVersion: 1,
    draftId,
    runId: 'run-plan-1',
    action: 'plan.create',
    targetScope: 'plans',
    payload: {
      title: '早晨听力训练',
      description: '完成精听并记录错因。',
      category: 'listening',
      frequency: 'weekly',
      weekDays: [1, 3, 5],
      targetTime: '08:00',
      targetDuration: 25,
      targetCount: null,
    },
    idempotencyKey: `tracker-plan-create:${draftId}`,
    context: {
      snapshotId: 'snapshot-plan-1',
      contextHash: 'context-plan-1',
      sourceRevision: 'source-plan-1',
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      generatedAt: '2026-08-02T00:00:00.000Z',
      expiresAt: '2026-08-03T00:00:00.000Z',
    },
    confirmation: { required: true, status: 'pending' },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('plan store AI command transaction', () => {
  beforeEach(async () => {
    vi.resetModules()
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    storeModule = await import('./planStore')
    storeModule.usePlanStore.setState({
      plans: [],
      executions: [],
      aiCommandReceipts: [],
      mutationRevision: 0,
    })
  })

  it('persists the plan and applied receipt in the same Zustand envelope', async () => {
    const receipt = await storeModule.usePlanStore.getState().applyConfirmedAiPlanDraft(draft(), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      now: new Date('2026-08-02T01:00:00.000Z'),
    })
    const state = storeModule.usePlanStore.getState()
    const envelope = JSON.parse(storage.getItem('ielts-tracker:studyPlans') || '{}')

    expect(receipt).toMatchObject({ status: 'applied', targetId: draft().draftId })
    expect(state.plans).toHaveLength(1)
    expect(state.aiCommandReceipts[0]).toMatchObject({ status: 'applied' })
    expect(envelope.state.plans).toHaveLength(1)
    expect(envelope.state.aiCommandReceipts[0]).toMatchObject({ status: 'applied' })
  })

  it('returns duplicate across repeated confirmation without creating another plan', async () => {
    const action = storeModule.usePlanStore.getState().applyConfirmedAiPlanDraft
    await action(draft(), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      now: new Date('2026-08-02T01:00:00.000Z'),
    })
    const duplicate = await storeModule.usePlanStore.getState().applyConfirmedAiPlanDraft(draft(), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      now: new Date('2026-08-02T01:01:00.000Z'),
    })

    expect(duplicate).toMatchObject({ status: 'duplicate', targetId: draft().draftId })
    expect(storeModule.usePlanStore.getState().plans).toHaveLength(1)
  })

  it('rehydrates the latest plan envelope before a stale tab confirms again', async () => {
    await storeModule.usePlanStore.getState().applyConfirmedAiPlanDraft(draft(), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      now: new Date('2026-08-02T01:00:00.000Z'),
    })
    const latestEnvelope = storage.getItem('ielts-tracker:studyPlans')!

    storeModule.usePlanStore.setState({
      plans: [],
      executions: [],
      aiCommandReceipts: [],
      mutationRevision: 0,
    })
    storage.setItem('ielts-tracker:studyPlans', latestEnvelope)

    const duplicate = await storeModule.usePlanStore.getState().applyConfirmedAiPlanDraft(draft(), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      now: new Date('2026-08-02T01:01:00.000Z'),
    })

    expect(duplicate.status).toBe('duplicate')
    expect(storeModule.usePlanStore.getState().plans).toHaveLength(1)
    expect(storeModule.usePlanStore.getState().mutationRevision).toBeGreaterThan(1)
  })

  it('merges a new plan into the latest persisted envelope instead of a stale array', async () => {
    await storeModule.usePlanStore.getState().addPlan({
      title: '标签 A 的计划',
      category: 'reading',
      frequency: 'daily',
      isActive: true,
    })
    const latestEnvelope = storage.getItem('ielts-tracker:studyPlans')!

    storeModule.usePlanStore.setState({
      plans: [],
      executions: [],
      aiCommandReceipts: [],
      mutationRevision: 0,
    })
    storage.setItem('ielts-tracker:studyPlans', latestEnvelope)

    const result = await storeModule.usePlanStore.getState().addPlan({
      title: '标签 B 的计划',
      category: 'listening',
      frequency: 'daily',
      isActive: true,
    })

    expect(result.status).toBe('applied')
    expect(storeModule.usePlanStore.getState().plans.map((plan) => plan.title).sort())
      .toEqual(['标签 A 的计划', '标签 B 的计划'])
  })

  it('blocks expired or account-mismatched drafts before plan creation', async () => {
    const store = storeModule.usePlanStore.getState()
    const stale = await store.applyConfirmedAiPlanDraft(draft(), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      now: new Date('2026-08-03T00:00:01.000Z'),
    })
    const mismatch = await storeModule.usePlanStore.getState().applyConfirmedAiPlanDraft(draft({
      draftId: '123e4567-e89b-42d3-a456-426614174212',
      idempotencyKey: 'tracker-plan-create:123e4567-e89b-42d3-a456-426614174212',
    }), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-2',
      now: new Date('2026-08-02T01:00:00.000Z'),
    })

    expect(stale.status).toBe('stale')
    expect(mismatch.status).toBe('scope_mismatch')
    expect(storeModule.usePlanStore.getState().plans).toHaveLength(0)
  })

  it('rolls memory back and reports failure when the atomic envelope cannot persist', async () => {
    storage.failWrites = true
    const receipt = await storeModule.usePlanStore.getState().applyConfirmedAiPlanDraft(draft(), {
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      now: new Date('2026-08-02T01:00:00.000Z'),
    })

    expect(receipt).toMatchObject({ status: 'failed', error: { code: 'STORAGE_WRITE_FAILED' } })
    expect(storeModule.usePlanStore.getState().plans).toHaveLength(0)
    expect(storeModule.usePlanStore.getState().aiCommandReceipts).toHaveLength(0)
  })
})
