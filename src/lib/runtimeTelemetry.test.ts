import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  classifyTrackerRuntimeError,
  reportTrackerRuntimeSignal,
  resetTrackerRuntimeTelemetryForTests,
  trackerRuntimeBrowserFamily,
  trackerRuntimePageKey,
} from '@/lib/runtimeTelemetry'

afterEach(() => {
  resetTrackerRuntimeTelemetryForTests()
  vi.unstubAllGlobals()
})

describe('Tracker runtime telemetry', () => {
  it('classifies Tracker RPC, browser and route evidence into closed categories', () => {
    expect(classifyTrackerRuntimeError({ httpStatus: 401 })).toBe('unauthorized')
    expect(classifyTrackerRuntimeError({ httpStatus: 403, rpcCode: '42501' })).toBe('forbidden')
    expect(classifyTrackerRuntimeError({ httpStatus: 409, rpcCode: '40001' })).toBe('conflict')
    expect(classifyTrackerRuntimeError({ httpStatus: 503 })).toBe('server')
    expect(classifyTrackerRuntimeError(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyTrackerRuntimeError(Object.assign(new Error('after retry'), { name: 'TrackerShadowSyncTimeoutError' }))).toBe('timeout')
    expect(classifyTrackerRuntimeError(new Error('unexpected state'))).toBe('unknown')

    expect(trackerRuntimeBrowserFamily('Mozilla/5.0 Version/18.0 Safari/605.1.15')).toBe('safari')
    expect(trackerRuntimeBrowserFamily('Mozilla/5.0 Chrome/130.0 Safari/537.36')).toBe('chrome')
    expect(trackerRuntimePageKey('/plans')).toBe('plan')
    expect(trackerRuntimePageKey('/words')).toBe('library')
    expect(trackerRuntimePageKey('/exam')).toBe('test')
    expect(trackerRuntimePageKey('/settings')).toBe('settings')
    expect(trackerRuntimePageKey('/unmapped')).toBe('unknown')
  })

  it('sends only controlled aggregate fields and cools down duplicates', async () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      userAgent: 'Mozilla/5.0 Version/18.0 Safari/605.1.15',
    })
    const rpc = vi.fn(async (_name: string, _payload: Record<string, unknown>) => ({
      data: { accepted: true },
      error: null,
    }))
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'not-sent' } } },
          error: null,
        })),
      },
      rpc,
    }
    const privateError = new Error('private essay and account details')

    expect(await reportTrackerRuntimeSignal({
      kind: 'sync_failure',
      error: privateError,
      pageKey: 'plan',
      pendingCount: 10_500,
    }, client as never)).toBe(true)
    expect(await reportTrackerRuntimeSignal({
      kind: 'sync_failure',
      error: privateError,
      pageKey: 'plan',
      pendingCount: 1,
    }, client as never)).toBe(false)

    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, payload] = rpc.mock.calls[0]
    expect(name).toBe('report_product_runtime_signal')
    expect(payload).toEqual({
      p_product_id: 'tracker',
      p_surface: 'learner',
      p_signal_kind: 'sync_failure',
      p_error_code: 'unknown',
      p_build_sha: 'unknown',
      p_page_key: 'plan',
      p_browser_family: 'safari',
      p_pending_count: 9999,
    })
    expect(JSON.stringify(payload)).not.toContain(privateError.message)
    expect(JSON.stringify(payload)).not.toContain('not-sent')
  })

  it('never lets monitoring failures escape into the learner flow', async () => {
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'test-agent' })
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'local-only' } } },
          error: null,
        })),
      },
      rpc: vi.fn(async (_name: string, _payload: Record<string, unknown>) => {
        throw new Error('monitor unavailable')
      }),
    }

    await expect(reportTrackerRuntimeSignal({
      kind: 'client_crash',
      error: new Error('render failed'),
      pageKey: 'home',
    }, client as never)).resolves.toBe(false)
  })
})
