import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, subDays, differenceInDays } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { BookA, Clock, CheckCircle, Circle, Flame, CalendarDays, Star, BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useSettingsStore } from '@/stores/settingsStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { usePlanStore } from '@/stores/planStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useStreakStore } from '@/stores/streakStore'
import { BADGES, MOOD_OPTIONS, WEEKDAY_LABELS } from '@/lib/constants'
import type { Achievement } from '@/lib/types'

// ===== 激励语句 =====
const MOTIVATIONAL_QUOTES = [
  '每一天的努力，都在缩短你和目标之间的距离。',
  '坚持就是胜利，今天又是元气满满的一天!',
  '千里之行，始于足下。继续加油!',
  '哪怕每天只进步一点点，也是了不起的成长。',
  '你的坚持终将美好，今天也要全力以赴!',
  '成功不是将来才有的，而是从决定去做的那一刻起。',
  '今天的你，比昨天更接近梦想了。',
]

const todayStr = () => format(new Date(), 'yyyy-MM-dd')

export default function Dashboard() {
  // ===== Store selectors (stable references) =====
  const examDate = useSettingsStore((s) => s.examDate)
  const wordRecords = useWordStore((s) => s.records)
  const practiceRecords = usePracticeStore((s) => s.records)
  const plans = usePlanStore((s) => s.plans)
  const executions = usePlanStore((s) => s.executions)
  const addExecution = usePlanStore((s) => s.addExecution)
  const updateExecution = usePlanStore((s) => s.updateExecution)
  const diaryEntries = useDiaryStore((s) => s.entries)
  const unlockedBadges = useAchievementStore((s) => s.unlockedBadges)
  const achievementStore = useAchievementStore()
  const currentStreak = useStreakStore((s) => s.currentStreak)
  const heatmapData = useStreakStore((s) => s.heatmapData)

  // ===== 激励语句（每天固定一句） =====
  const todayQuote = useMemo(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    )
    return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length]
  }, [])

  // ===== 今日日期（中文格式） =====
  const todayFormatted = useMemo(
    () => format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhCN }),
    []
  )

  // ===== 今日数据 =====
  const today = todayStr()

  const todayWordCount = useMemo(
    () => wordRecords.filter((r) => r.date === today).reduce((sum, r) => sum + r.count, 0),
    [wordRecords, today]
  )

  const todayPracticeMinutes = useMemo(
    () => practiceRecords.filter((r) => r.date === today).reduce((sum, r) => sum + r.duration, 0),
    [practiceRecords, today]
  )

  const todayCompletedTasks = useMemo(
    () => executions.filter((e) => e.date === today && e.isCompleted).length,
    [executions, today]
  )

  // ===== 今日待办 =====
  const todayPlans = useMemo(() => {
    const dayOfWeek = new Date().getDay()
    const activePlans = plans.filter((p) => {
      if (!p.isActive) return false
      if (p.frequency === 'daily') return true
      if (p.frequency === 'weekly') return p.weekDays?.includes(dayOfWeek)
      return false
    })
    const todayExecs = executions.filter((e) => e.date === today)
    return activePlans.slice(0, 5).map((plan) => {
      const exec = todayExecs.find((e) => e.planId === plan.id)
      return {
        id: plan.id,
        title: plan.title,
        completed: exec?.isCompleted ?? false,
        execId: exec?.id,
      }
    })
  }, [plans, executions, today])

  const togglePlanComplete = (planId: string, execId?: string) => {
    if (execId) {
      const exec = executions.find((e) => e.id === execId)
      if (exec) {
        updateExecution(execId, { isCompleted: !exec.isCompleted })
      }
    } else {
      addExecution({ planId, date: today, isCompleted: true })
    }
  }

  // ===== 考试倒计时 =====
  const examCountdown = useMemo(() => {
    if (!examDate) return null
    const exam = new Date(examDate)
    const now = new Date()
    const daysLeft = differenceInDays(exam, now)
    if (daysLeft < 0) return { daysLeft: 0, progress: 100, color: 'bg-red-500' }
    const startDate = subDays(exam, 90)
    const totalDays = 90
    const elapsed = differenceInDays(now, startDate)
    const progress = Math.min(100, Math.max(0, (elapsed / totalDays) * 100))
    let color = 'bg-green-500'
    if (daysLeft <= 7) color = 'bg-red-500'
    else if (daysLeft <= 30) color = 'bg-orange-500'
    return { daysLeft, progress, color }
  }, [examDate])

  // ===== 最近35天热力图 =====
  const heatmapCells = useMemo(() => {
    const cells: { date: string; level: number; isToday: boolean }[] = []
    for (let i = 34; i >= 0; i--) {
      const d = subDays(new Date(), i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const isToday = i === 0
      const activity = heatmapData[dateStr] ?? 0
      let level = 0
      if (activity >= 4) level = 4
      else if (activity >= 3) level = 3
      else if (activity >= 2) level = 2
      else if (activity >= 1) level = 1
      cells.push({ date: dateStr, level, isToday })
    }
    return cells
  }, [heatmapData])

  // ===== 最近成就（最多3个） =====
  const recentAchievements = useMemo(() => {
    return unlockedBadges
      .map((id) => BADGES.find((b) => b.id === id))
      .filter((b): b is Achievement => !!b)
      .slice(0, 3)
  }, [unlockedBadges])

  // ===== 最近日记（最新1条） =====
  const latestDiary = useMemo(() => {
    if (diaryEntries.length === 0) return null
    const sorted = [...diaryEntries].sort((a, b) => b.date.localeCompare(a.date))
    const entry = sorted[0]
    const mood = MOOD_OPTIONS.find((m) => m.value === entry.mood)
    return {
      date: entry.date,
      moodEmoji: mood?.emoji ?? '',
      moodLabel: mood?.label ?? '',
      contentPreview: entry.content.length > 60 ? entry.content.slice(0, 60) + '...' : entry.content,
    }
  }, [diaryEntries])

  // ===== 等级和经验值 =====
  const levelInfo = useMemo(() => {
    const current = achievementStore.getCurrentLevel()
    const progress = achievementStore.getXPProgress()
    return { ...current, xpProgress: progress }
  }, [achievementStore])

  // ===== 热力图颜色 =====
  // Indigo 体系（与主色统一）
  const heatmapColors = [
    'bg-indigo-50 dark:bg-indigo-950/50',
    'bg-indigo-100 dark:bg-indigo-900/60',
    'bg-indigo-300 dark:bg-indigo-700/70',
    'bg-indigo-500 dark:bg-indigo-500',
    'bg-indigo-700 dark:bg-indigo-300',
  ]

  // ===== 时间感知问候语 =====
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了'
    if (hour < 12) return '早上好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }, [])

  return (
    <div className="space-y-5 md:space-y-6">
      {/* ===== 1. 欢迎横幅 ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 p-6 md:p-8 text-white shadow-lg">
        {/* 装饰性背景圆形 */}
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -right-4 bottom-0 h-24 w-24 rounded-full bg-white/5 blur-xl" />
        <div className="absolute left-1/2 -top-4 h-20 w-20 rounded-full bg-violet-400/20 blur-lg" />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{greeting}</h1>
              <p className="mt-1 text-[15px] md:text-base text-indigo-100">{todayFormatted}</p>
            </div>
          </div>
          <p className="mt-3 text-[13px] md:text-sm text-indigo-200 italic leading-relaxed max-w-lg">
            {todayQuote}
          </p>
          {/* 今日快速概览 */}
          <div className="mt-4 flex gap-4 md:gap-6">
            <div className="flex items-center gap-1.5 text-[13px] md:text-sm">
              <BookA className="h-4 w-4 text-amber-300" />
              <span className="text-indigo-100">背词 <strong className="text-white">{todayWordCount}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px] md:text-sm">
              <Clock className="h-4 w-4 text-amber-300" />
              <span className="text-indigo-100">学习 <strong className="text-white">{todayPracticeMinutes}min</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px] md:text-sm">
              <Flame className="h-4 w-4 text-amber-300" />
              <span className="text-indigo-100">连续 <strong className="text-white">{currentStreak}天</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 2. 考试倒计时 ===== */}
      {examCountdown && (
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <CalendarDays className="h-5 w-5 text-indigo-500" />
                <CardTitle className="text-[15px] md:text-base">考试倒计时</CardTitle>
              </div>
              <span
                className={`text-3xl md:text-4xl font-bold ${
                  examCountdown.daysLeft <= 7
                    ? 'text-red-500'
                    : examCountdown.daysLeft <= 30
                      ? 'text-orange-500'
                      : 'text-green-500'
                }`}
              >
                {examCountdown.daysLeft}
              </span>
            </div>
            <p className="text-[13px] md:text-sm text-muted-foreground mt-2">
              距离考试还有 {examCountdown.daysLeft} 天
            </p>
            <div className="mt-3 h-2 w-full rounded-full bg-indigo-100 dark:bg-indigo-900/50">
              <div
                className={`h-full rounded-full transition-all ${examCountdown.color}`}
                style={{ width: `${examCountdown.progress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 3. 今日概览 ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          icon={<BookA className="h-5 w-5 text-indigo-500" />}
          value={todayWordCount}
          label="今日背词"
          accentBg="bg-indigo-50 dark:bg-indigo-950/40"
          accentBorder="border-l-indigo-400"
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          value={`${todayPracticeMinutes}min`}
          label="学习时长"
          accentBg="bg-amber-50 dark:bg-amber-950/40"
          accentBorder="border-l-amber-400"
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
          value={todayCompletedTasks}
          label="完成任务"
          accentBg="bg-emerald-50 dark:bg-emerald-950/40"
          accentBorder="border-l-emerald-400"
        />
        <StatCard
          icon={<Flame className="h-5 w-5 text-orange-500" />}
          value={currentStreak}
          label="连续天数"
          accentBg="bg-orange-50 dark:bg-orange-950/40"
          accentBorder="border-l-orange-400"
        />
      </div>

      {/* ===== 4. 今日待办 + 5. 热力图 ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 今日待办 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">今日待办</CardTitle>
          </CardHeader>
          <CardContent>
            {todayPlans.length === 0 ? (
              <EmptyState
                scene="tasks"
                title="今天没有待办任务"
                description="去「学习计划」页面创建你的第一个学习计划吧"
              />
          ) : (
            <div className="space-y-2">
              {todayPlans.map((plan, index) => (
                <button
                  key={plan.id}
                  onClick={() => togglePlanComplete(plan.id, plan.execId)}
                  className={`animate-stagger-up stagger-${index + 1} flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-all ${
                    plan.completed
                      ? 'bg-green-50 dark:bg-green-900/30'
                      : 'hover:bg-accent'
                  }`}
                >
                  {plan.completed ? (
                    <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={plan.completed ? 'line-through text-muted-foreground' : ''}>
                    {plan.title}
                  </span>
                </button>
              ))}
            </div>
          )}
            <Link
              to="/plans"
              className="text-[15px] text-primary hover:underline mt-3 inline-block"
            >
              查看全部计划 &rarr;
            </Link>
          </CardContent>
        </Card>

        {/* 热力图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">最近活跃度</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 md:gap-1.5">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="text-xs md:text-xs text-muted-foreground text-center mb-1"
                >
                  {label}
                </div>
              ))}
              {heatmapCells.map((cell) => (
                <div
                  key={cell.date}
                  title={`${cell.date}: ${cell.level > 0 ? '有学习记录' : '无记录'}`}
                  className={`aspect-square rounded-sm ${heatmapColors[cell.level]} ${
                    cell.isToday ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
                  } transition-colors`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== 6. 最近成就 + 8. 等级经验值 ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 最近成就 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">最近成就</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAchievements.length === 0 ? (
              <EmptyState
                scene="achievements"
                title="还没有解锁任何成就"
                description="坚持学习，完成每日任务来解锁你的第一个成就!"
              />
            ) : (
              <div className="flex gap-3 md:gap-4 flex-wrap">
                {recentAchievements.map((badge, index) => (
                  <div
                    key={badge.id}
                    className={`animate-stagger-up stagger-${index + 1} flex flex-col items-center gap-1.5 p-2 md:p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 min-w-[72px] md:min-w-[80px]`}
                  >
                    <span className="text-xl md:text-2xl">{badge.icon}</span>
                    <span className="text-xs font-medium text-center">{badge.name}</span>
                  </div>
                ))}
              </div>
            )}
            <Link
              to="/achievements"
              className="text-[15px] text-primary hover:underline mt-3 inline-block"
            >
              查看全部成就 &rarr;
            </Link>
          </CardContent>
        </Card>

        {/* 等级和经验值 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] md:text-base">等级与经验</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                <Star className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <div className="font-semibold text-[15px] md:text-base">
                  Lv.{levelInfo.level} {levelInfo.name}
                </div>
                <div className="text-[13px] text-muted-foreground">
                  {levelInfo.xpProgress.current} XP
                  {levelInfo.xpProgress.required !== levelInfo.xpProgress.current &&
                    ` / ${levelInfo.xpProgress.required} XP`}
                </div>
              </div>
            </div>
            <div className="h-2 md:h-2.5 w-full rounded-full bg-indigo-100 dark:bg-indigo-900/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all"
                style={{
                  width: `${Math.min(100, levelInfo.xpProgress.percentage)}%`,
                }}
              />
            </div>
            <p className="text-[13px] text-muted-foreground mt-1.5">
              {levelInfo.xpProgress.percentage >= 100
                ? '已达到最高等级!'
                : `距离下一等级还需 ${Math.max(0, levelInfo.xpProgress.required - levelInfo.xpProgress.current)} XP`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ===== 7. 最近学习日记 ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px] md:text-base">最近学习日记</CardTitle>
        </CardHeader>
        <CardContent>
          {latestDiary ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                <span>{format(new Date(latestDiary.date), 'yyyy年M月d日', { locale: zhCN })}</span>
                <span>
                  {latestDiary.moodEmoji} {latestDiary.moodLabel}
                </span>
              </div>
              <p className="text-[15px]">{latestDiary.contentPreview}</p>
            </div>
          ) : (
            <EmptyState
              scene="diary"
              title="还没有写过学习日记"
              description="记录每天的学习感悟，回顾时会发现成长的轨迹"
            />
          )}
          <Link
            to="/diary"
            className="text-[15px] text-primary hover:underline mt-3 inline-block"
          >
            查看全部日记 &rarr;
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

// ===== 小统计卡片 =====
function StatCard({
  icon,
  value,
  label,
  accentBg = 'bg-indigo-50 dark:bg-indigo-950/40',
  accentBorder = 'border-l-indigo-400',
}: {
  icon: React.ReactNode
  value: number | string
  label: string
  accentBg?: string
  accentBorder?: string
}) {
  return (
    <Card size="sm" className={`border-l-2 ${accentBorder}`}>
      <CardContent className="flex items-center gap-2.5 md:gap-3 py-3.5 px-3.5 md:px-4">
        <div className={`flex h-9 w-9 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg ${accentBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-lg md:text-lg font-bold leading-tight">{value}</div>
          <div className="text-[13px] md:text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}
