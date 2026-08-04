import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookA,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Flame,
  ListChecks,
  ListTodo,
  Sparkles,
  Star,
} from 'lucide-react'

import { AiSuggestionDialog } from '@/components/ai/AiSuggestionDialog'
import {
  learnerAiTaskCoordinator,
  learnerAiTaskKey,
  learnerAiTaskScopeKey,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { AchievementMark } from '@/components/achievements/achievement-mark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { MetricGroup } from '@/components/ui/metric-group'
import { SectionHeader } from '@/components/ui/section-header'
import { BADGES, LEVELS, MOOD_OPTIONS, PLAN_CATEGORY_OPTIONS, WEEKDAY_LABELS } from '@/lib/constants'
import { isLocalDate, parseLocalDate, toLocalDate } from '@/lib/localDate'
import { indexLatestPlanExecutionsForDate, isPlanScheduledForDate } from '@/lib/planView'
import { getActivityLevel, getDateRangeSummary } from '@/lib/statsAnalytics'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievementStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'
import { useTimerStore } from '@/stores/timerStore'
import { useWordStore } from '@/stores/wordStore'
import type { Achievement } from '@/lib/types'

const MOTIVATIONAL_QUOTES = [
  '每一天的努力，都在缩短你和目标之间的距离。',
  '坚持就是胜利，今天又是元气满满的一天！',
  '千里之行，始于足下。继续加油！',
  '哪怕每天只进步一点点，也是了不起的成长。',
  '你的坚持终将美好，今天也要全力以赴！',
  '成功不是将来才有的，而是从决定去做的那一刻起。',
  '今天的你，比昨天更接近梦想了。',
]

const HEATMAP_COLORS = [
  'var(--heatmap-level-0)',
  'var(--heatmap-level-1)',
  'var(--heatmap-level-2)',
  'var(--heatmap-level-3)',
  'var(--heatmap-level-4)',
] as const

const BADGE_BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]))

