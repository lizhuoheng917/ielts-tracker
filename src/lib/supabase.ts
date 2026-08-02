import { createClient } from '@supabase/supabase-js'

import { getAuthStorageKey } from '@/auth/config'
import { authConfiguration } from '@/auth/runtimeConfiguration'

export const supabase = authConfiguration.status === 'ready'
  ? createClient(authConfiguration.url, authConfiguration.publishableKey, {
      auth: {
        storageKey: getAuthStorageKey(authConfiguration),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
