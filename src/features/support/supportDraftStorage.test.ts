import { describe, expect, it } from 'vitest'

import {
  canPersistSupportDraft,
  guestSupportDraftStorageKey,
  trackerSupportDraftStorageKey,
} from './supportDraftStorage'

describe('Tracker support draft scope', () => {
  it('uses a separate local draft key for every signed-in account', () => {
    expect(trackerSupportDraftStorageKey('account-a', true)).toBe('lexi:account-a:tracker-support-feedback-draft-v1')
    expect(trackerSupportDraftStorageKey('account-b', true)).toBe('lexi:account-b:tracker-support-feedback-draft-v1')
    expect(trackerSupportDraftStorageKey(null, false)).toBe(guestSupportDraftStorageKey)
  })

  it('does not persist an old draft while the new account scope is loading', () => {
    expect(canPersistSupportDraft(guestSupportDraftStorageKey, 'lexi:account-a:tracker-support-feedback-draft-v1')).toBe(false)
    expect(canPersistSupportDraft('lexi:account-a:tracker-support-feedback-draft-v1', 'lexi:account-a:tracker-support-feedback-draft-v1')).toBe(true)
  })
})
