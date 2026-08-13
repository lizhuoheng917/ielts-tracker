import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { StudyPlan, WordRecord } from '@/lib/types'
import { DEFAULT_WORD_CATEGORIES } from '@/lib/constants'
import { usePlanStore } from '@/stores/planStore'
import { useWordStore } from '@/stores/wordStore'
import { useAuth } from '@/auth/authContext'
import { resolveLexiWordsUrl } from '@/app/productLinks'
import {
  learnerAiTaskCoordinator,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import {
  List,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCcw,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { DataToolbar } from '@/components/ui/data-toolbar'
import { MetricGroup } from '@/components/ui/metric-group'
import { PageHeader } from '@/components/ui/page-header'
import { ContentCloudLocationField } from '@/components/sync/ContentCloudLocationField'
import { DataPagination } from '@/components/ui/data-pagination'
import {
  filterAndSortWordRecords,
  getWordRecordPageCount,
  paginateWordRecords,
  WORD_RECORD_PAGE_SIZE,
  type WordRecordSortOrder,
} from '@/lib/wordRecordView'
import {
  setTrackerContentCloudLocation,
  trackerContentCloudMode,
  type TrackerContentCloudMode,
} from '@/sync/trackerContentCloudPolicy'
import { WordsCollaborationPanel } from '@/features/words-plan-intent/WordsCollaborationPanel'
import {
  WordsPlanIntentDialog,
  type WordsPlanIntentMode,
} from '@/features/words-plan-intent/WordsPlanIntentDialog'
import {
  listWordsHubVocabularyPlans,
  resolveWordsHubVocabularyPlan,
  WORDS_HUB_NEW_PLAN_ID,
  WORDS_HUB_SOURCE_PLAN_PARAM,
} from '@/features/words-plan-intent/wordsHub'
import { parseWordsPlanRecommendationTaskContext } from '@/features/words-plan-intent/wordsPlanRecommendationView'
import { useWordsPlanReceipts } from '@/features/words-plan-intent/useWordsPlanReceipts'

// ===== Helper Functions =====

function getTodayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function formatDateCN(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}月${parseInt(d)}日`
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(monday), end: fmt(sunday) }
}

function getMonthRange(
  year: number,
  month: number
): { start: string; end: string } {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const startDay = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (Date | null)[] = []
  for (let i = 0; i < startDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ===== Types & Constants =====

interface FormData {
  date: string
  category: string
  count: number
  note: string
  isCustomCategory: boolean
  customCategory: string
}

const SORT_LABELS: Record<WordRecordSortOrder, string> = {
  newest: '日期：从新到旧',
  oldest: '日期：从旧到新',
  'count-desc': '数量：从多到少',
  'count-asc': '数量：从少到多',
}

const CATEGORY_COLORS: Record<string, string> = {
  '学术词汇': 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700',
  '高频词汇': 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/50 dark:text-violet-300 dark:border-violet-700',
  '场景词汇': 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/50 dark:text-fuchsia-300 dark:border-fuchsia-700',
  '同义替换词': 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700',
}

const DEFAULT_CATEGORY_COLOR =
  'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700'

const WORDS_HUB_PREVIEW_PLAN_ID = 'preview-vocabulary-plan'
const LEXI_WORDS_URL = resolveLexiWordsUrl({
  wordsAppUrl: import.meta.env.VITE_LEXI_WORDS_APP_URL,
  isDevelopment: import.meta.env.DEV,
})

function createWordsHubPreviewPlan(): StudyPlan {
  const now = new Date().toISOString()
  return {
    id: WORDS_HUB_PREVIEW_PLAN_ID,
    title: '本周雅思核心词汇复习',
    description: '每天完成一组核心词复习，并补充当天新词。',
    category: 'vocabulary',
    frequency: 'weekly',
    startDate: getTodayStr(),
    weekDays: [1, 3, 5],
    targetTime: '20:30',
    targetDuration: 35,
    targetCount: 24,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || DEFAULT_CATEGORY_COLOR
}

function getHeatmapColor(count: number, maxCount: number): string {
  if (count === 0) return 'bg-muted/50'
  const ratio = maxCount > 0 ? count / maxCount : 0
  if (ratio <= 0.25) return 'bg-indigo-100 dark:bg-indigo-800/60'
  if (ratio <= 0.5) return 'bg-indigo-200 dark:bg-indigo-700/70'
  if (ratio <= 0.75) return 'bg-indigo-400 dark:bg-indigo-600'
  return 'bg-indigo-600 text-white dark:bg-indigo-400'
}

// ===== Main Component =====

export default function Words() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const plans = usePlanStore((s) => s.plans)
  const deletePlan = usePlanStore((s) => s.deletePlan)
  const records = useWordStore((s) => s.records)
  const addRecord = useWordStore((s) => s.addRecord)
  const updateRecord = useWordStore((s) => s.updateRecord)
  const deleteRecord = useWordStore((s) => s.deleteRecord)

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<WordRecordSortOrder>('newest')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [planIntentOpen, setPlanIntentOpen] = useState(false)
  const [planIntentMode, setPlanIntentMode] = useState<WordsPlanIntentMode>('manual')
  const [planDeleteTarget, setPlanDeleteTarget] = useState<StudyPlan | null>(null)
  const [planDeleteSaving, setPlanDeleteSaving] = useState(false)
  const [planMutationError, setPlanMutationError] = useState('')

  const { openRequestedTaskKey, tasks: aiTasks } = useLearnerAiTaskState()
  const wordsHubPreview = useMemo(() => {
    if (!import.meta.env.DEV) return false
    return new URLSearchParams(location.search).get('preview') === 'words-hub'
  }, [location.search])
  const previewPlan = useMemo(createWordsHubPreviewPlan, [])
  const vocabularyPlans = useMemo(
    () => listWordsHubVocabularyPlans(
      wordsHubPreview
        ? [previewPlan, ...plans.filter((plan) => plan.id !== WORDS_HUB_PREVIEW_PLAN_ID)]
        : plans,
    ),
    [plans, previewPlan, wordsHubPreview],
  )
  const selectedPlan = resolveWordsHubVocabularyPlan(vocabularyPlans, selectedPlanId)
  const planReceipts = useWordsPlanReceipts({
    userId: user?.id ?? null,
    sourceRefs: selectedPlan ? [selectedPlan.id] : [],
    preview: wordsHubPreview,
  })

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCloudMode, setFormCloudMode] = useState<TrackerContentCloudMode>('local')
  const [form, setForm] = useState<FormData>({
    date: getTodayStr(),
    category: DEFAULT_WORD_CATEGORIES[0].name,
    count: 0,
    note: '',
    isCustomCategory: false,
    customCategory: '',
  })

  const [deleteTarget, setDeleteTarget] = useState<WordRecord | null>(null)

  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  // ===== Computed =====

  const filteredRecords = useMemo(() => {
    return filterAndSortWordRecords(records, {
      searchQuery,
      category: filterCategory,
      dateFrom,
      dateTo,
      sortOrder,
    })
  }, [records, filterCategory, searchQuery, dateFrom, dateTo, sortOrder])

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterCategory !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    sortOrder !== 'newest'

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const totalPages = getWordRecordPageCount(filteredRecords.length)
  const resolvedPage = Math.min(currentPage, totalPages)
  const paginatedRecords = useMemo(
    () => paginateWordRecords(filteredRecords, resolvedPage),
    [filteredRecords, resolvedPage],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterCategory, dateFrom, dateTo, sortOrder])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    if (selectedPlanId === WORDS_HUB_NEW_PLAN_ID) return
    if (selectedPlan && selectedPlan.id === selectedPlanId) return
    setSelectedPlanId(
      wordsHubPreview
        ? WORDS_HUB_PREVIEW_PLAN_ID
        : WORDS_HUB_NEW_PLAN_ID,
    )
  }, [selectedPlan, selectedPlanId, vocabularyPlans, wordsHubPreview])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const requestedPlanId = params.get(WORDS_HUB_SOURCE_PLAN_PARAM)
    const shouldOpenPreview = wordsHubPreview && params.get('open') === 'plan-intent'
    if (!requestedPlanId && !shouldOpenPreview) return

    const sourcePlan = resolveWordsHubVocabularyPlan(
      vocabularyPlans,
      requestedPlanId ?? WORDS_HUB_PREVIEW_PLAN_ID,
    )
    if (sourcePlan) {
      setSelectedPlanId(sourcePlan.id)
    }
    if (shouldOpenPreview) {
      setPlanIntentMode('ai')
      setPlanIntentOpen(true)
    }

    params.delete(WORDS_HUB_SOURCE_PLAN_PARAM)
    params.delete('open')
    const nextSearch = params.toString()
    navigate(
      { pathname: '/words', search: nextSearch ? `?${nextSearch}` : '' },
      { replace: true },
    )
  }, [location.search, navigate, vocabularyPlans, wordsHubPreview])

  useEffect(() => {
    if (!openRequestedTaskKey) return
    const task = aiTasks[openRequestedTaskKey]
    if (task?.purpose !== 'words_plan_recommendation') return
    const context = parseWordsPlanRecommendationTaskContext(task.context)
    const sourcePlan = context
      ? vocabularyPlans.find((plan) => plan.id === context.sourcePlanId)
      : undefined
    if (sourcePlan) {
      setSelectedPlanId(sourcePlan.id)
      setPlanIntentMode('ai')
      setPlanIntentOpen(true)
    } else if (context?.sourcePlanId === null) {
      setSelectedPlanId(WORDS_HUB_NEW_PLAN_ID)
      setPlanIntentMode('ai')
      setPlanIntentOpen(true)
    }
    learnerAiTaskCoordinator.consumeOpenRequest(openRequestedTaskKey)
  }, [aiTasks, openRequestedTaskKey, vocabularyPlans])

  const allCategories = useMemo(() => {
    const presetNames: string[] = DEFAULT_WORD_CATEGORIES.map((c) => c.name)
    const customNames: string[] = [
      ...new Set(records.map((r) => r.category).filter((c) => !presetNames.includes(c))),
    ]
    return [...presetNames, ...customNames]
  }, [records])

  const todayStr = getTodayStr()
  const weekRange = getWeekRange()
  const monthRange = getMonthRange(now.getFullYear(), now.getMonth())

  const todayCount = useMemo(
    () => records.filter((r) => r.date === todayStr).reduce((s, r) => s + r.count, 0),
    [records, todayStr]
  )

  const weekCount = useMemo(
    () =>
      records
        .filter((r) => r.date >= weekRange.start && r.date <= weekRange.end)
        .reduce((s, r) => s + r.count, 0),
    [records, weekRange]
  )

  const monthCount = useMemo(
    () =>
      records
        .filter((r) => r.date >= monthRange.start && r.date <= monthRange.end)
        .reduce((s, r) => s + r.count, 0),
    [records, monthRange]
  )

  const calendarDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth])

  const calendarData = useMemo(() => {
    const data: Record<string, number> = {}
    const { start, end } = getMonthRange(calYear, calMonth)
    records.forEach((r) => {
      if (r.date >= start && r.date <= end) {
        data[r.date] = (data[r.date] || 0) + r.count
      }
    })
    return data
  }, [records, calYear, calMonth])

  const maxCalCount = useMemo(
    () => Math.max(...Object.values(calendarData), 1),
    [calendarData]
  )

  // ===== Handlers =====

  const openAddForm = () => {
    setEditingId(null)
    setFormCloudMode('local')
    setForm({
      date: getTodayStr(),
      category: DEFAULT_WORD_CATEGORIES[0].name,
      count: 0,
      note: '',
      isCustomCategory: false,
      customCategory: '',
    })
    setFormOpen(true)
  }

  const openEditForm = (record: WordRecord) => {
    setEditingId(record.id)
    setFormCloudMode(trackerContentCloudMode({ entityKind: 'word_record', entityId: record.id }))
    const isCustom = !DEFAULT_WORD_CATEGORIES.some((c) => c.name === record.category)
    setForm({
      date: record.date,
      category: isCustom ? '' : record.category,
      count: record.count,
      note: record.note || '',
      isCustomCategory: isCustom,
      customCategory: isCustom ? record.category : '',
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    const finalCategory = form.isCustomCategory
      ? form.customCategory.trim()
      : form.category
    if (!finalCategory || form.count <= 0 || !form.date) return

    const result = editingId
      ? await updateRecord(editingId, {
        date: form.date,
        category: finalCategory,
        count: form.count,
        note: form.note || undefined,
      })
      : await addRecord({
        date: form.date,
        category: finalCategory,
        count: form.count,
        note: form.note || undefined,
      })
    if (result.status !== 'applied') {
      window.alert(result.error?.message ?? '单词记录暂时无法保存，请稍后重试。')
      return
    }
    const targetId = result.targetId ?? editingId
    if (targetId) {
      setTrackerContentCloudLocation({
        entityKind: 'word_record',
        entityId: targetId,
        mode: formCloudMode,
      })
    }
    setFormOpen(false)
  }

  const handleDelete = async () => {
    if (deleteTarget) {
      const result = await deleteRecord(deleteTarget.id)
      if (result.status !== 'applied') {
        window.alert(result.error?.message ?? '单词记录暂时无法删除，请稍后重试。')
        return
      }
      setDeleteTarget(null)
    }
  }

  const handleCategoryChange = (value: string) => {
    if (value === '__custom__') {
      setForm((prev) => ({ ...prev, isCustomCategory: true, category: '' }))
    } else {
      setForm((prev) => ({
        ...prev,
        category: value,
        isCustomCategory: false,
        customCategory: '',
      }))
    }
  }

  const handleVocabularyPlanDelete = async () => {
    if (!planDeleteTarget || planDeleteSaving) return
    setPlanDeleteSaving(true)
    setPlanMutationError('')
    try {
      const result = await deletePlan(planDeleteTarget.id)
      if (result.status === 'applied' || result.status === 'not_found') {
        setSelectedPlanId(WORDS_HUB_NEW_PLAN_ID)
        setPlanDeleteTarget(null)
      } else {
        setPlanMutationError(result.error?.message || '词汇计划暂时无法删除，请重试。')
      }
    } finally {
      setPlanDeleteSaving(false)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterCategory('all')
    setDateFrom('')
    setDateTo('')
    setSortOrder('newest')
    setCurrentPage(1)
  }

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalYear((y) => y - 1)
      setCalMonth(11)
    } else {
      setCalMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalYear((y) => y + 1)
      setCalMonth(0)
    } else {
      setCalMonth((m) => m + 1)
    }
  }

  // ===== Render =====

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        eyebrow="Vocabulary center"
        title="词汇中心"
        description="记录词汇学习，并在 Tracker 与 Words 之间制定可审阅的智能安排。"
        actions={(
          <Button onClick={openAddForm} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加记录
          </Button>
        )}
      />

      {/* Stats summary */}
      <MetricGroup
        ariaLabel="单词背诵概览"
        columns={3}
        items={[
          { label: '今日背诵', value: todayCount, description: '词', tone: 'primary' },
          { label: '本周背诵', value: weekCount, description: '词' },
          { label: '本月背诵', value: monthCount, description: '词' },
        ]}
      />

      <WordsCollaborationPanel
        plans={vocabularyPlans}
        selectedPlan={selectedPlan}
        userId={user?.id ?? null}
        preview={wordsHubPreview}
        selectedReceipt={selectedPlan ? planReceipts.receipts.get(selectedPlan.id) : null}
        receiptLoading={planReceipts.loading}
        receiptError={planReceipts.error}
        onSelectPlan={setSelectedPlanId}
        onRefreshReceipt={() => { void planReceipts.refresh() }}
        onDeletePlan={() => selectedPlan && setPlanDeleteTarget(selectedPlan)}
        onStartManual={() => {
          setPlanIntentMode('manual')
          setPlanIntentOpen(true)
        }}
        onStartAi={() => {
          setPlanIntentMode('ai')
          setPlanIntentOpen(true)
        }}
        onOpenPlans={() => navigate('/plans')}
      />

      {/* View toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="单词记录视图">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            aria-label="切换到列表视图"
            aria-pressed={viewMode === 'list'}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1">列表</span>
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendar')}
            aria-label="切换到日历视图"
            aria-pressed={viewMode === 'calendar'}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1">日历</span>
          </Button>
        </div>
        {viewMode === 'list' && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            共 <span className="font-medium tabular-nums text-foreground">{filteredRecords.length}</span> 条记录
          </p>
        )}
      </div>

      {/* Content area */}
      {viewMode === 'list' ? (
        <div className="space-y-4">
          <DataToolbar
            aria-label="筛选单词记录"
            mobileFilterTitle="筛选单词记录"
            mobileFilterCount={
              Number(filterCategory !== 'all')
              + Number(sortOrder !== 'newest')
              + Number(Boolean(dateFrom))
              + Number(Boolean(dateTo))
            }
            search={(
              <div className="space-y-1.5">
                <Label htmlFor="word-search" className="text-xs text-muted-foreground">搜索</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="word-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="搜索分类、备注或日期"
                    className="pl-8"
                  />
                </div>
              </div>
            )}
            filters={(
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="word-category-filter" className="text-xs text-muted-foreground">分类</Label>
                  <Select value={filterCategory} onValueChange={(value) => value && setFilterCategory(value)}>
                    <SelectTrigger id="word-category-filter" className="w-full">
                      <SelectValue>{filterCategory === 'all' ? '全部分类' : filterCategory}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部分类</SelectItem>
                      {allCategories.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="word-sort-order" className="text-xs text-muted-foreground">排序</Label>
                  <Select value={sortOrder} onValueChange={(value) => value && setSortOrder(value as WordRecordSortOrder)}>
                    <SelectTrigger id="word-sort-order" className="w-full">
                      <SelectValue>{SORT_LABELS[sortOrder]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(SORT_LABELS) as Array<[WordRecordSortOrder, string]>).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            actions={(
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="w-full sm:w-auto"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                清空筛选
              </Button>
            )}
            summary={(
              <span>
                找到 <strong className="font-semibold tabular-nums text-foreground">{filteredRecords.length}</strong> 条记录，每页最多 {WORD_RECORD_PAGE_SIZE} 条
              </span>
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="word-date-from" className="text-xs text-muted-foreground">开始日期</Label>
                  <Input
                    id="word-date-from"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    aria-invalid={dateRangeInvalid}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="word-date-to" className="text-xs text-muted-foreground">结束日期</Label>
                  <Input
                    id="word-date-to"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    aria-invalid={dateRangeInvalid}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </div>
              </div>
            </div>

            {dateRangeInvalid && (
              <p className="mt-2 text-xs text-destructive" role="alert">开始日期不能晚于结束日期</p>
            )}
          </DataToolbar>

          <ListView
            records={paginatedRecords}
            hasAnyRecords={records.length > 0}
            hasActiveFilters={hasActiveFilters}
            onAdd={openAddForm}
            onClearFilters={clearFilters}
            onEdit={openEditForm}
            onDelete={setDeleteTarget}
          />

          <DataPagination
            aria-label="单词记录分页"
            currentPage={resolvedPage}
            totalPages={totalPages}
            totalItems={filteredRecords.length}
            pageSize={WORD_RECORD_PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </div>
      ) : (
        <CalendarView
          calMonthLabel={`${calYear}年${calMonth + 1}月`}
          calendarDays={calendarDays}
          calendarData={calendarData}
          maxCalCount={maxCalCount}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
        />
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-h-[88dvh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑记录' : '添加记录'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改单词背诵记录' : '记录今天的单词背诵情况'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="word-form-date">日期</Label>
              <Input
                id="word-form-date"
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={form.isCustomCategory ? 'word-form-custom-category' : 'word-form-category'}>分类</Label>
              {form.isCustomCategory ? (
                <div className="flex gap-2">
                  <Input
                    id="word-form-custom-category"
                    placeholder="输入自定义分类名称"
                    value={form.customCategory}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        customCategory: e.target.value,
                      }))
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        isCustomCategory: false,
                        category: DEFAULT_WORD_CATEGORIES[0].name,
                        customCategory: '',
                      }))
                    }
                  >
                    预设
                  </Button>
                </div>
              ) : (
                <Select value={form.category} onValueChange={(v) => v && handleCategoryChange(v)}>
                  <SelectTrigger id="word-form-category" className="w-full">
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_WORD_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">自定义分类...</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="word-form-count">数量</Label>
              <Input
                id="word-form-count"
                type="number"
                min={1}
                value={form.count || ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    count: parseInt(e.target.value) || 0,
                  }))
                }
                placeholder="输入背诵数量"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="word-form-note">备注</Label>
              <Textarea
                id="word-form-note"
                value={form.note}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, note: e.target.value }))
                }
                placeholder="可选备注..."
                rows={3}
              />
            </div>

            <ContentCloudLocationField
              entityKind="word_record"
              entityId={editingId}
              value={formCloudMode}
              onValueChange={setFormCloudMode}
            />
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                form.count <= 0 ||
                !form.date ||
                (form.isCustomCategory && !form.customCategory.trim())
              }
              className="w-full sm:w-auto"
            >
              {editingId ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除{' '}
              {deleteTarget
                ? `${formatDateCN(deleteTarget.date)} 的「${deleteTarget.category}」记录（${deleteTarget.count}词）`
                : ''}
              吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="w-full sm:w-auto">
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WordsPlanIntentDialog
        open={planIntentOpen}
        mode={planIntentMode}
        plan={selectedPlan}
        userId={user?.id ?? null}
        wordsUrl={LEXI_WORDS_URL}
        preview={wordsHubPreview}
        onPlanSaved={setSelectedPlanId}
        onIntentSent={(planId) => {
          setSelectedPlanId(planId)
          void planReceipts.refresh()
        }}
        onOpenChange={setPlanIntentOpen}
      />

      <Dialog
        open={!!planDeleteTarget}
        onOpenChange={(open) => {
          if (!open && !planDeleteSaving) {
            setPlanDeleteTarget(null)
            setPlanMutationError('')
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除词汇计划？</DialogTitle>
            <DialogDescription>
              {planDeleteTarget ? `将删除「${planDeleteTarget.title}」及其 Tracker 执行记录。Words 中已经确认的学习安排不会被反向修改。` : ''}
            </DialogDescription>
          </DialogHeader>
          {planMutationError && <p className="text-sm text-destructive" role="alert">{planMutationError}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setPlanDeleteTarget(null)} disabled={planDeleteSaving} className="w-full sm:w-auto">
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleVocabularyPlanDelete()} disabled={planDeleteSaving} className="w-full sm:w-auto">
              {planDeleteSaving ? '正在删除…' : '删除词汇计划'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ===== List View =====

function ListView({
  records,
  hasAnyRecords,
  hasActiveFilters,
  onAdd,
  onClearFilters,
  onEdit,
  onDelete,
}: {
  records: WordRecord[]
  hasAnyRecords: boolean
  hasActiveFilters: boolean
  onAdd: () => void
  onClearFilters: () => void
  onEdit: (record: WordRecord) => void
  onDelete: (record: WordRecord) => void
}) {
  if (records.length === 0) {
    if (!hasAnyRecords) {
      return (
        <EmptyState
          scene="words"
          title="还没有记录任何单词"
          description="创建第一条单词背诵记录，之后可以按分类、日期和备注快速查找"
          action={<Button onClick={onAdd}><Plus className="h-4 w-4" aria-hidden="true" />添加第一条记录</Button>}
        />
      )
    }

    return (
      <EmptyState
        scene="words"
        title="没有匹配的记录"
        description="试试调整关键词、分类或日期范围"
        action={hasActiveFilters ? (
          <Button variant="outline" onClick={onClearFilters}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            清空筛选
          </Button>
        ) : undefined}
      />
    )
  }

  return (
    <Card className="py-0">
      {/* Desktop table */}
      <div className="hidden max-h-[65vh] overflow-auto lg:block">
        <table className="w-full min-w-[680px] table-fixed border-collapse text-sm">
          <caption className="sr-only">单词背诵记录列表</caption>
          <colgroup>
            <col className="w-28" />
            <col className="w-40" />
            <col />
            <col className="w-24" />
            <col className="w-24" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card/95 text-xs text-muted-foreground shadow-[0_1px_0_0_var(--border)] backdrop-blur">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">日期</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">分类</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">备注</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">数量</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((record) => (
              <tr key={record.id} className="group/row transition-colors hover:bg-accent/50">
                <td className="whitespace-nowrap px-4 py-3 font-medium" title={record.date}>
                  {formatDateCN(record.date)}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={cn('max-w-full border text-xs', getCategoryColor(record.category))}
                  >
                    <span className="truncate">{record.category}</span>
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <p className="truncate" title={record.note}>{record.note || '—'}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{record.count}</span>
                  <span className="ml-1 text-xs text-muted-foreground">词</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(record)}
                      className="h-8 w-8"
                      aria-label={`编辑 ${record.date} ${record.category} 记录`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(record)}
                      className="h-8 w-8"
                      aria-label={`删除 ${record.date} ${record.category} 记录`}
                    >
                      <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile and tablet cards */}
      <ul className="divide-y divide-border lg:hidden" aria-label="单词背诵记录列表">
        {records.map((record) => (
          <li key={record.id} className="px-3 py-3 transition-colors hover:bg-accent/50 sm:px-4">
            <article className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <time dateTime={record.date} className="text-sm font-medium">{formatDateCN(record.date)}</time>
                    <Badge
                      variant="outline"
                      className={cn('max-w-full border text-xs', getCategoryColor(record.category))}
                    >
                      <span className="truncate">{record.category}</span>
                    </Badge>
                  </div>
                  {record.note && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{record.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-baseline gap-0.5">
                  <span className="text-xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{record.count}</span>
                  <span className="text-xs text-muted-foreground">词</span>
                </div>
              </div>

              <div className="flex justify-end gap-1 border-t border-border/60 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(record)}
                  aria-label={`编辑 ${record.date} ${record.category} 记录`}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(record)}
                  aria-label={`删除 ${record.date} ${record.category} 记录`}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  删除
                </Button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ===== Calendar View =====

function CalendarView({
  calMonthLabel,
  calendarDays,
  calendarData,
  maxCalCount,
  onPrevMonth,
  onNextMonth,
}: {
  calMonthLabel: string
  calendarDays: (Date | null)[]
  calendarData: Record<string, number>
  maxCalCount: number
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
  const todayStr = getTodayStr()

  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardContent className="py-3 md:py-4 px-3 md:px-4">
        {/* Month navigation */}
        <div className="mb-3 md:mb-4 flex items-center justify-between">
          <Button variant="outline" size="icon-sm" onClick={onPrevMonth} className="h-8 w-8" aria-label="查看上个月">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="font-semibold text-sm md:text-base">{calMonthLabel}</span>
          <Button variant="outline" size="icon-sm" onClick={onNextMonth} className="h-8 w-8" aria-label="查看下个月">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7">
          {weekLabels.map((label) => (
            <div
              key={label}
              className="py-1 text-center text-xs md:text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, i) => {
            if (!day) {
              return <div key={`empty-${i}`} className="aspect-square" />
            }

            const dateStr = dateToStr(day)
            const count = calendarData[dateStr] || 0
            const isToday = dateStr === todayStr

            return (
              <div
                key={dateStr}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-lg text-xs md:text-sm',
                  getHeatmapColor(count, maxCalCount),
                  isToday && 'ring-2 ring-indigo-500'
                )}
                title={`${formatDateCN(dateStr)}: ${count}词`}
              >
                <span className="text-xs md:text-xs leading-none">{day.getDate()}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      'text-[12px] md:text-[12px] font-semibold leading-none',
                      count / maxCalCount > 0.75 && 'text-white'
                    )}
                  >
                    {count}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
