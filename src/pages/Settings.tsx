import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { parseLocalDate, toLocalDate } from '@/lib/localDate'
import { importBackupJson, serializeBackupV3 } from '@/data/backupService'
import { browserBackupAdapter } from '@/data/browserBackupAdapter'
import {
  advanceCanonicalMutationEpoch,
  announceCanonicalMutation,
  withCanonicalMutationLock,
} from '@/data/canonicalMutationCoordinator'
import { readPendingLocalMutation } from '@/data/localMutationJournal'
import {
  diagnoseCurrentActivityConsistency,
  type ActivityConsistencyCheckinCompatibilitySource,
  type ActivityConsistencyCheckinDifferenceKind,
  type ActivityConsistencyHeatmapDifferenceKind,
  type ActivityConsistencyReport,
  type ActivityConsistencyScalarField,
} from '@/data/activityConsistency'
import { useSettingsStore } from '@/stores/settingsStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { usePlanStore } from '@/stores/planStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MetricGroup } from '@/components/ui/metric-group'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  CalendarDays,
  Activity,
  BookOpen,
  Database,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  CircleHelp,
  Moon,
  Sun,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  Link as LinkIcon,
  CheckCircle2,
  XCircle,
  Monitor,
  ListTodo,
  NotebookPen,
  History,
  Library,
  Palette,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Target,
  UserRound,
  Wifi,
  Cloud,
  CloudOff,
  LoaderCircle,
} from 'lucide-react'
import { useAIStore } from '@/stores/aiStore'
import { useAIPrivacyStore, type AIContextRangeDays } from '@/stores/aiPrivacyStore'
import { testAIConnection } from '@/lib/aiService'
import { useAuth } from '@/auth/authContext'
import { useAccountDialog } from '@/components/account/accountDialogContext'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'
import { listAiArtifactsForAccess } from '@/ai/artifactRepository'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import {
  CUSTOM_AI_PROVIDER_PRESET_OPTIONS,
  getCustomAiProviderPreset,
  type CustomAiProviderPresetId,
} from '@/ai/customProviderPresets'
import { useTrackerSyncStatusStore } from '@/sync/trackerSyncStatusStore'

const THEME_OPTIONS = [
  { value: 'light', label: '浅色', description: '白天阅读更清爽', icon: Sun },
  { value: 'dark', label: '深色', description: '夜间使用更柔和', icon: Moon },
  { value: 'system', label: '跟随系统', description: '自动同步设备', icon: Monitor },
] as const

const CONSISTENCY_FIELD_LABELS: Record<ActivityConsistencyScalarField, string> = {
  'achievements.totalXP': '总经验值',
  'achievements.level': '当前等级',
  'streak.currentStreak': '当前连续天数',
  'streak.longestStreak': '最长连续天数',
  'streak.lastActiveDate': '最后活跃日期',
  'settings.lastCheckinDate': '最后打卡日期',
}

const HEATMAP_DIFFERENCE_LABELS: Record<ActivityConsistencyHeatmapDifferenceKind, string> = {
  'missing-in-ledger': '账本缺少活动',
  'extra-in-ledger': '账本多出活动',
  'count-mismatch': '活动次数不同',
}

const CHECKIN_COMPATIBILITY_SOURCE_LABELS: Record<ActivityConsistencyCheckinCompatibilitySource, string> = {
  'completed-execution': '已完成计划',
  'last-checkin': '最后打卡记录',
}

const CHECKIN_DIFFERENCE_LABELS: Record<ActivityConsistencyCheckinDifferenceKind, string> = {
  'missing-in-ledger': '正式打卡奖励有记录，账本回放缺少',
  'extra-in-ledger': '账本回放有记录，正式打卡奖励缺少',
}

function formatConsistencyValue(value: number | string | null): string {
  if (value === null || value === '') return '未记录'
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : value
}

function formatDiagnosticDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function ledgerSourceLabel(source: string): string {
  switch (source) {
    case 'import':
      return '备份导入基线'
    case 'rebase':
      return '自动压缩基线'
    case 'migration':
      return '升级初始化基线'
    case 'recovery':
      return '事务恢复基线'
    default:
      return '本地活动基线'
  }
}

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
  const trackerSyncStatus = useTrackerSyncStatusStore()
  const { openAccountDialog } = useAccountDialog()
  const navigate = useNavigate()
  const artifactAccess = useAiArtifactAccess()
  const artifactRecords = useAiArtifactStore((state) => state.artifacts)
  const aiArtifactIntegrity = useAiArtifactStore((state) => state.integrity)
  const aiArtifactCount = useMemo(
    () => listAiArtifactsForAccess(artifactRecords, artifactAccess).length,
    [artifactAccess, artifactRecords],
  )

  // --- 核心状态（实时同步到 store） ---
  const examDate = useSettingsStore((s) => s.examDate)
  const setExamDate = useSettingsStore((s) => s.setExamDate)
  const clearExamDate = useSettingsStore((s) => s.clearExamDate)
  const showExamCountdown = useSettingsStore((s) => s.showExamCountdown)
  const setShowExamCountdown = useSettingsStore((s) => s.setShowExamCountdown)
  const showAiSuggestions = useSettingsStore((s) => s.showAiSuggestions)
  const setShowAiSuggestions = useSettingsStore((s) => s.setShowAiSuggestions)

  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [consistencyDialogOpen, setConsistencyDialogOpen] = useState(false)
  const [aiHelpDialogOpen, setAiHelpDialogOpen] = useState(false)
  const [aiConnectionDialogOpen, setAiConnectionDialogOpen] = useState(false)
  const [consistencyReport, setConsistencyReport] = useState<ActivityConsistencyReport | null>(null)
  const [dataOperation, setDataOperation] = useState<'idle' | 'importing' | 'clearing'>('idle')
  const dataOperationRef = useRef<'idle' | 'importing' | 'clearing'>('idle')

  // --- AI 配置（实时同步到 store） ---
  const aiApiKey = useAIStore((s) => s.apiKey)
  const aiBaseURL = useAIStore((s) => s.baseURL)
  const aiModel = useAIStore((s) => s.model)
  const aiRouteMode = useAIStore((s) => s.routeMode)
  const aiProviderPreset = useAIStore((s) => s.providerPreset)
  const setAiProviderPreset = useAIStore((s) => s.setProviderPreset)
  const setAiApiKey = useAIStore((s) => s.setApiKey)
  const setAiBaseURL = useAIStore((s) => s.setBaseURL)
  const setAiModel = useAIStore((s) => s.setModel)
  const setAiRouteMode = useAIStore((s) => s.setRouteMode)
  const clearAiConfig = useAIStore((s) => s.clearConfig)
  const aiDefaultRangeDays = useAIPrivacyStore((s) => s.defaultRangeDays)
  const includeDiaryExcerpts = useAIPrivacyStore((s) => s.includeDiaryExcerpts)
  const includePriorAIArtifacts = useAIPrivacyStore((s) => s.includePriorAIArtifacts)
  const setAiDefaultRangeDays = useAIPrivacyStore((s) => s.setDefaultRangeDays)
  const setIncludeDiaryExcerpts = useAIPrivacyStore((s) => s.setIncludeDiaryExcerpts)
  const setIncludePriorAIArtifacts = useAIPrivacyStore((s) => s.setIncludePriorAIArtifacts)

  const [showAiKey, setShowAiKey] = useState(false)
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [aiTestMessage, setAiTestMessage] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const importReaderRef = useRef<FileReader | null>(null)

  useEffect(() => () => {
    const reader = importReaderRef.current
    importReaderRef.current = null
    dataOperationRef.current = 'idle'
    if (reader?.readyState === FileReader.LOADING) reader.abort()
  }, [])

  const finishDataOperation = (operation: 'importing' | 'clearing') => {
    if (dataOperationRef.current !== operation) return
    dataOperationRef.current = 'idle'
    setDataOperation('idle')
  }

  const ensureStableData = (action: string) => {
    if (dataOperationRef.current !== 'idle') {
      alert(`正在处理本地数据，暂时无法${action}。`)
      return false
    }
    try {
      if (readPendingLocalMutation()) {
        alert('检测到尚待收口的数据事务，页面将先重新加载并完成恢复。')
        window.location.reload()
        return false
      }
    } catch {
      alert('无法安全读取事务状态，页面将重新加载并进入恢复检查。')
      window.location.reload()
      return false
    }
    return true
  }

  const beginDataOperation = (operation: 'importing' | 'clearing', action: string) => {
    if (!ensureStableData(action)) return false
    dataOperationRef.current = operation
    setDataOperation(operation)
    return true
  }

  const handleTestAI = async () => {
    setAiTestStatus('testing')
    setAiTestMessage('')
    const result = await testAIConnection()
    setAiTestStatus(result.ok ? 'success' : 'error')
    setAiTestMessage(result.ok ? '连接成功' : result.message)
  }

  const resetAiTestResult = () => {
    setAiTestStatus('idle')
    setAiTestMessage('')
  }

  const handleAiConnectionOpenChange = (open: boolean) => {
    setAiConnectionDialogOpen(open)
    if (!open) setShowAiKey(false)
  }

  const selectedCustomAiProvider = getCustomAiProviderPreset(aiProviderPreset)
  const hasCustomAiConnection = aiApiKey.trim().length > 0
    && aiBaseURL.trim().length > 0
    && aiModel.trim().length > 0
  const handleCustomAiProviderChange = (providerPreset: CustomAiProviderPresetId) => {
    if (providerPreset === aiProviderPreset) return
    setAiProviderPreset(providerPreset)
    setShowAiKey(false)
    resetAiTestResult()
  }
  const aiRouteDescription = aiRouteMode === 'custom'
    ? hasCustomAiConnection
      ? '当前使用自定义 AI，连接只保存在这台设备'
      : '已选择自定义 AI，但还没有配置连接'
    : authStatus === 'signed-in'
      ? managedAiDataBinding.status === 'bound'
        ? '已选择 Lexi 内置 AI，本机记录归属已确认'
        : managedAiDataBinding.status === 'unbound'
          ? '使用内置 AI 前，需要确认本机记录属于当前账号'
          : managedAiDataBinding.status === 'mismatch'
            ? '本机记录属于另一个账号，内置 AI 已停止发送'
            : '暂时无法确认本机记录归属，内置 AI 已停止发送'
      : authStatus === 'signed-out'
        ? '登录 Lexi 账号后即可使用内置 AI'
        : authStatus === 'initializing'
          ? '正在确认 Lexi 账号状态'
          : '当前环境尚未连接 Lexi 内置 AI'
  const accountDescription = user?.email
    ? `${user.email} · 计划、执行、练习、模考与考试日期可在后台同步`
    : authStatus === 'signed-out'
      ? '登录并确认数据归属后，可使用核心学习数据云同步'
      : authStatus === 'initializing'
        ? '正在读取当前设备的账号状态'
      : '本地模式 · 学习功能可完整使用'

  const trackerSyncPresentation = (() => {
    if (authStatus !== 'signed-in') {
      return { label: '仅本机', detail: '登录后可使用核心学习数据云同步', tone: 'muted' as const }
    }
    if (managedAiDataBinding.status !== 'bound') {
      return { label: '待确认', detail: '先确认这台设备上的记录归属', tone: 'muted' as const }
    }
    switch (trackerSyncStatus.phase) {
      case 'synced':
        return { label: '已同步', detail: trackerSyncStatus.detail || '核心学习数据已与云端保持一致', tone: 'success' as const }
      case 'syncing':
      case 'checking':
        return { label: '同步中', detail: trackerSyncStatus.detail || '正在检查云端学习数据', tone: 'active' as const }
      case 'needs_choice':
        return { label: '需选择', detail: trackerSyncStatus.detail, tone: 'warning' as const }
      case 'partial':
        return { label: '部分同步', detail: trackerSyncStatus.detail, tone: 'warning' as const }
      case 'offline':
        return { label: '离线', detail: trackerSyncStatus.detail, tone: 'muted' as const }
      case 'error':
        return { label: '待重试', detail: trackerSyncStatus.detail, tone: 'warning' as const }
      case 'paused':
        return { label: '未开放', detail: trackerSyncStatus.detail, tone: 'muted' as const }
      default:
        return { label: '检查中', detail: '正在确认学习数据同步状态', tone: 'active' as const }
    }
  })()

  const handleConsistencyCheck = () => {
    if (!ensureStableData('运行一致性检查')) return
    const report = diagnoseCurrentActivityConsistency()
    setConsistencyReport(report)
    if (report.status !== 'drift') setConsistencyDialogOpen(false)
  }

  // --- 考试倒计时 ---
  const daysUntilExam = useMemo(() => {
    if (!examDate) return null
    const exam = parseLocalDate(examDate)
    const now = new Date()
    const diff = differenceInCalendarDays(exam, now)
    return diff >= 0 ? diff : 0
  }, [examDate])

  // --- 统计 ---
  const totalWords = useMemo(
    () => useWordStore.getState().records.reduce((sum, r) => sum + r.count, 0),
    []
  )
  const totalPractice = useMemo(
    () => usePracticeStore.getState().records.length + useTimerStore.getState().records.length,
    []
  )
  const totalPlans = useMemo(
    () => usePlanStore.getState().plans.length,
    []
  )
  const totalDiary = useMemo(
    () => useDiaryStore.getState().entries.length,
    []
  )

  // --- 事件处理 ---

  const handleExport = () => {
    if (!ensureStableData('导出备份')) return
    const blob = new Blob([serializeBackupV3(browserBackupAdapter)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ielts-tracker-backup-${toLocalDate()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // CSV 导出
  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const handleExportCSV = () => {
    if (!ensureStableData('导出 CSV')) return
    const dateStr = toLocalDate()

    // 单词记录
    const wordsHeader = '日期,分类,子分类,数量,备注'
    const wordsRows = useWordStore.getState().records.map((r) =>
      [r.date, r.category, r.subCategory ?? '', r.count, r.note ?? ''].map(escapeCsv).join(',')
    )
    const wordsCsv = [wordsHeader, ...wordsRows].join('\n')

    // 模考记录
    const practiceHeader = '日期,科目,时长(分钟),分数,备注'
    const practiceRows = usePracticeStore.getState().records.map((r) =>
      [r.date, r.type, r.duration, r.score ?? '', r.note ?? ''].map(escapeCsv).join(',')
    )
    const practiceCsv = [practiceHeader, ...practiceRows].join('\n')

    // 练习记录
    const timerHeader = '日期,科目,时长(分钟),内容'
    const timerRows = useTimerStore.getState().records.map((r) =>
      [r.date, r.subject, Math.floor(r.duration / 60), r.note ?? ''].map(escapeCsv).join(',')
    )
    const timerCsv = [timerHeader, ...timerRows].join('\n')

    // 合并为一个文件，用空行分隔
    const fullCsv = [
      '=== 单词记录 ===',
      wordsCsv,
      '',
      '=== 模考记录 ===',
      practiceCsv,
      '',
      '=== 练习记录 ===',
      timerCsv,
    ].join('\n')

    const blob = new Blob(['\uFEFF' + fullCsv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ielts-tracker-data-${dateStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!beginDataOperation('importing', '导入备份')) {
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    importReaderRef.current = reader
    reader.onload = async () => {
      if (importReaderRef.current !== reader || dataOperationRef.current !== 'importing') return
      importReaderRef.current = null
      try {
        const result = await withCanonicalMutationLock(() => {
          advanceCanonicalMutationEpoch()
          return importBackupJson(
            String(reader.result ?? ''),
            browserBackupAdapter,
          )
        })
        announceCanonicalMutation('all', Date.now())
        alert(
          result.sourceVersion === 1
            ? '旧版备份导入成功。备份中的 AI 密钥、地址和模型已忽略；使用内置 AI 前需要重新确认这些记录所属的 Lexi 账号。'
            : '数据导入成功。当前设备的 AI 连接配置保持不变；使用内置 AI 前需要重新确认这些记录所属的 Lexi 账号。'
        )
        window.location.reload()
      } catch (err) {
        const detail = err instanceof Error ? err.message : '未知错误'
        alert(`导入失败：${detail}`)
        finishDataOperation('importing')
      }
    }
    reader.onerror = () => {
      if (importReaderRef.current !== reader) return
      importReaderRef.current = null
      alert('导入失败：无法读取文件')
      finishDataOperation('importing')
    }
    reader.onabort = () => {
      if (importReaderRef.current !== reader) return
      importReaderRef.current = null
      finishDataOperation('importing')
    }
    try {
      reader.readAsText(file)
    } catch (err) {
      importReaderRef.current = null
      const detail = err instanceof Error ? err.message : '无法读取文件'
      alert(`导入失败：${detail}`)
      finishDataOperation('importing')
    }
    e.target.value = ''
  }

  const handleClearAll = async () => {
    if (!beginDataOperation('clearing', '清空数据')) return
    try {
      // The next load rehydrates empty stores. Avoid writing a sequence of
      // empty snapshots before the prefix cleanup itself.
      await withCanonicalMutationLock(() => {
        advanceCanonicalMutationEpoch()
        useSettingsStore.getState().clearAllData()
      })
      announceCanonicalMutation('all', Date.now())
      setClearDialogOpen(false)
      alert('当前设备的数据已清空；已同步到账号的云端记录不会在这里被删除。')
      window.location.reload()
    } catch (err) {
      const detail = err instanceof Error ? err.message : '未知错误'
      alert(`清空未完整完成：${detail}。页面将重新加载当前可用数据。`)
      window.location.reload()
    }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        eyebrow="Workspace preferences"
        title="设置"
        description="管理考试目标、界面偏好、AI 接入与本地学习数据。"
        icon={<Settings2 />}
        meta={(
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
            核心学习数据可云同步
          </span>
        )}
      />

      <section
        aria-labelledby="lexi-account-settings-title"
        className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-3.5 sm:flex-row sm:items-center sm:justify-between"
      >
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
      </section>

      <div className="grid gap-4 lg:grid-cols-2 md:gap-5">
        <Card>
          <CardHeader className="border-b border-border/80">
            <SectionHeader
              eyebrow="Exam goal"
              title="考试目标"
              description="设定考试日期，保持备考节奏可见。"
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
                    daysUntilExam === null
                      ? 'bg-muted/50 text-muted-foreground'
                      : 'bg-primary/10 font-semibold text-primary'
                  )}
                >
                  {daysUntilExam === null ? '选择日期后显示备考倒计时' : `距离考试还有 ${daysUntilExam} 天`}
                </div>
              </div>
            </div>

            <div
              role="status"
              aria-live="polite"
              className={cn(
                'rounded-lg border px-3 py-2.5',
                trackerSyncPresentation.tone === 'success' && 'border-success/25 bg-success-surface/40',
                trackerSyncPresentation.tone === 'active' && 'border-primary/20 bg-primary/5',
                trackerSyncPresentation.tone === 'warning' && 'border-warning/30 bg-warning-surface/40',
                trackerSyncPresentation.tone === 'muted' && 'border-border/80 bg-muted/30',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-lg',
                  trackerSyncPresentation.tone === 'success' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                )}>
                  {trackerSyncStatus.phase === 'checking' || trackerSyncStatus.phase === 'syncing'
                    ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    : trackerSyncStatus.phase === 'offline' || trackerSyncStatus.phase === 'paused'
                      ? <CloudOff className="size-4" aria-hidden="true" />
                      : <Cloud className="size-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">学习数据云同步</p>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{trackerSyncPresentation.label}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{trackerSyncPresentation.detail}</p>
                </div>
              </div>

              {trackerSyncStatus.phase === 'needs_choice' && trackerSyncStatus.conflict && trackerSyncStatus.resolveConflict && (
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/70 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void trackerSyncStatus.resolveConflict?.('remote')}>
                    用云端 {trackerSyncStatus.conflict.remoteExamDate ?? '未设置'}
                  </Button>
                  <Button type="button" size="sm" onClick={() => void trackerSyncStatus.resolveConflict?.('local')}>
                    保留本机 {trackerSyncStatus.conflict.localExamDate ?? '未设置'}
                  </Button>
                </div>
              )}
            </div>

            <SettingRow
              icon={<CalendarDays />}
              title="主页倒计时"
              description={examDate ? '在主页持续显示距离考试的天数' : '设定考试日期后可以开启'}
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
              title="界面与主页"
              description="选择舒适的显示方式和主页内容。"
              action={(
                <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-warning-surface text-warning">
                  <Palette className="size-4.5" />
                </span>
              )}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">显示主题</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="显示主题">
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <label
                      key={option.value}
                      className="min-w-0 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="settings-theme"
                        value={option.value}
                        checked={theme === option.value}
                        onChange={() => setTheme(option.value)}
                        className="peer sr-only"
                      />
                      <span className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background px-2 py-2.5 text-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground peer-checked:border-primary/40 peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40">
                        <Icon className="size-4.5" aria-hidden="true" />
                        <span className="text-xs font-semibold leading-4 sm:text-sm">{option.label}</span>
                        <span className="hidden text-[11px] leading-4 text-muted-foreground sm:block">{option.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <SettingRow
              icon={<Sparkles />}
              title="主页 AI 建议"
              description="在主页显示基于学习记录的建议卡片"
              control={(
                <Switch
                  checked={showAiSuggestions}
                  onCheckedChange={setShowAiSuggestions}
                  aria-label="在主页显示 AI 建议"
                />
              )}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/80">
          <SectionHeader
            eyebrow="AI privacy"
            title="AI 助手与数据权限"
            description="选择分析范围，以及是否允许读取可选内容。"
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
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">AI 默认分析范围</legend>
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

            <SettingRow
              icon={<NotebookPen />}
              title="允许读取日记摘要"
              description="默认关闭；开启后最多读取 5 条近期摘要"
              control={(
                <Switch
                  checked={includeDiaryExcerpts}
                  onCheckedChange={setIncludeDiaryExcerpts}
                  aria-label="允许 AI 读取日记摘要"
                />
              )}
            />

            <SettingRow
              icon={<History />}
              title="允许参考历史 AI 结果"
              description="默认关闭；开启后只作为辅助参考"
              control={(
                <Switch
                  checked={includePriorAIArtifacts}
                  onCheckedChange={setIncludePriorAIArtifacts}
                  aria-label="允许 AI 参考历史 AI 结果"
                />
              )}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">AI 调取方式</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="选择 AI 调取方式">
              <Button
                type="button"
                variant={aiRouteMode === 'managed' ? 'default' : 'outline'}
                onClick={() => setAiRouteMode('managed')}
                aria-pressed={aiRouteMode === 'managed'}
                className="min-h-10 w-full"
              >
                <Sparkles aria-hidden="true" />
                Lexi 内置 AI
              </Button>
              <Button
                type="button"
                variant={aiRouteMode === 'custom' ? 'default' : 'outline'}
                onClick={() => {
                  if (hasCustomAiConnection) setAiRouteMode('custom')
                  else setAiConnectionDialogOpen(true)
                }}
                aria-pressed={aiRouteMode === 'custom'}
                className="min-h-10 w-full"
              >
                <KeyRound aria-hidden="true" />
                自定义 AI
              </Button>
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/25 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium leading-5 text-foreground">
                  {aiRouteMode === 'managed' ? 'Lexi 内置 AI' : '自定义 AI'}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {aiRouteDescription}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Lexi 账号：{user?.email ?? (authStatus === 'signed-out' ? '未登录' : authStatus === 'initializing' ? '正在检查' : '当前环境不可用')}
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {aiRouteMode === 'managed' && authStatus === 'signed-out' && (
                <Button
                  type="button"
                  onClick={(event) => openAccountDialog(event.currentTarget)}
                  className="min-h-10 w-full sm:w-auto"
                >
                  <UserRound aria-hidden="true" />
                  登录使用
                </Button>
              )}
              {aiRouteMode === 'managed' && authStatus === 'signed-in' && managedAiDataBinding.status !== 'bound' && (
                <Button
                  type="button"
                  onClick={(event) => openAccountDialog(event.currentTarget)}
                  className="min-h-10 w-full sm:w-auto"
                >
                  <ShieldCheck aria-hidden="true" />
                  {managedAiDataBinding.status === 'unbound' ? '确认记录归属' : '查看安全状态'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setAiConnectionDialogOpen(true)}
                className="min-h-10 w-full sm:w-auto"
              >
                <Settings2 aria-hidden="true" />
                AI 高级设置
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/80">
          <SectionHeader
            eyebrow="Local data"
            title="备份与数据管理"
            description="导出完整备份、迁移到其他浏览器，或清理当前设备的数据。"
            action={(
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-success-surface text-success">
                <Database className="size-4.5" />
              </span>
            )}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <MetricGroup
            ariaLabel="本地学习数据概览"
            className="shadow-none"
            items={[
              { label: '单词总数', value: totalWords.toLocaleString('zh-CN'), description: '已记录', icon: <BookOpen />, tone: 'primary' },
              { label: '练习记录', value: totalPractice, description: '模考与计时', icon: <Activity />, tone: 'success' },
              { label: '学习计划', value: totalPlans, description: '全部计划', icon: <ListTodo />, tone: 'warning' },
              { label: '学习日记', value: totalDiary, description: '心得记录', icon: <NotebookPen />, tone: 'listening' },
            ]}
          />

          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Library className="size-4" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground">
                  AI 内容库 · {aiArtifactIntegrity.status === 'corrupt'
                    ? '需恢复'
                    : artifactAccess.status === 'locked' ? '已锁定' : `${aiArtifactCount} 条`}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">完整 JSON 备份会包含已保存的建议和分析；账号、密钥与授权不会进入备份。</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/stats#ai-content-library')}
              className="min-h-10 w-full shrink-0 sm:w-auto"
            >
              <Library aria-hidden="true" />
              管理 AI 内容
            </Button>
          </div>

          <section
            aria-labelledby="activity-consistency-title"
            className={cn(
              'rounded-xl border p-4',
              consistencyReport?.status === 'consistent' && 'border-success/30 bg-success-surface/45',
              consistencyReport?.status === 'drift' && 'border-warning/35 bg-warning-surface/45',
              consistencyReport?.status === 'unavailable' && 'border-border bg-muted/30',
              !consistencyReport && 'border-border/80 bg-background/70',
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-xl',
                    consistencyReport?.status === 'consistent' && 'bg-success/10 text-success',
                    consistencyReport?.status === 'drift' && 'bg-warning/15 text-warning',
                    consistencyReport?.status === 'unavailable' && 'bg-muted text-muted-foreground',
                    !consistencyReport && 'bg-primary/10 text-primary',
                  )}
                >
                  {consistencyReport?.status === 'consistent' ? (
                    <CheckCircle2 className="size-5" />
                  ) : consistencyReport?.status === 'drift' ? (
                    <AlertTriangle className="size-5" />
                  ) : consistencyReport?.status === 'unavailable' ? (
                    <XCircle className="size-5" />
                  ) : (
                    <ShieldCheck className="size-5" />
                  )}
                </span>

                <div className="min-w-0">
                  <h3 id="activity-consistency-title" className="font-semibold text-foreground">
                    学习派生状态检查
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    只读核对 XP、等级、连续学习、热力图与打卡状态，不会修改任何记录。
                  </p>

                  <div className="mt-2 text-sm leading-5" role="status" aria-live="polite">
                    {!consistencyReport && (
                      <p className="text-muted-foreground">尚未运行检查。</p>
                    )}
                    {consistencyReport?.status === 'consistent' && (
                      <p className="font-medium text-success">未发现派生状态差异。</p>
                    )}
                    {consistencyReport?.status === 'drift' && (
                      <p className="font-medium text-warning">
                        发现 {consistencyReport.summary.totalDifferenceCount} 项差异，仅报告、不自动修复。
                      </p>
                    )}
                    {consistencyReport?.status === 'unavailable' && (
                      <p className="font-medium text-muted-foreground">
                        暂时无法检查影子账本，正式学习数据仍可正常使用。
                      </p>
                    )}
                  </div>

                  {consistencyReport?.ledger && (
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {ledgerSourceLabel(consistencyReport.ledger.source)} · {formatDiagnosticDateTime(consistencyReport.ledger.capturedAt)} · {consistencyReport.ledger.eventCount} 条基线后事件
                    </p>
                  )}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleConsistencyCheck}
                disabled={dataOperation !== 'idle'}
                className="min-h-11 w-full shrink-0 sm:w-auto"
              >
                <ShieldCheck aria-hidden="true" />
                {consistencyReport ? '重新检查' : '运行只读检查'}
              </Button>
            </div>

            {consistencyReport?.status === 'drift' && (
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-warning/25 bg-background/65 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted-foreground">
                  当前数据仍是正式数据源。查看差异前可先导出 JSON 备份。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConsistencyDialogOpen(true)}
                  className="min-h-11 w-full shrink-0 sm:w-auto"
                >
                  <Activity aria-hidden="true" />
                  查看差异
                </Button>
              </div>
            )}

            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              检查范围从当前账本基线开始，不包含记录正文、徽章和统计页访问次数。
            </p>
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Download className="size-4" />
                </span>
                <div>
                  <h3 className="font-semibold text-foreground">导出当前数据</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">JSON 用于完整备份，CSV 适合在 Excel 中查看。</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="outline" disabled={dataOperation !== 'idle'} className="min-h-10 w-full" />}>
                  <Download aria-hidden="true" />
                  选择导出格式
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleExport}>导出 JSON（完整备份）</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCSV}>导出 CSV（Excel 可打开）</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Upload className="size-4" />
                </span>
                <div>
                  <h3 className="font-semibold text-foreground">导入完整备份</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">仅接受本应用导出的 JSON 备份，导入后页面将刷新。</p>
                </div>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImport}
                disabled={dataOperation !== 'idle'}
                className="sr-only"
                aria-label="选择 JSON 备份文件"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => importInputRef.current?.click()}
                disabled={dataOperation !== 'idle'}
                className="min-h-10 w-full"
              >
                <Upload aria-hidden="true" />
                {dataOperation === 'importing' ? '正在读取备份…' : '选择 JSON 备份'}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle className="size-4" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground">清空当前设备数据</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">删除这台设备上的记录、计划、日记和成就；已同步到账号的云端记录会保留，建议先导出 JSON 备份。</p>
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setClearDialogOpen(true)}
              disabled={dataOperation !== 'idle'}
              className="min-h-10 w-full shrink-0 sm:w-auto"
            >
              <Trash2 aria-hidden="true" />
              清空本机数据
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={aiHelpDialogOpen} onOpenChange={setAiHelpDialogOpen}>
        <DialogContent className="max-h-[88dvh] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <CircleHelp className="size-5 shrink-0 text-primary" aria-hidden="true" />
              AI 会读取哪些数据？
            </DialogTitle>
            <DialogDescription>
              每次发起请求时才生成一份用途明确的数据快照。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1 text-sm leading-6">
            <section className="rounded-xl border border-border/80 bg-background p-3.5">
              <h3 className="font-semibold text-foreground">默认包含</h3>
              <p className="mt-1 text-muted-foreground">学习次数、时长、分数、连续学习和计划完成度等结构化数据。</p>
            </section>
            <section className="rounded-xl border border-border/80 bg-background p-3.5">
              <h3 className="font-semibold text-foreground">默认不包含</h3>
              <p className="mt-1 text-muted-foreground">单词、练习与计时记录中的自由文本备注不会发送。</p>
            </section>
            <section className="rounded-xl border border-border/80 bg-background p-3.5">
              <h3 className="font-semibold text-foreground">需要单独允许</h3>
              <p className="mt-1 text-muted-foreground">日记摘要每次最多 5 条；历史 AI 结果只作为辅助参考，不会冒充原始学习记录。</p>
            </section>
            <section className="rounded-xl border border-primary/15 bg-primary/5 p-3.5">
              <h3 className="font-semibold text-foreground">发送到哪里</h3>
              <p className="mt-1 text-muted-foreground">使用 Lexi 内置 AI 时，浏览器只发送用途明确的学习快照，模型密钥保留在服务端；选择自定义 AI 时，请求会直接发送到你配置的服务商。</p>
            </section>
            <section className="rounded-xl border border-border/80 bg-background p-3.5">
              <h3 className="font-semibold text-foreground">只在这台设备生效</h3>
              <p className="mt-1 text-muted-foreground">数据权限、自定义连接和调取方式都不会进入备份。系统不会在内置 AI 失败后静默转发到自定义服务商。</p>
            </section>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setAiHelpDialogOpen(false)} className="min-h-10 w-full sm:w-auto">
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiConnectionDialogOpen} onOpenChange={handleAiConnectionOpenChange}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Settings2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
              AI 高级设置
            </DialogTitle>
            <DialogDescription>
              Lexi 内置 AI 无需在这里配置。以下自定义连接只保存在当前设备，不会进入数据备份。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pr-1">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">当前调取方式</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="选择 AI 调取方式">
                <Button
                  type="button"
                  variant={aiRouteMode === 'managed' ? 'default' : 'outline'}
                  onClick={() => setAiRouteMode('managed')}
                  aria-pressed={aiRouteMode === 'managed'}
                  className="min-h-11 w-full justify-start"
                >
                  <Sparkles aria-hidden="true" />
                  Lexi 内置 AI
                </Button>
                <Button
                  type="button"
                  variant={aiRouteMode === 'custom' ? 'default' : 'outline'}
                  onClick={() => setAiRouteMode('custom')}
                  disabled={!hasCustomAiConnection}
                  aria-pressed={aiRouteMode === 'custom'}
                  className="min-h-11 w-full justify-start"
                >
                  <KeyRound aria-hidden="true" />
                  使用自定义连接
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {hasCustomAiConnection
                  ? '切换只影响后续请求；建议先检测连接。内置服务失败时不会自动使用自定义连接。'
                  : '填写完整的自定义连接后，才可选择它。'}
              </p>
            </fieldset>

            <div id="ai-connection-note" className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 p-3.5 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p>只有你明确选择“自定义 AI”后，本浏览器才会把本次选择发送的内容交给第三方服务商。这里的 Key 不会发往 Lexi 服务端，内置 AI 也不会使用它。</p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">自定义服务</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="选择自定义 AI 服务">
                {CUSTOM_AI_PROVIDER_PRESET_OPTIONS.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    role="radio"
                    aria-checked={aiProviderPreset === provider.id}
                    onClick={() => handleCustomAiProviderChange(provider.id)}
                    className={cn(
                      'min-h-16 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40',
                      aiProviderPreset === provider.id
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:bg-muted/60',
                    )}
                  >
                    <span className="block text-sm font-semibold leading-5">{provider.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                      {provider.editableConnection ? '自行填写地址与模型' : '预设连接'}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {selectedCustomAiProvider.description}
                {' '}切换服务时会清空上一家的 Key，避免将密钥发往错误的服务商。
              </p>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="ai-api-key">
                <KeyRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
                API Key
              </Label>
              <div className="relative">
                <Input
                  id="ai-api-key"
                  type={showAiKey ? 'text' : 'password'}
                  value={aiApiKey}
                  onChange={(event) => {
                    setAiApiKey(event.target.value)
                    resetAiTestResult()
                  }}
                  placeholder={selectedCustomAiProvider.keyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="ai-connection-note"
                  className="h-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowAiKey((visible) => !visible)}
                  className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={showAiKey ? '隐藏 API Key' : '显示 API Key'}
                  aria-pressed={showAiKey}
                >
                  {showAiKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {selectedCustomAiProvider.editableConnection ? (
              <div className="grid gap-4 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-base-url">
                    <LinkIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    API 地址
                  </Label>
                  <Input
                    id="ai-base-url"
                    value={aiBaseURL}
                    onChange={(event) => {
                      setAiBaseURL(event.target.value)
                      resetAiTestResult()
                    }}
                    placeholder="https://api.example.com/v1"
                    inputMode="url"
                    spellCheck={false}
                    aria-describedby="ai-connection-note ai-compatible-help"
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-model">模型</Label>
                  <Input
                    id="ai-model"
                    value={aiModel}
                    onChange={(event) => {
                      setAiModel(event.target.value)
                      resetAiTestResult()
                    }}
                    placeholder="model-name"
                    spellCheck={false}
                    aria-describedby="ai-connection-note ai-compatible-help"
                    className="h-10"
                  />
                </div>
                <p id="ai-compatible-help" className="text-[11px] leading-4 text-muted-foreground sm:col-span-2">
                  只支持 HTTPS 和 OpenAI-compatible <code>/chat/completions</code>；可填基础地址或完整的 Chat Completions 地址。
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs leading-5 text-muted-foreground">
                接口地址和模型由所选预设统一维护；它们不会替换 Lexi 内置 AI 的服务端配置。
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestAI}
                disabled={aiTestStatus === 'testing' || !hasCustomAiConnection}
                aria-busy={aiTestStatus === 'testing'}
                className="min-h-10 w-full"
              >
                <Wifi aria-hidden="true" />
                {aiTestStatus === 'testing' ? '正在检测…' : '检测连接'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  clearAiConfig()
                  setShowAiKey(false)
                  resetAiTestResult()
                }}
                className="min-h-10 w-full"
              >
                <RotateCcw aria-hidden="true" />
                重置配置
              </Button>
            </div>

            <div className="min-h-6" role="status" aria-live="polite">
              {aiTestStatus === 'testing' && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Wifi className="size-3.5" aria-hidden="true" />
                  正在验证 API 地址、密钥与模型…
                </p>
              )}
              {aiTestStatus === 'success' && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  {aiTestMessage}；如需使用，请在上方选择“使用自定义连接”
                </p>
              )}
              {aiTestStatus === 'error' && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <XCircle className="size-3.5" aria-hidden="true" />
                  {aiTestMessage}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => handleAiConnectionOpenChange(false)} className="min-h-10 w-full sm:w-auto">
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={consistencyDialogOpen} onOpenChange={setConsistencyDialogOpen}>
        <DialogContent className="max-h-[85dvh] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
              活动一致性差异
            </DialogTitle>
            <DialogDescription>
              当前业务数据与影子账本回放结果的只读对比。此处不会自动修改或重建数据。
            </DialogDescription>
          </DialogHeader>

          {consistencyReport?.status === 'drift' && (
            <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-2" aria-label="差异摘要">
                <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {consistencyReport.summary.scalarFieldCount}
                  </p>
                  <p className="text-[11px] leading-4 text-muted-foreground">状态字段</p>
                </div>
                <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {consistencyReport.summary.heatmapDateCount}
                  </p>
                  <p className="text-[11px] leading-4 text-muted-foreground">活跃日期</p>
                </div>
                <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {consistencyReport.summary.checkinDateCount}
                  </p>
                  <p className="text-[11px] leading-4 text-muted-foreground">打卡日期</p>
                </div>
              </div>

              {consistencyReport.scalarDifferences.length > 0 && (
                <section aria-labelledby="scalar-differences-title" className="space-y-2">
                  <h3 id="scalar-differences-title" className="text-sm font-semibold text-foreground">
                    派生状态字段
                  </h3>
                  <div className="space-y-2">
                    {consistencyReport.scalarDifferences.map((difference) => (
                      <div
                        key={difference.field}
                        className="rounded-lg border border-border/80 bg-background p-3"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {CONSISTENCY_FIELD_LABELS[difference.field]}
                        </p>
                        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div className="min-w-0 rounded-md bg-muted/40 p-2">
                            <dt className="text-muted-foreground">当前数据</dt>
                            <dd className="mt-1 break-words font-medium tabular-nums text-foreground">
                              {formatConsistencyValue(difference.canonicalValue)}
                            </dd>
                          </div>
                          <div className="min-w-0 rounded-md bg-muted/40 p-2">
                            <dt className="text-muted-foreground">账本回放</dt>
                            <dd className="mt-1 break-words font-medium tabular-nums text-foreground">
                              {formatConsistencyValue(difference.replayedValue)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {consistencyReport.heatmapDifferences.length > 0 && (
                <section aria-labelledby="heatmap-differences-title" className="space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <h3 id="heatmap-differences-title" className="text-sm font-semibold text-foreground">
                      热力图日期
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                      最近 {Math.min(consistencyReport.heatmapDifferences.length, 20)} / {consistencyReport.heatmapDifferences.length} 条
                    </span>
                  </div>
                  <div className="space-y-2">
                    {consistencyReport.heatmapDifferences.slice(0, 20).map((difference) => (
                      <div
                        key={difference.date}
                        className="flex flex-col gap-2 rounded-lg border border-border/80 bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium tabular-nums text-foreground">{difference.date}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {HEATMAP_DIFFERENCE_LABELS[difference.kind]}
                          </p>
                        </div>
                        <dl className="grid grid-cols-2 gap-2 text-xs sm:min-w-52">
                          <div className="rounded-md bg-muted/40 px-2.5 py-2">
                            <dt className="text-muted-foreground">当前数据</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                              {difference.canonicalCount} 次
                            </dd>
                          </div>
                          <div className="rounded-md bg-muted/40 px-2.5 py-2">
                            <dt className="text-muted-foreground">账本回放</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
                              {difference.replayedCount} 次
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {consistencyReport.checkinDifferences.length > 0 && (
                <section aria-labelledby="checkin-differences-title" className="space-y-2">
                  <h3 id="checkin-differences-title" className="text-sm font-semibold text-foreground">
                    打卡奖励日期
                  </h3>
                  <div className="space-y-2">
                    {consistencyReport.checkinDifferences.map((difference) => (
                      <div
                        key={difference.date}
                        className="rounded-lg border border-border/80 bg-background p-3"
                      >
                        <p className="font-medium tabular-nums text-foreground">{difference.date}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {CHECKIN_DIFFERENCE_LABELS[difference.kind]}。
                        </p>
                        {difference.compatibilitySources.length > 0 && (
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            兼容线索：{difference.compatibilitySources.map((source) => CHECKIN_COMPATIBILITY_SOURCE_LABELS[source]).join('、')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <p className="rounded-lg bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
                零差异只表示自账本基线建立后派生状态一致；徽章、统计页访问次数和基线前历史记录不在本次检查范围。
              </p>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConsistencyDialogOpen(false)}
              className="min-h-11 w-full sm:w-auto"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清空确认弹窗 */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              确认清空本机数据
            </DialogTitle>
            <DialogDescription>
              此操作只删除当前设备上的学习记录、计划、日记和成就，且无法撤销；已经同步到账号的云端记录不会被删除，今后重新确认同一账号时可能再次下载。如果还需要本机完整副本，请先导出 JSON 备份。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setClearDialogOpen(false)} className="min-h-10 w-full sm:w-auto">
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleClearAll()} disabled={dataOperation !== 'idle'} className="min-h-10 w-full sm:w-auto">
              {dataOperation === 'clearing' ? '正在清空…' : '确认清空本机'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
