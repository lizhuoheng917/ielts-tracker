import type { AuthConfiguration } from '@/auth/config'
import { authConfiguration } from '@/auth/runtimeConfiguration'
import { STORAGE_PREFIX } from '@/lib/constants'

export const MANAGED_AI_DATA_BINDING_KEY_PREFIX = `${STORAGE_PREFIX}:managedAiDataBinding:v1:`

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface ManagedAiDataBindingV1 {
  schemaVersion: 1
  scope: string
  accountUserId: string
  confirmedAt: string
}

export type ManagedAiDataBindingState =
  | { status: 'unbound' }
  | { status: 'bound'; confirmedAt: string }
  | { status: 'mismatch'; confirmedAt: string }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export interface ManagedAiDataBindingDependencies {
  configuration?: AuthConfiguration
  storage?: Storage
  now?: () => Date
}

export type ManagedAiDataBindingConfirmationResult =
  | { ok: true; binding: Extract<ManagedAiDataBindingState, { status: 'bound' }> }
  | {
      ok: false
      reason:
        | 'signed-out'
        | 'verification-failed'
        | 'account-changed'
        | 'mismatch'
        | 'invalid'
        | 'unavailable'
      binding: ManagedAiDataBindingState
    }

export interface ManagedAiDataBindingConfirmationDependencies {
  getCurrentAccountUserId: () => string | null
  verifyCurrentAccountUserId: () => Promise<string | null>
  inspectBinding?: (accountUserId: string) => ManagedAiDataBindingState
  confirmBinding?: (accountUserId: string) => ManagedAiDataBindingState
}

function readyScope(configuration: AuthConfiguration): string | null {
  if (configuration.status !== 'ready') return null
  const target = configuration.projectRef
    ?? new URL(configuration.url).host.toLowerCase().replace(/[^a-z0-9.-]/g, '_')
  return `${configuration.environment}:${target}`
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function resolveStorage(dependencies: ManagedAiDataBindingDependencies): Storage | null {
  if (dependencies.storage) return dependencies.storage
  return browserStorage()
}

function isBinding(value: unknown, expectedScope: string): value is ManagedAiDataBindingV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const binding = value as Record<string, unknown>
  return Object.keys(binding).length === 4
    && binding.schemaVersion === 1
    && binding.scope === expectedScope
    && typeof binding.accountUserId === 'string'
    && UUID_PATTERN.test(binding.accountUserId)
    && typeof binding.confirmedAt === 'string'
    && Number.isFinite(Date.parse(binding.confirmedAt))
}

export function getManagedAiDataBindingStorageKey(
  configuration: AuthConfiguration = authConfiguration,
): string | null {
  const scope = readyScope(configuration)
  return scope ? `${MANAGED_AI_DATA_BINDING_KEY_PREFIX}${scope}` : null
}

/**
 * Reads the local ownership marker without creating or replacing it. First
 * ownership must always be confirmed by an explicit learner action.
 */
export function inspectManagedAiDataBinding(
  accountUserId: string,
  dependencies: ManagedAiDataBindingDependencies = {},
): ManagedAiDataBindingState {
  if (!UUID_PATTERN.test(accountUserId)) return { status: 'unavailable' }

  const configuration = dependencies.configuration ?? authConfiguration
  const scope = readyScope(configuration)
  const key = getManagedAiDataBindingStorageKey(configuration)
  const storage = resolveStorage(dependencies)
  if (!scope || !key || !storage) return { status: 'unavailable' }

  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { status: 'unavailable' }
  }
  if (raw === null) return { status: 'unbound' }

  try {
    const binding: unknown = JSON.parse(raw)
    if (!isBinding(binding, scope)) return { status: 'invalid' }
    return binding.accountUserId === accountUserId
      ? { status: 'bound', confirmedAt: binding.confirmedAt }
      : { status: 'mismatch', confirmedAt: binding.confirmedAt }
  } catch {
    return { status: 'invalid' }
  }
}

