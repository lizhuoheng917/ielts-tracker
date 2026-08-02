import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { safeAuthErrorMessage } from '@/auth/authErrors'
import {
  confirmManagedAiDataBindingForCurrentAccount,
  inspectManagedAiDataBinding,
  type ManagedAiDataBindingState,
} from '@/auth/managedAiDataBinding'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from '@/auth/authContext'
import { authConfiguration } from '@/auth/runtimeConfiguration'

function initialStatus(): AuthStatus {
  if (authConfiguration.status === 'unconfigured') return 'unconfigured'
  if (authConfiguration.status === 'misconfigured') return 'misconfigured'
  return 'initializing'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(initialStatus)
  const [session, setSession] = useState<Session | null>(null)
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
    const applySession = (nextSession: Session | null) => {
      if (!active) return
      sessionRef.current = nextSession
      setSession(nextSession)
      setStatus(nextSession ? 'signed-in' : 'signed-out')
      setManagedAiDataBinding(
        nextSession
          ? inspectManagedAiDataBinding(nextSession.user.id)
          : { status: 'unavailable' },
      )
    }

    void import('@/lib/supabase').then(({ supabase }) => {
      if (!active || !supabase) return
      clientRef.current = supabase

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        authEventReceived = true
        applySession(nextSession)
      })
      unsubscribe = () => data.subscription.unsubscribe()

      void supabase.auth.getSession()
        .then(({ data: sessionData, error }) => {
          if (!active || authEventReceived) return
          if (error) {
            setStatus('unavailable')
            return
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
            message: '本机账号归属信息异常。请先在设置导出 JSON 备份，再重新导入该备份；或确认无需保留后清空所有数据。',
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
    signOut: async () => {
      const client = clientRef.current
      if (!client) return { ok: false, message: '当前环境尚未连接 Lexi 账号服务。' }
      try {
        const { error } = await client.auth.signOut({ scope: 'local' })
        if (error) return { ok: false, message: safeAuthErrorMessage(error) }
        sessionRef.current = null
        setSession(null)
        setStatus('signed-out')
        setManagedAiDataBinding({ status: 'unavailable' })
        return { ok: true }
      } catch (error) {
        return { ok: false, message: safeAuthErrorMessage(error) }
      }
    },
  }), [managedAiDataBinding, session, status])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
