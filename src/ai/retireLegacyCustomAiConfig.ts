import { STORAGE_PREFIX } from '@/lib/constants'

export const LEGACY_CUSTOM_AI_CONFIG_KEY = `${STORAGE_PREFIX}ai-config`

/**
 * Custom browser-side AI has been retired. Remove the old locally persisted
 * connection so a previously entered provider key is not left on the device.
 */
export function retireLegacyCustomAiConfig(storage: Storage = localStorage): boolean {
  try {
    storage.removeItem(LEGACY_CUSTOM_AI_CONFIG_KEY)
    return true
  } catch {
    return false
  }
}
