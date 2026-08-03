import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { useAuth } from '@/auth/authContext'
import { AccountDialogContext } from '@/components/account/accountDialogContext'
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

function LexiAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    status,
    user,
    managedAiDataBinding,
    confirmManagedAiDataBinding,
    signIn,
    signOut,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setPassword('')
    setShowPassword(false)
    setError('')
    setMessage('')
  }, [open])

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('请输入 Lexi 账号邮箱。')
      emailRef.current?.focus()
      return
    }
    if (password.length < 8) {
      setError('密码长度至少为 8 位。')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')
    const result = await signIn(normalizedEmail, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }

    setPassword('')
    setMessage('登录成功。本机学习记录没有发生变化；使用内置 AI 前请确认记录归属。')
  }

  const handleConfirmManagedAiDataBinding = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    const result = await confirmManagedAiDataBinding()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage('已确认。本机学习快照只会在当前 Lexi 账号下发送给内置 AI。')
  }

  const handleSignOut = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    const result = await signOut()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage('已退出 Lexi 账号。本机学习记录仍然保留。')
  }

  const identityAvailable = status === 'signed-out' || status === 'signed-in'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 left-0 top-auto max-h-[92dvh] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] rounded-b-none rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader className="border-b border-border/80 px-4 pb-4 pt-5 sm:px-5">
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-4.5" />
            </span>
            Lexi 账号
          </DialogTitle>
          <DialogDescription>
            使用与 Lexi Words 相同的邮箱和密码登录。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 p-3.5 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>
              登录并确认这台设备的数据归属后，学习计划、计划执行、练习、模考与考试日期可在你的设备间同步。日记、AI 对话、报告和自定义 AI 配置仍只保存在本机；退出账号不会清空本机记录。
            </p>
          </div>

          {status === 'initializing' && (
            <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-border/80 bg-muted/25 text-center">
              <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">正在读取当前设备的账号状态…</p>
            </div>
          )}

          {(status === 'unconfigured' || status === 'misconfigured' || status === 'unavailable') && (
            <div className="rounded-xl border border-border/80 bg-background p-4">
              <p className="font-semibold text-foreground">当前保持本地模式</p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {status === 'unconfigured' && '这个预览尚未连接 Lexi 账号服务，所有学习功能仍可正常使用。'}
                {status === 'misconfigured' && '账号环境配置不完整或不安全，应用已停止初始化账号连接。'}
                {status === 'unavailable' && '暂时无法读取账号状态，学习功能不受影响；请稍后重新打开此页面。'}
              </p>
            </div>
          )}

          {identityAvailable && user && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-surface/45 p-4">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">已登录 Lexi 账号</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{user.email ?? '已验证身份'}</p>
                </div>
              </div>
              {managedAiDataBinding.status === 'unbound' && (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">确认本机学习数据的账号归属</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        确认后，这台设备会以当前账号开始同步计划、执行、练习、模考与考试日期，并可调用内置 AI。日记、AI 对话和报告不会随普通学习同步上传。
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleConfirmManagedAiDataBinding}
                    disabled={busy}
                    aria-busy={busy}
                    className="min-h-10 w-full"
                  >
                    {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                    {busy ? '正在确认…' : '确认这些记录属于当前账号'}
                  </Button>
                </div>
              )}
              {managedAiDataBinding.status === 'bound' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-success/25 bg-success-surface/45 p-3.5 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <p>账号归属已确认。云同步与内置 AI 都只会在当前账号下读取这台设备的学习数据。</p>
                </div>
              )}
              {managedAiDataBinding.status === 'mismatch' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <p>
                    这些本机记录已确认归属于另一个账号，云同步与内置 AI 均已暂停。请切回原账号；若要开始一套新记录，请先导出备份并清空本机数据。
                  </p>
                </div>
              )}
              {managedAiDataBinding.status === 'invalid' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-surface/50 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>
                    本机账号归属信息异常，云同步与内置 AI 不会发送数据。请先到设置导出 JSON 备份，再重新导入该备份使旧绑定失效并重新确认；或确认无需保留后清空本机数据。
                  </p>
                </div>
              )}
              {managedAiDataBinding.status === 'unavailable' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-surface/50 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>当前浏览器无法确认本机记录归属，云同步与内置 AI 不会发送数据。本机学习与自定义 AI 不受影响。</p>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleSignOut}
                disabled={busy}
                aria-busy={busy}
                className="min-h-11 w-full"
              >
                {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
                {busy ? '正在退出…' : '退出当前设备的账号'}
              </Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">退出不会删除本机学习记录，也不会退出其他设备。</p>
            </div>
          )}

          {identityAvailable && !user && (
            <form className="space-y-4" onSubmit={handleSignIn} aria-busy={busy}>
              <div className="space-y-2">
                <Label htmlFor="lexi-account-email">邮箱</Label>
                <Input
                  ref={emailRef}
                  id="lexi-account-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'lexi-account-error' : undefined}
                  placeholder="你的 Lexi 账号邮箱"
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lexi-account-password">密码</Label>
                <div className="relative">
                  <Input
                    id="lexi-account-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'lexi-account-error' : undefined}
                    placeholder="至少 8 位"
                    className="h-11 pr-11 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label={showPassword ? '隐藏账号密码' : '显示账号密码'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={busy} className="min-h-11 w-full">
                {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {busy ? '正在登录…' : '登录已有 Lexi 账号'}
              </Button>

              <p className="text-center text-xs leading-5 text-muted-foreground">
                新账号注册、邀请码和邮箱验证暂由 Lexi Words 统一管理。
              </p>
            </form>
          )}

          <div className="min-h-5" aria-live="polite">
            {error && <p id="lexi-account-error" role="alert" className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-success">{message}</p>}
          </div>
        </div>

        <DialogFooter className="m-0 rounded-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-10 w-full sm:w-auto">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AccountDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) return
    window.requestAnimationFrame(() => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
      returnFocusRef.current = null
    })
  }

  return (
    <AccountDialogContext.Provider value={{
      openAccountDialog: (returnFocus) => {
        returnFocusRef.current = returnFocus ?? document.activeElement as HTMLElement | null
        setOpen(true)
      },
    }}>
      {children}
      <LexiAccountDialog open={open} onOpenChange={handleOpenChange} />
    </AccountDialogContext.Provider>
  )
}
