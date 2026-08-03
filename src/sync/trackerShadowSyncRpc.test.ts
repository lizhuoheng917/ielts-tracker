import { describe, expect, it, vi } from 'vitest'

import { trackerShadowSyncRpcInternals } from '@/sync/trackerShadowSyncRpc'

function abortError(): Error {
  return Object.assign(new Error('timed out'), { name: 'AbortError' })
}

describe('Tracker shadow sync RPC resilience', () => {
  it('shares concurrent work for one key and clears the flight after settlement', async () => {
    const singleFlight = trackerShadowSyncRpcInternals.createSingleFlight<string, string>()
    let release!: (value: string) => void
    const pending = new Promise<string>((resolve) => { release = resolve })
    const load = vi.fn(() => pending)

    const first = singleFlight('same-token', load)
    const second = singleFlight('same-token', load)
    expect(load).toHaveBeenCalledTimes(1)
    release('ready')
    await expect(Promise.all([first, second])).resolves.toEqual(['ready', 'ready'])

    await expect(singleFlight('same-token', async () => 'fresh')).resolves.toBe('fresh')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not share work across different access tokens', async () => {
    const singleFlight = trackerShadowSyncRpcInternals.createSingleFlight<string, string>()
    const first = singleFlight('token-a', async () => 'a')
    const second = singleFlight('token-b', async () => 'b')
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b'])
  })

  it('retries one timeout and returns the second result', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce('recovered')

    await expect(trackerShadowSyncRpcInternals.withAbortRetry(attempt)).resolves.toBe('recovered')
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('stops after the bounded timeout retry and never retries other errors', async () => {
    const timedOut = vi.fn().mockRejectedValue(abortError())
    await expect(trackerShadowSyncRpcInternals.withAbortRetry(timedOut)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(timedOut).toHaveBeenCalledTimes(2)

    const rpcError = new Error('HTTP 400')
    const rejected = vi.fn().mockRejectedValue(rpcError)
    await expect(trackerShadowSyncRpcInternals.withAbortRetry(rejected)).rejects.toBe(rpcError)
    expect(rejected).toHaveBeenCalledTimes(1)
  })
})
