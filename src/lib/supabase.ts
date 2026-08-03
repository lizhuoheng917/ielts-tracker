import { createClient } from '@supabase/supabase-js'

import { getAuthStorageKey } from '@/auth/config'
import { shouldHandleTrackerEmailConfirmation } from '@/auth/emailConfirmation'
import { authConfiguration } from '@/auth/runtimeConfiguration'

const confirmationRouteOwnsCallback = typeof window !== 'undefined'
  && shouldHandleTrackerEmailConfirmation(window.location)

export const supabase = authConfiguration.status === 'ready'
  ? createClient(authConfiguration.url, authConfiguration.publishableKey, {
      auth: {
        storageKey: getAuthStorageKey(authConfiguration),
        persistSession: !confirmationRouteOwnsCallback,
        autoRefreshToken: !confirmationRouteOwnsCallback,
        detectSessionInUrl: !confirmationRouteOwnsCallback,
      },
    })
  : null

export function requireSupabase() {
  if (!supabase) throw new Error('当前环境尚未连接 Lexi 账号服务。')
  return supabase
}
