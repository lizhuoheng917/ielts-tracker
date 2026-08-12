import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlanExecution, StudyPlan } from '@/lib/types'
import { usePlanStore } from '@/stores/planStore'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'
import { listAiArtifactsForAccess } from '@/ai/artifactRepository'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import {
  learnerAiTaskCoordinator,
  learnerAiTaskKey,
  learnerAiTaskScopeKey,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DataPagination } from '@/components/ui/data-pagination'
import { DataToolbar } from '@/components/ui/data-toolbar'
import { Input } from '@/components/ui/input'
import { MetricGroup } from '@/components/ui/metric-group'
import { PageHeader } from '@/components/ui/page-header'
import { ContentCloudLocationField } from '@/components/sync/ContentCloudLocationField'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle,
  Circle,
  CircleHelp,
  Clock3,
  ListTodo,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { AIChatPanel } from '@/components/ai/AIChatPanel'
import { createCurrentLearningContext } from '@/ai/runtimeContext'
import { useAIPrivacyStore } from '@/stores/aiPrivacyStore'
import { PLAN_CATEGORY_OPTIONS } from '@/lib/constants'
import { DEFAULT_DATA_PAGE_SIZE, getDataPageCount, paginateItems } from '@/lib/dataView'
import { addLocalDays, isLocalDate, toLocalDate } from '@/lib/localDate'
import {
  filterAndSortPlans,
  indexLatestPlanExecutionsForDate,
  isPlanScheduledForDate,
  type PlanCategoryFilter,
  type PlanFrequencyFilter,
  type PlanSortOrder,
  type PlanStatusFilter,
} from '@/lib/planView'
import { getSubjectVisual } from '@/lib/subjectVisuals'
import {
  formatPlanSchedule,
  formatPlanTimeAndDuration,
  formatShortDate,
  formatWeekDays,
  getPlanFrequency,
  getPlanScheduleFields,
} from './Plans.presentation'
import {
  setTrackerContentCloudLocation,
  trackerContentCloudMode,
  type TrackerContentCloudMode,
} from '@/sync/trackerContentCloudPolicy'
import { useAuth } from '@/auth/authContext'
import { resolveLexiWordsUrl } from '@/app/productLinks'
import { WordsPlanIntentDialog } from '@/features/words-plan-intent/WordsPlanIntentDialog'

const FREQUENCY_LABELS: Record<string, string> = {
  once: '单次任务',
  daily: '每日',
  weekly: '每周',
  custom: '自定义',
}

const PLAN_CATEGORY_LABELS: Record<string, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
  vocabulary: '词汇',
  general: '综合',
}

const WEEKDAY_OPTIONS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
]

const STATUS_LABELS: Record<PlanStatusFilter, string> = {
  all: '全部状态',
  active: '使用中',
  paused: '已暂停',
}

const SORT_LABELS: Record<PlanSortOrder, string> = {
  newest: '创建时间：从新到旧',
  oldest: '创建时间：从旧到新',
  'title-asc': '计划名称：升序',
  'time-asc': '完成时间：从早到晚',
}

function getCategoryLabel(category: string): string {
  return PLAN_CATEGORY_LABELS[category] ?? category
}

function getCategoryBadgeClass(category: string): string {
  if (category === 'vocabulary') {
    return 'border-primary/25 bg-primary/10 text-primary'
  }
  return getSubjectVisual(category).badgeClass
}

type FormPlanFrequency = 'once' | 'daily' | 'weekly' | 'custom'

function getTodayStr(): string {
  return toLocalDate()
}

const LEXI_WORDS_URL = resolveLexiWordsUrl({
  wordsAppUrl: import.meta.env.VITE_LEXI_WORDS_APP_URL,
  isDevelopment: import.meta.env.DEV,
})

