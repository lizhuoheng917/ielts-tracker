import {
  TRACKER_PRODUCTION_PROJECT_REF,
  TRACKER_PRODUCTION_URL,
  TRACKER_PRODUCTION_WORDS_URL,
} from './production-build-env-contract.mjs'

export const TRACKER_STAGING_PROJECT_REF = 'kkynryhceurvnylprxyx'
export const TRACKER_STAGING_URL = `https://${TRACKER_STAGING_PROJECT_REF}.supabase.co`
export const TRACKER_STAGING_WORDS_URL = 'https://lexi-ielts-staging.pages.dev'

export function validateProductionBundleText(bundleText) {
  const errors = []
  if (!bundleText.includes(TRACKER_PRODUCTION_PROJECT_REF)) {
    errors.push('Production bundle does not contain the reviewed Lexi production project reference.')
  }
  if (!bundleText.includes(TRACKER_PRODUCTION_URL)) {
    errors.push('Production bundle does not contain the reviewed Lexi production project URL.')
  }
  if (!bundleText.includes(TRACKER_PRODUCTION_WORDS_URL)) {
    errors.push('Production bundle does not contain the reviewed Lexi Words production root.')
  }
  if (bundleText.includes(TRACKER_STAGING_URL)) {
    errors.push('Production bundle contains the Lexi staging project URL.')
  }
  if (bundleText.includes(TRACKER_STAGING_WORDS_URL)) {
    errors.push('Production bundle contains the Lexi Words staging root.')
  }
  if (/sb_secret_[A-Za-z0-9._-]{8,}/.test(bundleText)) {
    errors.push('Production bundle contains a Supabase secret-shaped token.')
  }
  return errors
}
