import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
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
    signOut,
  } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setMessage('')
  }, [open])

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

  const openAuthPage = () => {
    onOpenChange(false)
    window.location.assign('/login')
  }

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
              登录并确认这台设备的数据归属后，学习计划、计划执行、练习、模考与考试日期可在你的设备间同步。日记、AI 对话和报告仍只保存在本机；退出账号不会清空本机记录。
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
                    这些本机记录已确认归属于另一个账号，云同步与内置 AI 均已暂停。请切回原账号；若确认无需保留这些记录，可清空本机数据后开始新记录。
                  </p>
                </div>
              )}
              {managedAiDataBinding.status === 'invalid' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-surface/50 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>
                    本机账号归属信息异常，云同步与内置 AI 不会发送数据。请重新登录后重试；若仍无法恢复，请确认无需保留后清空本机数据。
                  </p>
                </div>
              )}
              {managedAiDataBinding.status === 'unavailable' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-surface/50 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>当前浏览器无法确认本机记录归属，云同步与内置 AI 不会发送数据。本机学习不受影响。</p>
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
            <div className="space-y-4 rounded-xl border border-border/80 bg-background p-4">
              <div className="flex items-start gap-2.5">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-4.5" /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">登录或创建 Lexi 账号</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Tracker 与 Lexi Words 使用同一个账户。登录、注册、邮箱验证和找回密码都在统一页面完成。</p>
                </div>
              </div>
              <Button type="button" onClick={openAuthPage} className="min-h-11 w-full">
                打开登录与注册页面 <ArrowRight aria-hidden="true" />
              </Button>
            </div>
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
