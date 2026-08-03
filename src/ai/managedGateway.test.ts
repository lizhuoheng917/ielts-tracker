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

  it('does not mark a definitive provider failure as an unknown outcome', () => {
    expect(mapAiGatewayHttpStatus(502, {
      code: 'generation_failed',
      outcomeUnknown: false,
    })).toMatchObject({
      code: 'PROVIDER_ERROR',
      outcomeUnknown: false,
    })
  })
})
