import { useState, useMemo } from 'react'
import type { WordRecord } from '@/lib/types'
import { DEFAULT_WORD_CATEGORIES } from '@/lib/constants'
import { useWordStore } from '@/stores/wordStore'
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
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

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

const CATEGORY_COLORS: Record<string, string> = {
  '学术词汇': 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700',
  '高频词汇': 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/50 dark:text-violet-300 dark:border-violet-700',
  '场景词汇': 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/50 dark:text-fuchsia-300 dark:border-fuchsia-700',
  '同义替换词': 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700',
}

const DEFAULT_CATEGORY_COLOR =
  'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700'

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
  const records = useWordStore((s) => s.records)
  const addRecord = useWordStore((s) => s.addRecord)
  const updateRecord = useWordStore((s) => s.updateRecord)
  const deleteRecord = useWordStore((s) => s.deleteRecord)

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
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

  const sortedRecords = useMemo(() => {
    const filtered =
      filterCategory === 'all'
        ? [...records]
        : records.filter((r) => r.category === filterCategory)
    return filtered.sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    )
  }, [records, filterCategory])

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

  const handleSave = () => {
    const finalCategory = form.isCustomCategory
      ? form.customCategory.trim()
      : form.category
    if (!finalCategory || form.count <= 0 || !form.date) return

    if (editingId) {
      updateRecord(editingId, {
        date: form.date,
        category: finalCategory,
        count: form.count,
        note: form.note || undefined,
      })
    } else {
      addRecord({
        date: form.date,
        category: finalCategory,
        count: form.count,
        note: form.note || undefined,
      })
    }
    setFormOpen(false)
  }

  const handleDelete = () => {
    if (deleteTarget) {
      deleteRecord(deleteTarget.id)
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] md:text-2xl font-bold">单词记录</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            记录每日单词背诵数量和分类
          </p>
        </div>
        <Button onClick={openAddForm} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          添加记录
        </Button>
      </div>

      {/* View toggle & filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border p-0.5">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">列表</span>
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">日历</span>
          </Button>
        </div>

        {viewMode === 'list' && (
          <Select value={filterCategory} onValueChange={(v) => v && setFilterCategory(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {allCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content area */}
      {viewMode === 'list' ? (
        <ListView
          records={sortedRecords}
          onEdit={openEditForm}
          onDelete={setDeleteTarget}
        />
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

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-3 md:py-4">
            <span className="text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {todayCount}
            </span>
            <span className="text-[13px] md:text-xs text-muted-foreground">今日背诵</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-3 md:py-4">
            <span className="text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {weekCount}
            </span>
            <span className="text-[13px] md:text-xs text-muted-foreground">本周背诵</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-3 md:py-4">
            <span className="text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {monthCount}
            </span>
            <span className="text-[13px] md:text-xs text-muted-foreground">本月背诵</span>
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑记录' : '添加记录'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改单词背诵记录' : '记录今天的单词背诵情况'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>日期</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>分类</Label>
              {form.isCustomCategory ? (
                <div className="flex gap-2">
                  <Input
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
                  <SelectTrigger className="w-full">
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
              <Label>数量</Label>
              <Input
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
              <Label>备注</Label>
              <Textarea
                value={form.note}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, note: e.target.value }))
                }
                placeholder="可选备注..."
                rows={3}
              />
            </div>
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
    </div>
  )
}

// ===== List View =====

function ListView({
  records,
  onEdit,
  onDelete,
}: {
  records: WordRecord[]
  onEdit: (record: WordRecord) => void
  onDelete: (record: WordRecord) => void
}) {
  if (records.length === 0) {
    return (
      <EmptyState
        scene="words"
        title="还没有记录任何单词"
        description="开始你的第一个单词背诵记录吧，每天积累一点点"
      />
    )
  }

  return (
    <div className="space-y-2 md:space-y-3">
      {records.map((record, index) => (
        <Card key={record.id} className={`animate-stagger-up stagger-${(index % 8) + 1} transition-[shadow,transform] hover:shadow-md active:scale-[0.99] active:bg-accent/80`}>
          <CardContent className="flex items-center gap-3 md:gap-4 py-2.5 px-3 md:px-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {formatDateCN(record.date)}
                </span>
                <Badge
                  variant="outline"
                  className={cn('border text-[12px] md:text-xs', getCategoryColor(record.category))}
                >
                  {record.category}
                </Badge>
              </div>
              {record.note && (
                <p className="mt-1 truncate text-xs md:text-sm text-muted-foreground">
                  {record.note}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-baseline gap-0.5">
              <span className="text-lg md:text-xl font-bold text-indigo-600 dark:text-indigo-400">
                {record.count}
              </span>
              <span className="text-xs text-muted-foreground">词</span>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(record)}
                className="h-8 w-8"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(record)}
                className="h-8 w-8"
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
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
    <Card>
      <CardContent className="py-3 md:py-4 px-3 md:px-4">
        {/* Month navigation */}
        <div className="mb-3 md:mb-4 flex items-center justify-between">
          <Button variant="outline" size="icon-sm" onClick={onPrevMonth} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-sm md:text-base">{calMonthLabel}</span>
          <Button variant="outline" size="icon-sm" onClick={onNextMonth} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
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
