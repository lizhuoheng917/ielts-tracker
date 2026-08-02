import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import { format, subDays, startOfWeek, eachDayOfInterval } from 'date-fns'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Activity,
  AlertCircle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Clock,
  FileText,
  Flame,
  ListChecks,
  Save,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChartCard, ChartRangeControl } from '@/components/ui/chart-card'
import { MetricGroup } from '@/components/ui/metric-group'
import { PageHeader } from '@/components/ui/page-header'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AiGatewayError, type AiGatewayErrorCode } from '@/ai/gateway'
import { executeReadOnlyAi } from '@/ai/readOnlyExecution'
import { createCurrentLearningContext } from '@/ai/runtimeContext'
import {
  formatLearningAnalysisAsMarkdown,
  isLearningAnalysisV2,
  type LearningAnalysisV2,
} from '@/ai/structuredOutputs'
import { useStreakStore } from '@/stores/streakStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { usePlanStore } from '@/stores/planStore'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'
import { useAIPrivacyStore } from '@/stores/aiPrivacyStore'
import { useAIStore } from '@/stores/aiStore'
import { WEEKDAY_LABELS } from '@/lib/constants'
import { addLocalDays, parseLocalDate } from '@/lib/localDate'
import type { PracticeType } from '@/lib/types'
import { createPortal } from 'react-dom'
import { SafeAIContent } from '@/components/ai/SafeAIContent'
import { LearningAnalysisContent } from '@/components/ai/StructuredAIContent'
import { AiArtifactLibrary } from '@/components/ai/AiArtifactLibrary'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { useAccountDialog } from '@/components/account/accountDialogContext'
import { SUBJECT_VISUALS } from '@/lib/subjectVisuals'
import {
  getActivityLevel,
  countActiveDays,
  getStatsRangeAnalytics,
  type StatsRangeDays,
} from '@/lib/statsAnalytics'

// ===== 颜色常量 =====
const CHART_COLORS = {
  primary: 'var(--primary)',
  primaryLight: 'var(--chart-2)',
  primaryLighter: 'var(--chart-1)',
  gradient: ['var(--chart-2)', 'var(--primary)', 'var(--chart-4)'],
  skill: {
    reading: SUBJECT_VISUALS.reading.chartColor,
    listening: SUBJECT_VISUALS.listening.chartColor,
    writing: SUBJECT_VISUALS.writing.chartColor,
    speaking: SUBJECT_VISUALS.speaking.chartColor,
  },
  pie: Array.from({ length: 8 }, (_, index) => `var(--chart-${index + 1})`),
}

const SKILL_LABELS: Record<PracticeType, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
}

interface ReportContextMeta {
  snapshotId: string
  contextHash: string
  dataAsOf: string
  rangeDays: StatsRangeDays
  quality: 'empty' | 'limited' | 'sufficient'
  source: 'managed' | 'custom'
  runId?: string
  providerArtifactId?: string
  artifactCreatedAt?: string
  warnings: string[]
}

