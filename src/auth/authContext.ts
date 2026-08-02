import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

import type { ManagedAiDataBindingState } from '@/auth/managedAiDataBinding'

export type AuthStatus =
  | 'unconfigured'
  | 'misconfigured'
  | 'initializing'
  | 'signed-out'
  | 'signed-in'
  | 'unavailable'

export type AuthActionResult = { ok: true } | { ok: false; message: string }

export type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  managedAiDataBinding: ManagedAiDataBindingState
  confirmManagedAiDataBinding: () => Promise<AuthActionResult>
  signIn: (email: string, password: string) => Promise<AuthActionResult>
  signOut: () => Promise<AuthActionResult>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}
