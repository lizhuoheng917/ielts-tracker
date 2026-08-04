import { describe, expect, it } from 'vitest'

import { parseTrackerPlanCloudTransferReceipt } from '@/sync/trackerPlanCloudTransfer'

describe('Tracker plan cloud transfer receipt', () => {
  it('accepts metadata-only paired-transfer receipts', () => {
    expect(parseTrackerPlanCloudTransferReceipt({
      status: 'applied',
      operationId: '00000000-0000-4000-8000-000000000001',
      accountEpoch: 3,
      plan: { entityId: 'plan-1', version: 4 },
      executions: [{ entityId: 'execution-1', version: 2 }],
      quota: { study_plan: { remaining: 3 } },
    })).toMatchObject({ status: 'applied', accountEpoch: 3, reason: null })
  })

  it('rejects a receipt that tries to return learner-authored content', () => {
    expect(() => parseTrackerPlanCloudTransferReceipt({
      status: 'applied',
      operationId: '00000000-0000-4000-8000-000000000001',
      accountEpoch: 3,
      plan: { entityId: 'plan-1', version: 4, payload: { title: '不应回传' } },
    })).toThrow('must not contain learner content')
  })
})