// ===== 工具函数 =====
function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function formatStudyDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0 分钟'
  if (totalSeconds < 60) return `${totalSeconds} 秒`

  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${totalMinutes} 分钟`
  return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
}

// ===== 自定义 Tooltip =====
function CustomTooltip({
  active,
  payload,
  label,
  bgColor,
  borderColor,
  valueFormatter = (value) => String(value),
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
  bgColor?: string
  borderColor?: string
  valueFormatter?: (value: number, name: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-sm text-xs"
      style={{ backgroundColor: bgColor, borderColor }}
    >
      {label && <p className="font-medium text-foreground/90 mb-1">{label}</p>}
      {payload.map((item, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-medium tabular-nums">{valueFormatter(item.value, item.name)}</span>
        </p>
      ))}
    </div>
  )
}

// ===== 可拖动浮动按钮 =====
function DraggableFloatButton({ onClick }: { onClick: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const posRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const pointerStartRef = useRef({ x: 0, y: 0 })

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    posRef.current = { x: rect.left, y: rect.top }
    startRef.current = { x: clientX - rect.left, y: clientY - rect.top }
    pointerStartRef.current = { x: clientX, y: clientY }
    draggingRef.current = true
    movedRef.current = false
    btnRef.current.style.transition = 'none'
  }, [])

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!draggingRef.current || !btnRef.current) return
    const x = clientX - startRef.current.x
    const y = clientY - startRef.current.y
    const btnW = btnRef.current.offsetWidth
    const btnH = btnRef.current.offsetHeight
    const maxX = window.innerWidth - btnW
    const reservedBottom = window.matchMedia('(max-width: 767px)').matches ? 80 : 0
    const maxY = window.innerHeight - btnH - reservedBottom
    const cx = Math.max(0, Math.min(x, maxX))
    const cy = Math.max(0, Math.min(y, maxY))
    posRef.current = { x: cx, y: cy }
    btnRef.current.style.left = cx + 'px'
    btnRef.current.style.top = cy + 'px'
    btnRef.current.style.right = 'auto'
    btnRef.current.style.bottom = 'auto'
    const dist =
      Math.abs(clientX - pointerStartRef.current.x) +
      Math.abs(clientY - pointerStartRef.current.y)
    if (dist > 5) movedRef.current = true
  }, [])

  const handleEnd = useCallback(() => {
    if (!btnRef.current) return
    draggingRef.current = false
    btnRef.current.style.transition = ''
  }, [])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => handleStart(e.clientX, e.clientY)
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const onMouseUp = () => handleEnd()
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 1) handleStart(e.touches[0].clientX, e.touches[0].clientY) }
    const onTouchMove = (e: TouchEvent) => { if (e.touches.length === 1) handleMove(e.touches[0].clientX, e.touches[0].clientY) }
    const onTouchEnd = () => handleEnd()

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', onTouchEnd)

    const btn = btnRef.current
    btn?.addEventListener('mousedown', onMouseDown)
    btn?.addEventListener('touchstart', onTouchStart)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      btn?.removeEventListener('mousedown', onMouseDown)
      btn?.removeEventListener('touchstart', onTouchStart)
    }
  }, [handleStart, handleMove, handleEnd])

  if (typeof document === 'undefined') return null

  return createPortal(
    <button
      ref={btnRef}
      type="button"
      onClick={() => { if (!movedRef.current) onClick() }}
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25 transition-all duration-200 cursor-grab touch-none select-none hover:scale-105 hover:shadow-xl hover:shadow-violet-500/30 active:scale-95 active:cursor-grabbing md:bottom-6 md:right-6 md:h-14 md:w-14"
      aria-label="AI 智能分析"
    >
      <Sparkles className="h-5 w-5 md:h-6 md:w-6 pointer-events-none" />
    </button>,
    document.body,
  )
}

// ===== 主组件 =====
export default function Stats() {
  const statsViewRecordedRef = useRef(false)
  const { openAccountDialog } = useAccountDialog()
  const artifactAccess = useAiArtifactAccess()

  // --- 统计页面访问计数（成就系统）---
  useEffect(() => {
    if (statsViewRecordedRef.current) return
    statsViewRecordedRef.current = true
    // 动态导入避免循环依赖
    import('@/lib/achievementService').then(({ recordStatsView }) => {
      recordStatsView()
    })
  }, [])

  // --- 首次加载时从 heatmapData 修正连续天数（确保历史数据一致）---
  useEffect(() => {
    useStreakStore.getState().recomputeStreak()
  }, [])

  // --- Store 数据（使用 stable selector）---
  const streakData = useStreakStore((s) => s)
  const wordRecords = useWordStore((s) => s.records)
  const practiceRecords = usePracticeStore((s) => s.records)
  const timerRecords = useTimerStore((s) => s.records)
  const planExecutions = usePlanStore((s) => s.executions)
  const includeDiaryExcerpts = useAIPrivacyStore((s) => s.includeDiaryExcerpts)
  const includePriorAIArtifacts = useAIPrivacyStore((s) => s.includePriorAIArtifacts)
  const aiRouteMode = useAIStore((s) => s.routeMode)
  const [rangeDays, setRangeDays] = useState<StatsRangeDays>(30)

  const analytics = useMemo(
    () =>
      getStatsRangeAnalytics(
        {
          wordRecords,
          practiceRecords,
          timerRecords,
          planExecutions,
        },
        rangeDays,
      ),
    [planExecutions, practiceRecords, rangeDays, timerRecords, wordRecords],
  )

  // --- 累计活跃天数（热力图记录的是不可逆的学习事件）---
  const totalStudyDays = useMemo(() => {
    return countActiveDays(streakData.heatmapData)
  }, [streakData.heatmapData])

  // --- 图表颜色配置（适配暗色模式）---
  const chartColors = {
    grid: 'var(--chart-grid)',
    tick: 'var(--chart-tick)',
    label: 'var(--chart-label)',
    tooltipBg: 'var(--popover)',
    tooltipBorder: 'var(--border)',
  }

  // --- 报告相关状态 ---
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'report'>('idle')
  const [reportContent, setReportContent] = useState('')
  const [reportStructuredContent, setReportStructuredContent] = useState<LearningAnalysisV2 | null>(null)
  const [reportError, setReportError] = useState('')
  const [reportSaveError, setReportSaveError] = useState('')
  const [reportErrorCode, setReportErrorCode] = useState<AiGatewayErrorCode | null>(null)
  const [savedReportId, setSavedReportId] = useState<string | null>(null)
  const [reportCreatedAt, setReportCreatedAt] = useState(() => new Date().toISOString())
  const [reportContextMeta, setReportContextMeta] = useState<ReportContextMeta | null>(null)
  const [reportAccessKey, setReportAccessKey] = useState<string | null>(null)
  const saveLearningAnalysis = useAiArtifactStore((state) => state.saveLearningAnalysis)
  const reportRequestSequenceRef = useRef(0)
  const currentExecutionKey = `${JSON.stringify(artifactAccess)}|${aiRouteMode}`
  const currentExecutionKeyRef = useRef(currentExecutionKey)
  currentExecutionKeyRef.current = currentExecutionKey

  const [aiOpen, setAiOpen] = useState(false)

  const resetReportUi = useCallback(() => {
    setReportState('idle')
    setReportContent('')
    setReportStructuredContent(null)
    setReportError('')
    setReportSaveError('')
    setReportErrorCode(null)
    setSavedReportId(null)
    setReportContextMeta(null)
    setReportAccessKey(null)
    setReportCreatedAt(new Date().toISOString())
  }, [])

  const closeReportDialog = useCallback(() => {
    reportRequestSequenceRef.current += 1
    resetReportUi()
    setAiOpen(false)
  }, [resetReportUi])

  useEffect(() => {
    // Invalidate pending work and remove previews whenever the account scope or
    // route changes. Render-time access keys also prevent a one-frame leak.
    reportRequestSequenceRef.current += 1
    resetReportUi()
  }, [currentExecutionKey, resetReportUi])

  // --- 生成报告（只读托管网关或用户明确选择的自定义连接）---
  const generateReport = async () => {
    const requestSequence = ++reportRequestSequenceRef.current
    const requestExecutionKey = currentExecutionKey
    setReportState('loading')
    setReportContent('')
    setReportStructuredContent(null)
    setReportError('')
    setReportSaveError('')
    setReportErrorCode(null)
    setSavedReportId(null)
    setReportCreatedAt(new Date().toISOString())
    setReportContextMeta(null)
    setReportAccessKey(null)

    if (artifactAccess.status === 'locked' && aiRouteMode === 'managed') {
      const code: AiGatewayErrorCode = artifactAccess.reason === 'account-mismatch'
        ? 'LOCAL_DATA_ACCOUNT_MISMATCH'
        : 'LOCAL_DATA_BINDING_UNAVAILABLE'
      setReportErrorCode(code)
      setReportError(code === 'LOCAL_DATA_ACCOUNT_MISMATCH'
        ? '本机 AI 内容属于另一个 Lexi 账号，当前账号不能读取或写入。'
        : '无法安全确认本机 AI 内容归属，请先处理账号安全状态。')
      setReportState('idle')
      return
    }

    const snapshot = createCurrentLearningContext({
      purpose: 'learning_analysis',
      rangeDays,
    })
    try {
      const result = await executeReadOnlyAi({
        purpose: 'learning_analysis',
        snapshot,
        userInput: '请分析我的当前学习数据，包括各科目练习情况、计划完成进度、连续打卡情况，并给出具体的学习建议。',
      })
      if (!isLearningAnalysisV2(result.content)) {
        throw new AiGatewayError('INVALID_RESPONSE', 'AI 返回的分析格式不完整，请重新生成。', true)
      }
      if (
        requestSequence !== reportRequestSequenceRef.current
        || requestExecutionKey !== currentExecutionKeyRef.current
      ) return
      setReportStructuredContent(result.content)
      setReportContent(formatLearningAnalysisAsMarkdown(result.content))
      setReportCreatedAt(result.artifact?.createdAt ?? result.run?.completedAt ?? new Date().toISOString())
      setReportContextMeta({
        snapshotId: snapshot.snapshotId,
        contextHash: snapshot.contextHash,
        dataAsOf: snapshot.dataAsOf,
        rangeDays,
        quality: snapshot.quality.status,
        source: result.source,
        runId: result.artifact?.runId ?? result.run?.runId,
        providerArtifactId: result.artifact?.artifactId,
        artifactCreatedAt: result.artifact?.createdAt,
        warnings: result.warnings,
      })
      setReportAccessKey(requestExecutionKey)
      setReportState('report')
    } catch (caughtError) {
      if (
        requestSequence !== reportRequestSequenceRef.current
        || requestExecutionKey !== currentExecutionKeyRef.current
      ) return
      setReportErrorCode(caughtError instanceof AiGatewayError ? caughtError.code : null)
      setReportError(caughtError instanceof AiGatewayError ? caughtError.message : 'AI 分析暂时不可用，请稍后重试。')
      setReportState('idle')
    }
  }

  const reportNeedsAccountAction = reportErrorCode === 'UNAUTHORIZED'
    || reportErrorCode === 'LOCAL_DATA_UNBOUND'
    || reportErrorCode === 'LOCAL_DATA_ACCOUNT_MISMATCH'
    || reportErrorCode === 'LOCAL_DATA_BINDING_UNAVAILABLE'

  const openReportAccountRecovery = () => {
    closeReportDialog()
    window.setTimeout(() => openAccountDialog(null), 0)
  }

  // --- 报告相关回调 ---
  const handleSaveReport = () => {
    if (!reportContent || !reportStructuredContent) return
    if (reportAccessKey !== currentExecutionKey) {
      setReportSaveError('账号或 AI 调取方式已经变化，这份预览不会保存。请重新生成。')
      return
    }
    if (artifactAccess.status === 'locked') {
      setReportSaveError('当前账号归属未确认；自定义 AI 结果只供预览，不会保存到内容库。')
      return
    }
    setReportSaveError('')
    try {
      const artifact = saveLearningAnalysis({
        content: reportStructuredContent,
        recordId: reportContextMeta?.providerArtifactId,
        providerArtifactId: reportContextMeta?.providerArtifactId,
        runId: reportContextMeta?.runId,
        snapshotId: reportContextMeta?.snapshotId,
        contextHash: reportContextMeta?.contextHash,
        rangeDays: reportContextMeta?.rangeDays,
        quality: reportContextMeta?.quality,
        createdAt: reportContextMeta?.artifactCreatedAt ?? reportCreatedAt,
        dataAsOf: reportContextMeta?.dataAsOf ?? reportCreatedAt,
        source: reportContextMeta?.source ?? 'custom',
        warnings: reportContextMeta?.warnings,
      }, artifactAccess)
      setSavedReportId(artifact.recordId)
    } catch {
      setReportSaveError('报告已生成，但无法保存到当前设备。请先导出或删除部分本机数据后重试。')
    }
  }

  // --- 热力图数据（固定最近 12 个周列，CSS Grid）---
  const heatmapData = useMemo(() => {
    const today = new Date()
    const startDate = startOfWeek(subDays(today, 77), { weekStartsOn: 1 })

    const allDays = eachDayOfInterval({ start: startDate, end: today })
    const weeks: Array<Array<{ date: string; value: number; level: number | null }>> = []
    for (let i = 0; i < allDays.length; i += 7) {
      const weekSlice = allDays.slice(i, i + 7)
      weeks.push(
        weekSlice.map((day) => {
          const dateStr = formatDate(day)
          const value = streakData.heatmapData[dateStr] || 0
          return { date: dateStr, value, level: getActivityLevel(value) }
        })
      )
    }

    const lastWeek = weeks[weeks.length - 1]
    if (lastWeek && lastWeek.length < 7) {
      while (lastWeek.length < 7) {
        const nextDate = addLocalDays(lastWeek[lastWeek.length - 1].date, 1)
        lastWeek.push({ date: nextDate, value: 0, level: null })
      }
    }

    const visibleWeeks = weeks.slice(-12)
    const monthLabels: Array<{ colIndex: number; label: string; span: number }> = []
    let currentMonth = ''
    let monthStart = 0

    for (let w = 0; w < visibleWeeks.length; w++) {
      if (visibleWeeks[w].length === 0) continue
      const firstDate = parseLocalDate(visibleWeeks[w][0].date)
      const month = format(firstDate, 'yyyy-MM')
      if (month !== currentMonth) {
        if (currentMonth !== '') {
          monthLabels.push({
            colIndex: monthStart,
            label: format(parseLocalDate(currentMonth + '-01'), 'M月'),
            span: w - monthStart,
          })
        }
        currentMonth = month
        monthStart = w
      }
    }

    if (currentMonth !== '') {
      monthLabels.push({
        colIndex: monthStart,
        label: format(parseLocalDate(currentMonth + '-01'), 'M月'),
        span: visibleWeeks.length - monthStart,
      })
    }

    return { weeks: visibleWeeks, monthLabels }
  }, [streakData.heatmapData])

  const wordTrend = useMemo(
    () =>
      analytics.wordTrend.map((point) => ({
        ...point,
        label: format(parseLocalDate(point.date), 'M/d'),
      })),
    [analytics.wordTrend],
  )

  const durationData = useMemo(
    () =>
      analytics.studyDuration.map((point) => ({
        ...point,
        label: format(parseLocalDate(point.date), 'M/d'),
      })),
    [analytics.studyDuration],
  )

  const radarData = useMemo(
    () =>
      analytics.subjectScores.map((point) => ({
        ...point,
        subject: SKILL_LABELS[point.type],
        fullMark: 9,
        color: CHART_COLORS.skill[point.type],
      })),
    [analytics.subjectScores],
  )

  const categoryPieData = useMemo(() => {
    if (analytics.wordCategories.length <= 8) return analytics.wordCategories

    const visibleCategories = analytics.wordCategories.slice(0, 7)
    const otherCount = analytics.wordCategories
      .slice(7)
      .reduce((sum, point) => sum + point.value, 0)
    return [...visibleCategories, { name: '其他', value: otherCount }]
  }, [analytics.wordCategories])
  const hasWordData = analytics.overview.totalWords > 0
  const hasDurationData = analytics.overview.totalStudySeconds > 0
  const hasRadarData = radarData.some((point) => point.scoredRecordCount > 0)
  const hasPieData = categoryPieData.some((point) => point.value > 0)
  const rangeLabel = `近 ${rangeDays} 天`
  const rangeDateLabel = `${format(parseLocalDate(analytics.range.startDate), 'yyyy/M/d')} – ${format(parseLocalDate(analytics.range.endDate), 'yyyy/M/d')}`

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        eyebrow="Learning insights"
        title="数据统计"
        description="把背词、练习、计时和计划完成情况放在同一时间区间里观察。"
        icon={<BarChart3 />}
        actions={(
          <ChartRangeControl
            value={rangeDays}
            onValueChange={setRangeDays}
            ariaLabel="选择统计时间范围"
          />
        )}
        meta={(
          <>
            <span>{rangeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{rangeDateLabel}</span>
          </>
        )}
      />

      <MetricGroup
        ariaLabel={`${rangeLabel}学习概览`}
        columns={4}
        items={[
          {
            label: '学习单词',
            value: analytics.overview.totalWords.toLocaleString('zh-CN'),
            description: '按记录数量累计',
            icon: <BookOpen />,
            tone: 'primary',
          },
          {
            label: '学习时长',
            value: formatStudyDuration(analytics.overview.totalStudySeconds),
            description: `${analytics.overview.studySessionCount} 次练习记录`,
            icon: <Clock />,
            tone: 'warning',
          },
          {
            label: '练习次数',
            value: analytics.overview.studySessionCount,
            description: `${analytics.overview.practiceCount} 次模考 · ${analytics.overview.timerSessionCount} 次计时`,
            icon: <Activity />,
            tone: 'success',
          },
          {
            label: '完成计划',
            value: analytics.overview.completedPlanCount,
            description: '区间内完成打卡',
            icon: <ListChecks />,
            tone: 'reading',
          },
        ]}
      />

      {/* 连续打卡统计区 */}
      <MetricGroup
        ariaLabel="连续学习统计"
        columns={3}
        items={[
          {
            label: '当前连续天数',
            value: `${streakData.currentStreak} 天`,
            description: '连续活跃记录',
            icon: <Flame />,
            tone: 'warning',
          },
          {
            label: '最长连续天数',
            value: `${streakData.longestStreak} 天`,
            description: '历史最佳连续记录',
            icon: <Trophy />,
            tone: 'primary',
          },
          {
            label: '累计活跃天数',
            value: `${totalStudyDays} 天`,
            description: '有累计学习事件的日期',
            icon: <CalendarDays />,
            tone: 'listening',
          },
        ]}
      />

      {/* 学习热力图 */}
      <Card className="ring-1 ring-indigo-500/15">
        <CardHeader>
          <CardTitle className="text-[15px] md:text-base flex items-center gap-2">
            <div className="h-1.5 w-6 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
            最近 12 周学习热力图
          </CardTitle>
          <CardDescription>固定周窗口 · 颜色表示当天累计记录的学习事件强度</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-1 px-1">
            {/* CSS Grid 热力图：左列星期标签 + 右侧网格 */}
            <div className="grid gap-[3px]"
              style={{
                gridTemplateColumns: '1.5rem max-content',
                gridTemplateRows: 'auto auto auto',
              }}
            >
              {/* 月份标签行 - 左侧占位 */}
              <div />

              {/* 月份标签行 - 网格区域 */}
              <div className="flex mb-1">
                {heatmapData.monthLabels.map((ml) => (
                  <div
                    key={ml.colIndex}
                    className="text-[12px] md:text-xs text-muted-foreground"
                    style={{
                      flex: `${ml.span} 1 0%`,
                      textAlign: 'left',
                    }}
                  >
                    {ml.label}
                  </div>
                ))}
              </div>

              {/* 星期标签列 */}
              <div className="flex flex-col gap-[3px]">
                {/* Mon=0, Tue=1, ... Sun=6 对应 WEEKDAY_LABELS 的 一二三四五六日 */}
                {[1, 2, 3, 4, 5, 6, 0].map((jsDayIdx, rowIdx) => {
                  // 只在周一(1)、周三(3)、周五(5) 显示标签
                  if (jsDayIdx !== 1 && jsDayIdx !== 3 && jsDayIdx !== 5) {
                    return <div key={rowIdx} style={{ height: 'clamp(0.75rem, 4vw, 1rem)' }} />
                  }
                  return (
                    <div
                      key={rowIdx}
                      className="flex items-center text-[11px] md:text-[10px] leading-none text-muted-foreground"
                      style={{ height: 'clamp(0.75rem, 4vw, 1rem)' }}
                    >
                      {WEEKDAY_LABELS[jsDayIdx]}
                    </div>
                  )
                })}
              </div>

              {/* 热力图网格区域 */}
              <div
                className="grid gap-[3px]"
                style={{
                  gridTemplateColumns: `repeat(${heatmapData.weeks.length}, clamp(0.75rem, 4vw, 1rem))`,
                  gridTemplateRows: 'repeat(7, clamp(0.75rem, 4vw, 1rem))',
                }}
              >
                {/* 逐行逐列填入方块：row 0..6 = Mon..Sun */}
                {Array.from({ length: 7 }, (_, rowIdx) =>
                  heatmapData.weeks.map((week, colIdx) => {
                    const day = week[rowIdx]
                    if (!day || day.level === null) {
                      return <div key={`${colIdx}-${rowIdx}`} className="h-full w-full" />
                    }
                    const levelColors = [
                      'var(--heatmap-level-0)',
                      'var(--heatmap-level-1)',
                      'var(--heatmap-level-2)',
                      'var(--heatmap-level-3)',
                      'var(--heatmap-level-4)',
                    ]
                    return (
                      <div
                        key={`${colIdx}-${rowIdx}`}
                        role="img"
                        aria-label={`${day.date}，${day.value} 次累计学习事件`}
                        className="h-full w-full rounded-[3px] transition-colors"
                        style={{ backgroundColor: levelColors[day.level] }}
                        title={`${day.date}: ${day.value} 次活动`}
                      />
                    )
                  })
                )}
              </div>

              {/* 图例行 - 左侧占位 */}
              <div />

              {/* 图例行 */}
              <div className="mt-2 flex items-center justify-end gap-1 text-[11px] md:text-xs text-muted-foreground">
                <span>少</span>
                <div className="size-4 rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-0)' }} />
                <div className="size-4 rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-1)' }} />
                <div className="size-4 rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-2)' }} />
                <div className="size-4 rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-3)' }} />
                <div className="size-4 rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-4)' }} />
                <span>多</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 图表区域：折线图 + 柱状图 */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="单词背诵趋势"
          description={`${rangeLabel}每日背词数量`}
          height={hasWordData ? 'default' : 'compact'}
          hasData={hasWordData}
          legendItems={[{ label: '背诵量', color: CHART_COLORS.primary, marker: 'line' }]}
          emptyState={{
            scene: 'wordTrend',
            title: `${rangeLabel}暂无单词记录`,
            description: '添加背词记录后，这里会展示每天的变化。',
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={wordTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="wordGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: chartColors.tick }}
                interval="preserveStartEnd"
                minTickGap={rangeDays === 90 ? 30 : 18}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: chartColors.tick }}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                content={(
                  <CustomTooltip
                    bgColor={chartColors.tooltipBg}
                    borderColor={chartColors.tooltipBorder}
                    valueFormatter={(value) => `${value.toLocaleString('zh-CN')} 个`}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="背诵量"
                stroke={CHART_COLORS.primary}
                strokeWidth={2.5}
                fill="url(#wordGradient)"
                dot={false}
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: CHART_COLORS.primary }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="学习时长分布"
          description={`${rangeLabel}每日模考与计时总时长`}
          height={hasDurationData ? 'default' : 'compact'}
          hasData={hasDurationData}
          legendItems={[{ label: '学习时长', color: CHART_COLORS.primary, marker: 'square' }]}
          emptyState={{
            scene: 'durationChart',
            title: `${rangeLabel}暂无时长记录`,
            description: '完成模考或计时练习后，这里会显示每日投入。',
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={durationData} barCategoryGap="20%" margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="durationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.primary} />
                  <stop offset="100%" stopColor={CHART_COLORS.gradient[2]} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: chartColors.tick }}
                interval="preserveStartEnd"
                minTickGap={rangeDays === 90 ? 30 : 18}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: chartColors.tick }}
                tickFormatter={(value) => `${Math.round(Number(value) / 60)}m`}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={(
                  <CustomTooltip
                    bgColor={chartColors.tooltipBg}
                    borderColor={chartColors.tooltipBorder}
                    valueFormatter={(value) => formatStudyDuration(value)}
                  />
                )}
              />
              <Bar
                dataKey="totalSeconds"
                name="学习时长"
                fill="url(#durationGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={rangeDays === 7 ? 32 : rangeDays === 30 ? 18 : 8}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 图表区域：雷达图 + 饼图 */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="四科能力雷达图"
          description={`${rangeLabel}有评分模考的科目平均分`}
          height={hasRadarData ? 'default' : 'compact'}
          hasData={hasRadarData}
          legendItems={radarData.map((point) => ({
            label: point.subject,
            color: point.color,
            value: point.scoredRecordCount > 0 ? `${point.score.toFixed(1)} 分` : '—',
          }))}
          emptyState={{
            scene: 'radarChart',
            title: `${rangeLabel}暂无评分数据`,
            description: '完成模考并填写分数后，这里会展示四科能力轮廓。',
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
              <PolarGrid stroke={chartColors.grid} />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 12, fill: chartColors.label, fontWeight: 500 }}
              />
              <PolarRadiusAxis angle={90} domain={[0, 9]} tick={false} axisLine={false} />
              <Radar
                name="平均分"
                dataKey="score"
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primaryLight}
                fillOpacity={0.4}
                strokeWidth={2.5}
                dot={{ r: 4, fill: CHART_COLORS.primary, stroke: '#fff', strokeWidth: 1.5 }}
              />
              <Tooltip
                content={(
                  <CustomTooltip
                    bgColor={chartColors.tooltipBg}
                    borderColor={chartColors.tooltipBorder}
                    valueFormatter={(value) => `${value.toFixed(1)} 分`}
                  />
                )}
              />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="单词分类占比"
          description={`${rangeLabel}各词汇分类的背诵量；超过 8 类时合并为“其他”`}
          height={hasPieData ? 'default' : 'compact'}
          hasData={hasPieData}
          legendItems={categoryPieData.map((point, index) => ({
            label: point.name,
            color: CHART_COLORS.pie[index % CHART_COLORS.pie.length],
            value: point.value.toLocaleString('zh-CN'),
          }))}
          emptyState={{
            scene: 'pieChart',
            title: `${rangeLabel}暂无分类数据`,
            description: '添加分类背词记录后，这里会展示词汇构成。',
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryPieData}
                cx="50%"
                cy="50%"
                innerRadius={54}
                outerRadius={88}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {categoryPieData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS.pie[index % CHART_COLORS.pie.length]}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip
                content={(
                  <CustomTooltip
                    bgColor={chartColors.tooltipBg}
                    borderColor={chartColors.tooltipBorder}
                    valueFormatter={(value) => `${value.toLocaleString('zh-CN')} 个`}
                  />
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* AI 智能分析浮动按钮（可拖动） */}
      <DraggableFloatButton onClick={() => {
        reportRequestSequenceRef.current += 1
        resetReportUi()
        setAiOpen(true)
      }} />

      {/* AI 智能分析弹窗 */}
      <Dialog open={aiOpen} onOpenChange={(open) => {
        if (!open) {
          reportRequestSequenceRef.current += 1
          resetReportUi()
        }
        setAiOpen(open)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
          {reportState === 'idle' && !reportError && (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  生成学习分析
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 px-5 pb-5 pt-2">
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="space-y-1 text-sm leading-6">
                      <p className="font-medium text-foreground">本次使用近 {rangeDays} 天的最新学习快照</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        默认包含次数、时长、分数、连续学习和计划完成度
                        {includeDiaryExcerpts ? '，并包含你已允许的日记摘要' : ''}
                        {includePriorAIArtifacts ? '，并将近期 AI 报告标记为参考材料' : ''}。
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        本次会发送到{aiRouteMode === 'managed' ? ' Lexi 内置 AI' : '你在高级设置中选择的自定义服务商'}。
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {artifactAccess.status === 'locked' && aiRouteMode === 'custom'
                    ? '账号归属未确认：本次自定义 AI 结果只供预览，不会保存到内容库。'
                    : '结果会先供你预览；只有点击“保存报告”后，报告与本次快照来源才会写入当前设备。'}
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={closeReportDialog}>取消</Button>
                  <Button onClick={generateReport}>
                    <Sparkles className="h-4 w-4" />
                    开始分析
                  </Button>
                </div>
              </div>
            </>
          )}

          {reportState === 'loading' && (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  AI 智能分析
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center px-5 py-16 gap-5">
                {/* 简约加载动画：渐变圆环 + 中心图标 */}
                <div className="relative">
                  <svg className="animate-spin" width="72" height="72" viewBox="0 0 72 72" fill="none">
                    <circle cx="36" cy="36" r="32" stroke="currentColor" strokeWidth="3" strokeOpacity="0.1" />
                    <circle
                      cx="36" cy="36" r="32"
                      stroke="url(#loadingGradient)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="60 200"
                      fill="none"
                    />
                    <defs>
                      <linearGradient id="loadingGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="50%" stopColor="#a78bfa" />
                        <stop offset="100%" stopColor="#c4b5fd" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-violet-500" />
                </div>

                <div className="text-center space-y-1">
                  <p className="text-[15px] font-medium text-foreground">AI 正在分析</p>
                  <p className="text-sm text-muted-foreground">正在根据近 {rangeDays} 天的最新学习快照生成报告</p>
                </div>

                {/* 生成警告 */}
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/30 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="text-[12px] text-amber-700 dark:text-amber-400">
                    请勿关闭弹窗或切换页面，以免生成中断
                  </span>
                </div>
              </div>
            </>
          )}

          {reportState === 'idle' && reportError && (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  生成失败
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center px-5 py-12 gap-4">
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{reportError}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={closeReportDialog}>
                    关闭
                  </Button>
                  {reportNeedsAccountAction ? (
                    <Button size="sm" onClick={openReportAccountRecovery}>
                      <ShieldCheck className="h-4 w-4" />
                      {reportErrorCode === 'UNAUTHORIZED' ? '登录 Lexi 账号' : '查看账号安全状态'}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={generateReport}>重试</Button>
                  )}
                </div>
              </div>
            </>
          )}

          {reportState === 'report' && reportAccessKey === currentExecutionKey && (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-violet-500" />
                  学习分析报告
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* 报告内容 */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-3 bg-white dark:bg-background">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      生成于 {new Date(reportCreatedAt).toLocaleString('zh-CN')}
                      {reportContextMeta ? ` · 依据近 ${reportContextMeta.rangeDays} 天数据` : ''}
                    </span>
                    {reportStructuredContent && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">结构化 V2</Badge>
                    )}
                    {reportContextMeta && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                        {reportContextMeta.source === 'managed' ? 'Lexi 内置 AI' : '自定义 AI'}
                      </Badge>
                    )}
                    {reportContextMeta && reportContextMeta.quality !== 'sufficient' && (
                      <Badge variant="outline" className="h-5 border-amber-500/30 px-1.5 text-[10px] font-normal text-amber-700 dark:text-amber-400">
                        {reportContextMeta.quality === 'empty' ? '数据不足' : '数据有限'}
                      </Badge>
                    )}
                  </div>
                  {reportStructuredContent ? (
                    <LearningAnalysisContent value={reportStructuredContent} />
                  ) : (
                    <SafeAIContent content={reportContent} variant="report" />
                  )}
                </div>
                {/* 底部按钮 */}
                <div className="border-t px-5 py-3 flex flex-wrap items-center gap-2">
                  {reportSaveError ? (
                    <p className="min-w-0 flex-1 basis-full text-xs leading-5 text-destructive sm:basis-auto" role="alert">
                      {reportSaveError}
                    </p>
                  ) : <div className="flex-1" />}
                  <Button
                    size="sm"
                    onClick={handleSaveReport}
                    disabled={!!savedReportId || artifactAccess.status === 'locked'}
                    className="gap-1.5"
                  >
                    <Save className="h-4 w-4" />
                    {savedReportId ? '已保存' : artifactAccess.status === 'locked' ? '仅预览' : '保存报告'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={closeReportDialog}
                    className="gap-1.5"
                  >
                    关闭
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AiArtifactLibrary />
    </div>
  )
}
