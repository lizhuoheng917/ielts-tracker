import { describe, expect, it } from 'vitest'

import { validateReleaseImpact } from './release-impact-contract.mjs'

const validManifest = {
  schemaVersion: 1,
  release: 'phase-1-local-foundation',
  Frontend: { status: 'changed', reason: 'Local data and UI changed.' },
  Backend: {
    status: 'reviewed-not-needed',
    reason: 'No remote contract changed.',
  },
  Admin: {
    status: 'reviewed-not-needed',
    reason: 'No remotely managed state changed.',
  },
  Deployment: { status: 'not-deployed', reason: 'Local implementation only.' },
  Verification: { status: 'required', reason: 'Run the release gate.' },
}

describe('validateReleaseImpact', () => {
  it('accepts an explicit five-area release review', () => {
    expect(validateReleaseImpact(validManifest)).toEqual([])
  })

  it('rejects a missing release area', () => {
    const { Admin: _admin, ...withoutAdmin } = validManifest

    expect(validateReleaseImpact(withoutAdmin)).toContain(
      'Admin must be an object with status and reason.',
    )
  })

  it('rejects vague statuses and empty reasons', () => {
    const invalidManifest = {
      ...validManifest,
      Backend: { status: 'not-affected', reason: '   ' },
    }

    expect(validateReleaseImpact(invalidManifest)).toEqual([
      'Backend.status must be one of: changed, reviewed-not-needed.',
      'Backend.reason must explain the review result.',
    ])
  })
})
