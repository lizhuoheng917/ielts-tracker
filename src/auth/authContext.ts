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

export type AuthSignUpOptions = {
  emailRedirectTo: string
  data?: Record<string, string>
}

export type AuthSignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; message: string }

export type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  guestMode: boolean
  recoveryMode: boolean
  managedAiDataBinding: ManagedAiDataBindingState
  confirmManagedAiDataBinding: () => Promise<AuthActionResult>
  signIn: (email: string, password: string) => Promise<AuthActionResult>
  signUp: (
    email: string,
    password: string,
    options: AuthSignUpOptions,
  ) => Promise<AuthSignUpResult>
  sendPasswordReset: (email: string, redirectTo: string) => Promise<AuthActionResult>
  updatePassword: (password: string) => Promise<AuthActionResult>
  signOut: () => Promise<AuthActionResult>
  deleteAccount: () => Promise<AuthActionResult>
  enterGuest: () => void
  exitGuest: () => void
  finishPasswordRecovery: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}
