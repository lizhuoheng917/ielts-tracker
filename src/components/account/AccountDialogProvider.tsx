import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Laptop,
  LoaderCircle,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  UserRound,
} from 'lucide-react'

import { clearTrackerDataAfterAccountDeletion } from '@/auth/accountDataCleanup'
import { useAuth } from '@/auth/authContext'
import { type UserDevice, useDevicePresence } from '@/auth/devicePresence'
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

type BusyAction = 'binding' | 'sign-out' | 'delete-account' | null

function deviceIcon(device: UserDevice) {
  if (device.deviceType === 'phone') return Smartphone
  if (device.deviceType === 'tablet') return Tablet
  if (device.deviceType === 'computer') return Laptop
  return Monitor
}

function lastSeenLabel(value: string, active: boolean): string {
  if (active) return '当前在线'
  const elapsed = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(elapsed) || elapsed < 0) return '最近使用'
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟前活跃`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前活跃`
  return `${Math.floor(hours / 24)} 天前活跃`
}

function accountInitial(email?: string | null): string {
  const first = email?.trim().charAt(0)
  return first ? first.toUpperCase() : '雅'
}

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
    deleteAccount,
  } = useAuth()
  const { devices, activeDevices, loading: devicesLoading, error: devicesError, refresh: refreshDevices } = useDevicePresence(user?.id)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deletionOpen, setDeletionOpen] = useState(false)
  const [deletionPhrase, setDeletionPhrase] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setMessage('')
    setDeletionOpen(false)
    setDeletionPhrase('')
  }, [open])

  const handleConfirmManagedAiDataBinding = async () => {
    if (busy) return
    setBusy('binding')
    setError('')
    setMessage('')
    const result = await confirmManagedAiDataBinding()
    setBusy(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage('已确认。本机学习快照只会在当前 Lexi 账号下同步并发送给内置 AI。')
  }

  const handleSignOut = async () => {
    if (busy) return
    setBusy('sign-out')
    setError('')
    setMessage('')
    const result = await signOut()
    setBusy(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage('已退出当前设备。本机学习记录仍会保留。')
  }

  const handleDeleteAccount = async () => {
    if (busy || deletionPhrase !== '永久注销' || !user) return
    const accountUserId = user.id
    setBusy('delete-account')
    setError('')
    setMessage('')
    const result = await deleteAccount()
    if (!result.ok) {
      setBusy(null)
      setError(result.message)
      return
    }

    // Let authenticated bridges observe the signed-out state before their
    // durable outbox is removed from this browser.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    const cleanup = await clearTrackerDataAfterAccountDeletion(accountUserId)
    setDeletionOpen(false)
    setDeletionPhrase('')
    setMessage(cleanup.phase4bStateCleared
      ? '共享 Lexi 账号及云端学习数据已永久删除，当前 Lexi Tracker 浏览器记录也已清除。正在返回登录页面…'
      : '共享 Lexi 账号及云端学习数据已永久删除。当前浏览器的同步缓存未能确认清除，请随后在浏览器设置中清除本网站数据。')
    window.setTimeout(() => window.location.assign('/login?accountDeleted=1'), 1_000)
  }

  const identityAvailable = status === 'signed-out' || status === 'signed-in'
  const isBusy = busy !== null
  const openAuthPage = () => {
    onOpenChange(false)
    window.location.assign('/login')
  }
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy === 'delete-account') return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="bottom-0 left-0 top-auto max-h-[92dvh] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] rounded-b-none rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader className="border-b border-border/80 px-4 pb-4 pt-5 sm:px-5">
          <DialogTitle className="flex items-center gap-2 pr-8 text-lg">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-4.5" />
            </span>
            个人中心
          </DialogTitle>
          <DialogDescription>
            Lexi Tracker 与 Lexi Words 共用同一个 Lexi 账号。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
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
              <section className="rounded-2xl border border-success/25 bg-success-surface/45 p-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
                    {accountInitial(user.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">已登录 Lexi 账号</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{user.email ?? '已验证身份'}</p>
                  </div>
                  <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">已连接</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  计划、练习、模考、背词记录和考试日期会在已确认的设备间同步；日记、AI 对话与报告仍保留在当前浏览器。
                </p>
              </section>

              {managedAiDataBinding.status === 'unbound' && (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">确认本机学习数据的账号归属</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        确认后，这台设备会以当前账号开始同步学习记录，并可调用内置 AI；日记、AI 对话和报告不会随普通学习同步上传。
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={handleConfirmManagedAiDataBinding}
                    disabled={isBusy}
                    aria-busy={busy === 'binding'}
                    className="min-h-10 w-full"
                  >
                    {busy === 'binding' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                    {busy === 'binding' ? '正在确认…' : '确认这些记录属于当前账号'}
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
                  <p>这些本机记录已确认归属于另一个账号，云同步与内置 AI 均已暂停。请切回原账号；若确认无需保留这些记录，可清空本机数据后开始新记录。</p>
                </div>
              )}
              {managedAiDataBinding.status === 'invalid' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-surface/50 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>本机账号归属信息异常，云同步与内置 AI 不会发送数据。请重新登录后重试；若仍无法恢复，请确认无需保留后清空所有数据。</p>
                </div>
              )}
              {managedAiDataBinding.status === 'unavailable' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-surface/50 p-3.5 text-xs leading-5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  <p>当前浏览器无法确认本机记录归属，云同步与内置 AI 不会发送数据。本机学习不受影响。</p>
                </div>
              )}

              <section className="rounded-xl border border-border/80 bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">最近登录设备</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">“在线”表示最近 2 分 30 秒内收到页面心跳，不等同于可单独撤销的登录会话。</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    disabled={devicesLoading || isBusy}
                    onClick={() => void refreshDevices()}
                    aria-label="刷新设备列表"
                  >
                    <RefreshCw className={devicesLoading ? 'animate-spin' : ''} aria-hidden="true" />
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {devicesLoading && <p className="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">正在确认设备状态…</p>}
                  {!devicesLoading && devicesError && <p className="rounded-lg bg-destructive/5 px-3 py-3 text-sm text-destructive">{devicesError}</p>}
                  {!devicesLoading && !devicesError && devices.length === 0 && <p className="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">尚未记录设备，保持页面联网后会自动出现。</p>}
                  {!devicesLoading && !devicesError && devices.map((device) => {
                    const Icon = deviceIcon(device)
                    return (
                      <article key={device.deviceId} className="flex items-center gap-3 rounded-lg border border-border/65 px-3 py-2.5">
                        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{device.deviceName}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{device.osName} · {device.browserName}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={device.active ? 'text-xs font-medium text-success' : 'text-xs font-medium text-muted-foreground'}>{device.current ? '本设备' : device.active ? '在线' : '离线'}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{lastSeenLabel(device.lastSeenAt, device.active)}</p>
                        </div>
                      </article>
                    )
                  })}
                </div>
                {!devicesLoading && !devicesError && devices.length > 0 && <p className="mt-3 text-xs text-muted-foreground">当前 {activeDevices.length} 台设备在线</p>}
              </section>

              <section className="space-y-2 rounded-xl border border-border/80 bg-background p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">账户操作</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">退出当前设备不会删除本机学习记录，也不会影响其他设备。</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSignOut}
                  disabled={isBusy}
                  aria-busy={busy === 'sign-out'}
                  className="min-h-11 w-full"
                >
                  {busy === 'sign-out' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
                  {busy === 'sign-out' ? '正在退出…' : '退出当前设备'}
                </Button>
              </section>

              <section className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">永久注销共享账号</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">将永久删除这个 Lexi 账号及云端学习数据。Lexi Tracker 和 Lexi Words 都会注销，无法恢复。</p>
                  </div>
                </div>
                {!deletionOpen ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isBusy}
                    onClick={() => {
                      setError('')
                      setMessage('')
                      setDeletionOpen(true)
                    }}
                    className="mt-3 min-h-10 w-full"
                  >
                    永久注销账号
                  </Button>
                ) : (
                  <div className="mt-3 space-y-3 rounded-lg border border-destructive/25 bg-background/85 p-3">
                    <p className="text-sm font-semibold text-foreground">确认永久注销？</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      云端的账户和学习数据会立即删除；当前 Lexi Tracker 浏览器数据会同时清除。其他设备或 Lexi Words 本机未同步内容无法由这里自动清除。
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="tracker-account-deletion-confirmation">输入“永久注销”以继续</Label>
                      <Input
                        id="tracker-account-deletion-confirmation"
                        value={deletionPhrase}
                        onChange={(event) => setDeletionPhrase(event.target.value)}
                        disabled={isBusy}
                        autoComplete="off"
                        className="h-10"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => {
                          setDeletionOpen(false)
                          setDeletionPhrase('')
                        }}
                        className="min-h-10 flex-1"
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={isBusy || deletionPhrase !== '永久注销'}
                        aria-busy={busy === 'delete-account'}
                        onClick={() => void handleDeleteAccount()}
                        className="min-h-10 flex-1"
                      >
                        {busy === 'delete-account' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                        {busy === 'delete-account' ? '正在注销…' : '确认永久注销'}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {identityAvailable && !user && (
            <div className="space-y-4 rounded-xl border border-border/80 bg-background p-4">
              <div className="flex items-start gap-2.5">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-4.5" /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">登录或创建 Lexi 账号</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Lexi Tracker 与 Lexi Words 使用同一个账户。登录、注册、邮箱验证和找回密码都在统一页面完成。</p>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy === 'delete-account'} className="min-h-10 w-full sm:w-auto">
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
