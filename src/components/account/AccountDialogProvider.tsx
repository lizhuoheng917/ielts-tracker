import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  KeyRound,
  Laptop,
  LoaderCircle,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
} from 'lucide-react'

import { clearTrackerDataAfterAccountDeletion } from '@/auth/accountDataCleanup'
import { trackerPasswordResetRedirectUrl, type AccountSessionScope } from '@/auth/accountSecurity'
import { useAuth } from '@/auth/authContext'
import { type UserDevice, useDevicePresence } from '@/auth/devicePresence'
import { trackerLexiAccountCenterUrl } from '@/auth/lexiAccountCenter'
import { AccountDialogContext } from '@/components/account/accountDialogContext'
import { BrandMark } from '@/components/brand/brand-mark'
import { LexiAccountMark } from '@/components/brand/lexi-account-mark'
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

type BusyAction = 'binding' | 'password-reset' | 'sign-out-local' | 'sign-out-others' | 'sign-out-global' | 'delete-account' | null
type SessionSignOutConfirmation = Exclude<AccountSessionScope, 'local'> | null

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

export function LexiAccountDialog({
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
    sendPasswordReset,
    signOut,
    deleteAccount,
  } = useAuth()
  const { devices, activeDevices, loading: devicesLoading, error: devicesError, refresh: refreshDevices } = useDevicePresence(user?.id)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deletionOpen, setDeletionOpen] = useState(false)
  const [deletionPhrase, setDeletionPhrase] = useState('')
  const [sessionSignOutConfirmation, setSessionSignOutConfirmation] = useState<SessionSignOutConfirmation>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setMessage('')
    setDeletionOpen(false)
    setDeletionPhrase('')
    setSessionSignOutConfirmation(null)
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

  const handleSendPasswordReset = async () => {
    if (busy) return
    if (!user?.email) {
      setError('当前账户没有可用的邮箱地址。')
      return
    }
    setBusy('password-reset')
    setError('')
    setMessage('')
    const result = await sendPasswordReset(user.email, trackerPasswordResetRedirectUrl(window.location))
    setBusy(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setMessage('修改密码邮件已发送，请前往注册邮箱继续。完成设置新密码后，其他设备需要使用新密码重新登录。')
  }

  const busyActionForSessionScope = (scope: AccountSessionScope): BusyAction => {
    if (scope === 'others') return 'sign-out-others'
    if (scope === 'global') return 'sign-out-global'
    return 'sign-out-local'
  }

  const handleSignOut = async (scope: AccountSessionScope) => {
    if (busy) return
    setBusy(busyActionForSessionScope(scope))
    setError('')
    setMessage('')
    const result = await signOut(scope)
    setBusy(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setSessionSignOutConfirmation(null)
    if (scope === 'others') {
      setMessage('其他 Lexi 登录会话已撤销。已签发的短期访问令牌可能在到期前短暂有效。')
      return
    }
    if (scope === 'global') {
      setMessage('已退出所有 Lexi 设备。下次进入 Lexi Tracker 或 Lexi Words 时需要重新登录。')
      return
    }
    setMessage('已退出当前 Tracker 设备。本机学习记录仍会保留。')
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
  const accountCenterUrl = typeof window === 'undefined'
    ? null
    : trackerLexiAccountCenterUrl(window.location, {
        accountCenterUrl: import.meta.env.VITE_LEXI_ACCOUNT_URL,
        isDevelopment: import.meta.env.DEV,
      })
  const openAuthPage = () => {
    onOpenChange(false)
    window.location.assign('/login')
  }
  const openAccountCenter = () => {
    if (!accountCenterUrl || isBusy) return
    window.location.assign(accountCenterUrl)
  }
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy === 'delete-account') return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="bottom-0 left-0 top-auto max-h-[92dvh] max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] rounded-b-none rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[min(88dvh,52rem)] sm:max-h-[88dvh] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader className="border-b border-border/80 px-4 pb-4 pt-5 sm:px-5">
          <div className="flex items-start gap-3 pr-8">
            <LexiAccountMark className="size-10" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">Lexi Account</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                一个账号，统一管理安全与跨产品登录会话。
              </DialogDescription>
            </div>
            <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-primary">TRACKER</span>
          </div>
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
              <section
                aria-labelledby="tracker-current-account-title"
                data-account-scope="tracker"
                className="rounded-2xl border border-primary/25 bg-primary/[0.045] p-4"
              >
                <div className="flex items-center gap-3">
                  <BrandMark className="size-11" />
                  <div className="min-w-0 flex-1">
                    <p id="tracker-current-account-title" className="text-sm font-semibold text-foreground">当前产品 · Lexi Tracker</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">已连接 Lexi Account</p>
                    <p className="mt-1 truncate text-sm text-foreground">{user.email ?? '已验证身份'}</p>
                  </div>
                  <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">已连接</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  这里管理这台设备的 Tracker 学习数据、同步与 AI 使用状态；不会改变 Lexi Words 的本机内容。
                </p>
              </section>

              <section
                aria-labelledby="tracker-data-sync-title"
                data-account-scope="tracker"
                className="space-y-4 rounded-xl border border-border/80 bg-background p-4"
              >
                <div className="flex items-start gap-2.5">
                  <BrandMark className="size-9" />
                  <div>
                    <p id="tracker-data-sync-title" className="text-sm font-semibold text-foreground">Tracker 数据与同步</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">仅影响当前 Lexi Tracker 浏览器和学习记录。</p>
                  </div>
                </div>

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

                <div className="border-t border-border/70 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Tracker 最近活跃设备</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">这些是 Tracker 浏览器的近期心跳记录，不等同于全部 Lexi 登录会话。</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      disabled={devicesLoading || isBusy}
                      onClick={() => void refreshDevices()}
                      aria-label="刷新 Tracker 活跃设备"
                    >
                      <RefreshCw className={devicesLoading ? 'animate-spin' : ''} aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {devicesLoading && <p className="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">正在确认 Tracker 设备状态…</p>}
                    {!devicesLoading && devicesError && <p className="rounded-lg bg-destructive/5 px-3 py-3 text-sm text-destructive">{devicesError}</p>}
                    {!devicesLoading && !devicesError && devices.length === 0 && <p className="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">尚未记录 Tracker 活跃设备，保持页面联网后会自动出现。</p>}
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
                  {!devicesLoading && !devicesError && devices.length > 0 && <p className="mt-3 text-xs text-muted-foreground">当前 {activeDevices.length} 个 Tracker 浏览器在线</p>}
                </div>

                <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">当前 Tracker 设备</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">退出只会结束当前浏览器中的 Tracker 登录，不删除本机学习记录，也不影响 Lexi Words。</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSignOut('local')}
                    disabled={isBusy}
                    aria-busy={busy === 'sign-out-local'}
                    className="min-h-11 w-full shrink-0 sm:w-auto"
                  >
                    {busy === 'sign-out-local' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
                    {busy === 'sign-out-local' ? '正在退出…' : '退出当前 Tracker 设备'}
                  </Button>
                </div>
              </section>

              <section
                aria-labelledby="lexi-account-security-title"
                data-account-scope="lexi-account"
                className="space-y-4 rounded-xl border border-[#31513d]/20 bg-[#f4f8f0] p-4 dark:bg-[#17281f]/15"
              >
                <div className="flex items-start gap-2.5">
                  <LexiAccountMark className="size-9" />
                  <div>
                    <p id="lexi-account-security-title" className="text-sm font-semibold text-foreground">Lexi Account 安全</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">密码和跨产品登录会话会同时影响 Lexi Tracker 与 Lexi Words。</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-[#31513d]/15 bg-background/75 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Lexi Account 账户中心</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">统一查看共享账户信息；只会带上当前 Tracker 页面作为安全回跳位置。</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openAccountCenter}
                    disabled={isBusy || !accountCenterUrl}
                    className="min-h-11 w-full shrink-0 border-[#31513d]/25 sm:w-auto"
                  >
                    <ExternalLink aria-hidden="true" />
                    打开账户中心
                  </Button>
                </div>
                {!accountCenterUrl && (
                  <p role="alert" className="text-xs leading-5 text-warning">
                    账户中心地址不可用，已阻止外部跳转。你仍可在这里管理当前 Tracker 的账户安全功能。
                  </p>
                )}

                <div className="space-y-3 rounded-xl border border-border/80 bg-background/85 p-3.5">
                  <div>
                    <div className="flex items-start gap-2.5">
                      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#31513d]/10 text-[#31513d] dark:text-[#b6dd8c]"><KeyRound className="size-[18px]" /></span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">修改密码</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">通过注册邮箱接收安全修改链接，不会在浏览器保存你的密码。</p>
                      </div>
                    </div>
                    <p className="mt-3 truncate rounded-lg bg-muted/45 px-3 py-2 text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSendPasswordReset()}
                    disabled={isBusy}
                    aria-busy={busy === 'password-reset'}
                    className="min-h-11 w-full"
                  >
                    {busy === 'password-reset' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                    {busy === 'password-reset' ? '正在发送…' : '发送修改密码邮件'}
                  </Button>
                  <p className="text-xs leading-5 text-muted-foreground">密码更新后，Lexi Tracker 与 Lexi Words 的其他登录设备会需要使用新密码重新登录。</p>
                </div>

                <div className="border-t border-[#31513d]/15 pt-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">跨产品登录会话</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">这里控制真实的 Lexi 登录会话；Tracker 活跃设备记录仍在上方单独显示。</p>
                  </div>
                  {sessionSignOutConfirmation ? (
                    <div className="mt-3 space-y-3 rounded-lg border border-warning/30 bg-warning-surface/35 p-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {sessionSignOutConfirmation === 'others' ? '退出其他 Lexi 设备？' : '退出所有 Lexi 设备？'}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {sessionSignOutConfirmation === 'others'
                            ? '当前设备会保持登录；其他浏览器会失去刷新登录的能力。已签发的短期访问令牌可能在到期前短暂有效。'
                            : 'Lexi Tracker 与 Lexi Words 的所有刷新会话都会被撤销，完成后需要重新登录。'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" disabled={isBusy} onClick={() => setSessionSignOutConfirmation(null)} className="min-h-10 flex-1">取消</Button>
                        <Button
                          type="button"
                          variant={sessionSignOutConfirmation === 'global' ? 'destructive' : 'default'}
                          disabled={isBusy}
                          aria-busy={busy === busyActionForSessionScope(sessionSignOutConfirmation)}
                          onClick={() => void handleSignOut(sessionSignOutConfirmation)}
                          className="min-h-10 flex-1"
                        >
                          {busy === busyActionForSessionScope(sessionSignOutConfirmation) && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                          {busy === busyActionForSessionScope(sessionSignOutConfirmation)
                            ? '正在处理…'
                            : sessionSignOutConfirmation === 'others' ? '确认退出其他 Lexi 设备' : '确认退出所有 Lexi 设备'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant="outline" onClick={() => { setError(''); setMessage(''); setSessionSignOutConfirmation('others') }} disabled={isBusy} className="min-h-11 w-full">
                        退出其他 Lexi 设备
                      </Button>
                      <Button type="button" variant="outline" onClick={() => { setError(''); setMessage(''); setSessionSignOutConfirmation('global') }} disabled={isBusy} className="min-h-11 w-full text-destructive hover:text-destructive">
                        退出所有 Lexi 设备
                      </Button>
                    </div>
                  )}
                </div>

                <div className="border-t border-[#31513d]/15 pt-4">
                  <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5">
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
                  </div>
                </div>
              </section>
            </div>
          )}

          {identityAvailable && !user && (
            <div className="space-y-4 rounded-xl border border-border/80 bg-background p-4">
              <div className="flex items-start gap-2.5">
                <LexiAccountMark className="size-9" />
                <div>
                  <p className="text-sm font-semibold text-foreground">登录或创建 Lexi Account</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">一个账号连接 Lexi Tracker 与 Lexi Words；登录后仍由你决定这台 Tracker 设备的数据归属与同步。</p>
                </div>
              </div>
              <Button type="button" onClick={openAuthPage} className="min-h-11 w-full">
                打开登录与注册页面 <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          )}

        </div>

        <DialogFooter className="m-0 flex-col rounded-none px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center sm:px-5 sm:pb-4">
          <div className="min-h-5 min-w-0 flex-1" aria-live="polite">
            {error && <p id="lexi-account-error" role="alert" className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm leading-5 text-success">{message}</p>}
          </div>
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
