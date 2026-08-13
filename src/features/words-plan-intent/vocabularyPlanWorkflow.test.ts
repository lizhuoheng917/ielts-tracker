import { describe, expect, it, vi } from 'vitest'

import type { StudyPlan } from '@/lib/types'
import { createCanonicalVocabularyPlanFields } from './vocabularyPlanTemplate'
import {
  saveAndSendVocabularyPlan,
  VocabularyPlanWorkflowError,
  type VocabularyPlanWorkflowDependencies,
} from './vocabularyPlanWorkflow'

const operationId = '123e4567-e89b-42d3-a456-426614174000'

function fields() {
  return createCanonicalVocabularyPlanFields({
    title: '8月14日词汇计划',
    targetDate: '2026-08-14',
    targetTime: '20:30',
    targetCount: 30,
    targetDuration: 25,
  })
}

function input(overrides: Partial<Parameters<typeof saveAndSendVocabularyPlan>[0]> = {}) {
  return {
    fields: fields(),
    cloudMode: 'local' as const,
    userId: 'user-1',
    operationId,
    targetDate: '2026-08-14',
    targetCount: 30,
    studyMode: 'mixed' as const,
    ...overrides,
  }
}

function existingPlan(id = 'plan-1'): StudyPlan {
  return {
    ...fields(),
    id,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  }
}

describe('Vocabulary Center save and Words handoff workflow', () => {
  it('saves one Tracker plan before using its real id for cloud policy and Words', async () => {
    const order: string[] = []
    const upsertPlan = vi.fn(async () => {
      order.push('plan')
      return { status: 'applied' as const, targetId: 'plan-created' }
    })
    const setCloudLocation = vi.fn(() => order.push('cloud'))
    const sendIntent = vi.fn(async () => { order.push('words') })

    await expect(saveAndSendVocabularyPlan(input(), {
      readPlans: () => [],
      upsertPlan,
      setCloudLocation,
      sendIntent,
    })).resolves.toEqual({ planId: 'plan-created' })

    expect(order).toEqual(['plan', 'cloud', 'words'])
    expect(sendIntent).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      sourceRef: 'plan-created',
      targetDate: '2026-08-14',
      targetCount: 30,
      studyMode: 'mixed',
    }))
  })

  it('reuses an unchanged plan while still applying cloud choice and sending it', async () => {
    const plan = existingPlan()
    const dependencies: VocabularyPlanWorkflowDependencies = {
      readPlans: () => [plan],
      upsertPlan: vi.fn(),
      setCloudLocation: vi.fn(),
      sendIntent: vi.fn(async () => undefined),
    }

    await saveAndSendVocabularyPlan(input({ existingPlanId: plan.id }), dependencies)

    expect(dependencies.upsertPlan).not.toHaveBeenCalled()
    expect(dependencies.setCloudLocation).toHaveBeenCalledWith({
      entityKind: 'study_plan', entityId: plan.id, mode: 'local',
    })
    expect(dependencies.sendIntent).toHaveBeenCalledWith(expect.objectContaining({ sourceRef: plan.id }))
  })

  it('does not send anything when the Tracker plan cannot be saved', async () => {
    const setCloudLocation = vi.fn()
    const sendIntent = vi.fn()

    await expect(saveAndSendVocabularyPlan(input(), {
      readPlans: () => [],
      upsertPlan: vi.fn(async () => ({ status: 'busy' as const })),
      setCloudLocation,
      sendIntent,
    })).rejects.toMatchObject({ stage: 'plan', savedPlanId: undefined })
    expect(setCloudLocation).not.toHaveBeenCalled()
    expect(sendIntent).not.toHaveBeenCalled()
  })

  it('reports the saved plan id when the handoff is uncertain so retry cannot duplicate it', async () => {
    const promise = saveAndSendVocabularyPlan(input(), {
      readPlans: () => [],
      upsertPlan: vi.fn(async () => ({ status: 'applied' as const, targetId: 'plan-saved' })),
      setCloudLocation: vi.fn(),
      sendIntent: vi.fn(async () => { throw new Error('network uncertain') }),
    })

    await expect(promise).rejects.toBeInstanceOf(VocabularyPlanWorkflowError)
    await expect(promise).rejects.toMatchObject({ stage: 'handoff', savedPlanId: 'plan-saved' })
  })
})
