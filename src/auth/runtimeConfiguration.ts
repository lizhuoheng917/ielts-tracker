import { resolveAuthConfiguration } from '@/auth/config'

export const authConfiguration = resolveAuthConfiguration({
  VITE_LEXI_ENVIRONMENT: import.meta.env.VITE_LEXI_ENVIRONMENT,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_PROJECT_REF: import.meta.env.VITE_SUPABASE_PROJECT_REF,
})
