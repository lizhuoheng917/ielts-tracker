import { STORAGE_PREFIX } from '@/lib/constants'

export const CANONICAL_MUTATION_LOCK_NAME = `${STORAGE_PREFIX}:canonical-mutation-v1`
export const CANONICAL_MUTATION_LEASE_KEY = `${STORAGE_PREFIX}:canonicalMutationLease`
export const CANONICAL_MUTATION_PULSE_KEY = `${STORAGE_PREFIX}:canonicalMutationPulse`
export const CANONICAL_MUTATION_EPOCH_KEY = `${STORAGE_PREFIX}:canonicalMutationEpoch`

const DEFAULT_LEASE_TTL_MS = 15_000
const DEFAULT_ACQUIRE_TIMEOUT_MS = 1_500

interface CanonicalMutationLease {
  ownerId: string
  token: string
  expiresAt: number
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => T | PromiseLike<T>,
  ): Promise<T>
}

interface CoordinatorOptions {
  lockManager?: LockManagerLike | null
  storage?: Storage | null
  acquireTimeoutMs?: number
  leaseTtlMs?: number
}

export class CanonicalMutationBusyError extends Error {
  constructor(message = '另一个页面正在保存学习数据，请稍后重试。') {
    super(message)
    this.name = 'CanonicalMutationBusyError'
  }
}

