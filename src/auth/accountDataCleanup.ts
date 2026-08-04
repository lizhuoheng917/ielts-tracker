import { AUTH_STORAGE_KEY } from '@/auth/config'
import { clearTrackerPresenceDeviceId } from '@/auth/devicePresence'
import { STORAGE_PREFIX } from '@/lib/constants'
import { BrowserTrackerPhase4bSyncPersistence } from '@/sync/trackerPhase4bSyncPersistence'

const GUEST_MODE_STORAGE_KEY = 'lexi-tracker-guest-mode-v1'

function removeMatchingKeys(storage: Storage, predicate: (key: string) => boolean): void {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && predicate(key)) keys.push(key)
  }
  keys.forEach((key) => storage.removeItem(key))
}

/**
 * Runs only after the server has acknowledged account deletion. Cloud data is
 * gone with the shared Auth user; this removes the current Tracker origin's
 * local learning state and durable sync outbox as well. Other browser origins
 * and offline data on other devices cannot be erased by this web page.
 */
export async function clearTrackerDataAfterAccountDeletion(accountUserId: string): Promise<{
  phase4bStateCleared: boolean
}> {
  let phase4bStateCleared = false
  try {
    await new BrowserTrackerPhase4bSyncPersistence().delete(accountUserId)
    phase4bStateCleared = true
  } catch {
    // Keep deleting the ordinary local records below. The caller will disclose
    // if the durable sync cache could not be confirmed as cleared.
  }

  try {
    removeMatchingKeys(localStorage, (key) => (
      key.startsWith(`${STORAGE_PREFIX}:`)
      || key.startsWith(AUTH_STORAGE_KEY)
      || key === GUEST_MODE_STORAGE_KEY
    ))
    clearTrackerPresenceDeviceId()
  } catch {
    // Browser storage can be disabled. Account deletion has still completed on
    // the server; a reload will prevent the old in-memory state being used.
  }

  try {
    removeMatchingKeys(sessionStorage, (key) => key.startsWith(`${STORAGE_PREFIX}:`))
  } catch {
    // Session storage cleanup is best-effort for privacy, never a reason to
    // claim the server-side account deletion failed.
  }

  return { phase4bStateCleared }
}
