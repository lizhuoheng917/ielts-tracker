export const TRACKER_PRODUCTION_ENVIRONMENT = 'production'
export const TRACKER_PRODUCTION_PROJECT_REF = 'olkvqmnuyxuddgpcordp'
export const TRACKER_PRODUCTION_URL = `https://${TRACKER_PRODUCTION_PROJECT_REF}.supabase.co`
export const TRACKER_PRODUCTION_WORDS_URL = 'https://lexi-ielts.pages.dev'

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateProductionBuildEnvironment(env) {
  const errors = []
  const environment = clean(env.VITE_LEXI_ENVIRONMENT)
  const url = clean(env.VITE_SUPABASE_URL)
  const publishableKey = clean(env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const projectRef = clean(env.VITE_SUPABASE_PROJECT_REF)
  const wordsUrl = clean(env.VITE_LEXI_WORDS_APP_URL)

  if (environment !== TRACKER_PRODUCTION_ENVIRONMENT) {
    errors.push('VITE_LEXI_ENVIRONMENT must be production.')
  }
  if (projectRef !== TRACKER_PRODUCTION_PROJECT_REF) {
    errors.push('VITE_SUPABASE_PROJECT_REF must match the reviewed Lexi production project.')
  }
  if (url !== TRACKER_PRODUCTION_URL) {
    errors.push('VITE_SUPABASE_URL must match the reviewed Lexi production project URL.')
  }
  if (!publishableKey.startsWith('sb_publishable_') || publishableKey.length <= 'sb_publishable_'.length) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a modern browser-safe publishable key.')
  }
  if (publishableKey.startsWith('sb_secret_')) {
    errors.push('A Supabase secret key must never enter the Tracker browser build.')
  }
  if (wordsUrl !== TRACKER_PRODUCTION_WORDS_URL) {
    errors.push('VITE_LEXI_WORDS_APP_URL must match the reviewed Lexi Words production root.')
  }

  return errors
}
