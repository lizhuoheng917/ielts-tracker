import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import { format, subDays, startOfWeek, eachDayOfInterval } from 'date-fns'
import { zhCN } from 'date-fns/locale'
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
  Legend,
} from 'recharts'
import { Flame, Trophy, CalendarDays, Sparkles, FileText, Save, Trash2, Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AILoadingState } from '@/components/ai/AILoadingState'
import { getAllLearningData, streamAIChat, type AIMessage } from '@/lib/aiService'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { useReportStore } from '@/stores/reportStore'
import { WEEKDAY_LABELS } from '@/lib/constants'
import type { PracticeType } from '@/lib/types'
import ReactMarkdown, { type Components } from 'react-markdown'

// ===== 颜色常量 =====
const CHART_COLORS = {
  primary: '#6366F1',
  primaryLight: '#A5B4FC',
  primaryLighter: '#E0E7FF',
  gradient: ['#818CF8', '#6366F1', '#4F46E5'],
  skill: {
    reading: '#3B82F6',
    listening: '#8B5CF6',
    writing: '#F59E0B',
    speaking: '#10B981',
  },
  pie: ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#F97316', '#14B8A6'],
}

const SKILL_LABELS: Record<PracticeType, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
}

// ===== 工具函数 =====
function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function formatShortDate(date: Date): string {
  return format(date, 'M/d')
}

function getHeatmapLevel(value: number): number {
  if (value === 0) return 0
  if (value <= 2) return 1
  if (value <= 5) return 2
  if (value <= 8) return 3
  return 4
}

// ===== 自定义 Tooltip =====
function CustomTooltip({
  active,
  payload,
  label,
  bgColor,
  borderColor,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
  bgColor?: string
  borderColor?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-sm text-xs"
      style={{ backgroundColor: bgColor, borderColor }}
    >
      <p className="font-medium text-foreground/90 mb-1">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-medium">{item.value}</span>
        </p>
      ))}
    </div>
  )
}

// ===== 报告 Markdown 自定义渲染器（卡片式美化）=====
const reportMarkdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h1
      className="text-2xl font-bold mt-6 mb-4 pb-2 bg-[linear-gradient(to_right,#8b5cf6,#6366f1)] bg-[length:100%_2px] bg-no-repeat bg-bottom"
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="text-xl font-bold mt-6 mb-3 pl-3 border-l-4 border-violet-500"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="text-base font-bold mt-4 mb-2 text-foreground" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="text-sm leading-[1.8] my-3 text-foreground/90" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="my-3 ml-5 list-disc space-y-1.5 text-sm leading-[1.8] text-foreground/90" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="my-3 ml-5 list-decimal space-y-1.5 text-sm leading-[1.8] text-foreground/90" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="my-4 pl-4 pr-3 py-2 border-l-4 border-violet-400 bg-violet-50/60 dark:bg-violet-950/20 rounded-r text-sm italic text-muted-foreground"
      {...props}
    />
  ),
  pre: ({ node, ...props }) => (
    <pre className="my-3 p-3 rounded-lg bg-muted overflow-x-auto text-[0.85em] leading-relaxed font-mono" {...props} />
  ),
  code: ({ node, className, children, ...props }) => {
    // 含 language- 类名的是代码块（已被 pre 包裹）
    if (className && className.startsWith('language-')) {
      return (
        <code className={`font-mono ${className}`} {...props}>
          {children}
        </code>
      )
    }
    // 行内代码
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-muted/70 text-violet-600 dark:text-violet-400 text-[0.85em] font-mono"
        {...props}
      >
        {children}
      </code>
    )
  },
  strong: ({ node, ...props }) => (
    <strong className="font-bold text-violet-600 dark:text-violet-400" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => (
    <thead className="bg-muted/50" {...props} />
  ),
  th: ({ node, ...props }) => (
    <th className="border-b border-border px-3 py-2 text-left font-semibold" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border-b border-border px-3 py-2" {...props} />
  ),
}

