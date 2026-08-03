import { describe, expect, it } from 'vitest'

import { shouldAcceptPlanAssistantResult } from './planAssistantSession'

const REQUEST = {
  epoch: 2,
  accountScopeId: 'managed:user-a',
  snapshotId: 'snapshot-a',
  contextHash: 'context-a',
}

describe('plan assistant late-result guard', () => {
  it('accepts only the still-current request scope', () => {
    expect(shouldAcceptPlanAssistantResult(REQUEST, {
      epoch: 2,
      accountScopeId: 'managed:user-a',
      aborted: false,
    })).toBe(true)
  })

  it.each([
    [{ epoch: 3 }, 'newer request'],
    [{ aborted: true }, 'abort'],
    [{ accountScopeId: 'managed:user-b' }, 'account switch'],
  ] as const)('rejects a late result after %s (%s)', (override, _label) => {
    expect(shouldAcceptPlanAssistantResult(REQUEST, {
      epoch: 2,
      accountScopeId: 'managed:user-a',
      aborted: false,
      ...override,
    })).toBe(false)
  })
})