let cachedOwnerId = ''
let fallbackId = 0
let localQueue: Promise<void> = Promise.resolve()

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`
  } catch {
    fallbackId += 1
    return `${prefix}-${Date.now()}-${fallbackId}`
  }
}

function ownerId(): string {
  if (cachedOwnerId) return cachedOwnerId
  const key = `${STORAGE_PREFIX}:canonicalMutationOwner`
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) {
      cachedOwnerId = existing
      return existing
    }
    cachedOwnerId = createId('tab')
    sessionStorage.setItem(key, cachedOwnerId)
  } catch {
    cachedOwnerId = createId('runtime')
  }
  return cachedOwnerId
}

function browserLockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null
  const locks = navigator.locks as LockManagerLike | undefined
  return locks && typeof locks.request === 'function' ? locks : null
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function parseLease(raw: string | null): CanonicalMutationLease | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<CanonicalMutationLease>
    if (
      typeof value.ownerId !== 'string'
      || typeof value.token !== 'string'
      || typeof value.expiresAt !== 'number'
      || !Number.isFinite(value.expiresAt)
    ) {
      return null
    }
    return value as CanonicalMutationLease
  } catch {
    return null
  }
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

async function withFallbackLease<T>(
  task: () => T | PromiseLike<T>,
  storage: Storage | null,
  acquireTimeoutMs: number,
  leaseTtlMs: number,
): Promise<T> {
  if (!storage) {
    throw new CanonicalMutationBusyError('浏览器无法提供安全的数据锁，请只保留一个页面后重试。')
  }

  const currentOwnerId = ownerId()
  const deadline = Date.now() + Math.max(0, acquireTimeoutMs)

  while (Date.now() <= deadline) {
    const now = Date.now()
    const current = parseLease(storage.getItem(CANONICAL_MUTATION_LEASE_KEY))
    if (!current || current.expiresAt <= now) {
      const candidate: CanonicalMutationLease = {
        ownerId: currentOwnerId,
        token: createId('lease'),
        expiresAt: now + leaseTtlMs,
      }
      storage.setItem(CANONICAL_MUTATION_LEASE_KEY, JSON.stringify(candidate))

      // Yield once so contenders that observed the same expired lease can publish
      // their token. Only the final verified owner proceeds with canonical writes.
      await sleep(12)
      const verified = parseLease(storage.getItem(CANONICAL_MUTATION_LEASE_KEY))
      if (verified?.token === candidate.token) {
        let leaseLost = false
        const heartbeat = setInterval(() => {
          try {
            const latest = parseLease(storage.getItem(CANONICAL_MUTATION_LEASE_KEY))
            if (latest?.token !== candidate.token) {
              leaseLost = true
              return
            }
            storage.setItem(CANONICAL_MUTATION_LEASE_KEY, JSON.stringify({
              ...candidate,
              expiresAt: Date.now() + leaseTtlMs,
            }))
          } catch {
            leaseLost = true
          }
        }, Math.max(250, Math.floor(leaseTtlMs / 3)))

        try {
          const result = await task()
          try {
            const latest = parseLease(storage.getItem(CANONICAL_MUTATION_LEASE_KEY))
            if (latest?.token !== candidate.token) leaseLost = true
          } catch {
            leaseLost = true
          }
          if (leaseLost) {
            throw new CanonicalMutationBusyError('保存期间数据锁发生变化，已停止继续写入。')
          }
          return result
        } finally {
          clearInterval(heartbeat)
          try {
            const latest = parseLease(storage.getItem(CANONICAL_MUTATION_LEASE_KEY))
            if (latest?.token === candidate.token) {
              storage.removeItem(CANONICAL_MUTATION_LEASE_KEY)
            }
          } catch {
            // Cleanup is advisory after the task has completed. A stale lease
            // expires automatically and must not turn a committed write into a
            // misleading failure.
          }
        }
      }
    }
    await sleep(25)
  }

  throw new CanonicalMutationBusyError()
}

/**
 * Serializes canonical local mutations across tabs. Web Locks is authoritative;
 * the short localStorage lease is a fail-closed compatibility path.
 */
export function withCanonicalMutationLock<T>(
  task: () => T | PromiseLike<T>,
  options: CoordinatorOptions = {},
): Promise<T> {
  const run = async () => {
    const lockManager = options.lockManager === undefined
      ? browserLockManager()
      : options.lockManager
    if (lockManager) {
      return lockManager.request(
        CANONICAL_MUTATION_LOCK_NAME,
        { mode: 'exclusive' },
        task,
      )
    }
    if (
      typeof window === 'undefined'
      && options.storage === undefined
      && options.lockManager === undefined
    ) {
      return task()
    }
    return withFallbackLease(
      task,
      options.storage === undefined ? browserStorage() : options.storage,
      options.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS,
      options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS,
    )
  }

  const queued = localQueue.then(run, run)
  localQueue = queued.then(() => undefined, () => undefined)
  return queued
}

export function announceCanonicalMutation(scope: string, revision: number): void {
  const storage = browserStorage()
  if (!storage) return
  try {
    storage.setItem(CANONICAL_MUTATION_PULSE_KEY, JSON.stringify({
      scope,
      revision,
      ownerId: ownerId(),
      emittedAt: new Date().toISOString(),
      nonce: createId('pulse'),
    }))
  } catch {
    // The canonical mutation is already committed. Cross-tab refresh can recover
    // on focus/reload even when the non-canonical notification cannot persist.
  }
}

export function readCanonicalMutationEpoch(storage: Storage | null = browserStorage()): string {
  if (!storage) return 'unavailable'
  try {
    return storage.getItem(CANONICAL_MUTATION_EPOCH_KEY) ?? 'initial'
  } catch {
    return 'unavailable'
  }
}

export function advanceCanonicalMutationEpoch(storage: Storage | null = browserStorage()): string {
  if (!storage) {
    throw new CanonicalMutationBusyError('浏览器无法安全标记这次整体数据更新。')
  }
  const nextEpoch = createId('epoch')
  storage.setItem(CANONICAL_MUTATION_EPOCH_KEY, nextEpoch)
  return nextEpoch
}

export function installCanonicalMutationPulseListener(
  onPulse: (scope: string) => void | Promise<void>,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const listener = (event: StorageEvent) => {
    if (event.key !== CANONICAL_MUTATION_PULSE_KEY || !event.newValue) return
    try {
      const value = JSON.parse(event.newValue) as { scope?: unknown }
      if (typeof value.scope === 'string') void onPulse(value.scope)
    } catch {
      // Ignore malformed advisory notifications; canonical envelopes stay intact.
    }
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}