// ===== 可拖动浮动按钮 =====
function DraggableFloatButton({ onClick }: { onClick: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const posRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })

  const handleStart = useCallback((clientX: number, clientY: number) => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    posRef.current = { x: rect.left, y: rect.top }
    startRef.current = { x: clientX - rect.left, y: clientY - rect.top }
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
    const maxY = window.innerHeight - btnH
    const cx = Math.max(0, Math.min(x, maxX))
    const cy = Math.max(0, Math.min(y, maxY))
    posRef.current = { x: cx, y: cy }
    btnRef.current.style.left = cx + 'px'
    btnRef.current.style.top = cy + 'px'
    btnRef.current.style.right = 'auto'
    btnRef.current.style.bottom = 'auto'
    const dist = Math.abs(cx - (clientX - startRef.current.x)) + Math.abs(cy - (clientY - startRef.current.y))
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

  return (
    <button
      ref={btnRef}
      onClick={() => { if (!movedRef.current) onClick() }}
      className="fixed bottom-6 right-6 z-40 flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-105 active:scale-95 transition-all duration-200 cursor-grab active:cursor-grabbing touch-none select-none"
      aria-label="AI 智能分析"
    >
      <Sparkles className="h-5 w-5 md:h-6 md:w-6 pointer-events-none" />
    </button>
  )
}

