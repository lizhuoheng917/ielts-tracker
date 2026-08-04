import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StudyPlan } from '@/lib/types'
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  AlertCircle,
  CheckCircle,
  Circle,
  Clock3,
  ListTodo,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { AIChatPanel } from '@/components/ai/AIChatPanel'
import { createCurrentLearningContext } from '@/ai/runtimeContext'
import { useAIPrivacyStore } from '@/stores/aiPrivacyStore'
import { PLAN_CATEGORY_OPTIONS } from '@/lib/constants'
import { DEFAULT_DATA_PAGE_SIZE, getDataPageCount, paginateItems } from '@/lib/dataView'
import { toLocalDate } from '@/lib/localDate'
import {
  filterAndSortPlans,
  indexLatestPlanExecutionsForDate,
  isPlanScheduledForDay,
  toEditablePlanFrequency,
  type EditablePlanFrequency,
  type PlanCategoryFilter,
  type PlanFrequencyFilter,
  type PlanSortOrder,
  type PlanStatusFilter,
} from '@/lib/planView'
import { getSubjectVisual } from '@/lib/subjectVisuals'

const FREQUENCY_LABELS: Record<string, string> = {
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

function formatWeekDays(days?: number[]): string {
  if (!days?.length) return '未设置星期'
  const labels = WEEKDAY_OPTIONS
    .filter((option) => days.includes(option.value))
    .map((option) => option.label)
  return `周${labels.join('、')}`
}

function getTodayStr(): string {
  return toLocalDate()
}

export default function Plans() {
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
  const [formFreq, setFormFreq] = useState<EditablePlanFrequency>('daily')
  const [formWeekDays, setFormWeekDays] = useState<number[]>([])
  const [formTime, setFormTime] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [editingLegacyCustomFrequency, setEditingLegacyCustomFrequency] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [planDetailOpen, setPlanDetailOpen] = useState(false)
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
  const formWeekDaysMissing = formFreq === 'weekly' && formWeekDays.length === 0

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
  const dayOfWeek = new Date().getDay()

  const activePlanCount = useMemo(() => plans.filter((plan) => plan.isActive).length, [plans])
  const pausedPlanCount = plans.length - activePlanCount

  // 今日计划（根据频率筛选）
  const todayPlans = useMemo(() => {
    return plans
      .filter((plan) => isPlanScheduledForDay(plan, dayOfWeek))
      .sort((a, b) => (a.targetTime || '99:99').localeCompare(b.targetTime || '99:99'))
  }, [plans, dayOfWeek])

  // 今日执行记录映射（状态 + ID）
  const todayExecMap = useMemo(
    () => indexLatestPlanExecutionsForDate(executions, today),
    [executions, today],
  )

  const completedTodayCount = useMemo(
    () => todayPlans.filter((plan) => todayExecMap.get(plan.id)?.isCompleted).length,
    [todayExecMap, todayPlans],
  )

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
    setFormFreq('daily')
    setFormWeekDays([])
    setFormTime('')
    setFormActive(true)
    setFormOpen(true)
  }

  const openEdit = (plan: StudyPlan) => {
    setEditingId(plan.id)
    setEditingLegacyCustomFrequency(plan.frequency === 'custom')
    setFormTitle(plan.title)
    setFormDescription(plan.description || '')
    setFormCategory(plan.category)
    setFormFreq(toEditablePlanFrequency(plan.frequency))
    setFormWeekDays(plan.weekDays || [])
    setFormTime(plan.targetTime || '')
    setFormActive(plan.isActive)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim() || formWeekDaysMissing || formSaving) return
    const data = {
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      category: formCategory as 'reading' | 'listening' | 'writing' | 'speaking' | 'vocabulary' | 'general',
      frequency: formFreq,
      weekDays: formFreq === 'weekly' ? formWeekDays : undefined,
      targetTime: formTime || undefined,
      isActive: formActive,
    }
    setFormSaving(true)
    setPlanMutationError('')
    try {
      const result = editingId
        ? await updatePlan(editingId, data)
        : await addPlan(data)
      if (result.status === 'applied' || result.status === 'duplicate') {
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
        description="统一管理每日与每周任务，今日完成后可直接打卡。"
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
          { label: '使用中', value: activePlanCount, description: '个', icon: <Play />, tone: 'primary' },
          { label: '今日待办', value: todayPlans.length, description: '项', icon: <Clock3 />, tone: 'warning' },
          {
            label: '今日完成',
            value: `${completedTodayCount}/${todayPlans.length}`,
            description: pausedPlanCount > 0 ? `${pausedPlanCount} 个计划已暂停` : '全部计划均已启用',
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
                        {FREQUENCY_LABELS[plan.frequency]}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="plan-library-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="plan-library-title" className="text-[15px] font-semibold md:text-base">计划库</h2>
            <p className="mt-1 text-sm text-muted-foreground">查找、暂停或调整长期学习安排</p>
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
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑计划' : '添加计划'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改这个学习计划的设置' : '创建一个新的学习计划'}
            </DialogDescription>
          </DialogHeader>

          {editingLegacyCustomFrequency && (
            <p
              className="rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-sm leading-5 text-warning-foreground"
              role="status"
            >
              此计划使用旧版“自定义”频率。编辑时已默认转为“每日”；保存后将按你当前选择的频率执行。
            </p>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-form-title">计划名称</Label>
              <Input
                id="plan-form-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="例如：每天背诵50个单词"
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

            <div className="space-y-2">
              <Label htmlFor="plan-form-frequency">频率</Label>
              <Select value={formFreq} onValueChange={(v) => v && setFormFreq(v as EditablePlanFrequency)}>
                <SelectTrigger id="plan-form-frequency" className="w-full">
                  <SelectValue>
                    {(value) => FREQUENCY_LABELS[String(value)] ?? '选择频率'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">每日</SelectItem>
                  <SelectItem value="weekly">每周</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formFreq === 'weekly' && (
              <div className="space-y-2">
                <span id="plan-form-weekdays-label" className="block text-sm font-medium">星期</span>
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
                        'flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-all',
                        formWeekDays.includes(day.value)
                          ? 'bg-primary text-primary-foreground'
                          : 'border bg-background hover:bg-accent'
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

            <div className="space-y-2">
              <Label htmlFor="plan-form-time">完成时间（可选）</Label>
              <Input
                id="plan-form-time"
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-subtle px-3 py-2.5">
              <div>
                <Label htmlFor="plan-form-active" className="cursor-pointer">启用此计划</Label>
                <p className="mt-1 text-xs text-muted-foreground">暂停的计划不会出现在今日待办</p>
              </div>
              <Switch
                id="plan-form-active"
                checked={formActive}
                onCheckedChange={setFormActive}
                aria-label="启用此计划"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!formTitle.trim() || formWeekDaysMissing || formSaving}
              aria-describedby={formWeekDaysMissing ? 'plan-form-weekdays-error' : undefined}
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
        <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1rem)] sm:max-w-lg flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
              AI 生成学习计划
            </DialogTitle>
            <DialogDescription>
              每次发送时读取近 {aiDefaultRangeDays} 天的最新学习快照。AI 只生成结构化草稿；你可以核对分类、频率与目标，再逐条确认加入计划。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 px-4 pb-4">
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
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" aria-hidden="true" />
              计划详情
            </DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">{selectedPlan.title}</h3>
                {selectedPlan.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{selectedPlan.description}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={cn('text-xs', getCategoryBadgeClass(selectedPlan.category))}>
                  {getCategoryLabel(selectedPlan.category)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {FREQUENCY_LABELS[selectedPlan.frequency]}
                </Badge>
                {selectedPlan.targetTime && (
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-xs text-primary">
                    {selectedPlan.targetTime}
                  </Badge>
                )}
                {selectedPlan.frequency === 'weekly' && selectedPlan.weekDays && (
                  <Badge variant="outline" className="text-xs">
                    {formatWeekDays(selectedPlan.weekDays)}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
              <th scope="col" className="px-4 py-3 text-left font-medium">频率</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">时间</th>
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
                  <p className="font-medium">{FREQUENCY_LABELS[plan.frequency]}</p>
                  {plan.frequency === 'weekly' && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={formatWeekDays(plan.weekDays)}>
                      {formatWeekDays(plan.weekDays)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {plan.targetTime || '—'}
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
                <span>{FREQUENCY_LABELS[plan.frequency]}</span>
                {plan.frequency === 'weekly' && <span>{formatWeekDays(plan.weekDays)}</span>}
                {plan.targetTime && (
                  <span className="inline-flex items-center gap-1 font-medium tabular-nums text-primary">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {plan.targetTime}
                  </span>
                )}
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
