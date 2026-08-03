import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LayoutList,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UserPlus,
} from 'lucide-react'

import { useAuth } from '@/auth/authContext'
import {
  authPathForMode,
  safeAuthReturnPath,
  type TrackerAuthMode,
} from '@/auth/authRouting'
import {
  completeTrackerEmailConfirmationFromUrl,
  inspectTrackerEmailConfirmationUrl,
  trackerEmailConfirmationErrorCopy,
  trackerEmailConfirmationRedirectUrl,
} from '@/auth/emailConfirmation'
import {
  getRegistrationAccessPolicy,
  hashInviteCode,
  type RegistrationAccessPolicy,
} from '@/auth/registrationAccess'
import { safeAuthErrorMessage } from '@/auth/authErrors'
import { BrandMark } from '@/components/brand/brand-mark'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function destinationFor(mode: TrackerAuthMode, returnPath: string): string {
  const path = authPathForMode(mode)
  return returnPath === '/' ? path : `${path}?returnTo=${encodeURIComponent(returnPath)}`
}

function accountServiceCopy(status: string): string {
  if (status === 'unconfigured') return '当前预览尚未连接 Lexi 账号服务。你仍可先在本机记录学习内容。'
  if (status === 'misconfigured') return '账号环境配置不完整或不安全，已暂停账号连接。你仍可先在本机使用。'
  return '暂时无法读取账号状态。学习记录仍保存在本机，稍后可重新尝试登录。'
}

function AuthBrand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className="size-11" />
      <div>
        <p className="text-base font-semibold tracking-tight text-foreground">Lexi Tracker</p>
        <p className="mt-0.5 text-xs text-muted-foreground">IELTS 学习总控台</p>
      </div>
    </div>
  )
}

function AuthVisual() {
  return (
    <div className="relative mx-auto mt-8 h-60 w-full max-w-md" aria-hidden="true">
      <div className="absolute right-2 top-2 h-40 w-40 rounded-full border-[18px] border-white/10" />
      <div className="absolute bottom-1 left-2 h-28 w-28 rounded-full bg-cyan-200/15 blur-[1px]" />
      <article className="absolute left-0 top-9 w-[72%] rounded-2xl border border-white/20 bg-white/13 p-4 shadow-[0_22px_40px_-24px_rgb(8_12_62/0.85)] backdrop-blur-sm">
        <div className="flex items-center justify-between text-white/75">
          <span className="text-[10px] font-semibold tracking-[0.16em]">TODAY'S PLAN</span>
          <LayoutList className="size-4" />
        </div>
        <p className="mt-4 text-lg font-semibold tracking-tight text-white">完成听力精练</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-[68%] rounded-full bg-cyan-200" />
        </div>
        <p className="mt-2 text-xs text-white/70">2 / 3 个小目标已完成</p>
      </article>
      <article className="absolute bottom-1 right-0 w-[61%] rounded-2xl border border-white/25 bg-white/95 p-4 text-slate-900 shadow-[0_22px_44px_-22px_rgb(8_12_62/0.9)]">
        <div className="flex items-center gap-2 text-indigo-700">
          <span className="grid size-7 place-items-center rounded-lg bg-indigo-100"><Check className="size-4" /></span>
          <span className="text-[10px] font-semibold tracking-[0.14em]">FOCUS LOG</span>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">45 分钟</p>
        <p className="mt-1 text-xs text-slate-500">专注记录已保存在本机</p>
      </article>
    </div>
  )
}

export function TrackerAuthLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_12%_8%,oklch(0.72_0.17_282/0.16),transparent_31rem),radial-gradient(circle_at_88%_92%,oklch(0.82_0.13_210/0.16),transparent_28rem),oklch(0.98_0.008_275)] px-5">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark className="size-12" />
        <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">正在恢复你的学习空间…</p>
      </div>
    </main>
  )
}

