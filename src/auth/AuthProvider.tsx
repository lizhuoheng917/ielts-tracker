import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { deleteCurrentLexiAccount } from '@/auth/accountDeletion'
import { safeAuthErrorMessage } from '@/auth/authErrors'
import { removeCurrentDevicePresence } from '@/auth/devicePresence'
import {
  confirmManagedAiDataBindingForCurrentAccount,
  inspectManagedAiDataBinding,
  type ManagedAiDataBindingState,
} from '@/auth/managedAiDataBinding'
import {
  AuthContext,
  type AuthContextValue,
  type AuthSignUpOptions,
  type AuthStatus,
} from '@/auth/authContext'
import { isTrackerPasswordRecoveryCallback } from '@/auth/emailConfirmation'
import { authConfiguration } from '@/auth/runtimeConfiguration'

const GUEST_MODE_STORAGE_KEY = 'lexi-tracker-guest-mode-v1'

function readGuestMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(GUEST_MODE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeGuestMode(nextGuestMode: boolean): void {
  try {
    if (nextGuestMode) globalThis.localStorage?.setItem(GUEST_MODE_STORAGE_KEY, 'true')
    else globalThis.localStorage?.removeItem(GUEST_MODE_STORAGE_KEY)
  } catch {
    // Guest mode is a convenience flag. Failing to persist it must never block local learning.
  }
}

function initialStatus(): AuthStatus {
  if (authConfiguration.status === 'unconfigured') return 'unconfigured'
  if (authConfiguration.status === 'misconfigured') return 'misconfigured'
  return 'initializing'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(initialStatus)
  const [session, setSession] = useState<Session | null>(null)
  const [guestMode, setGuestMode] = useState(readGuestMode)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [managedAiDataBinding, setManagedAiDataBinding] = useState<ManagedAiDataBindingState>({
    status: 'unavailable',
  })
  const clientRef = useRef<SupabaseClient | null>(null)
  const sessionRef = useRef<Session | null>(null)

  useEffect(() => {
    if (authConfiguration.status !== 'ready') return

    let active = true
    let authEventReceived = false
    let unsubscribe: () => void = () => undefined
    const applySession = (nextSession: Session | null, event?: AuthChangeEvent) => {
      if (!active) return
      sessionRef.current = nextSession
      setSession(nextSession)
      setStatus(nextSession ? 'signed-in' : 'signed-out')
      if (nextSession) {
        writeGuestMode(false)
        setGuestMode(false)
      }
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (event === 'SIGNED_OUT') setRecoveryMode(false)
      setManagedAiDataBinding(
        nextSession
          ? inspectManagedAiDataBinding(nextSession.user.id)
          : { status: 'unavailable' },
      )
    }

    void import('@/lib/supabase').then(({ supabase }) => {
      if (!active || !supabase) return
      clientRef.current = supabase

      const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
        authEventReceived = true
        applySession(nextSession, event)
      })
      unsubscribe = () => data.subscription.unsubscribe()

      void supabase.auth.getSession()
        .then(({ data: sessionData, error }) => {
          if (!active || authEventReceived) return
          if (error) {
            setStatus('unavailable')
            return
          }
          if (sessionData.session && isTrackerPasswordRecoveryCallback()) {
            setRecoveryMode(true)
          }
          applySession(sessionData.session)
        })
        .catch(() => {
          if (active && !authEventReceived) setStatus('unavailable')
        })
    }).catch(() => {
      if (active) setStatus('unavailable')
    })

    return () => {
      active = false
      clientRef.current = null
      sessionRef.current = null
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    user: session?.user ?? null,
    guestMode,
    recoveryMode,
    managedAiDataBinding,
    confirmManagedAiDataBinding: async () => {
      const client = clientRef.current
      if (!client || !sessionRef.current) return { ok: false, message: '请先登录 Lexi 账号。' }
      try {
        let verificationError: unknown
        const result = await confirmManagedAiDataBindingForCurrentAccount({
          getCurrentAccountUserId: () => sessionRef.current?.user.id ?? null,
          verifyCurrentAccountUserId: async () => {
            const { data, error } = await client.auth.getUser()
            if (error) {
              verificationError = error
              return null
            }
            return data.user?.id ?? null
          },
        })
        setManagedAiDataBinding(result.binding)
        if (result.ok) return { ok: true }
        if (result.reason === 'mismatch') {
          return {
            ok: false,
            message: '这台设备的本机记录已确认归属于另一个 Lexi 账号，不能直接改绑。',
          }
        }
        if (result.reason === 'account-changed') {
          return { ok: false, message: '账号状态刚刚发生变化，请按当前显示的账号重新确认。' }
        }
        if (result.reason === 'invalid') {
          return {
            ok: false,
            message: '本机账号归属信息异常。请重新登录后重试；若仍无法恢复，请确认无需保留后清空所有数据。',
          }
        }
        if (result.reason === 'signed-out') return { ok: false, message: '请先登录 Lexi 账号。' }
        if (result.reason === 'verification-failed' && verificationError) {
          return { ok: false, message: safeAuthErrorMessage(verificationError) }
        }
        return { ok: false, message: '暂时无法保存本机记录的账号确认，请稍后重试。' }
      } catch (error) {
        return { ok: false, message: safeAuthErrorMessage(error) }
      }
    },
    signIn: async (email, password) => {
      const client = clientRef.current
      if (!client) return { ok: false, message: '当前环境尚未连接 Lexi 账号服务。' }
      try {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (error) return { ok: false, message: safeAuthErrorMessage(error) }
        return { ok: true }
      } catch (error) {
        return { ok: false, message: safeAuthErrorMessage(error) }
      }
    },
    signUp: async (email, password, options: AuthSignUpOptions) => {
      const client = clientRef.current
      if (!client) return { ok: false, message: '当前环境尚未连接 Lexi 账号服务。' }
      try {
        const { data, error } = await client.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options,
        })
        if (error) return { ok: false, message: safeAuthErrorMessage(error) }
        if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
          return { ok: false, message: '该账号已注册，请直接登录。' }
        }
        return { ok: true, needsEmailConfirmation: !data.session }
      } catch (error) {
        return { ok: false, message: safeAuthErrorMessage(error) }
      }
    },
    sendPasswordReset: async (email, redirectTo) => {
      const client = clientRef.current
      if (!client) return { ok: false, message: '当前环境尚未连接 Lexi 账号服务。' }
      try {
        const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo,
        })
        if (error) return { ok: false, message: safeAuthErrorMessage(error) }
        return { ok: true }
      } catch (error) {
        return { ok: false, message: safeAuthErrorMessage(error) }
      }
    },
    updatePassword: async (password) => {
      const client = clientRef.current
      if (!client) return { ok: false, message: '当前环境尚未连接 Lexi 账号服务。' }
      try {
        const { error } = await client.auth.updateUser({ password })
        if (error) return { ok: false, message: safeAuthErrorMessage(error) }
        return { ok: true }
      } catch (error) {
        return { ok: false, message: safeAuthErrorMessage(error) }
      }
    },
    signOut: async () => {
      const client = clientRef.current
      if (!client) return { ok: false, message: '当前环境尚未连接 Lexi 账号服务。' }
      try {
        const userId = sessionRef.current?.user.id
        if (userId) {
          try {
            await removeCurrentDevicePresence(userId)
          } catch {
            // Device presence expires shortly even if the best-effort cleanup fails.
          }
        }
        const { error } = await client.auth.signOut({ scope: 'local' })
        if (error) return { ok: false, message: safeAuthErrorMessage(error) }
        sessionRef.current = null
        setSession(null)
        setStatus('signed-out')
        writeGuestMode(false)
        setGuestMode(false)
        setRecoveryMode(false)
        setManagedAiDataBinding({ status: 'unavailable' })
        return { ok: true }
      } catch (error) {
        return { ok: false, message: safeAuthErrorMessage(error) }
      }
    },
    deleteAccount: async () => {
      const client = clientRef.current
      if (!client || !sessionRef.current) return { ok: false, message: '请先登录 Lexi 账号。' }
      try {
        await deleteCurrentLexiAccount(client)
        // The server has deleted this shared identity. Stop all local auth and
        // sync work even if Supabase does not emit a local SIGNED_OUT event.
        sessionRef.current = null
        setSession(null)
        setStatus('signed-out')
        writeGuestMode(false)
        setGuestMode(false)
        setRecoveryMode(false)
        setManagedAiDataBinding({ status: 'unavailable' })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : '账号暂时无法注销，请稍后再试。',
        }
      }
    },
    enterGuest: () => {
      writeGuestMode(true)
      setGuestMode(true)
    },
    exitGuest: () => {
      writeGuestMode(false)
      setGuestMode(false)
    },
    finishPasswordRecovery: () => {
      setRecoveryMode(false)
      const recoveryType = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type')
      if (recoveryType === 'recovery') {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
      }
    },
  }), [guestMode, managedAiDataBinding, recoveryMode, session, status])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
