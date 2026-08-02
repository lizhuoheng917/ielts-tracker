import { describe, expect, it } from 'vitest'

import {
  TRACKER_PRODUCTION_PROJECT_REF,
  TRACKER_PRODUCTION_URL,
} from './production-build-env-contract.mjs'
import {
  TRACKER_STAGING_URL,
  validateProductionBundleText,
} from './production-bundle-contract.mjs'

describe('Tracker production bundle contract', () => {
  it('accepts a production-connected bundle without staging or secret markers', () => {
    expect(validateProductionBundleText(`${TRACKER_PRODUCTION_URL} ${TRACKER_PRODUCTION_PROJECT_REF} sb_publishable_public`)).toEqual([])
  })

  it('rejects offline, staging, and secret-bearing bundles', () => {
    expect(validateProductionBundleText('offline bundle')).toHaveLength(2)
    expect(validateProductionBundleText(
      `${TRACKER_PRODUCTION_URL} ${TRACKER_PRODUCTION_PROJECT_REF} ${TRACKER_STAGING_URL} sb_secret_server_only_key`,
    )).toHaveLength(2)
  })
})
