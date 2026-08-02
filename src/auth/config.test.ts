import { describe, expect, it } from 'vitest'

import {
  AUTH_STORAGE_KEY,
  LEXI_PRODUCTION_PROJECT_REF,
  LEXI_STAGING_PROJECT_REF,
  getAuthStorageKey,
  resolveAuthConfiguration,
} from '@/auth/config'

const STAGING_PROJECT_REF = LEXI_STAGING_PROJECT_REF

function jwtWithRole(role: string): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${encode({ alg: 'none' })}.${encode({ role })}.signature`
}

describe('resolveAuthConfiguration', () => {
  it('keeps the app in local mode when no account environment is present', () => {
    expect(resolveAuthConfiguration({})).toEqual({ status: 'unconfigured' })
  })

  it('treats partial configuration as misconfigured instead of creating a client', () => {
    expect(resolveAuthConfiguration({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toEqual({
      status: 'misconfigured',
      reason: 'missing-value',
    })
    expect(resolveAuthConfiguration({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })).toEqual({
      status: 'misconfigured',
      reason: 'missing-value',
    })
  })

  it('requires an explicit environment and project reference for a remote connection', () => {
    expect(resolveAuthConfiguration({
      VITE_SUPABASE_URL: ' https://example.supabase.co ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test ',
    })).toEqual({ status: 'misconfigured', reason: 'invalid-environment' })
  })

  it('accepts localhost only over http for local Supabase development', () => {
    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'local',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: jwtWithRole('anon'),
    })).toEqual({
      status: 'ready',
      url: 'http://127.0.0.1:54321',
      publishableKey: jwtWithRole('anon'),
      environment: 'local',
      projectRef: null,
    })
  })

  it('accepts an explicitly identified non-production shared Lexi project', () => {
    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({
      status: 'ready',
      url: `https://${STAGING_PROJECT_REF}.supabase.co`,
      publishableKey: 'sb_publishable_staging',
      environment: 'staging',
      projectRef: STAGING_PROJECT_REF,
    })
  })

  it('fails closed when staging points at production or a mismatched project', () => {
    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${LEXI_PRODUCTION_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_production',
      VITE_SUPABASE_PROJECT_REF: LEXI_PRODUCTION_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'production-target' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
      VITE_SUPABASE_PROJECT_REF: 'qrstabcdefghijklmnop',
    })).toEqual({ status: 'misconfigured', reason: 'project-ref-mismatch' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
      VITE_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
    })).toEqual({ status: 'misconfigured', reason: 'project-ref-mismatch' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'local',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'production-target' })
  })

  it('requires an exact environment label and project reference when declared', () => {
    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'preview',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
    })).toEqual({ status: 'misconfigured', reason: 'invalid-environment' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
    })).toEqual({ status: 'misconfigured', reason: 'project-ref-mismatch' })

    expect(resolveAuthConfiguration({
      VITE_SUPABASE_URL: `https://${LEXI_PRODUCTION_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_production',
    })).toEqual({ status: 'misconfigured', reason: 'invalid-environment' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: 'https://accounts.example.com',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'project-ref-mismatch' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co:444`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'invalid-url' })
  })

  it('rejects malformed URLs and browser-unsafe secret keys', () => {
    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'invalid-url' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_server_only',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'unsafe-key' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: jwtWithRole('service_role'),
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'unsafe-key' })

    expect(resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sk-provider-key-must-not-enter-vite',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })).toEqual({ status: 'misconfigured', reason: 'unsafe-key' })
  })

  it('keeps the auth session outside the learning-data prefix', () => {
    expect(AUTH_STORAGE_KEY.startsWith('ielts-tracker')).toBe(false)

    const staging = resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'staging',
      VITE_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging',
      VITE_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    })
    const production = resolveAuthConfiguration({
      VITE_LEXI_ENVIRONMENT: 'production',
      VITE_SUPABASE_URL: `https://${LEXI_PRODUCTION_PROJECT_REF}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_production',
      VITE_SUPABASE_PROJECT_REF: LEXI_PRODUCTION_PROJECT_REF,
    })

    expect(staging.status).toBe('ready')
    expect(production.status).toBe('ready')
    if (staging.status !== 'ready' || production.status !== 'ready') return

    expect(getAuthStorageKey(staging)).toBe(
      `${AUTH_STORAGE_KEY}:staging:${STAGING_PROJECT_REF}`,
    )
    expect(getAuthStorageKey(production)).toBe(
      `${AUTH_STORAGE_KEY}:production:${LEXI_PRODUCTION_PROJECT_REF}`,
    )
    expect(getAuthStorageKey(staging)).not.toBe(getAuthStorageKey(production))
  })
})
