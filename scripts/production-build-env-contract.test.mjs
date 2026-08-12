import { describe, expect, it } from 'vitest'

import {
  TRACKER_PRODUCTION_PROJECT_REF,
  TRACKER_PRODUCTION_URL,
  TRACKER_PRODUCTION_WORDS_URL,
  validateProductionBuildEnvironment,
} from './production-build-env-contract.mjs'

const validEnvironment = {
  VITE_LEXI_ENVIRONMENT: 'production',
  VITE_SUPABASE_URL: TRACKER_PRODUCTION_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_value',
  VITE_SUPABASE_PROJECT_REF: TRACKER_PRODUCTION_PROJECT_REF,
  VITE_LEXI_WORDS_APP_URL: TRACKER_PRODUCTION_WORDS_URL,
}

describe('Tracker production build environment', () => {
  it('accepts only the reviewed shared Lexi production connection', () => {
    expect(validateProductionBuildEnvironment(validEnvironment)).toEqual([])
  })

  it('fails closed when any production connection value is missing or points at staging', () => {
    expect(validateProductionBuildEnvironment({})).toHaveLength(5)
    expect(validateProductionBuildEnvironment({
      ...validEnvironment,
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: 'https://kkynryhceurvnylprxyx.supabase.co',
      VITE_SUPABASE_PROJECT_REF: 'kkynryhceurvnylprxyx',
    })).toHaveLength(3)
  })

  it('rejects an unreviewed Words destination', () => {
    expect(validateProductionBuildEnvironment({
      ...validEnvironment,
      VITE_LEXI_WORDS_APP_URL: 'https://lookalike.example',
    })).toEqual([
      'VITE_LEXI_WORDS_APP_URL must match the reviewed Lexi Words production root.',
    ])
  })

  it('rejects secret, legacy, or provider-shaped keys without echoing their values', () => {
    for (const key of ['sb_secret_server_only', 'legacy-anon-jwt', 'sk-provider-key']) {
      const errors = validateProductionBuildEnvironment({
        ...validEnvironment,
        VITE_SUPABASE_PUBLISHABLE_KEY: key,
      })
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.join(' ')).not.toContain(key)
    }
  })
})
