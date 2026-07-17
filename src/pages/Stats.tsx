import { useMemo, useEffect } from 'react'
import { format, subDays, startOfWeek, eachDayOfInterval } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Flame, Trophy, CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { WEEKDAY_LABELS } from '@/lib/constants'
import type { PracticeType } from '@/lib/types'

// ===== 颜色常量 =====
const INDIGO_COLORS = {
  100: '#EEF2FF',
  200: '#E0E7FF',
  300: '#A5B4FC',
  400: '#818CF8',
  500: '#6366F1',
  600: '#4F46E5',
}

const SKILL_COLORS: Record<PracticeType, string> = {
  reading: '#3B82F6',
  listening: '#8B5CF6',
  writing: '#F59E0B',
  speaking: '#10B981',
}

const SKILL_LABELS: Record<PracticeType, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
}

const PIE_COLORS = [INDIGO_COLORS[500], INDIGO_COLORS[400], INDIGO_COLORS[300], INDIGO_COLORS[200], INDIGO_COLORS[600]]

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

// ===== 空数据占位组件 =====
function EmptyChartTip({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-[13px] md:text-sm text-muted-foreground px-4 text-center">
      {text}
    </div>
  )
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
      className="rounded-lg border px-3 py-2 shadow-sm text-xs md:text-sm"
      style={{ backgroundColor: bgColor, borderColor }}
    >
      <p className="font-medium">{label}</p>
      {payload.map((item, i) => (
        <p key={i} style={{ color: item.color }}>
          {item.name}: {item.value}
        </p>
      ))}
    </div>
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
        color: SKILL_COLORS[type],
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
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">单词背诵趋势（近30天）</CardTitle>
          </CardHeader>
          <CardContent>
            {wordTrend.some((d) => d.count > 0) ? (
              <div className="h-[200px] md:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={wordTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: chartColors.tick }}
                      interval={6}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartColors.tick }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip bgColor={chartColors.tooltipBg} borderColor={chartColors.tooltipBorder} />} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="背诵量"
                      stroke={INDIGO_COLORS[500]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: INDIGO_COLORS[500] }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState scene="wordTrend" title="暂无单词背诵数据" description="开始背单词，你的进步趋势将在这里展示" />
            )}
          </CardContent>
        </Card>

        {/* 学习时长分布 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">学习时长分布（近7天）</CardTitle>
          </CardHeader>
          <CardContent>
            {hasDurationData ? (
              <div className="h-[200px] md:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: chartColors.tick }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartColors.tick }}
                      allowDecimals={false}
                      unit="分"
                    />
                    <Tooltip content={<CustomTooltip bgColor={chartColors.tooltipBg} borderColor={chartColors.tooltipBorder} />} />
                    <Bar
                      dataKey="duration"
                      name="时长（分钟）"
                      fill={INDIGO_COLORS[500]}
                      radius={[6, 6, 0, 0]}
                      barSize={32}
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
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">四科能力雷达图</CardTitle>
          </CardHeader>
          <CardContent>
            {hasRadarData ? (
              <div className="h-[260px] md:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
                    <PolarGrid stroke={chartColors.grid} />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 11, fill: chartColors.label }}
                    />
                    <Radar
                      name="平均分"
                      dataKey="score"
                      stroke={INDIGO_COLORS[500]}
                      fill={INDIGO_COLORS[300]}
                      fillOpacity={0.5}
                      strokeWidth={2}
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
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">单词分类占比</CardTitle>
          </CardHeader>
          <CardContent>
            {hasPieData ? (
              <div className="h-[240px] md:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) =>
                        `${name} ${(percent && typeof percent === 'number' ? percent * 100 : 0).toFixed(0)}%`
                      }
                      labelLine={{ stroke: chartColors.label }}
                    >
                      {categoryPieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<CustomTooltip bgColor={chartColors.tooltipBg} borderColor={chartColors.tooltipBorder} />}
                      formatter={(value) => [`${value} 个`, '']}
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
    </div>
  )
}
