import { describe, expect, it } from 'vitest'
import {
  createPlanCommandDrafts,
  parsePlanCreateCommandDraft,
  planCommandPayloadToStudyPlan,
} from './planCommands'
import type { PlanDraftV2 } from './structuredOutputs'

const CONTENT: PlanDraftV2 = {
  schemaVersion: 2,
  kind: 'plan_draft',
  title: '一周听力计划',
  summary: '先完成三次短练习，再根据记录调整。',
  plans: [{
    title: '早晨听力训练',
    description: '完成精听并记录错因。',
    category: 'listening',
    frequency: 'weekly',
    scheduledDate: null,
    startDate: '2026-08-03',
    endDate: null,
    weekDays: [1, 3, 5],
    targetTime: '08:00',
    targetDuration: 25,
    targetCount: null,
  }],
  evidence: [],
  limitations: ['样本较少。'],
}

const COMMAND_CONTEXT = {
  snapshotId: 'snapshot-plan',
  contextHash: 'context-plan',
  sourceRevision: 'source-plan',
  routeMode: 'managed' as const,
  accountScopeId: 'managed:user-1',
}

describe('plan command lifecycle', () => {
  it('creates local command identifiers instead of trusting provider identifiers', () => {
    const commands = createPlanCommandDrafts(CONTENT, 'run-1', {
      context: COMMAND_CONTEXT,
      now: new Date('2026-08-02T00:00:00.000Z'),
      createId: () => '123e4567-e89b-42d3-a456-426614174111',
    })

    expect(commands).toEqual([expect.objectContaining({
      draftId: '123e4567-e89b-42d3-a456-426614174111',
      idempotencyKey: 'tracker-plan-create:123e4567-e89b-42d3-a456-426614174111',
      confirmation: { required: true, status: 'pending' },
      payload: expect.objectContaining({ title: '早晨听力训练', weekDays: [1, 3, 5] }),
    })])
  })

  it('rejects altered command ids and provider-added fields on restore', () => {
    const [draft] = createPlanCommandDrafts(CONTENT, 'run-1', {
      context: COMMAND_CONTEXT,
      createId: () => '123e4567-e89b-42d3-a456-426614174112',
    })
    expect(() => parsePlanCreateCommandDraft({
      ...draft,
      idempotencyKey: 'provider-chosen-key',
    })).toThrow('Invalid plan command draft')
    expect(() => parsePlanCreateCommandDraft({
      ...draft,
      providerAction: 'delete_everything',
    })).toThrow('Invalid plan command draft')
  })

  it('maps nullable AI schedule fields into a compact one-time local plan', () => {
    const mapped = planCommandPayloadToStudyPlan({
      ...CONTENT.plans[0],
      frequency: 'once',
      scheduledDate: '2026-08-14',
      startDate: null,
      endDate: null,
      weekDays: [],
    })

    expect(mapped).toMatchObject({
      frequency: 'once',
      scheduledDate: '2026-08-14',
      isActive: true,
    })
    expect(mapped).not.toHaveProperty('startDate')
    expect(mapped).not.toHaveProperty('endDate')
    expect(mapped).not.toHaveProperty('weekDays')
  })

  it('does not create Plan Center commands for vocabulary drafts while keeping other drafts', () => {
    const commands = createPlanCommandDrafts({
      ...CONTENT,
      plans: [
        { ...CONTENT.plans[0], title: '旧词汇草稿', category: 'vocabulary' },
        { ...CONTENT.plans[0], title: '阅读训练', category: 'reading' },
      ],
    }, 'run-2', {
      context: COMMAND_CONTEXT,
      createId: () => '123e4567-e89b-42d3-a456-426614174113',
    })

    expect(commands).toHaveLength(1)
    expect(commands[0].payload).toMatchObject({ title: '阅读训练', category: 'reading' })
  })
})