// ===== 主组件 =====
export default function Stats() {
  // --- 统计页面访问计数（成就系统）---
  useEffect(() => {
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
  const theme = useSettingsStore((s) => s.theme)
  const streakData = useStreakStore((s) => s)
  const wordRecords = useWordStore((s) => s.records)
  const practiceRecords = usePracticeStore((s) => s.records)
  const timerRecords = useTimerStore((s) => s.records)

  // --- 总学习天数 ---
  const totalStudyDays = useMemo(() => {
    return Object.keys(streakData.heatmapData).length
  }, [streakData.heatmapData])

  // --- 图表颜色配置（适配暗色模式）---
  const chartColors = useMemo(() => {
    const isDark = theme === 'dark'
    return {
      grid: isDark ? 'oklch(0.3 0 0)' : '#e5e7eb',
      tick: isDark ? 'oklch(0.6 0 0)' : '#9ca3af',
      label: isDark ? 'oklch(0.7 0 0)' : '#6b7280',
      tooltipBg: isDark ? 'oklch(0.205 0 0)' : '#ffffff',
      tooltipBorder: isDark ? 'oklch(1 0 0 / 10%)' : '#e5e7eb',
    }
  }, [theme])

  // --- 报告相关状态 ---
  const [reportState, setReportState] = useState<'idle' | 'loading' | 'report' | 'history'>('idle')
  const [reportContent, setReportContent] = useState('')
  const [reportError, setReportError] = useState('')
  const [savedReportId, setSavedReportId] = useState<string | null>(null)
  const [reportCreatedAt, setReportCreatedAt] = useState(() => new Date().toISOString())
  const reports = useReportStore((s) => s.reports)
  const addReport = useReportStore((s) => s.addReport)
  const deleteReport = useReportStore((s) => s.deleteReport)

  const [aiOpen, setAiOpen] = useState(false)
  const aiSystemPrompt = useMemo(() => {
    const data = getAllLearningData()
    return `你是 IELTS Tracker 的 AI 智能学习分析师。你是一位经验丰富的雅思备考教练，擅长分析学习数据并给出专业建议。

## 用户学习数据
${JSON.stringify(data, null, 2)}

## 你的职责
1. 分析用户的学习数据，找出强项和弱项
2. 评估当前计划完成进度，指出完成情况
3. 给出具体的、可操作的学习建议
4. 如果用户数据很少（刚开始使用），给出入门建议

## 重要限制
- 你只负责分析和建议，不负责创建学习计划
- 如果用户想要创建学习计划，请引导他们去「学习计划」页面使用 AI 生成功能
- 不要在回复中使用 [ACTION:create_plan] 标记

## 风格要求
- 用中文回复
- 语气友好、鼓励但不失专业
- 建议要具体，避免空泛的"多练习"
- 回复使用 Markdown 格式` }, [])

  // --- 生成报告（直接调用 streamAIChat，不通过 AIChatPanel）---
  const generateReport = async () => {
    setReportState('loading')
    setReportContent('')
    setReportError('')
    setSavedReportId(null)
    setReportCreatedAt(new Date().toISOString())

    const messages: AIMessage[] = [
      { role: 'system', content: aiSystemPrompt },
      { role: 'user', content: '请分析我的当前学习数据，包括各科目练习情况、计划完成进度、连续打卡情况，并给出具体的学习建议。' },
    ]

    let fullContent = ''
    await streamAIChat(messages, {
      onContent: (content) => {
        fullContent = content
      },
      onError: (err) => {
        setReportError(err)
        setReportState('idle')
      },
      onDone: () => {
        setReportContent(fullContent)
        setReportState('report')
      },
    })
  }

  // --- 报告相关回调 ---
  const handleSaveReport = () => {
    if (!reportContent) return
    const id = addReport({
      title: '学习分析报告',
      content: reportContent,
      createdAt: reportCreatedAt,
    })
    setSavedReportId(id)
  }

  const handleOpenHistoryReport = (content: string, createdAt: string) => {
    setReportContent(content)
    setReportCreatedAt(createdAt)
    setSavedReportId(null)
    setReportError('')
    setReportState('history')
    setAiOpen(true)
  }

  const handleDeleteReport = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteReport(id)
  }

  // --- 热力图数据（最近12周，CSS Grid）---
  // 生成最近 12 周 (84 天) 的所有日期，从周一开始排列
  // 返回：7 行 x N 列的网格数据 + 月份标签
  const heatmapData = useMemo(() => {
    const today = new Date()
    const startDate = startOfWeek(subDays(today, 83), { weekStartsOn: 1 })

    // 收集所有日期
    const allDays = eachDayOfInterval({ start: startDate, end: today })

    // 按周分组（每 7 天一组）
    const weeks: Array<Array<{ date: string; value: number; level: number | null }>> = []
    for (let i = 0; i < allDays.length; i += 7) {
      const weekSlice = allDays.slice(i, i + 7)
      weeks.push(
        weekSlice.map((day) => {
          const dateStr = formatDate(day)
          const value = streakData.heatmapData[dateStr] || 0
          return { date: dateStr, value, level: getHeatmapLevel(value) }
        })
      )
    }

    // 确保最后一周补齐 7 天（null 表示未来日期）
    const lastWeek = weeks[weeks.length - 1]
    if (lastWeek && lastWeek.length < 7) {
      while (lastWeek.length < 7) {
        const nextDate = new Date(
          new Date(lastWeek[lastWeek.length - 1].date).getTime() + 86400000
        )
        lastWeek.push({ date: formatDate(nextDate), value: 0, level: null })
      }
    }

    // 月份标签：记录每列首日的月份
    const monthLabels: Array<{ colIndex: number; label: string; span: number }> = []
    let currentMonth = ''
    let monthStart = 0

    for (let w = 0; w < weeks.length; w++) {
      if (weeks[w].length === 0) continue
      const firstDate = new Date(weeks[w][0].date)
      const month = format(firstDate, 'yyyy-MM')
      if (month !== currentMonth) {
        if (currentMonth !== '') {
          monthLabels.push({
            colIndex: monthStart,
            label: format(new Date(currentMonth + '-01'), 'M月'),
            span: w - monthStart,
          })
        }
        currentMonth = month
        monthStart = w
      }
    }
    // 最后一个月
    if (currentMonth !== '') {
      monthLabels.push({
        colIndex: monthStart,
        label: format(new Date(currentMonth + '-01'), 'M月'),
        span: weeks.length - monthStart,
      })
    }

    return { weeks: weeks.slice(-12), monthLabels }
  }, [streakData.heatmapData])

  // --- 单词背诵趋势（最近30天）---
  const wordTrend = useMemo(() => {
    const today = new Date()
    const trend: Array<{ date: string; count: number; label: string }> = []

    for (let i = 29; i >= 0; i--) {
      const date = subDays(today, i)
      const dateStr = formatDate(date)
      const dayCount = wordRecords
        .filter((r) => r.date === dateStr)
        .reduce((sum, r) => sum + r.count, 0)
      trend.push({
        date: dateStr,
        count: dayCount,
        label: formatShortDate(date),
      })
    }

    return trend
  }, [wordRecords])

  // --- 四科能力雷达图 ---
  const radarData = useMemo(() => {
    const types: PracticeType[] = ['reading', 'listening', 'writing', 'speaking']

    return types.map((type) => {
      const typeRecords = practiceRecords.filter((r) => r.type === type)
      const scoredRecords = typeRecords.filter((r) => r.score !== undefined && r.score > 0)

      const avgScore =
        scoredRecords.length > 0
          ? scoredRecords.reduce((sum, r) => sum + (r.score ?? 0), 0) / scoredRecords.length
          : 0

      return {
        subject: SKILL_LABELS[type],
        fullMark: 9,
        score: Math.round(avgScore * 10) / 10,
        color: CHART_COLORS.skill[type],
      }
    })
  }, [practiceRecords])

  const hasRadarData = useMemo(() => {
    return radarData.some((d) => d.score > 0)
  }, [radarData])

  // --- 学习时长分布（最近7天）---
  const durationData = useMemo(() => {
    const today = new Date()
    const data: Array<{ date: string; duration: number; label: string }> = []

    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i)
      const dateStr = formatDate(date)
      const dayDuration = practiceRecords
        .filter((r) => r.date === dateStr)
        .reduce((sum, r) => sum + r.duration, 0)
      const dayTimerDuration = timerRecords
        .filter((r) => r.date === dateStr)
        .reduce((sum, r) => sum + Math.floor(r.duration / 60), 0)
      data.push({
        date: dateStr,
        duration: dayDuration + dayTimerDuration,
        label: format(date, 'EEE', { locale: zhCN }),
      })
    }

    return data
  }, [practiceRecords, timerRecords])

  const hasDurationData = useMemo(() => {
    return durationData.some((d) => d.duration > 0)
  }, [durationData])

  // --- 单词分类饼图 ---
  const categoryPieData = useMemo(() => {
    const categoryMap: Record<string, number> = {}

    for (const record of wordRecords) {
      const categoryName = record.category || '未分类'
      categoryMap[categoryName] = (categoryMap[categoryName] || 0) + record.count
    }

    return Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [wordRecords])

  const hasPieData = useMemo(() => {
    return categoryPieData.length > 0
  }, [categoryPieData])

  return (
    <div className="space-y-5 md:space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-[22px] md:text-2xl font-bold tracking-tight">数据统计</h1>
        <p className="mt-1 text-[13px] md:text-sm text-muted-foreground">可视化你的学习数据与进步趋势</p>
      </div>

      {/* 连续打卡统计区 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {/* 当前连续天数 */}
        <div className="relative overflow-hidden rounded-xl p-4 md:p-5 shadow-sm bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 border border-orange-200/50 dark:border-orange-800/30">
          <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-orange-200/40 dark:bg-orange-700/20 blur-lg" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/40">
              <Flame className="h-5 w-5 md:h-6 md:w-6 text-orange-500 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-[13px] md:text-sm text-orange-700/70 dark:text-orange-300/60">当前连续天数</p>
              <p className="text-2xl md:text-3xl font-bold text-orange-600 dark:text-orange-400">{streakData.currentStreak}</p>
            </div>
          </div>
        </div>

        {/* 最长连续天数 */}
        <div className="relative overflow-hidden rounded-xl p-4 md:p-5 shadow-sm bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/20 border border-indigo-200/50 dark:border-indigo-800/30">
          <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-indigo-200/40 dark:bg-indigo-700/20 blur-lg" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
              <Trophy className="h-5 w-5 md:h-6 md:w-6 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-[13px] md:text-sm text-indigo-700/70 dark:text-indigo-300/60">最长连续天数</p>
              <p className="text-2xl md:text-3xl font-bold text-indigo-600 dark:text-indigo-400">{streakData.longestStreak}</p>
            </div>
          </div>
        </div>

        {/* 总学习天数 */}
        <div className="relative overflow-hidden rounded-xl p-4 md:p-5 shadow-sm bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/20 border border-blue-200/50 dark:border-blue-800/30">
          <div className="absolute -right-3 -top-3 h-14 w-14 rounded-full bg-blue-200/40 dark:bg-blue-700/20 blur-lg" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
              <CalendarDays className="h-5 w-5 md:h-6 md:w-6 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[13px] md:text-sm text-blue-700/70 dark:text-blue-300/60">总学习天数</p>
              <p className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">{totalStudyDays}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 学习热力图 */}
      <Card className="ring-1 ring-indigo-500/15">
        <CardHeader>
          <CardTitle className="text-[15px] md:text-base flex items-center gap-2">
            <div className="h-1.5 w-6 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
            学习热力图
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-1 px-1">
            {/* CSS Grid 热力图：左列星期标签 + 右侧网格 */}
            <div className="grid gap-[3px]"
              style={{
                gridTemplateColumns: '1.5rem auto',
                gridTemplateRows: 'auto auto auto',
                minWidth: '280px',
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
                      width: `${ml.span * 1.125}rem`, // span * (1rem cell + 0.125rem gap)
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
                    return <div key={rowIdx} className="h-[0.875rem] md:h-[1rem]" />
                  }
                  return (
                    <div
                      key={rowIdx}
                      className="flex h-[0.875rem] md:h-[1rem] items-center text-[11px] md:text-[10px] leading-none text-muted-foreground"
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
                  gridTemplateColumns: `repeat(${heatmapData.weeks.length}, 0.875rem)`,
                  gridTemplateRows: 'repeat(7, 0.875rem)',
                }}
              >
                {/* 逐行逐列填入方块：row 0..6 = Mon..Sun */}
                {Array.from({ length: 7 }, (_, rowIdx) =>
                  heatmapData.weeks.map((week, colIdx) => {
                    const day = week[rowIdx]
                    if (!day || day.level === null) {
                      return <div key={`${colIdx}-${rowIdx}`} className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem]" />
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
                        className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px] transition-colors"
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
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-0)' }} />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-1)' }} />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-2)' }} />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-3)' }} />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: 'var(--heatmap-level-4)' }} />
                <span>多</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 图表区域：折线图 + 柱状图 */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
        {/* 单词背诵趋势 */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] md:text-base">单词背诵趋势（近30天）</CardTitle>
          </CardHeader>
          <CardContent>
            {wordTrend.some((d) => d.count > 0) ? (
              <div className="h-[220px] md:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={wordTrend}>
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
                      angle={0}
                      interval={6}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartColors.tick }}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip bgColor={chartColors.tooltipBg} borderColor={chartColors.tooltipBorder} />} />
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
              </div>
            ) : (
              <EmptyState scene="wordTrend" title="暂无单词背诵数据" description="开始背单词，你的进步趋势将在这里展示" />
            )}
          </CardContent>
        </Card>

        {/* 学习时长分布 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] md:text-base">学习时长分布（近7天）</CardTitle>
          </CardHeader>
          <CardContent>
            {hasDurationData ? (
              <div className="h-[220px] md:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData} barCategoryGap="20%">
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
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartColors.tick }}
                      allowDecimals={false}
                      unit="分"
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip bgColor={chartColors.tooltipBg} borderColor={chartColors.tooltipBorder} />} />
                    <Bar
                      dataKey="duration"
                      name="时长（分钟）"
                      fill="url(#durationGradient)"
                      radius={[8, 8, 0, 0]}
                      barSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState scene="durationChart" title="暂无学习时长数据" description="开始练习，你的学习时长将在这里展示" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 图表区域：雷达图 + 饼图 */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
        {/* 四科能力雷达图 */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] md:text-base">四科能力雷达图</CardTitle>
          </CardHeader>
          <CardContent>
            {hasRadarData ? (
              <div className="h-[260px] md:h-[320px]">
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
                    <Tooltip content={<CustomTooltip bgColor={chartColors.tooltipBg} borderColor={chartColors.tooltipBorder} />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState scene="radarChart" title="暂无评分数据" description="完成练习并打分，你的能力雷达图将在这里展示" />
            )}
          </CardContent>
        </Card>

        {/* 单词分类饼图 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] md:text-base">单词分类占比</CardTitle>
          </CardHeader>
          <CardContent>
            {hasPieData ? (
              <div className="h-[260px] md:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      cx="40%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
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
                      content={<CustomTooltip bgColor={chartColors.tooltipBg} borderColor={chartColors.tooltipBorder} />}
                      formatter={(value) => [`${value} 个`, '数量']}
                    />
                    <Legend
                      content={({ payload }) => (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
                          {payload?.map((entry, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                              <span>{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState scene="pieChart" title="暂无单词分类数据" description="开始分类背诵单词，分类占比将在这里展示" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI 智能分析浮动按钮（可拖动） */}
      <DraggableFloatButton onClick={() => {
        setReportState('loading')
        setReportContent('')
        setReportError('')
        setSavedReportId(null)
        setReportCreatedAt(new Date().toISOString())
        setAiOpen(true)
        generateReport()
      }} />

      {/* AI 智能分析弹窗 */}
      <Dialog open={aiOpen} onOpenChange={(open) => {
        if (!open) {
          setReportState('idle')
          setReportContent('')
          setReportError('')
          setSavedReportId(null)
        }
        setAiOpen(open)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
          {reportState === 'loading' && (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  AI 智能分析
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center px-5 py-16 gap-4">
                <AILoadingState text="AI 正在生成你的学习分析报告" className="text-base" />
                <p className="text-sm text-muted-foreground">
                  正在分析你的学习数据，这可能需要 10-20 秒
                </p>
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
                <Button variant="outline" size="sm" onClick={() => setAiOpen(false)}>
                  关闭
                </Button>
              </div>
            </>
          )}

          {(reportState === 'report' || reportState === 'history') && (
            <>
              <DialogHeader className="px-5 pt-5 pb-2">
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-violet-500" />
                  {reportState === 'history' ? '历史分析报告' : '学习分析报告'}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* 报告内容 */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-3 bg-white dark:bg-background">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      生成于 {new Date(reportCreatedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div className="prose prose-lg dark:prose-invert max-w-none">
                    <ReactMarkdown components={reportMarkdownComponents}>
                      {reportContent}
                    </ReactMarkdown>
                  </div>
                </div>
                {/* 底部按钮 */}
                <div className="border-t px-5 py-3 flex items-center gap-2">
                  <div className="flex-1" />
                  {reportState === 'report' && (
                    <Button
                      size="sm"
                      onClick={handleSaveReport}
                      disabled={!!savedReportId}
                      className="gap-1.5"
                    >
                      <Save className="h-4 w-4" />
                      {savedReportId ? '已保存' : '保存报告'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAiOpen(false)}
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

      {/* 历史分析报告 */}
      {reports.length > 0 && (
        <Card className="ring-1 ring-indigo-500/15">
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base flex items-center gap-2">
              <div className="h-1.5 w-6 rounded-full bg-gradient-to-r from-violet-400 to-indigo-400" />
              历史分析报告
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => handleOpenHistoryReport(report.content, report.createdAt)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-accent/50 cursor-pointer transition-colors group"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 shrink-0">
                    <FileText className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{report.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(report.createdAt).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    AI 分析
                  </Badge>
                  <button
                    onClick={(e) => handleDeleteReport(e, report.id)}
                    className="shrink-0 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive dark:text-muted-foreground dark:hover:text-destructive transition-colors"
                    aria-label="删除报告"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
