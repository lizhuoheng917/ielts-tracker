import { useMemo, useState, type ReactNode } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import {
  CalendarDays,
  CircleHelp,
  Cloud,
  CloudOff,
  LoaderCircle,
  MessageCircleMore,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  UserRound,
} from 'lucide-react'

import { useAuth } from '@/auth/authContext'
import { useAccountDialog } from '@/components/account/accountDialogContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { parseLocalDate } from '@/lib/localDate'
import { useAIPrivacyStore, type AIContextRangeDays } from '@/stores/aiPrivacyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTrackerSyncStatusStore } from '@/sync/trackerSyncStatusStore'
import { FeedbackDialog } from '@/features/support'

const THEME_OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

interface SettingRowProps {
  icon: ReactNode
  title: ReactNode
  description: ReactNode
  control: ReactNode
}

function SettingRow({ icon, title, description, control }: SettingRowProps) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-border/80 bg-background/70 px-3.5 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&>svg]:size-4"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium leading-5 text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export default function Settings() {
  const { status: authStatus, user, managedAiDataBinding } = useAuth()
  const { openAccountDialog } = useAccountDialog()
  const trackerSyncStatus = useTrackerSyncStatusStore()

  const examDate = useSettingsStore((state) => state.examDate)
  const setExamDate = useSettingsStore((state) => state.setExamDate)
  const clearExamDate = useSettingsStore((state) => state.clearExamDate)
  const showExamCountdown = useSettingsStore((state) => state.showExamCountdown)
  const setShowExamCountdown = useSettingsStore((state) => state.setShowExamCountdown)
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)

  const aiDefaultRangeDays = useAIPrivacyStore((state) => state.defaultRangeDays)
  const includeDiaryExcerpts = useAIPrivacyStore((state) => state.includeDiaryExcerpts)
  const includePriorAIArtifacts = useAIPrivacyStore((state) => state.includePriorAIArtifacts)
  const setAiDefaultRangeDays = useAIPrivacyStore((state) => state.setDefaultRangeDays)
  const setIncludeDiaryExcerpts = useAIPrivacyStore((state) => state.setIncludeDiaryExcerpts)
  const setIncludePriorAIArtifacts = useAIPrivacyStore((state) => state.setIncludePriorAIArtifacts)

  const [aiHelpDialogOpen, setAiHelpDialogOpen] = useState(false)
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false)

  const daysUntilExam = useMemo(() => {
    if (!examDate) return null
    const difference = differenceInCalendarDays(parseLocalDate(examDate), new Date())
    return difference >= 0 ? difference : 0
  }, [examDate])

  const accountDescription = user?.email
    ? `${user.email} · 已连接`
    : authStatus === 'signed-out'
      ? '登录后可同步学习记录并使用 Lexi AI'
      : authStatus === 'initializing'
        ? '正在确认账号状态'
        : '当前以本机模式使用'

  const syncPresentation = (() => {
    if (authStatus !== 'signed-in') {
      return { label: '仅本机', detail: '登录后可自动同步', tone: 'muted' as const }
    }
    if (managedAiDataBinding.status !== 'bound') {
      return { label: '待确认', detail: '请确认这台设备的记录归属', tone: 'muted' as const }
    }
    switch (trackerSyncStatus.phase) {
      case 'synced':
        return { label: '已同步', detail: '学习记录已保持一致', tone: 'success' as const }
      case 'syncing':
      case 'checking':
        return { label: '同步中', detail: '正在更新学习记录', tone: 'active' as const }
      case 'needs_choice':
        return { label: '需处理', detail: '考试日期有两个版本', tone: 'warning' as const }
      case 'partial':
      case 'error':
        return { label: '待重试', detail: '会自动继续同步', tone: 'warning' as const }
      case 'offline':
        return { label: '离线', detail: '恢复网络后会自动同步', tone: 'muted' as const }
      case 'paused':
        return { label: '未开放', detail: '当前账号暂不可同步', tone: 'muted' as const }
      default:
        return { label: '检查中', detail: '正在确认同步状态', tone: 'active' as const }
    }
  })()

  const aiStatus = authStatus !== 'signed-in'
    ? '登录后即可使用 AI 分析'
    : managedAiDataBinding.status === 'bound'
      ? 'AI 已准备好'
      : managedAiDataBinding.status === 'unbound'
        ? '请先确认本机记录归属'
        : '请先处理账号状态'

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        eyebrow="Preferences"
        title="设置"
        description="账号、目标、显示和 AI 数据权限。"
        icon={<SettingsIcon />}
        meta={(
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
            Lexi AI 由服务端维护
          </span>
        )}
      />

      <section
        aria-labelledby="lexi-account-settings-title"
        className="rounded-xl border border-primary/15 bg-primary/[0.035] p-3.5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h2 id="lexi-account-settings-title" className="font-semibold leading-5 text-foreground">Lexi 账号</h2>
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{accountDescription}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={(event) => openAccountDialog(event.currentTarget)}
            className="min-h-10 w-full shrink-0 sm:w-auto"
          >
            {user ? '管理账号' : authStatus === 'signed-out' ? '登录账号' : '查看账号状态'}
          </Button>
        </div>

        <div
          role="status"
          aria-live="polite"
          className={cn(
            'mt-3 rounded-lg border px-3 py-2.5',
            syncPresentation.tone === 'success' && 'border-success/25 bg-success-surface/40',
            syncPresentation.tone === 'active' && 'border-primary/20 bg-primary/5',
            syncPresentation.tone === 'warning' && 'border-warning/30 bg-warning-surface/40',
            syncPresentation.tone === 'muted' && 'border-border/80 bg-muted/30',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className={cn(
              'grid size-7 shrink-0 place-items-center rounded-lg',
              syncPresentation.tone === 'success' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
            )}>
              {trackerSyncStatus.phase === 'checking' || trackerSyncStatus.phase === 'syncing'
                ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                : trackerSyncStatus.phase === 'offline' || trackerSyncStatus.phase === 'paused'
                  ? <CloudOff className="size-4" aria-hidden="true" />
                  : <Cloud className="size-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">云同步</p>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">{syncPresentation.label}</span>
              </div>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{syncPresentation.detail}</p>
            </div>
          </div>

          {trackerSyncStatus.phase === 'needs_choice' && trackerSyncStatus.conflict && trackerSyncStatus.resolveConflict && (
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/70 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void trackerSyncStatus.resolveConflict?.('remote')}>
                使用云端日期
              </Button>
              <Button type="button" size="sm" onClick={() => void trackerSyncStatus.resolveConflict?.('local')}>
                保留本机日期
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 md:gap-5">
        <Card>
          <CardHeader className="border-b border-border/80">
            <SectionHeader
              eyebrow="Exam"
              title="考试目标"
              description="设置考试日期和主页倒计时。"
              action={(
                <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Target className="size-4.5" />
                </span>
              )}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exam-date">考试日期</Label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,13rem)_1fr] sm:items-center">
                <Input
                  id="exam-date"
                  type="date"
                  value={examDate || ''}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value) setExamDate(value)
                    else clearExamDate()
                  }}
                  className="h-10"
                />
                <div
                  role="status"
                  className={cn(
                    'flex min-h-10 items-center rounded-lg px-3 text-sm',
                    daysUntilExam === null ? 'bg-muted/50 text-muted-foreground' : 'bg-primary/10 font-semibold text-primary',
                  )}
                >
                  {daysUntilExam === null ? '设定后显示倒计时' : `距离考试 ${daysUntilExam} 天`}
                </div>
              </div>
            </div>

            <SettingRow
              icon={<CalendarDays />}
              title="主页倒计时"
              description={examDate ? '在主页显示考试日期' : '设定考试日期后可开启'}
              control={(
                <Switch
                  checked={showExamCountdown}
                  onCheckedChange={setShowExamCountdown}
                  disabled={!examDate}
                  aria-label="在主页显示考试倒计时"
                />
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/80">
            <SectionHeader
              eyebrow="Appearance"
              title="显示方式"
              description="选择舒适的阅读主题。"
              action={(
                <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-warning-surface text-warning">
                  <Palette className="size-4.5" />
                </span>
              )}
            />
          </CardHeader>
          <CardContent>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">主题</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="显示主题">
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <label key={option.value} className="min-w-0 cursor-pointer">
                      <input
                        type="radio"
                        name="settings-theme"
                        value={option.value}
                        checked={theme === option.value}
                        onChange={() => setTheme(option.value)}
                        className="peer sr-only"
                      />
                      <span className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background px-2 py-2.5 text-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground peer-checked:border-primary/40 peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40">
                        <Icon className="size-4.5" aria-hidden="true" />
                        <span className="text-xs font-semibold leading-4 sm:text-sm">{option.label}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/80">
          <SectionHeader
            eyebrow="AI"
            title="AI 数据权限"
            description="模型由 Lexi 服务维护，你只决定可选数据是否参与分析。"
            action={(
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setAiHelpDialogOpen(true)}
                aria-label="了解 AI 数据权限"
                title="了解 AI 数据权限"
                className="text-muted-foreground"
              >
                <CircleHelp aria-hidden="true" />
              </Button>
            )}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium leading-5 text-foreground">Lexi AI</p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{aiStatus}</p>
              </div>
            </div>
            {authStatus !== 'signed-in' || managedAiDataBinding.status !== 'bound' ? (
              <Button
                type="button"
                variant="outline"
                onClick={(event) => openAccountDialog(event.currentTarget)}
                className="min-h-10 w-full shrink-0 sm:w-auto"
              >
                {authStatus === 'signed-out' ? '登录账号' : '处理账号状态'}
              </Button>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">默认分析范围</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="AI 默认分析范围">
              {([7, 30, 90] as AIContextRangeDays[]).map((days) => (
                <label key={days} className="cursor-pointer">
                  <input
                    type="radio"
                    name="ai-context-range"
                    value={days}
                    checked={aiDefaultRangeDays === days}
                    onChange={() => setAiDefaultRangeDays(days)}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 peer-checked:border-primary/40 peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40">
                    近 {days} 天
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <SettingRow
              icon={<CalendarDays />}
              title="日记摘要"
              description="允许 AI 参考最多 5 条近期摘要"
              control={(
                <Switch
                  checked={includeDiaryExcerpts}
                  onCheckedChange={setIncludeDiaryExcerpts}
                  aria-label="允许 AI 读取日记摘要"
                />
              )}
            />
            <SettingRow
              icon={<Sparkles />}
              title="历史 AI 结果"
              description="允许把近期报告作为辅助参考"
              control={(
                <Switch
                  checked={includePriorAIArtifacts}
                  onCheckedChange={setIncludePriorAIArtifacts}
                  aria-label="允许 AI 参考历史 AI 结果"
                />
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <MessageCircleMore className="size-4.5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold leading-5 text-foreground">帮助与反馈</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">提交 Tracker 使用问题，并持续查看管理员回复。</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFeedbackDialogOpen(true)}
              className="min-h-10 w-full shrink-0 sm:w-auto"
            >
              <MessageCircleMore aria-hidden="true" />
              问题反馈
            </Button>
          </section>
        </CardContent>
      </Card>

      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        page="/settings"
        theme={theme}
        onRequestLogin={() => {
          setFeedbackDialogOpen(false)
          window.requestAnimationFrame(() => openAccountDialog())
        }}
      />

      <Dialog open={aiHelpDialogOpen} onOpenChange={setAiHelpDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <CircleHelp className="size-5 shrink-0 text-primary" aria-hidden="true" />
              AI 如何使用数据？
            </DialogTitle>
            <DialogDescription>每次分析才生成当前所需的学习快照。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>默认只发送学习次数、时长、完成度和分数等结构化信息，不发送自由备注。</p>
            <p>日记摘要和历史报告仅在你开启对应开关后参与分析。</p>
            <p>模型、服务商和密钥均由 Lexi 服务端与管理员维护，不保存在浏览器。</p>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setAiHelpDialogOpen(false)} className="min-h-10 w-full sm:w-auto">
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingsIcon() {
  return <ShieldCheck />
}
