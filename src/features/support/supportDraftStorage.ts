export const legacySupportDraftStorageKey = 'lexi-support-feedback-draft-v1'
export const guestSupportDraftStorageKey = 'lexi:guest:tracker-support-feedback-draft-v1'
export const supportDraftClaimKey = 'lexi:tracker:support-feedback-claim-guest-v1'

export function trackerSupportDraftStorageKey(userId?: string | null, authenticated = false): string {
  return authenticated && userId
    ? `lexi:${userId}:tracker-support-feedback-draft-v1`
    : guestSupportDraftStorageKey
}

/**
 * Authentication can change between render and effects. A draft must only be
 * saved after the new scope has actually been loaded, otherwise a guest or
 * prior-account draft could be written under the next account's key.
 */
export function canPersistSupportDraft(loadedStorageKey: string, currentStorageKey: string): boolean {
  return loadedStorageKey === currentStorageKey
}