function ReportMetric({ value, label, tone }: { value: string | number; label: string; tone: string }) {
  return (
    <div className={cn('rounded-xl border p-3 text-center', tone)}>
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function formatPlanScheduleDate(value: string | undefined): string | null {
  if (!isLocalDate(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

function planScheduleLabel(plan: {
  frequency?: string
  scheduledDate?: string
  startDate?: string
  endDate?: string
  weekDays?: number[]
}): string {
  if (plan.frequency === 'once') {
    const scheduledDate = formatPlanScheduleDate(plan.scheduledDate)
    return scheduledDate ? `单次 · ${scheduledDate}` : '单次任务'
  }

  if (plan.frequency === 'daily' || plan.frequency === 'weekly') {
    const cadence = plan.frequency === 'daily'
      ? '每日'
      : [
          '每周',
          plan.weekDays
            ?.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            .map((day) => `周${WEEKDAY_LABELS[day]}`)
            .join('、'),
        ].filter(Boolean).join(' · ')
    const startDate = formatPlanScheduleDate(plan.startDate)
    const endDate = formatPlanScheduleDate(plan.endDate)
    const dateRange = [
      startDate ? `自 ${startDate} 起` : null,
      endDate ? `至 ${endDate}` : null,
    ].filter(Boolean).join('，')
    return `${cadence}${dateRange ? ` · ${dateRange}` : ''}`
  }

  return '旧版计划'
}

export default function Dashboard() {
  const artifactAccess = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(artifactAccess)
  const dailySuggestionTaskKey = scopeKey
    ? learnerAiTaskKey('daily_suggestion', scopeKey, 'dashboard')
    : null
  const { openRequestedTaskKey } = useLearnerAiTaskState()
  const examDate = useSettingsStore((state) => state.examDate)
  const showExamCountdown = useSettingsStore((state) => state.showExamCountdown)
  const showAiSuggestions = useSettingsStore((state) => state.showAiSuggestions)
  const lastCheckinDate = useSettingsStore((state) => state.lastCheckinDate)
  const checkIn = useSettingsStore((state) => state.checkIn)
  const wordRecords = useWordStore((state) => state.records)
  const practiceRecords = usePracticeStore((state) => state.records)
  const timerRecords = useTimerStore((state) => state.records)
  const plans = usePlanStore((state) => state.plans)
  const executions = usePlanStore((state) => state.executions)
  const setExecutionForDate = usePlanStore((state) => state.setExecutionForDate)
  const diaryEntries = useDiaryStore((state) => state.entries)
  const unlockedBadges = useAchievementStore((state) => state.unlockedBadges)
  const achievementLevel = useAchievementStore((state) => state.level)
  const totalXP = useAchievementStore((state) => state.totalXP)
  const displayXP = Math.max(totalXP, 0)
  const currentStreak = useStreakStore((state) => state.currentStreak)
  const heatmapData = useStreakStore((state) => state.heatmapData)

  const [reportOpen, setReportOpen] = useState(false)
  const [planDetailOpen, setPlanDetailOpen] = useState(false)
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false)
  const [planMutationError, setPlanMutationError] = useState('')
  const [mutatingPlanIds, setMutatingPlanIds] = useState<Set<string>>(new Set())
  const [selectedPlan, setSelectedPlan] = useState<{
    id: string
    title: string
    description?: string
    category?: string
    frequency?: string
    scheduledDate?: string
    startDate?: string
    endDate?: string
    weekDays?: number[]
    targetTime?: string
  } | null>(null)

  useEffect(() => {
    if (!dailySuggestionTaskKey || openRequestedTaskKey !== dailySuggestionTaskKey) return
    setAiSuggestionOpen(true)
    learnerAiTaskCoordinator.consumeOpenRequest(dailySuggestionTaskKey)
  }, [dailySuggestionTaskKey, openRequestedTaskKey])

  const today = toLocalDate()
  const checkedIn = lastCheckinDate === today

  const todayQuote = useMemo(() => {
    const now = new Date()
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
    return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length]
  }, [])

  const todayFormatted = useMemo(
    () => format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhCN }),
    [],
  )

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了'
    if (hour < 12) return '早上好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }, [])

  const analyticsInput = useMemo(
    () => ({ wordRecords, practiceRecords, timerRecords, planExecutions: executions }),
    [wordRecords, practiceRecords, timerRecords, executions],
  )

  const todaySummary = useMemo(
    () => getDateRangeSummary(analyticsInput, { startDate: today, endDate: today }),
    [analyticsInput, today],
  )

  const weekReport = useMemo(() => {
    const now = parseLocalDate(today)
    const summary = getDateRangeSummary(analyticsInput, {
      startDate: toLocalDate(startOfWeek(now, { weekStartsOn: 1 })),
      endDate: today,
    })
    return {
      words: summary.totalWords,
      minutes: summary.displayMinutes,
      completedTasks: summary.completedPlanCount,
    }
  }, [analyticsInput, today])

  const monthReport = useMemo(() => {
    const summary = getDateRangeSummary(analyticsInput, {
      startDate: toLocalDate(startOfMonth(parseLocalDate(today))),
      endDate: today,
    })
    return {
      words: summary.totalWords,
      minutes: summary.displayMinutes,
      completedTasks: summary.completedPlanCount,
    }
  }, [analyticsInput, today])

  const todayPlans = useMemo(() => {
    const todayExecutionMap = indexLatestPlanExecutionsForDate(executions, today)

    return plans
      .filter((plan) => isPlanScheduledForDate(plan, today))
      .map((plan) => {
        const execution = todayExecutionMap.get(plan.id)
        return {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          category: plan.category,
          frequency: plan.frequency,
          scheduledDate: plan.scheduledDate,
          startDate: plan.startDate,
          endDate: plan.endDate,
          weekDays: plan.weekDays,
          targetTime: plan.targetTime,
          completed: execution?.isCompleted ?? false,
          execId: execution?.id,
        }
      })
  }, [executions, plans, today])

  const visibleTodayPlans = todayPlans.slice(0, 5)
  const completedTodayCount = todayPlans.filter((plan) => plan.completed).length
  const remainingTodayCount = todayPlans.length - completedTodayCount

  const togglePlanComplete = async (planId: string) => {
    if (mutatingPlanIds.has(planId)) return
    const execution = indexLatestPlanExecutionsForDate(executions, today).get(planId)
    setMutatingPlanIds((current) => new Set(current).add(planId))
    setPlanMutationError('')
    try {
      const result = await setExecutionForDate({
        planId,
        date: today,
        isCompleted: !(execution?.isCompleted ?? false),
      })
      if (result.status === 'busy' || result.status === 'failed') {
        setPlanMutationError(result.error?.message || '计划状态暂时无法保存，请重试。')
      }
    } finally {
      setMutatingPlanIds((current) => {
        const next = new Set(current)
        next.delete(planId)
        return next
      })
    }
  }

  const showPlanDetail = (plan: (typeof todayPlans)[number]) => {
    setSelectedPlan(plan)
    setPlanDetailOpen(true)
  }

  const examCountdown = useMemo(() => {
    if (!examDate) return null
    const exam = parseLocalDate(examDate)
    const now = new Date()
    const daysLeft = differenceInCalendarDays(exam, now)
    if (daysLeft < 0) return { daysLeft: 0, progress: 100, tone: 'danger' as const }

    const elapsed = differenceInCalendarDays(now, subDays(exam, 90))
    const progress = Math.min(100, Math.max(0, (elapsed / 90) * 100))
    if (daysLeft <= 7) return { daysLeft, progress, tone: 'danger' as const }
    if (daysLeft <= 30) return { daysLeft, progress, tone: 'warning' as const }
    return { daysLeft, progress, tone: 'success' as const }
  }, [examDate])

  const heatmapCells = useMemo(() => {
    const gridEnd = endOfWeek(new Date(), { weekStartsOn: 0 })
    return Array.from({ length: 35 }, (_, index) => {
      const date = toLocalDate(subDays(gridEnd, 34 - index))
      const isFuture = date > today
      const value = isFuture ? 0 : (heatmapData[date] ?? 0)
      return {
        date,
        value,
        level: getActivityLevel(value),
        isToday: date === today,
        isFuture,
      }
    })
  }, [heatmapData, today])

  const recentAchievements = useMemo(
    () => unlockedBadges
      .slice(-3)
      .reverse()
      .map((id) => BADGE_BY_ID.get(id))
      .filter((badge): badge is Achievement => Boolean(badge)),
    [unlockedBadges],
  )

  const latestDiary = useMemo(() => {
    if (diaryEntries.length === 0) return null
    const entry = diaryEntries.reduce((latest, candidate) => (
      candidate.date > latest.date ? candidate : latest
    ))
    const mood = MOOD_OPTIONS.find((item) => item.value === entry.mood)
    return {
      date: entry.date,
      moodEmoji: mood?.emoji ?? '',
      moodLabel: mood?.label ?? '',
      contentPreview: entry.content.length > 88 ? `${entry.content.slice(0, 88)}…` : entry.content,
    }
  }, [diaryEntries])

  const levelInfo = useMemo(() => {
    const currentLevel = LEVELS.find((item) => item.level === achievementLevel) ?? LEVELS[0]
    const nextLevel = LEVELS.find((item) => item.level === currentLevel.level + 1)
    const levelRange = nextLevel ? nextLevel.requiredXP - currentLevel.requiredXP : 0
    const percentage = nextLevel && levelRange > 0
      ? ((displayXP - currentLevel.requiredXP) / levelRange) * 100
      : 100

    return {
      level: currentLevel.level,
      name: currentLevel.name,
      xpProgress: {
        current: displayXP,
        required: nextLevel?.requiredXP ?? currentLevel.requiredXP,
        percentage: Math.max(0, percentage),
      },
    }
  }, [achievementLevel, displayXP])

  const countdownTone = examCountdown?.tone === 'danger'
    ? 'text-danger'
    : examCountdown?.tone === 'warning'
      ? 'text-warning'
      : 'text-success'
  const countdownBar = examCountdown?.tone === 'danger'
    ? 'bg-danger'
    : examCountdown?.tone === 'warning'
      ? 'bg-warning'
      : 'bg-success'

  return (
    <div className="space-y-5 md:space-y-6">
      <Card className="relative isolate overflow-hidden border-0 bg-gradient-to-br from-primary via-primary to-violet-600 py-0 text-primary-foreground shadow-md shadow-primary/15">
        <div
          className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full border-[26px] border-white/8"
          aria-hidden="true"
        />
        <CardContent className="relative flex items-start justify-between gap-3 px-4 py-4 sm:items-center sm:px-5 md:py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/14 ring-1 ring-white/15">
                <CalendarDays className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/65">今日学习</p>
                <h1 className="text-xl font-bold tracking-tight md:text-2xl">{greeting}</h1>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-primary-foreground/82">{todayQuote}</p>
            <time className="mt-1.5 block text-xs text-primary-foreground/65" dateTime={today}>{todayFormatted}</time>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={checkIn}
            disabled={checkedIn}
            className="shrink-0 bg-white text-primary hover:bg-white/90 disabled:bg-white/15 disabled:text-primary-foreground/75"
            aria-label={checkedIn ? '今天已完成打卡' : '完成今天的学习打卡'}
          >
            <Check aria-hidden="true" />
            <span className="sm:hidden">{checkedIn ? '已打卡' : '打卡'}</span>
            <span className="hidden sm:inline">{checkedIn ? '今日已打卡' : '今日打卡'}</span>
          </Button>
        </CardContent>
      </Card>

      {planMutationError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{planMutationError}</span>
        </div>
      )}

      <MetricGroup
        ariaLabel="今日学习概览"
        columns={4}
        items={[
          {
            label: '今日背词',
            value: todaySummary.totalWords.toLocaleString('zh-CN'),
            description: '词',
            icon: <BookA />,
            tone: 'primary',
          },
          {
            label: '今日学习',
            value: `${todaySummary.displayMinutes} 分钟`,
            description: `${todaySummary.studySessionCount} 次练习记录`,
            icon: <Clock3 />,
            tone: 'warning',
          },
          {
            label: '连续学习',
            value: `${currentStreak} 天`,
            description: '保持稳定节奏',
            icon: <Flame />,
            tone: 'success',
          },
          {
            label: '今日计划',
            value: todayPlans.length === 0 ? '暂无' : `${completedTodayCount}/${todayPlans.length}`,
            description: todayPlans.length === 0 ? '尚未安排任务' : `${remainingTodayCount} 项待完成`,
            icon: <ListChecks />,
            tone: 'reading',
          },
        ]}
      />

      {((examCountdown && showExamCountdown) || showAiSuggestions) && (
        <section
          className={cn(
            'grid gap-3',
            examCountdown && showExamCountdown && showAiSuggestions && 'md:grid-cols-2',
          )}
          aria-label="备考工具"
        >
          {examCountdown && showExamCountdown && (
            <Card size="sm">
              <CardContent>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CalendarDays className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">考试倒计时</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {examDate ? format(parseLocalDate(examDate), 'yyyy年M月d日') : ''}
                    </p>
                  </div>
                  <span className={cn('shrink-0 text-2xl font-bold tabular-nums', countdownTone)}>
                    {examCountdown.daysLeft}<span className="ml-1 text-xs font-medium">天</span>
                  </span>
                </div>
                <div
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="90 天备考周期进度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(examCountdown.progress)}
                >
                  <div className={cn('h-full rounded-full', countdownBar)} style={{ width: `${examCountdown.progress}%` }} />
                </div>
              </CardContent>
            </Card>
          )}

          {showAiSuggestions && (
            <Card size="sm" className="border-primary/15 bg-primary/5">
              <CardContent className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">AI 学习建议</h2>
                  <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">根据现有学习记录生成可执行建议。</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAiSuggestionOpen(true)}>
                  查看<span className="hidden sm:inline">建议</span>
                  <ArrowRight aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]" aria-label="今日安排与活跃度">
        <Card>
          <CardHeader>
            <SectionHeader
              title="今日待办"
              description={todayPlans.length > 0 ? `${completedTodayCount} 项已完成，${remainingTodayCount} 项待完成` : '把计划拆成今天可以完成的小步骤'}
              action={(
                <Link to="/plans" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  全部计划<ArrowRight aria-hidden="true" />
                </Link>
              )}
            />
          </CardHeader>
          <CardContent>
            {visibleTodayPlans.length === 0 ? (
              <EmptyState
                scene="tasks"
                density="compact"
                title="今天没有待办任务"
                description="创建或调整学习计划，让首页为你聚焦下一步。"
                action={(
                  <Link to="/plans" className={buttonVariants({ size: 'sm' })}>安排今天</Link>
                )}
              />
            ) : (
              <ul className="space-y-2" aria-label="今日学习待办">
                {visibleTodayPlans.map((plan) => (
                  <li
                    key={plan.id}
                    className={cn(
                      'flex min-h-12 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors',
                      plan.completed ? 'border-success-border bg-success-surface' : 'border-border bg-background hover:bg-accent/70',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void togglePlanComplete(plan.id)}
                      disabled={mutatingPlanIds.has(plan.id)}
                      className="grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={plan.completed ? `将「${plan.title}」标记为未完成` : `将「${plan.title}」标记为已完成`}
                      aria-pressed={plan.completed}
                    >
                      {plan.completed
                        ? <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                        : <Circle className="size-5 text-muted-foreground" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => showPlanDetail(plan)}
                      className={cn(
                        'min-w-0 flex-1 rounded-md py-1 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        plan.completed && 'text-muted-foreground line-through',
                      )}
                    >
                      <span className="block truncate">{plan.title}</span>
                    </button>
                    {plan.targetTime && (
                      <time className="shrink-0 text-xs font-medium tabular-nums text-primary" dateTime={plan.targetTime}>
                        {plan.targetTime}
                      </time>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {todayPlans.length > visibleTodayPlans.length && (
              <p className="mt-3 text-xs text-muted-foreground">另有 {todayPlans.length - visibleTodayPlans.length} 项任务，请在计划页查看。</p>
            )}
          </CardContent>
        </Card>

        <Card size="sm" className="self-start">
          <CardHeader>
            <SectionHeader title="最近活跃度" description="过去 5 周累计学习事件" />
          </CardHeader>
          <CardContent>
            <div
              className="grid grid-cols-[repeat(7,1.35rem)] justify-center gap-1.5 min-[380px]:grid-cols-[repeat(7,1.5rem)]"
              aria-label="过去 5 周学习活跃度"
            >
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="mb-0.5 text-center text-[11px] font-medium text-muted-foreground">{label}</span>
              ))}
              {heatmapCells.map((cell) => (
                <span
                  key={cell.date}
                  role="img"
                  title={cell.isFuture ? `${cell.date}: 尚未到来` : `${cell.date}: ${cell.value} 次活动`}
                  aria-label={cell.isFuture ? `${cell.date}，尚未到来` : `${cell.date}，${cell.value} 次活动`}
                  className={cn(
                    'aspect-square rounded-[4px]',
                    cell.isToday && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                  style={{ backgroundColor: cell.isFuture ? 'transparent' : HEATMAP_COLORS[cell.level] }}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-muted-foreground" aria-hidden="true">
              <span className="mr-1">少</span>
              {HEATMAP_COLORS.map((color) => (
                <span key={color} className="size-3 rounded-[3px]" style={{ backgroundColor: color }} />
              ))}
              <span className="ml-1">多</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="growth-review-title">
        <SectionHeader
          title="成长回顾"
          titleId="growth-review-title"
          description="把短期行动沉淀成可回看的学习轨迹。"
          action={(
            <Button type="button" variant="outline" size="sm" onClick={() => setReportOpen(true)}>
              <BarChart3 aria-hidden="true" />学习报告
            </Button>
          )}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>最近成就</CardTitle>
              <CardDescription>{unlockedBadges.length} / {BADGES.length} 已解锁</CardDescription>
            </CardHeader>
            <CardContent className="flex h-full flex-col justify-between gap-4">
              {recentAchievements.length === 0 ? (
                <EmptyState
                  scene="achievements"
                  density="compact"
                  title="还没有解锁成就"
                  description="完成学习和打卡后，里程碑会出现在这里。"
                />
              ) : (
                <ul className="grid grid-cols-3 gap-2" aria-label="最近解锁的成就">
                  {recentAchievements.map((badge) => (
                    <li key={badge.id} className="rounded-xl border border-primary/10 bg-primary/5 p-2.5 text-center">
                      <AchievementMark achievementId={badge.id} size="md" className="mx-auto" />
                      <span className="mt-1 block truncate text-xs font-medium">{badge.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/achievements" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}>
                查看全部成就<ArrowRight aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>等级与经验</CardTitle>
              <CardDescription>持续记录会累积经验值</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Star className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">Lv.{levelInfo.level} {levelInfo.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {levelInfo.xpProgress.current} / {levelInfo.xpProgress.required} XP
                  </p>
                </div>
              </div>
              <div
                className="mt-5 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="当前等级经验进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(100, levelInfo.xpProgress.percentage))}
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, levelInfo.xpProgress.percentage)}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {levelInfo.xpProgress.percentage >= 100
                  ? '已达到当前最高等级。'
                  : `距离下一等级还需 ${Math.max(0, levelInfo.xpProgress.required - levelInfo.xpProgress.current)} XP。`}
              </p>
            </CardContent>
          </Card>

          <Card size="sm" className="md:col-span-2 xl:col-span-1">
            <CardHeader>
              <CardTitle>最近学习日记</CardTitle>
              <CardDescription>记录状态，也记录方法</CardDescription>
            </CardHeader>
            <CardContent className="flex h-full flex-col justify-between gap-4">
              {latestDiary ? (
                <article className="rounded-xl border border-border/70 bg-secondary/40 p-3.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <BookOpen className="size-4" aria-hidden="true" />
                    <time dateTime={latestDiary.date}>{format(parseLocalDate(latestDiary.date), 'yyyy年M月d日')}</time>
                    <span aria-hidden="true">·</span>
                    <span>{latestDiary.moodEmoji} {latestDiary.moodLabel}</span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6">{latestDiary.contentPreview}</p>
                </article>
              ) : (
                <EmptyState
                  scene="diary"
                  density="compact"
                  title="还没有学习日记"
                  description="写下今天的方法和感受，方便以后回看。"
                />
              )}
              <Link to="/diary" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}>
                查看全部日记<ArrowRight aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <Dialog open={aiSuggestionOpen} onOpenChange={setAiSuggestionOpen}>
        <DialogContent className="max-h-[85vh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              今日学习建议
            </DialogTitle>
          </DialogHeader>
          <AiSuggestionDialog open={aiSuggestionOpen} onOpenChange={setAiSuggestionOpen} />
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[85vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" aria-hidden="true" />
              学习报告
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <section aria-labelledby="weekly-report-title">
              <h3 id="weekly-report-title" className="mb-2 text-sm font-semibold">本周</h3>
              <div className="grid grid-cols-3 gap-2">
                <ReportMetric value={weekReport.words} label="背词" tone="border-primary/15 bg-primary/5" />
                <ReportMetric value={`${weekReport.minutes}m`} label="时长" tone="border-warning-border bg-warning-surface" />
                <ReportMetric value={weekReport.completedTasks} label="完成任务" tone="border-success-border bg-success-surface" />
              </div>
            </section>
            <section aria-labelledby="monthly-report-title">
              <h3 id="monthly-report-title" className="mb-2 text-sm font-semibold">本月</h3>
              <div className="grid grid-cols-3 gap-2">
                <ReportMetric value={monthReport.words} label="背词" tone="border-primary/15 bg-primary/5" />
                <ReportMetric value={`${monthReport.minutes}m`} label="时长" tone="border-warning-border bg-warning-surface" />
                <ReportMetric value={monthReport.completedTasks} label="完成任务" tone="border-success-border bg-success-surface" />
              </div>
            </section>
            <Link to="/stats" onClick={() => setReportOpen(false)} className={buttonVariants({ className: 'w-full' })}>
              查看完整学习复盘<ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={planDetailOpen} onOpenChange={setPlanDetailOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="size-5 text-primary" aria-hidden="true" />
              计划详情
            </DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">{selectedPlan.title}</h3>
                {selectedPlan.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedPlan.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPlan.category && (
                  <Badge variant="outline">
                    {PLAN_CATEGORY_OPTIONS.find((option) => option.value === selectedPlan.category)?.label ?? selectedPlan.category}
                  </Badge>
                )}
                {selectedPlan.frequency && (
                  <Badge variant="outline">
                    {planScheduleLabel(selectedPlan)}
                  </Badge>
                )}
                {selectedPlan.targetTime && <Badge variant="outline" className="text-primary">{selectedPlan.targetTime}</Badge>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
