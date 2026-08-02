import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  BookHeart,
  CalendarDays,
  NotebookPen,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Smile,
  Trash2,
} from 'lucide-react'

import type { DiaryEntry, MoodType } from '@/lib/types'
import { MOOD_OPTIONS } from '@/lib/constants'
import { useDiaryStore } from '@/stores/diaryStore'
import { cn } from '@/lib/utils'
import {
  DEFAULT_DATA_PAGE_SIZE,
  getDataPageCount,
  paginateItems,
} from '@/lib/dataView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DataPagination } from '@/components/ui/data-pagination'
import { DataToolbar } from '@/components/ui/data-toolbar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MetricGroup } from '@/components/ui/metric-group'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type DiaryMoodFilter = MoodType | 'all'
type DiarySortOrder = 'newest' | 'oldest'

const SORT_LABELS: Record<DiarySortOrder, string> = {
  newest: '日期从新到旧',
  oldest: '日期从旧到新',
}

function getMoodOption(mood: MoodType) {
  return MOOD_OPTIONS.find((option) => option.value === mood)
}

export default function Diary() {
  const entries = useDiaryStore((state) => state.entries)
  const addEntry = useDiaryStore((state) => state.addEntry)
  const updateEntry = useDiaryStore((state) => state.updateEntry)
  const deleteEntry = useDiaryStore((state) => state.deleteEntry)

  const [searchQuery, setSearchQuery] = useState('')
  const [moodFilter, setMoodFilter] = useState<DiaryMoodFilter>('all')
  const [sortOrder, setSortOrder] = useState<DiarySortOrder>('newest')
  const [currentPage, setCurrentPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formDate, setFormDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [formMood, setFormMood] = useState<MoodType>('normal')
  const [formContent, setFormContent] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => right.date.localeCompare(left.date)),
    [entries],
  )

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('zh-CN')
    const matchingEntries = sortedEntries.filter((entry) => {
      if (moodFilter !== 'all' && entry.mood !== moodFilter) return false
      if (!normalizedQuery) return true

      const mood = getMoodOption(entry.mood)
      return [entry.content, entry.date, mood?.label]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    })

    return sortOrder === 'newest' ? matchingEntries : [...matchingEntries].reverse()
  }, [moodFilter, searchQuery, sortOrder, sortedEntries])

  const totalPages = getDataPageCount(filteredEntries.length)
  const resolvedPage = Math.min(currentPage, totalPages)
  const paginatedEntries = useMemo(
    () => paginateItems(filteredEntries, resolvedPage),
    [filteredEntries, resolvedPage],
  )

  const currentMonth = format(new Date(), 'yyyy-MM')
  const currentMonthCount = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(currentMonth)).length,
    [currentMonth, entries],
  )
  const positiveMoodCount = useMemo(
    () => entries.filter((entry) => entry.mood === 'great' || entry.mood === 'good').length,
    [entries],
  )
  const positiveMoodRate = entries.length === 0
    ? 0
    : Math.round((positiveMoodCount / entries.length) * 100)
  const latestEntry = sortedEntries[0]
  const latestMood = latestEntry ? getMoodOption(latestEntry.mood) : undefined
  const hasActiveFilters = searchQuery.trim().length > 0 || moodFilter !== 'all' || sortOrder !== 'newest'

  const openAdd = () => {
    setEditingId(null)
    setFormDate(format(new Date(), 'yyyy-MM-dd'))
    setFormMood('normal')
    setFormContent('')
    setFormOpen(true)
  }

  const openEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id)
    setFormDate(entry.date)
    setFormMood(entry.mood)
    setFormContent(entry.content)
    setFormOpen(true)
  }

  const handleSave = () => {
    if (!formDate || !formContent.trim()) return
    if (editingId) {
      updateEntry(editingId, { date: formDate, mood: formMood, content: formContent.trim() })
    } else {
      addEntry({ date: formDate, mood: formMood, content: formContent.trim() })
    }
    setFormOpen(false)
  }

  const handleDelete = () => {
    if (!deleteId) return
    deleteEntry(deleteId)
    setDeleteId(null)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setMoodFilter('all')
    setSortOrder('newest')
    setCurrentPage(1)
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        eyebrow="Learning journal"
        title="学习日记"
        description="记录每天的学习心情、困难与收获，留下一条可回看的备考轨迹。"
        icon={<NotebookPen />}
        actions={(
          <Button type="button" onClick={openAdd} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            写日记
          </Button>
        )}
      />

      <MetricGroup
        ariaLabel="学习日记概览"
        items={[
          { label: '累计日记', value: entries.length, description: '篇学习记录', icon: <BookHeart />, tone: 'primary' },
          { label: '本月记录', value: currentMonthCount, description: format(new Date(), 'yyyy年M月'), icon: <CalendarDays />, tone: 'reading' },
          { label: '积极心情', value: `${positiveMoodRate}%`, description: `${positiveMoodCount} 篇为很棒或不错`, icon: <Smile />, tone: 'success' },
          {
            label: '最近记录',
            value: latestEntry ? format(parseISO(latestEntry.date), 'M月d日') : '暂无',
            description: latestMood ? `${latestMood.emoji} ${latestMood.label}` : '写下第一篇日记',
            icon: <NotebookPen />,
            tone: 'warning',
          },
        ]}
      />

      <section className="space-y-4" aria-labelledby="diary-records-heading">
        <SectionHeader
          titleId="diary-records-heading"
          eyebrow="Journal archive"
          title="日记记录"
          description="按关键词或心情查找记录，编辑和删除操作始终可以直接使用。"
          action={(
            <p className="text-sm text-muted-foreground" aria-live="polite">
              共 <span className="font-medium tabular-nums text-foreground">{filteredEntries.length}</span> 篇
            </p>
          )}
        />

        {entries.length > 0 && (
          <DataToolbar
            aria-label="筛选学习日记"
            mobileFilterTitle="筛选学习日记"
            mobileFilterCount={
              Number(moodFilter !== 'all')
              + Number(sortOrder !== 'newest')
            }
            search={(
              <div className="space-y-1.5">
                <Label htmlFor="diary-search" className="text-xs text-muted-foreground">搜索</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="diary-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value)
                      setCurrentPage(1)
                    }}
                    placeholder="搜索内容、心情或日期"
                    className="pl-8"
                  />
                </div>
              </div>
            )}
            filters={(
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="diary-mood-filter" className="text-xs text-muted-foreground">心情</Label>
                  <Select
                    value={moodFilter}
                    onValueChange={(value) => {
                      if (!value) return
                      setMoodFilter(value as DiaryMoodFilter)
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger id="diary-mood-filter" className="w-full">
                      <SelectValue>
                        {moodFilter === 'all'
                          ? '全部心情'
                          : `${getMoodOption(moodFilter)?.emoji} ${getMoodOption(moodFilter)?.label}`}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部心情</SelectItem>
                      {MOOD_OPTIONS.map((mood) => (
                        <SelectItem key={mood.value} value={mood.value}>
                          {mood.emoji} {mood.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="diary-sort-order" className="text-xs text-muted-foreground">排序</Label>
                  <Select
                    value={sortOrder}
                    onValueChange={(value) => {
                      if (!value) return
                      setSortOrder(value as DiarySortOrder)
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger id="diary-sort-order" className="w-full">
                      <SelectValue>{SORT_LABELS[sortOrder]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(SORT_LABELS) as Array<[DiarySortOrder, string]>).map(([value, label]) => (
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
                找到 <strong className="font-semibold tabular-nums text-foreground">{filteredEntries.length}</strong> 篇日记，每页最多 {DEFAULT_DATA_PAGE_SIZE} 篇
              </span>
            )}
          />
        )}

        {paginatedEntries.length === 0 ? (
          entries.length === 0 ? (
            <EmptyState
              scene="diary"
              title="还没有写过学习日记"
              description="写下今天的学习感悟，记录你备考路上的每一步。"
              action={(
                <Button type="button" onClick={openAdd}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  写第一篇日记
                </Button>
              )}
            />
          ) : (
            <EmptyState
              scene="diary"
              title="没有匹配的日记"
              description="试试调整关键词、心情或排序方式。"
              action={(
                <Button type="button" variant="outline" onClick={clearFilters}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  清空筛选
                </Button>
              )}
            />
          )
        ) : (
          <ul className="space-y-3" aria-label="学习日记记录">
            {paginatedEntries.map((entry) => {
              const mood = getMoodOption(entry.mood)
              const dateLabel = format(parseISO(entry.date), 'yyyy年M月d日 EEEE', { locale: zhCN })

              return (
                <li key={entry.id}>
                  <Card size="sm">
                    <CardContent>
                      <article className="space-y-3">
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-xl"
                          >
                            {mood?.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <time dateTime={entry.date} className="text-sm font-semibold text-foreground md:text-[15px]">
                              {dateLabel}
                            </time>
                            <div className="mt-1.5">
                              <Badge variant="secondary">{mood?.label}</Badge>
                            </div>
                          </div>
                        </div>

                        <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
                          {entry.content}
                        </p>

                        <div className="flex flex-wrap justify-end gap-1 border-t border-border/70 pt-2.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(entry)}
                            aria-label={`编辑 ${dateLabel} 的日记`}
                          >
                            <PenLine className="size-3.5" aria-hidden="true" />
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(entry.id)}
                            aria-label={`删除 ${dateLabel} 的日记`}
                          >
                            <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                            删除
                          </Button>
                        </div>
                      </article>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}

        <DataPagination
          currentPage={resolvedPage}
          totalPages={totalPages}
          totalItems={filteredEntries.length}
          onPageChange={setCurrentPage}
          itemLabel="篇日记"
          aria-label="学习日记分页"
        />
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑日记' : '新学习日记'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改这篇日记的内容。' : '记录今天的学习心情与收获。'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="diary-form-date">日期</Label>
              <Input
                id="diary-form-date"
                type="date"
                value={formDate}
                onChange={(event) => setFormDate(event.target.value)}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">心情</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MOOD_OPTIONS.map((mood) => (
                  <button
                    key={mood.value}
                    type="button"
                    aria-pressed={formMood === mood.value}
                    onClick={() => setFormMood(mood.value)}
                    className={cn(
                      'flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                      formMood === mood.value
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-input bg-background text-foreground hover:bg-accent',
                    )}
                  >
                    <span aria-hidden="true">{mood.emoji}</span>
                    <span>{mood.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="diary-form-content">内容</Label>
              <Textarea
                id="diary-form-content"
                value={formContent}
                onChange={(event) => setFormContent(event.target.value)}
                placeholder="今天学了什么？遇到了什么困难？有什么收获……"
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">保存前会自动去除内容首尾的空格。</p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!formDate || !formContent.trim()}
              className="w-full sm:w-auto"
            >
              {editingId ? '保存修改' : '添加日记'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这条学习日记吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} className="w-full sm:w-auto">
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