export default function Plans() {
  const { user } = useAuth()
  const plans = usePlanStore((s) => s.plans)
  const executions = usePlanStore((s) => s.executions)
  const addPlan = usePlanStore((s) => s.addPlan)
  const artifactAccess = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(artifactAccess)
  const planDraftTaskKey = scopeKey
    ? learnerAiTaskKey('plan_draft', scopeKey, 'plans')
    : null
  const { openRequestedTaskKey } = useLearnerAiTaskState()
  const artifactRecords = useAiArtifactStore((state) => state.artifacts)
  const learningAnalysisCount = useMemo(
    () => listAiArtifactsForAccess(artifactRecords, artifactAccess, 'learning_analysis').length,
    [artifactAccess, artifactRecords],
  )
  const updatePlan = usePlanStore((s) => s.updatePlan)
  const deletePlan = usePlanStore((s) => s.deletePlan)
  const setExecutionForDate = usePlanStore((s) => s.setExecutionForDate)
  const aiDefaultRangeDays = useAIPrivacyStore((s) => s.defaultRangeDays)
  const includePriorAIArtifacts = useAIPrivacyStore((s) => s.includePriorAIArtifacts)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formCategory, setFormCategory] = useState<string>('general')
  const [formFreq, setFormFreq] = useState<FormPlanFrequency>('once')
  const [formWeekDays, setFormWeekDays] = useState<number[]>([])
  const [formScheduledDate, setFormScheduledDate] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formTime, setFormTime] = useState('')
  const [formDuration, setFormDuration] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formCloudMode, setFormCloudMode] = useState<TrackerContentCloudMode>('local')
  const [editingLegacyCustomFrequency, setEditingLegacyCustomFrequency] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [planDetailOpen, setPlanDetailOpen] = useState(false)
  const [planIntentOpen, setPlanIntentOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<StudyPlan | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<PlanCategoryFilter>('all')
  const [frequencyFilter, setFrequencyFilter] = useState<PlanFrequencyFilter>('all')
  const [sortOrder, setSortOrder] = useState<PlanSortOrder>('newest')
  const [currentPage, setCurrentPage] = useState(1)
  const [planMutationError, setPlanMutationError] = useState('')
  const [mutatingPlanIds, setMutatingPlanIds] = useState<Set<string>>(new Set())
  const [formSaving, setFormSaving] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const formPlanExecutionIds = useMemo(
    () => editingId
      ? executions.filter((execution) => execution.planId === editingId).map((execution) => execution.id)
      : [],
    [editingId, executions],
  )
  const formWeekDaysMissing = formFreq === 'weekly' && formWeekDays.length === 0
  const formScheduleSelectionMissing = formFreq === 'custom'
  const formScheduledDateMissing = formFreq === 'once' && !isLocalDate(formScheduledDate)
  const formStartDateMissing =
    (formFreq === 'daily' || formFreq === 'weekly')
    && !isLocalDate(formStartDate)
  const formDateRangeInvalid =
    (formFreq === 'daily' || formFreq === 'weekly')
    && isLocalDate(formStartDate)
    && isLocalDate(formEndDate)
    && formEndDate < formStartDate
  const parsedFormDuration = formDuration.trim() === '' ? undefined : Number(formDuration)
  const formDurationInvalid =
    parsedFormDuration !== undefined
    && (!Number.isInteger(parsedFormDuration) || parsedFormDuration <= 0 || parsedFormDuration > 1_440)
  const formHasSchedulingError =
    formScheduleSelectionMissing
    || formScheduledDateMissing
    || formStartDateMissing
    || formDateRangeInvalid
    || formWeekDaysMissing
    || formDurationInvalid
  const formErrorDescription = [
    formScheduleSelectionMissing ? 'plan-form-type-error' : null,
    formScheduledDateMissing ? 'plan-form-date-error' : null,
    formStartDateMissing || formDateRangeInvalid ? 'plan-form-range-error' : null,
    formWeekDaysMissing ? 'plan-form-weekdays-error' : null,
    formDurationInvalid ? 'plan-form-duration-error' : null,
  ].filter(Boolean).join(' ') || undefined

  const planIntentPreview = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('preview') === 'plan-intent'
  }, [])

  useEffect(() => {
    if (!planIntentPreview) return
    setSelectedPlan({
      id: 'preview-vocabulary-plan',
      title: '本周雅思核心词汇复习',
      description: '每天完成一组核心词复习，并补充当天新词。',
      category: 'vocabulary',
      frequency: 'once',
      scheduledDate: getTodayStr(),
      targetTime: '20:30',
      targetDuration: 35,
      targetCount: 24,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setPlanIntentOpen(true)
  }, [planIntentPreview])

  useEffect(() => {
    if (!planDraftTaskKey || openRequestedTaskKey !== planDraftTaskKey) return
    setAiOpen(true)
    learnerAiTaskCoordinator.consumeOpenRequest(planDraftTaskKey)
  }, [openRequestedTaskKey, planDraftTaskKey])

  const createPlanSnapshot = useCallback(
    () => createCurrentLearningContext({ purpose: 'plan_draft' }),
    [],
  )

  const today = getTodayStr()
  const nextWeek = addLocalDays(today, 7)

  const activePlanCount = useMemo(() => plans.filter((plan) => plan.isActive).length, [plans])
  const pausedPlanCount = plans.length - activePlanCount

  // 今日待办按日历日期解析：单次任务不会被当成每日计划，重复计划也会尊重起止日期。
  const todayPlans = useMemo(() => {
    return plans
      .filter((plan) => isPlanScheduledForDate(plan, today))
      .sort((a, b) => (a.targetTime || '99:99').localeCompare(b.targetTime || '99:99'))
  }, [plans, today])

  // 今日执行记录映射（状态 + ID）
  const todayExecMap = useMemo(
    () => indexLatestPlanExecutionsForDate(executions, today),
    [executions, today],
  )

  const completedTodayCount = useMemo(
    () => todayPlans.filter((plan) => todayExecMap.get(plan.id)?.isCompleted).length,
    [todayExecMap, todayPlans],
  )

  const executionByPlanAndDate = useMemo(() => {
    const indexed = new Map<string, PlanExecution>()
    executions.forEach((execution) => {
      const key = `${execution.planId}\u0000${execution.date}`
      if (!indexed.has(key)) indexed.set(key, execution)
    })
    return indexed
  }, [executions])

  const overdueOncePlans = useMemo(() => plans
    .filter((plan) => {
      if (!plan.isActive || getPlanFrequency(plan) !== 'once') return false
      const { scheduledDate } = getPlanScheduleFields(plan)
      if (!scheduledDate || !isLocalDate(scheduledDate) || scheduledDate >= today) return false
      return !executionByPlanAndDate.get(`${plan.id}\u0000${scheduledDate}`)?.isCompleted
    })
    .sort((a, b) => (
      (getPlanScheduleFields(a).scheduledDate ?? '').localeCompare(getPlanScheduleFields(b).scheduledDate ?? '')
    )), [executionByPlanAndDate, plans, today])

  const upcomingOncePlans = useMemo(() => plans
    .filter((plan) => {
      if (!plan.isActive || getPlanFrequency(plan) !== 'once') return false
      const { scheduledDate } = getPlanScheduleFields(plan)
      return Boolean(scheduledDate && isLocalDate(scheduledDate) && scheduledDate > today && scheduledDate <= nextWeek)
    })
    .sort((a, b) => (
      (getPlanScheduleFields(a).scheduledDate ?? '').localeCompare(getPlanScheduleFields(b).scheduledDate ?? '')
    )), [nextWeek, plans, today])

  const filteredPlans = useMemo(
    () => filterAndSortPlans(plans, {
      searchQuery,
      status: statusFilter,
      category: categoryFilter,
      frequency: frequencyFilter,
      sortOrder,
    }),
    [plans, searchQuery, statusFilter, categoryFilter, frequencyFilter, sortOrder],
  )

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    frequencyFilter !== 'all' ||
    sortOrder !== 'newest'
  const totalPages = getDataPageCount(filteredPlans.length)
  const resolvedPage = Math.min(currentPage, totalPages)
  const paginatedPlans = useMemo(
    () => paginateItems(filteredPlans, resolvedPage),
    [filteredPlans, resolvedPage],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, statusFilter, categoryFilter, frequencyFilter, sortOrder])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const togglePlanComplete = async (planId: string) => {
    if (mutatingPlanIds.has(planId)) return
    const exec = todayExecMap.get(planId)
    setMutatingPlanIds((current) => new Set(current).add(planId))
    setPlanMutationError('')
    try {
      const result = await setExecutionForDate({
        planId,
        date: today,
        isCompleted: !(exec?.isCompleted ?? false),
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

  const showPlanDetail = (plan: StudyPlan) => {
    setSelectedPlan(plan)
    setPlanDetailOpen(true)
  }

  const openAdd = () => {
    setEditingId(null)
    setEditingLegacyCustomFrequency(false)
    setFormTitle('')
    setFormDescription('')
    setFormCategory('general')
    setFormFreq('once')
    setFormWeekDays([])
    setFormScheduledDate(today)
    setFormStartDate(today)
    setFormEndDate('')
    setFormTime('')
    setFormDuration('')
    setFormActive(true)
    setFormCloudMode('local')
    setFormOpen(true)
  }

  const openEdit = (plan: StudyPlan) => {
    const planFrequency = getPlanFrequency(plan)
    const { scheduledDate, startDate, endDate } = getPlanScheduleFields(plan)
    setEditingId(plan.id)
    setEditingLegacyCustomFrequency(planFrequency === 'custom')
    setFormTitle(plan.title)
    setFormDescription(plan.description || '')
    setFormCategory(plan.category)
    setFormFreq(planFrequency)
    setFormWeekDays(plan.weekDays || [])
    setFormScheduledDate(scheduledDate || today)
    setFormStartDate(startDate || today)
    setFormEndDate(endDate || '')
    setFormTime(plan.targetTime || '')
    setFormDuration(plan.targetDuration ? String(plan.targetDuration) : '')
    setFormActive(plan.isActive)
    setFormCloudMode(trackerContentCloudMode({ entityKind: 'study_plan', entityId: plan.id }))
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim() || formHasSchedulingError || formSaving) return
    const data = {
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      category: formCategory as 'reading' | 'listening' | 'writing' | 'speaking' | 'vocabulary' | 'general',
      frequency: formFreq,
      scheduledDate: formFreq === 'once' ? formScheduledDate : undefined,
      startDate: formFreq === 'daily' || formFreq === 'weekly' ? formStartDate : undefined,
      endDate: formFreq === 'daily' || formFreq === 'weekly' ? formEndDate || undefined : undefined,
      weekDays: formFreq === 'weekly' ? formWeekDays : undefined,
      targetTime: formTime || undefined,
      targetDuration: parsedFormDuration,
      isActive: formActive,
    }
    setFormSaving(true)
    setPlanMutationError('')
    try {
      const result = editingId
        ? await updatePlan(editingId, data)
        : await addPlan(data)
      if (result.status === 'applied' || result.status === 'duplicate') {
        const targetId = result.targetId ?? editingId
        if (targetId) {
          setTrackerContentCloudLocation({
            entityKind: 'study_plan',
            entityId: targetId,
            mode: formCloudMode,
          })
        }
        setFormOpen(false)
      } else {
        setPlanMutationError(result.error?.message || '计划暂时无法保存，请重试。')
      }
    } finally {
      setFormSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId || deleteSaving) return
    setDeleteSaving(true)
    setPlanMutationError('')
    try {
      const result = await deletePlan(deleteId)
      if (result.status === 'applied' || result.status === 'not_found') {
        setDeleteId(null)
      } else {
        setPlanMutationError(result.error?.message || '计划暂时无法删除，请重试。')
      }
    } finally {
      setDeleteSaving(false)
    }
  }

  const handleToggleActive = async (plan: StudyPlan) => {
    if (mutatingPlanIds.has(plan.id)) return
    setMutatingPlanIds((current) => new Set(current).add(plan.id))
    setPlanMutationError('')
    try {
      const result = await updatePlan(plan.id, { isActive: !plan.isActive })
      if (result.status === 'busy' || result.status === 'failed') {
        setPlanMutationError(result.error?.message || '计划状态暂时无法保存，请重试。')
      }
    } finally {
      setMutatingPlanIds((current) => {
        const next = new Set(current)
        next.delete(plan.id)
        return next
      })
    }
  }

  const toggleWeekDay = (day: number) => {
    setFormWeekDays((previous) => {
      const next = previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day]
      return WEEKDAY_OPTIONS.map((option) => option.value).filter((value) => next.includes(value))
    })
  }

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setFrequencyFilter('all')
    setSortOrder('newest')
    setCurrentPage(1)
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        eyebrow="Study routine"
        title="学习计划"
        description="安排单次任务与重复节奏，今天、近期和逾期事项一目了然。"
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              AI 生成
            </Button>
            <Button type="button" onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              添加计划
            </Button>
          </>
        )}
      />

      {planMutationError && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{planMutationError}</span>
        </div>
      )}

      <MetricGroup
        ariaLabel="学习计划概览"
        items={[
          { label: '全部计划', value: plans.length, description: '个', icon: <ListTodo /> },
          { label: '进行中', value: activePlanCount, description: '个', icon: <Play />, tone: 'primary' },
          { label: '今日待办', value: todayPlans.length, description: '项', icon: <Clock3 />, tone: 'warning' },
          {
            label: '今日完成',
            value: `${completedTodayCount}/${todayPlans.length}`,
            description: overdueOncePlans.length > 0
              ? `${overdueOncePlans.length} 项单次任务待处理`
              : pausedPlanCount > 0 ? `${pausedPlanCount} 个计划已暂停` : '没有待处理的逾期任务',
            icon: <CheckCircle />,
            tone: 'success',
          },
        ]}
      />

      {/* 今日待办 */}
      <Card size="sm">
        <CardContent>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold md:text-base">
              <ListTodo className="h-4 w-4 text-primary" aria-hidden="true" />
              今日待办
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {completedTodayCount} / {todayPlans.length} 已完成
            </span>
          </div>
          {todayPlans.length === 0 ? (
            <EmptyState
              scene="tasks"
              density="compact"
              title="今天没有待办任务"
              description={plans.length === 0 ? '创建第一个计划，安排你的每日任务' : '今日暂无安排，可在计划库中调整频率'}
              action={plans.length === 0 ? (
                <Button type="button" size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" aria-hidden="true" />添加计划
                </Button>
              ) : undefined}
            />
          ) : (
            <ul className="space-y-2" aria-label="今日学习待办">
              {todayPlans.map((plan, index) => {
                const exec = todayExecMap.get(plan.id)
                const isCompleted = exec?.isCompleted ?? false
                return (
                  <li
                    key={plan.id}
                    className={cn(
                      `animate-stagger-up stagger-${Math.min(index + 1, 6)} flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors`,
                      isCompleted
                        ? 'border-success-border bg-success-surface'
                        : 'border-border bg-background hover:bg-accent active:bg-accent/80'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void togglePlanComplete(plan.id)}
                      disabled={mutatingPlanIds.has(plan.id)}
                      className="-ml-0.5 shrink-0 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={isCompleted ? `将「${plan.title}」标记为未完成` : `将「${plan.title}」标记为已完成`}
                      aria-pressed={isCompleted}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-success" aria-hidden="true" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => showPlanDetail(plan)}
                      className={cn(
                        'min-w-0 flex-1 rounded-sm text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isCompleted && 'line-through text-muted-foreground'
                      )}
                      aria-label={`查看计划详情：${plan.title}`}
                    >
                      <span className="block truncate">{plan.title}</span>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {plan.targetTime && (
                        <time className="text-xs font-medium tabular-nums text-primary" dateTime={plan.targetTime}>
                          {plan.targetTime}
                        </time>
                      )}
                      <Badge variant="outline" className="hidden shrink-0 text-xs sm:inline-flex">
                        {FREQUENCY_LABELS[getPlanFrequency(plan)]}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ScheduleOverview
        overduePlans={overdueOncePlans}
        upcomingPlans={upcomingOncePlans}
        onShowDetail={showPlanDetail}
        onEdit={openEdit}
      />

      <section className="space-y-4" aria-labelledby="plan-library-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="plan-library-title" className="text-[15px] font-semibold md:text-base">所有计划</h2>
            <p className="mt-1 text-sm text-muted-foreground">查找、调整或暂停单次任务与重复安排</p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            共 <span className="font-medium tabular-nums text-foreground">{filteredPlans.length}</span> 个计划
          </p>
        </div>

        <DataToolbar
          aria-label="筛选学习计划"
          mobileFilterTitle="筛选学习计划"
          mobileFilterCount={
            Number(statusFilter !== 'all')
            + Number(categoryFilter !== 'all')
            + Number(frequencyFilter !== 'all')
            + Number(sortOrder !== 'newest')
          }
          search={(
            <div className="space-y-1.5">
              <Label htmlFor="plan-search" className="text-xs text-muted-foreground">搜索</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="plan-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索计划名称或内容"
                  className="pl-8"
                />
              </div>
            </div>
          )}
          filters={(
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-status-filter" className="text-xs text-muted-foreground">状态</Label>
                <Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value as PlanStatusFilter)}>
                  <SelectTrigger id="plan-status-filter" className="w-full">
                    <SelectValue>{STATUS_LABELS[statusFilter]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(STATUS_LABELS) as Array<[PlanStatusFilter, string]>).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-category-filter" className="text-xs text-muted-foreground">分类</Label>
                <Select value={categoryFilter} onValueChange={(value) => value && setCategoryFilter(value as PlanCategoryFilter)}>
                  <SelectTrigger id="plan-category-filter" className="w-full">
                    <SelectValue>{categoryFilter === 'all' ? '全部分类' : getCategoryLabel(categoryFilter)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
                    {PLAN_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-frequency-filter" className="text-xs text-muted-foreground">频率</Label>
                <Select value={frequencyFilter} onValueChange={(value) => value && setFrequencyFilter(value as PlanFrequencyFilter)}>
                  <SelectTrigger id="plan-frequency-filter" className="w-full">
                    <SelectValue>{frequencyFilter === 'all' ? '全部频率' : FREQUENCY_LABELS[frequencyFilter]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部频率</SelectItem>
                    <SelectItem value="once">单次任务</SelectItem>
                    <SelectItem value="daily">每日</SelectItem>
                    <SelectItem value="weekly">每周</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-sort-order" className="text-xs text-muted-foreground">排序</Label>
                <Select value={sortOrder} onValueChange={(value) => value && setSortOrder(value as PlanSortOrder)}>
                  <SelectTrigger id="plan-sort-order" className="w-full">
                    <SelectValue>{SORT_LABELS[sortOrder]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SORT_LABELS) as Array<[PlanSortOrder, string]>).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          actions={(
            <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasActiveFilters}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              清空筛选
            </Button>
          )}
          summary={(
            <span>
              找到 <strong className="font-semibold tabular-nums text-foreground">{filteredPlans.length}</strong> 个计划，每页最多 {DEFAULT_DATA_PAGE_SIZE} 个
            </span>
          )}
        />

        <PlanList
          plans={paginatedPlans}
          hasAnyPlans={plans.length > 0}
          hasActiveFilters={hasActiveFilters}
          onAdd={openAdd}
          onClearFilters={clearFilters}
          onShowDetail={showPlanDetail}
          onToggleActive={(plan) => { void handleToggleActive(plan) }}
          onEdit={openEdit}
          onDelete={(plan) => setDeleteId(plan.id)}
        />

        <DataPagination
          currentPage={resolvedPage}
          totalPages={totalPages}
          totalItems={filteredPlans.length}
          onPageChange={setCurrentPage}
          itemLabel="个"
          aria-label="学习计划分页"
        />
      </section>

      {/* 添加/编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="flex max-h-[90dvh] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(92vw,42rem)] md:h-[min(88dvh,52rem)]">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 md:px-6">
            <DialogTitle>{editingId ? '编辑计划' : '添加计划'}</DialogTitle>
            <DialogDescription>
              {editingId ? '调整任务的安排方式、时间与学习目标' : '先选择单次任务或重复计划，再补全安排'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
            <div className="space-y-5">
              {editingLegacyCustomFrequency && (
                <p
                  className="rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-sm leading-5 text-warning-foreground"
                  role="status"
                >
                  这是旧版“自定义”计划，尚无明确日程。请重新选择单次任务或重复计划后再保存。
                </p>
              )}

              <section className="space-y-2" aria-labelledby="plan-form-type-label">
                <span id="plan-form-type-label" className="block text-sm font-medium">计划类型</span>
                <div
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  role="group"
                  aria-labelledby="plan-form-type-label"
                  aria-describedby={formScheduleSelectionMissing ? 'plan-form-type-error' : undefined}
                  aria-invalid={formScheduleSelectionMissing}
                >
                  <button
                    type="button"
                    onClick={() => setFormFreq('once')}
                    aria-pressed={formFreq === 'once'}
                    className={cn(
                      'flex min-h-20 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      formFreq === 'once'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-accent',
                    )}
                  >
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-semibold">单次任务</span>
                      <span className="mt-1 block text-xs leading-4 text-muted-foreground">在指定日期完成一次，完成后不再出现在后续待办中。</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormFreq((current) => current === 'weekly' ? 'weekly' : 'daily')}
                    aria-pressed={formFreq === 'daily' || formFreq === 'weekly'}
                    className={cn(
                      'flex min-h-20 items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      formFreq === 'daily' || formFreq === 'weekly'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-accent',
                    )}
                  >
                    <Repeat2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">重复计划</span>
                      <span className="mt-1 block text-xs leading-4 text-muted-foreground">按每天或每周节奏，持续安排学习。</span>
                    </span>
                  </button>
                </div>
                {formScheduleSelectionMissing && (
                  <p id="plan-form-type-error" className="text-xs text-destructive" role="alert">
                    请先重新选择这项计划的安排方式
                  </p>
                )}
              </section>

            <div className="space-y-2">
              <Label htmlFor="plan-form-title">计划名称</Label>
              <Input
                id="plan-form-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="例如：完成一套阅读练习"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-form-description">计划内容</Label>
              <Textarea
                id="plan-form-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="详细描述你的学习计划（可选）"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-form-category">分类</Label>
              <Select value={formCategory} onValueChange={(v) => v && setFormCategory(v)}>
                <SelectTrigger id="plan-form-category" className="w-full">
                  <SelectValue>
                    {(value) => PLAN_CATEGORY_LABELS[String(value)] ?? '选择分类'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reading">阅读</SelectItem>
                  <SelectItem value="listening">听力</SelectItem>
                  <SelectItem value="writing">写作</SelectItem>
                  <SelectItem value="speaking">口语</SelectItem>
                  <SelectItem value="vocabulary">词汇</SelectItem>
                  <SelectItem value="general">综合</SelectItem>
                </SelectContent>
              </Select>
            </div>

              {formFreq === 'once' && (
                <section className="space-y-3 rounded-xl border border-border bg-surface-subtle p-3" aria-labelledby="plan-form-once-schedule-label">
                  <div>
                    <h3 id="plan-form-once-schedule-label" className="text-sm font-semibold">这一次安排</h3>
                    <p className="mt-1 text-xs leading-4 text-muted-foreground">任务只会在该日期出现在待办中。</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="plan-form-scheduled-date">执行日期</Label>
                      <Input
                        id="plan-form-scheduled-date"
                        type="date"
                        value={formScheduledDate}
                        onChange={(event) => setFormScheduledDate(event.target.value)}
                        aria-invalid={formScheduledDateMissing}
                        aria-describedby={formScheduledDateMissing ? 'plan-form-date-error' : undefined}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan-form-time">开始时间（可选）</Label>
                      <Input
                        id="plan-form-time"
                        type="time"
                        value={formTime}
                        onChange={(event) => setFormTime(event.target.value)}
                      />
                    </div>
                  </div>
                  {formScheduledDateMissing && (
                    <p id="plan-form-date-error" className="text-xs text-destructive" role="alert">
                      单次任务需要选择有效的执行日期
                    </p>
                  )}
                </section>
              )}

              {(formFreq === 'daily' || formFreq === 'weekly') && (
                <section className="space-y-3 rounded-xl border border-border bg-surface-subtle p-3" aria-labelledby="plan-form-recurring-schedule-label">
                  <div>
                    <h3 id="plan-form-recurring-schedule-label" className="text-sm font-semibold">重复安排</h3>
                    <p className="mt-1 text-xs leading-4 text-muted-foreground">只保存一条计划规则，不会预先写入未来每一天的任务。</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="plan-form-frequency">重复节奏</Label>
                    <Select value={formFreq} onValueChange={(value) => value && setFormFreq(value as 'daily' | 'weekly')}>
                      <SelectTrigger id="plan-form-frequency" className="w-full">
                        <SelectValue>{FREQUENCY_LABELS[formFreq]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">每天</SelectItem>
                        <SelectItem value="weekly">每周指定日期</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formFreq === 'weekly' && (
                    <div className="space-y-2">
                      <span id="plan-form-weekdays-label" className="block text-sm font-medium">执行星期</span>
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-labelledby="plan-form-weekdays-label"
                        aria-describedby={formWeekDaysMissing ? 'plan-form-weekdays-error' : undefined}
                        aria-invalid={formWeekDaysMissing}
                      >
                        {WEEKDAY_OPTIONS.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleWeekDay(day.value)}
                            aria-pressed={formWeekDays.includes(day.value)}
                            aria-label={`星期${day.label}`}
                            className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-all',
                              formWeekDays.includes(day.value)
                                ? 'bg-primary text-primary-foreground'
                                : 'border bg-background hover:bg-accent',
                            )}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      {formWeekDaysMissing && (
                        <p id="plan-form-weekdays-error" className="text-xs text-destructive" role="alert">
                          每周计划至少需要选择一天
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="plan-form-start-date">开始日期</Label>
                      <Input
                        id="plan-form-start-date"
                        type="date"
                        value={formStartDate}
                        onChange={(event) => setFormStartDate(event.target.value)}
                        aria-invalid={formStartDateMissing || formDateRangeInvalid}
                        aria-describedby={formStartDateMissing || formDateRangeInvalid ? 'plan-form-range-error' : undefined}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plan-form-end-date">结束日期（可选）</Label>
                      <Input
                        id="plan-form-end-date"
                        type="date"
                        value={formEndDate}
                        min={formStartDate || undefined}
                        onChange={(event) => setFormEndDate(event.target.value)}
                        aria-invalid={formDateRangeInvalid}
                        aria-describedby={formDateRangeInvalid ? 'plan-form-range-error' : undefined}
                      />
                    </div>
                  </div>
                  {(formStartDateMissing || formDateRangeInvalid) && (
                    <p id="plan-form-range-error" className="text-xs text-destructive" role="alert">
                      {formStartDateMissing ? '重复计划需要选择开始日期' : '结束日期不能早于开始日期'}
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="plan-form-time">开始时间（可选）</Label>
                    <Input
                      id="plan-form-time"
                      type="time"
                      value={formTime}
                      onChange={(event) => setFormTime(event.target.value)}
                    />
                  </div>
                </section>
              )}

              {formFreq !== 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="plan-form-duration">预计时长（可选）</Label>
                  <div className="relative">
                    <Input
                      id="plan-form-duration"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="1440"
                      value={formDuration}
                      onChange={(event) => setFormDuration(event.target.value)}
                      placeholder="例如：45"
                      className="pr-12"
                      aria-invalid={formDurationInvalid}
                      aria-describedby={formDurationInvalid ? 'plan-form-duration-error' : undefined}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">分钟</span>
                  </div>
                  {formDurationInvalid && (
                    <p id="plan-form-duration-error" className="text-xs text-destructive" role="alert">
                      请输入 1 到 1440 之间的整数分钟数
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-subtle px-3 py-2.5">
                <div>
                  <Label htmlFor="plan-form-active" className="cursor-pointer">启用此计划</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formFreq === 'once' ? '暂停后不会在安排日期出现在待办中' : '暂停后不会继续出现在每日待办中'}
                  </p>
                </div>
                <Switch
                  id="plan-form-active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                  aria-label="启用此计划"
                />
              </div>

              <ContentCloudLocationField
                entityKind="study_plan"
                entityId={editingId}
                value={formCloudMode}
                onValueChange={setFormCloudMode}
                disabled={formSaving}
                relatedContent={{
                  entityKind: 'plan_execution',
                  label: '执行记录',
                  unit: '条',
                  count: formPlanExecutionIds.length,
                  entityIds: formPlanExecutionIds,
                }}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_18px_-18px_rgb(15_23_42_/_0.45)] sm:flex-row sm:justify-end md:px-6">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!formTitle.trim() || formHasSchedulingError || formSaving}
              aria-describedby={formErrorDescription}
              className="w-full sm:w-auto"
            >
              {formSaving ? '正在保存…' : editingId ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这个学习计划吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={deleteSaving} className="w-full sm:w-auto">
              {deleteSaving ? '正在删除…' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 生成计划弹窗 */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="flex max-h-[90dvh] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(94vw,56rem)] md:h-[min(86dvh,54rem)]">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-2 pr-12 md:px-6 md:pt-5">
            <div className="flex items-center gap-1.5">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                AI 生成学习计划
              </DialogTitle>
              <Popover>
                <PopoverTrigger
                  className="-my-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="查看 AI 计划生成说明"
                >
                  <CircleHelp className="size-4" aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  className="w-[min(20rem,calc(100vw-2rem))] gap-3 p-3"
                >
                  <PopoverHeader>
                    <PopoverTitle>生成说明</PopoverTitle>
                    <PopoverDescription className="leading-5">
                      每次发送时读取近 {aiDefaultRangeDays} 天的最新学习快照。AI 只生成结构化草稿；请核对单次或重复安排、日期和目标后再逐条加入。
                    </PopoverDescription>
                  </PopoverHeader>
                </PopoverContent>
              </Popover>
            </div>
            <DialogDescription className="sr-only">
              每次发送时读取近 {aiDefaultRangeDays} 天的最新学习快照。AI 只生成结构化草稿；请核对单次或重复安排、日期和目标后再逐条加入。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 md:px-6 md:pb-6">
            <AIChatPanel
              createSnapshot={createPlanSnapshot}
              placeholder="让 AI 根据你的学习数据生成计划..."
              chatContext="plans"
              quotaActive={aiOpen}
              suggestions={
                learningAnalysisCount > 0 && includePriorAIArtifacts
                  ? [
                      '根据我的历史学习报告，分析薄弱项并生成针对性的学习计划',
                      '帮我制定一个为期四周的听力提升计划',
                      '根据我的基础，每天应该怎么安排学习？',
                      '我阅读比较弱，帮我设计一个阅读专项训练',
                      '帮我规划周末的集中练习时间',
                    ]
                  : [
                      '帮我制定一个为期四周的听力提升计划',
                      '根据我的基础，每天应该怎么安排学习？',
                      '我阅读比较弱，帮我设计一个阅读专项训练',
                      '我想每天早上和晚上各安排一个任务',
                      '帮我规划周末的集中练习时间',
                    ]
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 计划详情弹窗 */}
      <Dialog open={planDetailOpen} onOpenChange={setPlanDetailOpen}>
        <DialogContent className="flex max-h-[85dvh] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(92vw,36rem)]">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 md:px-6">
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" aria-hidden="true" />
              计划详情
            </DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
              <div>
                <h3 className="break-words text-base font-semibold">{selectedPlan.title}</h3>
                {selectedPlan.description && (
                  <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{selectedPlan.description}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={cn('text-xs', getCategoryBadgeClass(selectedPlan.category))}>
                  {getCategoryLabel(selectedPlan.category)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {FREQUENCY_LABELS[getPlanFrequency(selectedPlan)]}
                </Badge>
                {selectedPlan.targetTime && (
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-xs text-primary">
                    {selectedPlan.targetTime}
                  </Badge>
                )}
                {selectedPlan.targetDuration && (
                  <Badge variant="outline" className="text-xs">
                    约 {selectedPlan.targetDuration} 分钟
                  </Badge>
                )}
                {getPlanFrequency(selectedPlan) === 'weekly' && selectedPlan.weekDays && (
                  <Badge variant="outline" className="text-xs">
                    {formatWeekDays(selectedPlan.weekDays)}
                  </Badge>
                )}
              </div>
              <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">安排</span>
                <p className="mt-1 break-words font-medium">{formatPlanSchedule(selectedPlan)}</p>
                {(selectedPlan.targetTime || selectedPlan.targetDuration) && (
                  <p className="mt-1 text-xs text-muted-foreground">{formatPlanTimeAndDuration(selectedPlan)}</p>
                )}
              </div>
              {selectedPlan.category === 'vocabulary' && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Send className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">交给 Words 安排当天学习</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        先发送日期、词数和模式；词书仍在 Words 中由你选择并确认。
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    onClick={() => {
                      setPlanDetailOpen(false)
                      setPlanIntentOpen(true)
                    }}
                  >
                    发送到 Words
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WordsPlanIntentDialog
        open={planIntentOpen}
        plan={selectedPlan}
        userId={user?.id ?? null}
        wordsUrl={LEXI_WORDS_URL}
        preview={planIntentPreview}
        onOpenChange={setPlanIntentOpen}
      />
    </div>
  )
}

interface PlanListProps {
  plans: StudyPlan[]
  hasAnyPlans: boolean
  hasActiveFilters: boolean
  onAdd: () => void
  onClearFilters: () => void
  onShowDetail: (plan: StudyPlan) => void
  onToggleActive: (plan: StudyPlan) => void
  onEdit: (plan: StudyPlan) => void
  onDelete: (plan: StudyPlan) => void
}

interface ScheduleOverviewProps {
  overduePlans: StudyPlan[]
  upcomingPlans: StudyPlan[]
  onShowDetail: (plan: StudyPlan) => void
  onEdit: (plan: StudyPlan) => void
}

function ScheduleOverview({
  overduePlans,
  upcomingPlans,
  onShowDetail,
  onEdit,
}: ScheduleOverviewProps) {
  if (overduePlans.length === 0 && upcomingPlans.length === 0) return null

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold md:text-base">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
              近期安排
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">仅显示需要改期或将在未来 7 天执行的单次任务</p>
          </div>
        </div>

        {overduePlans.length > 0 && (
          <section aria-labelledby="overdue-plan-title" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="overdue-plan-title" className="text-sm font-semibold text-warning-foreground">已逾期</h3>
              <Badge variant="outline" className="border-warning-border bg-warning-surface text-xs text-warning-foreground">
                {overduePlans.length} 项待处理
              </Badge>
            </div>
            <ul className="space-y-2" aria-label="已逾期的单次任务">
              {overduePlans.slice(0, 3).map((plan) => (
                <ScheduleOverviewRow
                  key={plan.id}
                  plan={plan}
                  tone="overdue"
                  onShowDetail={onShowDetail}
                  onEdit={onEdit}
                />
              ))}
            </ul>
          </section>
        )}

        {upcomingPlans.length > 0 && (
          <section aria-labelledby="upcoming-plan-title" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="upcoming-plan-title" className="text-sm font-semibold">未来 7 天</h3>
              <span className="text-xs text-muted-foreground">{upcomingPlans.length} 项单次任务</span>
            </div>
            <ul className="space-y-2" aria-label="未来七天的单次任务">
              {upcomingPlans.slice(0, 4).map((plan) => (
                <ScheduleOverviewRow
                  key={plan.id}
                  plan={plan}
                  tone="upcoming"
                  onShowDetail={onShowDetail}
                  onEdit={onEdit}
                />
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

function ScheduleOverviewRow({
  plan,
  tone,
  onShowDetail,
  onEdit,
}: {
  plan: StudyPlan
  tone: 'overdue' | 'upcoming'
  onShowDetail: (plan: StudyPlan) => void
  onEdit: (plan: StudyPlan) => void
}) {
  const { scheduledDate } = getPlanScheduleFields(plan)
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2.5',
        tone === 'overdue'
          ? 'border-warning-border bg-warning-surface/60'
          : 'border-border bg-surface-subtle',
      )}
    >
      <CalendarDays
        className={cn('h-4 w-4 shrink-0', tone === 'overdue' ? 'text-warning-foreground' : 'text-primary')}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => onShowDetail(plan)}
        className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`查看计划详情：${plan.title}`}
      >
        <span className="block truncate text-sm font-medium">{plan.title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {formatShortDate(scheduledDate)}{plan.targetTime ? ` · ${plan.targetTime}` : ''}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onEdit(plan)}
        className="shrink-0"
        aria-label={`调整日期：${plan.title}`}
      >
        改期
      </Button>
    </li>
  )
}

function PlanList({
  plans,
  hasAnyPlans,
  hasActiveFilters,
  onAdd,
  onClearFilters,
  onShowDetail,
  onToggleActive,
  onEdit,
  onDelete,
}: PlanListProps) {
  if (plans.length === 0) {
    if (!hasAnyPlans) {
      return (
        <EmptyState
          scene="plans"
          title="还没有创建学习计划"
          description="创建第一个学习计划，让每天的雅思备考更有条理"
          action={(
            <Button type="button" onClick={onAdd}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              添加第一个计划
            </Button>
          )}
        />
      )
    }

    return (
      <EmptyState
        scene="plans"
        title="没有匹配的计划"
        description="试试调整关键词、状态、分类或频率"
        action={hasActiveFilters ? (
          <Button type="button" variant="outline" onClick={onClearFilters}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            清空筛选
          </Button>
        ) : undefined}
      />
    )
  }

  return (
    <Card className="py-0">
      <div className="hidden max-h-[65vh] overflow-auto lg:block">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-sm">
          <caption className="sr-only">学习计划列表</caption>
          <colgroup>
            <col />
            <col className="w-28" />
            <col className="w-44" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-32" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card/95 text-xs text-muted-foreground shadow-[0_1px_0_0_var(--border)] backdrop-blur">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">计划</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">分类</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">安排</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">时间与时长</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">状态</th>
              <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {plans.map((plan) => (
              <tr key={plan.id} className="group/row transition-colors hover:bg-accent/50">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onShowDetail(plan)}
                    className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`查看计划详情：${plan.title}`}
                  >
                    <span className={cn('block truncate font-medium', !plan.isActive && 'text-muted-foreground')}>
                      {plan.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={plan.description}>
                      {plan.description || '暂无计划说明'}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={cn('max-w-full text-xs', getCategoryBadgeClass(plan.category))}>
                    <span className="truncate">{getCategoryLabel(plan.category)}</span>
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{FREQUENCY_LABELS[getPlanFrequency(plan)]}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={formatPlanSchedule(plan)}>
                    {formatPlanSchedule(plan)}
                  </p>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {formatPlanTimeAndDuration(plan)}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      plan.isActive
                        ? 'border-success-border bg-success-surface text-success'
                        : 'border-border bg-surface-subtle text-muted-foreground',
                    )}
                  >
                    {plan.isActive ? '使用中' : '已暂停'}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onToggleActive(plan)}
                      className={cn('h-8 w-8', plan.isActive ? 'text-warning' : 'text-success')}
                      aria-label={plan.isActive ? `暂停计划：${plan.title}` : `启用计划：${plan.title}`}
                    >
                      {plan.isActive ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(plan)}
                      className="h-8 w-8"
                      aria-label={`编辑计划：${plan.title}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(plan)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`删除计划：${plan.title}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border lg:hidden" aria-label="学习计划列表">
        {plans.map((plan) => (
          <li key={plan.id} className="px-3 py-3 transition-colors hover:bg-accent/50 sm:px-4">
            <article className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onShowDetail(plan)}
                  className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`查看计划详情：${plan.title}`}
                >
                  <span className={cn('block text-sm font-semibold', !plan.isActive && 'text-muted-foreground')}>
                    {plan.title}
                  </span>
                  {plan.description && (
                    <span className="mt-1 block line-clamp-2 text-sm leading-5 text-muted-foreground">
                      {plan.description}
                    </span>
                  )}
                </button>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-xs',
                    plan.isActive
                      ? 'border-success-border bg-success-surface text-success'
                      : 'border-border bg-surface-subtle text-muted-foreground',
                  )}
                >
                  {plan.isActive ? '使用中' : '已暂停'}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className={cn('text-xs', getCategoryBadgeClass(plan.category))}>
                  {getCategoryLabel(plan.category)}
                </Badge>
                <span>{FREQUENCY_LABELS[getPlanFrequency(plan)]}</span>
                <span>{formatPlanSchedule(plan)}</span>
                {plan.targetTime && (
                  <span className="inline-flex items-center gap-1 font-medium tabular-nums text-primary">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {plan.targetTime}
                  </span>
                )}
                {plan.targetDuration && <span>约 {plan.targetDuration} 分钟</span>}
              </div>

              <div className="flex flex-wrap justify-end gap-1 border-t border-border/60 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleActive(plan)}
                  className={plan.isActive ? 'text-warning' : 'text-success'}
                  aria-label={plan.isActive ? `暂停计划：${plan.title}` : `启用计划：${plan.title}`}
                >
                  {plan.isActive ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
                  {plan.isActive ? '暂停' : '启用'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(plan)}
                  aria-label={`编辑计划：${plan.title}`}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />编辑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(plan)}
                  className="text-destructive hover:text-destructive"
                  aria-label={`删除计划：${plan.title}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />删除
                </Button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </Card>
  )
}