export function TrackerAuthScreen({ initialMode }: { initialMode: TrackerAuthMode }) {
  const {
    status,
    user,
    signIn,
    signUp,
    sendPasswordReset,
    enterGuest,
  } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<TrackerAuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [registrationPolicy, setRegistrationPolicy] = useState<RegistrationAccessPolicy | null>(null)
  const [registrationPolicyState, setRegistrationPolicyState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [signupComplete, setSignupComplete] = useState(false)
  const [localPromptOpen, setLocalPromptOpen] = useState(false)
  const policyRequestSequence = useRef(0)
  const submitRequestSequence = useRef(0)
  const submitInFlight = useRef(false)

  const returnPath = safeAuthReturnPath(new URLSearchParams(location.search).get('returnTo'))
  const accountServiceReady = status === 'signed-out'

  useEffect(() => {
    setMode(initialMode)
    setError('')
    setMessage('')
    setSignupComplete(false)
  }, [initialMode])

  useEffect(() => {
    document.title = `${mode === 'sign-up' ? '注册' : mode === 'forgot' ? '找回密码' : '登录'} · Lexi Tracker`
  }, [mode])

  useEffect(() => {
    if (status === 'signed-in' && user) navigate(returnPath, { replace: true })
  }, [navigate, returnPath, status, user])

  const loadRegistrationPolicy = useCallback(async () => {
    const sequence = ++policyRequestSequence.current
    setRegistrationPolicyState('loading')
    setRegistrationPolicy(null)
    try {
      const policy = await getRegistrationAccessPolicy()
      if (sequence !== policyRequestSequence.current) return
      setRegistrationPolicy(policy)
      setRegistrationPolicyState('ready')
    } catch {
      if (sequence !== policyRequestSequence.current) return
      setRegistrationPolicy(null)
      setRegistrationPolicyState('unavailable')
    }
  }, [])

  useEffect(() => {
    if (!accountServiceReady || mode !== 'sign-up') return
    void loadRegistrationPolicy()
    return () => { policyRequestSequence.current += 1 }
  }, [accountServiceReady, loadRegistrationPolicy, mode])

  const switchMode = (nextMode: TrackerAuthMode) => {
    if (busy) return
    setMode(nextMode)
    setError('')
    setMessage('')
    setSignupComplete(false)
    setPassword('')
    setShowPassword(false)
    if (nextMode !== 'sign-up') {
      policyRequestSequence.current += 1
      setRegistrationPolicy(null)
      setRegistrationPolicyState('idle')
      setInviteCode('')
    }
    navigate(destinationFor(nextMode, returnPath))
  }

  const continueLocally = () => {
    setLocalPromptOpen(false)
    enterGuest()
    navigate(returnPath, { replace: true })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!accountServiceReady || submitInFlight.current) return
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('请输入邮箱地址。')
      return
    }
    if (mode !== 'forgot' && password.length < 8) {
      setError('密码长度至少为 8 位。')
      return
    }

    const requestSequence = ++submitRequestSequence.current
    submitInFlight.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'sign-in') {
        const result = await signIn(normalizedEmail, password)
        if (!result.ok) {
          setError(result.message)
          return
        }
      } else if (mode === 'sign-up') {
        if (registrationPolicyState !== 'ready' || !registrationPolicy) {
          throw new Error('LEXI_REGISTRATION_POLICY_UNAVAILABLE')
        }
        let authoritativePolicy: RegistrationAccessPolicy
        try {
          authoritativePolicy = await getRegistrationAccessPolicy()
        } catch {
          if (requestSequence === submitRequestSequence.current) {
            setRegistrationPolicy(null)
            setRegistrationPolicyState('unavailable')
          }
          throw new Error('LEXI_REGISTRATION_POLICY_UNAVAILABLE')
        }
        if (requestSequence !== submitRequestSequence.current) return
        setRegistrationPolicy(authoritativePolicy)
        setRegistrationPolicyState('ready')
        if (authoritativePolicy.mode === 'closed') throw new Error('LEXI_REGISTRATION_CLOSED')
        const inviteHash = authoritativePolicy.mode === 'invite_only'
          ? await hashInviteCode(inviteCode)
          : null
        const result = await signUp(normalizedEmail, password, {
          emailRedirectTo: trackerEmailConfirmationRedirectUrl(),
          ...(inviteHash ? { data: { registration_invite_hash: inviteHash } } : {}),
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        if (requestSequence !== submitRequestSequence.current) return
        setInviteCode('')
        setPassword('')
        setSignupComplete(true)
        if (result.needsEmailConfirmation) {
          setMessage('账户已创建，请打开验证邮件完成确认后再登录。')
        }
      } else {
        const resetUrl = new URL('/login', window.location.origin)
        if (returnPath !== '/') resetUrl.searchParams.set('returnTo', returnPath)
        const result = await sendPasswordReset(normalizedEmail, resetUrl.toString())
        if (!result.ok) {
          setError(result.message)
          return
        }
        setMessage('如果这个邮箱已注册，密码重置邮件会很快送达。')
      }
    } catch (submitError) {
      if (requestSequence !== submitRequestSequence.current) return
      setError(safeAuthErrorMessage(submitError))
      const evidence = submitError instanceof Error ? submitError.message : String(submitError || '')
      if (mode === 'sign-up' && /LEXI_REGISTRATION_CLOSED|LEXI_REGISTRATION_POLICY_UNAVAILABLE|LEXI_INVITATION_INVALID|hook_timeout/i.test(evidence)) {
        void loadRegistrationPolicy()
      }
    } finally {
      submitInFlight.current = false
      if (requestSequence === submitRequestSequence.current) setBusy(false)
    }
  }

  const registrationBlocked = mode === 'sign-up' && (
    registrationPolicyState !== 'ready' || registrationPolicy?.mode === 'closed'
  )
  const modeCopy = mode === 'sign-in'
    ? {
        eyebrow: 'WELCOME BACK',
        title: '继续你的学习节奏',
        description: '使用与你的 Lexi Words 相同的邮箱和密码登录。',
        submit: '登录并继续',
      }
    : mode === 'sign-up'
      ? {
          eyebrow: 'CREATE YOUR SPACE',
          title: '创建统一学习账户',
          description: '一个 Lexi 账号，连接背词与雅思学习记录。',
          submit: '创建账户',
        }
      : {
          eyebrow: 'ACCOUNT RECOVERY',
          title: '找回登录密码',
          description: '输入注册邮箱，我们会发送安全的重置链接。',
          submit: '发送重置邮件',
        }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_8%_8%,oklch(0.73_0.17_282/0.18),transparent_30rem),radial-gradient(circle_at_92%_90%,oklch(0.82_0.13_210/0.18),transparent_28rem),oklch(0.98_0.008_275)] p-0 text-foreground sm:grid sm:place-items-center sm:p-6 lg:p-8">
      <div className="min-h-dvh w-full overflow-hidden bg-card shadow-[0_30px_90px_-46px_oklch(0.3_0.14_280/0.45)] sm:min-h-[min(45rem,calc(100dvh-3rem))] lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1.08fr)_minmax(25rem,.92fr)] lg:rounded-[2rem] lg:border lg:border-white/65">
        <section className="relative overflow-hidden bg-[linear-gradient(145deg,#312e81_0%,#4338ca_52%,#7c3aed_100%)] px-6 pb-12 pt-[max(1.75rem,env(safe-area-inset-top))] text-white sm:px-10 sm:py-10">
          <div className="absolute -right-28 -top-32 size-80 rounded-full border-[3.2rem] border-white/10" aria-hidden="true" />
          <div className="absolute -bottom-32 -left-24 size-64 rounded-full bg-cyan-200/15" aria-hidden="true" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <BrandMark className="size-11 shadow-[0_12px_28px_-15px_rgb(10_10_55/0.95)]" />
              <div>
                <p className="text-base font-semibold tracking-tight">Lexi Tracker</p>
                <p className="mt-0.5 text-xs text-indigo-100/85">IELTS 学习总控台</p>
              </div>
            </div>
            <div className="mt-12 max-w-lg sm:mt-16">
              <p className="text-[11px] font-semibold tracking-[0.19em] text-cyan-100">YOUR IELTS COMPANION</p>
              <h1 className="mt-3 text-[2.35rem] font-semibold leading-[1.12] tracking-[-0.055em] sm:text-5xl">
                让每一次学习，<br />
                <span className="text-cyan-200">都留下可见的进步。</span>
              </h1>
              <p className="mt-5 max-w-md text-sm leading-7 text-indigo-50/90 sm:text-[15px]">
                计划、练习、模考与复盘在同一个安静的空间中持续积累。登录后可安全同步到你的其他设备。
              </p>
            </div>
            <AuthVisual />
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-indigo-50/90">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">↻ 多端同步</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">⌁ 离线可用</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">✓ 数据归属确认</span>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-9 sm:px-10 sm:py-10">
          <div className="sm:hidden"><AuthBrand /></div>
          <div className="mt-9 sm:mt-auto">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-primary">{modeCopy.eyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-foreground">{modeCopy.title}</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{modeCopy.description}</p>
          </div>

          {!accountServiceReady ? (
            <div className="mt-7 rounded-2xl border border-border/80 bg-muted/35 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-[18px]" /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">当前保持本机模式</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{accountServiceCopy(status)}</p>
                </div>
              </div>
              <Button type="button" className="mt-4 min-h-11 w-full" onClick={() => setLocalPromptOpen(true)}>
                继续仅在本机使用 <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          ) : mode === 'sign-up' && signupComplete ? (
            <div className="mt-7 rounded-2xl border border-success/25 bg-success-surface/45 p-5 text-center" role="status">
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-success/12 text-success"><CheckCircle2 className="size-6" /></span>
              <h3 className="mt-3 text-lg font-semibold text-foreground">账户申请已提交</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{message || '账户已经创建，可以继续进入学习空间。'}</p>
              <Button type="button" className="mt-5 min-h-11 w-full" onClick={() => switchMode('sign-in')}>
                返回登录 <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <>
              {mode === 'sign-up' && (
                <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3" role="status" aria-live="polite">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {registrationPolicyState === 'loading' ? '正在确认注册状态' : registrationPolicyState === 'unavailable' ? '注册状态暂不可用' : registrationPolicy?.mode === 'open' ? '当前开放注册' : registrationPolicy?.mode === 'invite_only' ? '当前为邀请注册' : '新账户注册已暂停'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">注册规则由 Lexi 管理后台统一控制。</p>
                  </div>
                  {(registrationPolicyState === 'unavailable' || registrationPolicy?.mode === 'closed') && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadRegistrationPolicy()} disabled={busy || registrationPolicyState === 'loading'}>
                      重新检查
                    </Button>
                  )}
                </div>
              )}

              <form className="mt-7 space-y-4" onSubmit={submit} aria-busy={busy}>
                {!registrationBlocked && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="tracker-auth-email">邮箱地址</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                          id="tracker-auth-email"
                          type="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="name@example.com"
                          required
                          autoFocus
                          className="h-12 rounded-xl pl-10 text-base"
                        />
                      </div>
                    </div>

                    {mode !== 'forgot' && (
                      <div className="space-y-2">
                        <Label htmlFor="tracker-auth-password">密码</Label>
                        <div className="relative">
                          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                          <Input
                            id="tracker-auth-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="至少 8 位"
                            minLength={8}
                            required
                            className="h-12 rounded-xl px-10 text-base"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((visible) => !visible)}
                            className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={showPassword ? '隐藏密码' : '显示密码'}
                            aria-pressed={showPassword}
                          >
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {mode === 'sign-up' && registrationPolicy?.mode === 'invite_only' && (
                      <div className="space-y-2">
                        <Label htmlFor="tracker-auth-invite">测试邀请码</Label>
                        <Input
                          id="tracker-auth-invite"
                          type="text"
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          value={inviteCode}
                          onChange={(event) => setInviteCode(event.target.value)}
                          placeholder="LEXI-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                          required
                          className="h-12 rounded-xl text-base"
                        />
                        <p className="text-xs leading-5 text-muted-foreground">邀请码仅会在提交前留在当前页面，并以安全哈希发送验证。</p>
                      </div>
                    )}
                  </>
                )}

                {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive">{error}</p>}
                {message && mode !== 'sign-up' && <p role="status" className="rounded-xl border border-success/20 bg-success-surface/50 px-3 py-2.5 text-sm leading-5 text-success">{message}</p>}

                {!registrationBlocked && (
                  <Button
                    type="submit"
                    disabled={busy || (mode === 'sign-up' && registrationPolicy?.mode === 'invite_only' && !inviteCode.trim())}
                    className="min-h-12 w-full rounded-xl text-base shadow-[0_12px_24px_-16px_oklch(0.45_0.2_275/0.8)]"
                  >
                    {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : mode === 'sign-up' ? <UserPlus aria-hidden="true" /> : mode === 'forgot' ? <TimerReset aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                    {busy ? '正在连接学习空间…' : modeCopy.submit}
                  </Button>
                )}
              </form>
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {accountServiceReady && mode === 'sign-in' && (
              <>
                <button type="button" disabled={busy} onClick={() => switchMode('forgot')} className="font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">忘记密码？</button>
                <button type="button" disabled={busy} onClick={() => switchMode('sign-up')} className="font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">创建新账户</button>
              </>
            )}
            {accountServiceReady && mode === 'sign-up' && <button type="button" disabled={busy} onClick={() => switchMode('sign-in')} className="font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">已有账户？返回登录</button>}
            {accountServiceReady && mode === 'forgot' && <button type="button" disabled={busy} onClick={() => switchMode('sign-in')} className="font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">返回登录</button>}
          </div>

          <div className="mt-8 border-t border-border/70 pt-5">
            <button type="button" disabled={busy} onClick={() => setLocalPromptOpen(true)} className="group flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
              <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"><Sparkles className="size-[18px]" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">先以本机模式使用</span><span className="mt-0.5 block text-xs text-muted-foreground">无需账户，记录仅保存在当前浏览器</span></span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
            <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">登录、注册或切换账号都不会未经确认上传、覆盖或删除本机学习记录。</p>
          </div>
        </section>
      </div>

      <Dialog open={localPromptOpen} onOpenChange={setLocalPromptOpen}>
        <DialogContent className="max-w-md rounded-2xl p-0">
          <DialogHeader className="border-b border-border/80 px-5 pb-4 pt-5">
            <DialogTitle className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-[18px]" /></span>先以本机模式使用？</DialogTitle>
            <DialogDescription>你可以先完整使用学习功能，之后再登录并确认数据归属。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4 text-sm leading-6 text-muted-foreground">
            <p><strong className="text-foreground">无法多端同步：</strong>当前记录只保存在这台设备的浏览器中。</p>
            <p><strong className="text-foreground">请注意备份：</strong>清除浏览器数据可能会丢失记录。</p>
            <p><strong className="text-foreground">随时可以登录：</strong>首次登录时会先要求确认这些本机记录属于当前账号。</p>
          </div>
          <DialogFooter className="border-t border-border/80 px-5 py-4 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setLocalPromptOpen(false)}>返回登录</Button>
            <Button type="button" onClick={continueLocally}>确认，仅在本机使用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

type EmailConfirmationViewState =
  | { kind: 'checking' }
  | { kind: 'success' }
  | { kind: 'error'; title: string; description: string }

export function TrackerEmailConfirmationScreen() {
  const navigate = useNavigate()
  const [view, setView] = useState<EmailConfirmationViewState>(() => (
    inspectTrackerEmailConfirmationUrl().kind === 'success'
      ? { kind: 'success' }
      : { kind: 'checking' }
  ))

  useEffect(() => {
    document.title = '邮箱确认 · Lexi Tracker'
  }, [])

  useEffect(() => {
    if (view.kind !== 'checking') return
    let active = true
    void completeTrackerEmailConfirmationFromUrl().then(() => {
      if (active) setView({ kind: 'success' })
    }).catch((error: unknown) => {
      if (!active) return
      setView({ kind: 'error', ...trackerEmailConfirmationErrorCopy(error) })
    })
    return () => { active = false }
  }, [view.kind])

  const openLogin = () => navigate('/login', { replace: true })

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_15%_10%,oklch(0.72_0.17_282/0.16),transparent_32rem),oklch(0.98_0.008_275)] px-5">
      <section className="w-full max-w-md rounded-[1.75rem] border border-white/75 bg-card p-7 text-center shadow-[0_30px_80px_-45px_oklch(0.3_0.14_280/0.5)]" aria-live="polite">
        <div className="flex justify-center"><BrandMark className="size-12" /></div>
        {view.kind === 'checking' ? <div className="py-11">
          <LoaderCircle className="mx-auto size-7 animate-spin text-primary" aria-hidden="true" />
          <p className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-primary">VERIFYING EMAIL</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">正在确认邮箱</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">请保持页面打开，验证结果马上就好。</p>
        </div> : view.kind === 'success' ? <div className="py-6">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-success/12 text-success"><CheckCircle2 className="size-7" /></span>
          <p className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-primary">EMAIL CONFIRMED</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">注册成功</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">邮箱已经验证。请使用注册邮箱和密码登录 Lexi Tracker。</p>
          <Button type="button" className="mt-6 min-h-11 w-full" onClick={openLogin}>打开登录页 <ArrowRight aria-hidden="true" /></Button>
        </div> : <div className="py-6">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"><Mail className="size-6" /></span>
          <p className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-primary">CONFIRMATION NEEDED</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{view.title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{view.description}</p>
          <Button type="button" className="mt-6 min-h-11 w-full" onClick={openLogin}>返回登录页</Button>
        </div>}
      </section>
    </main>
  )
}

