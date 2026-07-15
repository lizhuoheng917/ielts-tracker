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
import { useStreakStore } from '@/stores/streakStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { WEEKDAY_LABELS } from '@/lib/constants'
import type { PracticeType } from '@/lib/types'

// ===== 颜色常量 =====
const PURPLE_COLORS = {
  100: '#F3F0FF',
  200: '#DDD8FF',
  300: '#A9AEFF',
  400: '#6F6FFF',
  500: '#4B3FE3',
  600: '#3C2ECA',
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

const PIE_COLORS = [PURPLE_COLORS[500], PURPLE_COLORS[400], PURPLE_COLORS[300], PURPLE_COLORS[200], PURPLE_COLORS[600]]

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
    <div className="flex h-full items-center justify-center text-xs md:text-sm text-muted-foreground px-4 text-center">
      {text}
    </div>
  )
}

// ===== 自定义 Tooltip =====
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-sm text-xs md:text-sm">
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

  // --- Store 数据（使用 stable selector）---
  const streakData = useStreakStore((s) => s)
  const wordRecords = useWordStore((s) => s.records)
  const practiceRecords = usePracticeStore((s) => s.records)

  // --- 总学习天数 ---
  const totalStudyDays = useMemo(() => {
    return Object.keys(streakData.heatmapData).length
  }, [streakData.heatmapData])

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
      data.push({
        date: dateStr,
        duration: dayDuration,
        label: format(date, 'EEE', { locale: zhCN }),
      })
    }

    return data
  }, [practiceRecords])

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
        <h1 className="text-xl md:text-2xl font-bold">数据统计</h1>
        <p className="mt-1 text-xs md:text-sm text-muted-foreground">可视化你的学习数据</p>
      </div>

      {/* 连续打卡统计区 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-500">
              <Flame className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">当前连续天数</p>
              <p className="text-xl md:text-2xl font-bold">{streakData.currentStreak}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-500">
              <Trophy className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">最长连续天数</p>
              <p className="text-xl md:text-2xl font-bold">{streakData.longestStreak}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-500">
              <CalendarDays className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">总学习天数</p>
              <p className="text-xl md:text-2xl font-bold">{totalStudyDays}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 学习热力图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base">学习热力图</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-1 px-1">
            {/* CSS Grid 热力图：左列星期标签 + 右侧网格 */}
            <div
              className="grid gap-[3px]"
              style={{
                gridTemplateColumns: '1.5rem auto',
                gridTemplateRows: 'auto 1fr auto',
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
                    className="text-[11px] md:text-xs text-muted-foreground"
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
                      className="flex h-[0.875rem] md:h-[1rem] items-center text-[10px] md:text-[10px] leading-none text-muted-foreground"
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
                    if (!day || day.level === null) return <div key={`${colIdx}-${rowIdx}`} />
                    const levelColors = [
                      'bg-muted',
                      PURPLE_COLORS[100],
                      PURPLE_COLORS[300],
                      PURPLE_COLORS[400],
                      PURPLE_COLORS[600],
                    ]
                    return (
                      <div
                        key={`${colIdx}-${rowIdx}`}
                        className="rounded-[3px] transition-colors"
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
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px] bg-muted" />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: PURPLE_COLORS[100] }} />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: PURPLE_COLORS[300] }} />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: PURPLE_COLORS[400] }} />
                <div className="h-[0.875rem] w-[0.875rem] md:h-[1rem] md:w-[1rem] rounded-[3px]" style={{ backgroundColor: PURPLE_COLORS[600] }} />
                <span>多</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 图表区域：折线图 + 柱状图 */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* 单词背诵趋势 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm md:text-base">单词背诵趋势（近30天）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] md:h-[250px]">
              {wordTrend.some((d) => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={wordTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      interval={6}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="背诵量"
                      stroke={PURPLE_COLORS[500]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: PURPLE_COLORS[500] }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartTip text="暂无单词背诵数据，开始背单词吧" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* 学习时长分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm md:text-base">学习时长分布（近7天）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] md:h-[250px]">
              {hasDurationData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      allowDecimals={false}
                      unit="分"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="duration"
                      name="时长（分钟）"
                      fill={PURPLE_COLORS[500]}
                      radius={[4, 4, 0, 0]}
                      barSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartTip text="暂无学习时长数据，开始练习吧" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 图表区域：雷达图 + 饼图 */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* 四科能力雷达图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm md:text-base">四科能力雷达图</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] md:h-[300px]">
              {hasRadarData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                    />
                    <Radar
                      name="平均分"
                      dataKey="score"
                      stroke={PURPLE_COLORS[500]}
                      fill={PURPLE_COLORS[300]}
                      fillOpacity={0.5}
                      strokeWidth={2}
                    />
                    <Tooltip content={<CustomTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartTip text="暂无评分数据，完成练习并打分后将展示" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* 单词分类饼图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm md:text-base">单词分类占比</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] md:h-[300px]">
              {hasPieData ? (
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
                      labelLine={{ stroke: '#d1d5db' }}
                    >
                      {categoryPieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${value} 个`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChartTip text="暂无单词数据，开始背诵单词吧" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
