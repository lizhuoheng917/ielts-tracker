import { describe, expect, it } from 'vitest'

import { mapAiGatewayHttpStatus } from './managedGateway'

describe('managed AI gateway error state', () => {
  it('preserves a server-declared unknown outcome instead of flattening it into a normal failure', () => {
    expect(mapAiGatewayHttpStatus(503, {
      code: 'generation_outcome_unknown',
      outcomeUnknown: true,
    })).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      outcomeUnknown: true,
    })
  })

  it('shows a definitive generation failure without pretending the provider did not respond', () => {
    expect(mapAiGatewayHttpStatus(502, {
      code: 'generation_failed',
      outcomeUnknown: false,
    })).toMatchObject({
      code: 'INVALID_RESPONSE',
      message: '本次 AI 未生成可用结果，未保存。请重试。',
      retryable: true,
      outcomeUnknown: false,
    })
  })
})
