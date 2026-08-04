import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { AiCommandReceipt } from '@/ai/contracts'
import type { PlanCreateCommandDraft } from '@/ai/planCommands'
import { AIConfirmCard } from './AIConfirmCard'

vi.mock('@/components/sync/ContentCloudLocationField', () => ({
  ContentCloudLocationField: ({ value }: { value: 'local' | 'cloud' }) => (
    <p>保存位置：{value === 'cloud' ? '同步云端' : '仅本机'}</p>
  ),
}))

const draft: PlanCreateCommandDraft = {
  schemaVersion: 1,
  draftId: '123e4567-e89b-42d3-a456-426614174411',
  runId: 'run-plan-1',
  action: 'plan.create',
  targetScope: 'plans',
  payload: {
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
  },
  idempotencyKey: 'tracker-plan-create:123e4567-e89b-42d3-a456-426614174411',
  context: {
    snapshotId: 'snapshot-1',
    contextHash: 'context-1',
    sourceRevision: 'source-1',
    routeMode: 'managed',
    accountScopeId: 'managed:user-1',
    generatedAt: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-08-03T00:00:00.000Z',
  },
  confirmation: { required: true, status: 'pending' },
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
}

describe('AI plan confirmation card', () => {
  it('shows every material plan field before a 44px confirmation action', () => {
    const html = renderToStaticMarkup(
      <AIConfirmCard draft={draft} onConfirm={vi.fn()} onReject={vi.fn()} />,
    )
    expect(html).toContain('早晨听力训练')
    expect(html).toContain('完成精听并记录错因')
    expect(html).toContain('重复计划 · 周一、周三、周五 · 自 2026年8月3日 起')
    expect(html).toContain('08:00 · 25 分钟')
    expect(html).toContain('确认加入计划')
    expect(html).toContain('min-h-11')
  })

  it('clearly identifies a dated one-time task before confirmation', () => {
    const html = renderToStaticMarkup(
      <AIConfirmCard
        draft={{
          ...draft,
          payload: {
            ...draft.payload,
            frequency: 'once',
            scheduledDate: '2026-08-12',
            startDate: null,
            endDate: null,
            weekDays: [],
          },
        }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    )

    expect(html).toContain('单次任务 · 2026年8月12日')
    expect(html).not.toContain('重复计划')
  })

  it('shows a storage choice before the learner confirms an AI plan', () => {
    const html = renderToStaticMarkup(
      <AIConfirmCard
        draft={draft}
        cloudMode="cloud"
        onCloudModeChange={vi.fn()}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    )

    expect(html).toContain('保存位置：同步云端')
    expect(html).toContain('确认加入计划')
  })

  it('shows duplicate receipt as final and hides the execution buttons', () => {
    const receipt: AiCommandReceipt = {
      schemaVersion: 1,
      receiptId: 'receipt-1',
      draftId: draft.draftId,
      action: 'plan.create',
      idempotencyKey: draft.idempotencyKey,
      status: 'duplicate',
      targetId: draft.draftId,
      createdAt: '2026-08-02T01:00:00.000Z',
    }
    const html = renderToStaticMarkup(
      <AIConfirmCard draft={draft} receipt={receipt} onConfirm={vi.fn()} onReject={vi.fn()} />,
    )
    expect(html).toContain('已存在，未重复添加')
    expect(html).not.toContain('确认加入计划')
  })
})
