import { ACTIVITY_LEDGER_STORAGE_KEY, type StorageLike } from '@/data/localMutationJournal'
import {
  useActivityLedgerStore,
  type ActivityLedgerAppendInput,
} from '@/stores/activityLedgerStore'

interface PersistedLedgerEnvelope {
  state?: {
    events?: Array<{ idempotencyKey?: unknown }>
  }
}

/**
 * Appends post-commit shadow events and verifies that Zustand's synchronous
 * persistence write reached storage. A failed check leaves the committed
 * transaction marker in place so startup can rebuild this disposable ledger.
 */
export function appendActivityLedgerEventsOrThrow(
  events: ActivityLedgerAppendInput[],
  storage: StorageLike = localStorage,
): void {
  const requiredKeys: string[] = []

  for (const event of events) {
    if (!event.idempotencyKey) throw new Error('事务账本事件缺少幂等键。')

    const alreadyPresent = useActivityLedgerStore.getState().events.some(
      (candidate) => candidate.idempotencyKey === event.idempotencyKey,
    )
    const appended = useActivityLedgerStore.getState().append(event)
    if (!appended && !alreadyPresent) throw new Error('影子活动账本写入失败。')
    requiredKeys.push(event.idempotencyKey)
  }

  if (requiredKeys.length === 0) return

  const raw = storage.getItem(ACTIVITY_LEDGER_STORAGE_KEY)
  if (raw === null) throw new Error('影子活动账本未持久化。')

  let envelope: PersistedLedgerEnvelope
  try {
    envelope = JSON.parse(raw) as PersistedLedgerEnvelope
  } catch {
    throw new Error('影子活动账本持久化内容无效。')
  }
  const persistedKeys = new Set(
    Array.isArray(envelope.state?.events)
      ? envelope.state.events
        .map((event) => event.idempotencyKey)
        .filter((key): key is string => typeof key === 'string')
      : [],
  )
  if (requiredKeys.some((key) => !persistedKeys.has(key))) {
    throw new Error('影子活动账本持久化校验失败。')
  }
}