export function TrackerUpdatePasswordScreen() {
  const { updatePassword, finishPasswordRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = '设置新密码 · Lexi Tracker'
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    if (password.length < 8) {
      setError('密码长度至少为 8 位。')
      return
    }
    if (password !== confirmation) {
      setError('两次输入的密码不一致。')
      return
    }
    setBusy(true)
    setError('')
    const result = await updatePassword(password)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    finishPasswordRecovery()
    navigate('/', { replace: true })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_15%_10%,oklch(0.72_0.17_282/0.16),transparent_32rem),oklch(0.98_0.008_275)] px-5">
      <section className="w-full max-w-md rounded-[1.75rem] border border-white/75 bg-card p-7 shadow-[0_30px_80px_-45px_oklch(0.3_0.14_280/0.5)]">
        <AuthBrand />
        <div className="mt-9">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-primary">SECURE YOUR ACCOUNT</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">设置新密码</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">新密码保存后，你会继续进入原来的学习账户。</p>
        </div>
        <form className="mt-7 space-y-4" onSubmit={submit} aria-busy={busy}>
          <div className="space-y-2"><Label htmlFor="tracker-new-password">新密码</Label><Input id="tracker-new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoFocus className="h-12 rounded-xl text-base" /></div>
          <div className="space-y-2"><Label htmlFor="tracker-confirm-password">再次输入</Label><Input id="tracker-confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required className="h-12 rounded-xl text-base" /></div>
          {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl">{busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />} {busy ? '正在保存…' : '保存新密码'}</Button>
        </form>
      </section>
    </main>
  )
}