/**
 * Claims an unbound local dataset for the currently verified account. It never
 * replaces a binding owned by another account and never repairs corrupt state.
 */
export function confirmManagedAiDataBinding(
  accountUserId: string,
  dependencies: ManagedAiDataBindingDependencies = {},
): ManagedAiDataBindingState {
  const current = inspectManagedAiDataBinding(accountUserId, dependencies)
  if (current.status !== 'unbound') return current

  const configuration = dependencies.configuration ?? authConfiguration
  const scope = readyScope(configuration)
  const key = getManagedAiDataBindingStorageKey(configuration)
  const storage = resolveStorage(dependencies)
  if (!scope || !key || !storage) return { status: 'unavailable' }

  const now = dependencies.now?.() ?? new Date()
  if (!Number.isFinite(now.getTime())) return { status: 'unavailable' }
  const binding: ManagedAiDataBindingV1 = {
    schemaVersion: 1,
    scope,
    accountUserId,
    confirmedAt: now.toISOString(),
  }

  try {
    storage.setItem(key, JSON.stringify(binding))
  } catch {
    return { status: 'unavailable' }
  }
  return inspectManagedAiDataBinding(accountUserId, { ...dependencies, storage })
}

/**
 * Coordinates the asynchronous confirmation UI. The account is checked once
 * when the learner starts and again after Auth verification returns, preventing
 * an old account-A request from updating UI state after an A-to-B auth event.
 */
export async function confirmManagedAiDataBindingForCurrentAccount(
  dependencies: ManagedAiDataBindingConfirmationDependencies,
): Promise<ManagedAiDataBindingConfirmationResult> {
  const attemptAccountUserId = dependencies.getCurrentAccountUserId()
  if (!attemptAccountUserId) {
    return { ok: false, reason: 'signed-out', binding: { status: 'unavailable' } }
  }

  const verifiedAccountUserId = await dependencies.verifyCurrentAccountUserId()
  const currentAccountUserId = dependencies.getCurrentAccountUserId()
  const inspectBinding = dependencies.inspectBinding ?? inspectManagedAiDataBinding

  if (!verifiedAccountUserId) {
    return {
      ok: false,
      reason: 'verification-failed',
      binding: currentAccountUserId
        ? inspectBinding(currentAccountUserId)
        : { status: 'unavailable' },
    }
  }
  if (
    currentAccountUserId !== attemptAccountUserId
    || verifiedAccountUserId !== attemptAccountUserId
  ) {
    return {
      ok: false,
      reason: 'account-changed',
      binding: currentAccountUserId
        ? inspectBinding(currentAccountUserId)
        : { status: 'unavailable' },
    }
  }

  const latestBinding = inspectBinding(attemptAccountUserId)
  if (latestBinding.status === 'bound') return { ok: true, binding: latestBinding }
  if (latestBinding.status === 'mismatch') {
    return { ok: false, reason: 'mismatch', binding: latestBinding }
  }
  if (latestBinding.status === 'invalid') {
    return { ok: false, reason: 'invalid', binding: latestBinding }
  }
  if (latestBinding.status === 'unavailable') {
    return { ok: false, reason: 'unavailable', binding: latestBinding }
  }

  const binding = (dependencies.confirmBinding ?? confirmManagedAiDataBinding)(attemptAccountUserId)
  if (binding.status === 'bound') return { ok: true, binding }
  if (binding.status === 'mismatch') return { ok: false, reason: 'mismatch', binding }
  if (binding.status === 'invalid') return { ok: false, reason: 'invalid', binding }
  return { ok: false, reason: 'unavailable', binding }
}

/**
 * Portable backup import replaces the whole dataset, so every environment's
 * ownership marker must be invalidated. Throwing lets the import transaction
 * roll the data back instead of leaving new data under an old binding.
 */
export function clearAllManagedAiDataBindings(storage: Storage = globalThis.localStorage): number {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(MANAGED_AI_DATA_BINDING_KEY_PREFIX)) keys.push(key)
  }
  keys.forEach((key) => storage.removeItem(key))
  return keys.length
}
