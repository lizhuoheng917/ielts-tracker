import { useState, useMemo, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import type { PracticeType, PracticeRecord } from '@/lib/types'
import { PRACTICE_TYPE_OPTIONS } from '@/lib/constants'
import { usePracticeStore } from '@/stores/practiceStore'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  Search,
  RotateCcw,
  Download,
  PenLine,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { WritingCorrection, type WritingWorkspaceState } from '@/components/ai/WritingCorrection'
import { WritingFeedbackContent } from '@/components/ai/StructuredAIContent'
import { SafeAIContent } from '@/components/ai/SafeAIContent'
import {
  aiArtifactToMarkdown,
  listAiArtifactsForAccess,
  type WritingFeedbackArtifactV2,
} from '@/ai/artifactRepository'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import {
  learnerAiTaskCoordinator,
  learnerAiTaskKey,
  learnerAiTaskScopeKey,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'
import { useWritingReportStore, type WritingReport } from '@/stores/writingReportStore'
import { SUBJECT_VISUALS } from '@/lib/subjectVisuals'
import { DataToolbar } from '@/components/ui/data-toolbar'
import { DataPagination } from '@/components/ui/data-pagination'
import { MetricGroup } from '@/components/ui/metric-group'
import { PageHeader } from '@/components/ui/page-header'
import { DEFAULT_DATA_PAGE_SIZE, getDataPageCount, paginateItems } from '@/lib/dataView'
import {
  IELTS_SCORE_SLIDER_MAX,
  filterAndSortPracticeRecords,
  normalizeIeltsScore,
  scoreToSliderIndex,
  sliderIndexToScore,
  type PracticeRecordSortOrder,
} from '@/lib/practiceRecordView'

// ===== 雅思分数滑轴组件（方案 B：极简 + 端点提示） =====
function IeltsScoreSlider({
  id,
  value,
  onChange,
}: {
  id: string
  value: number
  onChange: (score: number) => void
}) {
  // 内部步进值：0~17 对应分数 0, 1, 1.5, 2, 2.5 ... 9
  const normalizedScore = normalizeIeltsScore(value) ?? 0
  const stepIndex = scoreToSliderIndex(normalizedScore)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10)
    onChange(sliderIndexToScore(idx))
  }

  const displayScore = normalizedScore > 0
    ? (Number.isInteger(normalizedScore) ? normalizedScore.toString() : normalizedScore.toFixed(1))
    : '未评分'

  return (
    <div className="flex flex-col gap-3">
      {/* 标签行：提示文字 + 实时分数徽章 */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground">雅思分数</span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-md min-w-[4rem] justify-center transition-all',
            normalizedScore > 0
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <span>雅思</span>
          <span className="tabular-nums">{displayScore}</span>
        </span>
      </div>

      {/* 滑轨：容器+轨道层+滑块层，确保轨道在所有浏览器中可见 */}
      <div className="relative h-7 flex items-center">
        {/* 轨道背景（独立层，确保始终可见） */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted-foreground/20" />
        {/* 输入滑块（透明背景，只显示拖拽按钮） */}
        <input
          id={id}
          type="range"
          min={0}
          max={IELTS_SCORE_SLIDER_MAX}
          step={1}
          value={stepIndex}
          onChange={handleChange}
          className="relative w-full h-7 appearance-none cursor-pointer bg-transparent z-10
            [&::-webkit-slider-container]:h-7 [&::-webkit-slider-container]:flex [&::-webkit-slider-container]:items-center
            [&::-webkit-slider-track]:h-0 [&::-webkit-slider-track]:bg-transparent
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-primary
            [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-background
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95
            [&::-moz-range-track]:h-0 [&::-moz-range-track]:bg-transparent
            [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-primary
            [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-background
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:cursor-pointer"
          aria-valuetext={displayScore}
        />
      </div>

      {/* 端点提示 */}
      <div className="flex justify-between -mt-1">
        <span className="text-[11px] text-muted-foreground/60">未评分</span>
        <span className="text-[11px] text-muted-foreground/60">9</span>
      </div>
    </div>
  )
}

// ===== 科目颜色映射 =====
const TYPE_COLOR_MAP: Record<PracticeType, string> = {
  reading: SUBJECT_VISUALS.reading.chartColor,
  listening: SUBJECT_VISUALS.listening.chartColor,
  writing: SUBJECT_VISUALS.writing.chartColor,
  speaking: SUBJECT_VISUALS.speaking.chartColor,
}

const TYPE_LABEL_MAP: Record<PracticeType, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
}

const SORT_LABELS: Record<PracticeRecordSortOrder, string> = {
  newest: '日期：从新到旧',
  oldest: '日期：从旧到新',
  'score-desc': '分数：从高到低',
  'score-asc': '分数：从低到高',
  'duration-desc': '时长：从长到短',
  'duration-asc': '时长：从短到长',
}

// ===== 格式化分数显示 =====
const formatScore = (s: number) => {
  if (Number.isInteger(s)) return s.toString()
  return s.toFixed(1)
}

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0
    ? `${hours}小时${remainingMinutes}分`
    : `${hours}小时`
}

const formatDateCN = (date: string) => {
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function downloadWritingReport(report: WritingFeedbackArtifactV2) {
  const url = URL.createObjectURL(new Blob([aiArtifactToMarkdown(report)], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `lexi-writing-${report.createdAt.slice(0, 10)}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

// ===== 统计摘要卡片 =====
function StatsSummary({ type }: { type: PracticeType }) {
  const allRecords = usePracticeStore((s) => s.records)
  const records = useMemo(() => allRecords.filter((r) => r.type === type), [allRecords, type])

  const count = records.length
  const totalDuration = records.reduce((sum, r) => sum + r.duration, 0)
  const scoredRecords = records.filter((r) => r.score !== undefined && r.score > 0)
  const avgScore =
    scoredRecords.length > 0
      ? scoredRecords.reduce((sum, r) => sum + (r.score ?? 0), 0) / scoredRecords.length
      : undefined

  return (
    <MetricGroup
      ariaLabel={`${TYPE_LABEL_MAP[type]}模考概览`}
      columns={3}
      items={[
        {
          label: '平均分',
          value: avgScore !== undefined ? avgScore.toFixed(1) : '—',
          description: avgScore !== undefined ? '雅思分数' : '尚未评分',
          tone: type,
        },
        {
          label: '总时长',
          value: totalDuration > 0 ? formatDuration(totalDuration) : '—',
          description: '累计练习',
          tone: type,
        },
        {
          label: '练习次数',
          value: count > 0 ? count : '—',
          description: '条记录',
          tone: type,
        },
      ]}
    />
  )
}

// ===== 表单弹窗 =====
function PracticeFormDialog({
  open,
  onOpenChange,
  editRecord,
  defaultType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editRecord: PracticeRecord | null
  defaultType: PracticeType
}) {
  const addRecord = usePracticeStore((s) => s.addRecord)
  const updateRecord = usePracticeStore((s) => s.updateRecord)

  const isEdit = editRecord !== null

  const [type, setType] = useState<PracticeType>(defaultType)
  const [date, setDate] = useState('')
  const [topic, setTopic] = useState('')
  const [duration, setDuration] = useState('')
  const [score, setScore] = useState<number>(0)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const formId = `practice-${isEdit ? `edit-${editRecord?.id ?? defaultType}` : `add-${defaultType}`}`

  // 当弹窗打开或 editRecord 变化时，初始化表单内容
  useEffect(() => {
    if (open) {
      if (isEdit && editRecord) {
        setType(editRecord.type)
        setDate(editRecord.date)
        setTopic(editRecord.topic ?? '')
        setDuration(String(editRecord.duration))
        setScore(editRecord.score ?? 0)
        setNote(editRecord.note ?? '')
      } else {
        setType(defaultType)
        setDate(format(new Date(), 'yyyy-MM-dd'))
        setTopic('')
        setDuration('')
        setScore(0)
        setNote('')
      }
    }
  }, [open, isEdit, editRecord, defaultType])

  const handleSubmit = async () => {
    if (submittingRef.current) return
    const durationNum = parseInt(duration, 10)
    if (!date || !durationNum || durationNum <= 0) return

    const data = {
      type,
      date,
      topic: topic.trim() || undefined,
      duration: durationNum,
      score: normalizeIeltsScore(score),
      note: note.trim() || undefined,
    }

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const result = isEdit && editRecord
        ? await updateRecord(editRecord.id, data)
        : await addRecord(data)

      if (result.status !== 'applied') {
        window.alert(result.error?.message ?? '模考记录暂时无法保存，请稍后重试。')
        return
      }

      onOpenChange(false)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const canSubmit = date && parseInt(duration, 10) > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && submittingRef.current) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        aria-busy={isSubmitting}
        className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑模考' : '添加模考'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改这条模考记录的信息。' : '记录一次模考练习。'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 科目选择（添加模式下可选） */}
          <div className="flex flex-col gap-1.5">
            <Label
              id={`${formId}-subject-label`}
              htmlFor={`${formId}-subject`}
            >
              科目
            </Label>
            {isEdit ? (
              <div
                id={`${formId}-subject`}
                role="textbox"
                aria-readonly="true"
                aria-labelledby={`${formId}-subject-label`}
                className="h-8 px-2.5 flex items-center rounded-lg border border-input text-sm font-medium"
                style={{ color: TYPE_COLOR_MAP[type] }}
              >
                {TYPE_LABEL_MAP[type]}
              </div>
            ) : (
              <Select
                value={type}
                onValueChange={(v) => setType(v as PracticeType)}
              >
                <SelectTrigger id={`${formId}-subject`} className="w-full">
                  <SelectValue>
                    {(value) => TYPE_LABEL_MAP[value as PracticeType] ?? '选择科目'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRACTICE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span style={{ color: opt.color }}>{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 日期 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-date`}>日期</Label>
            <Input
              id={`${formId}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* 主题 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-topic`}>主题</Label>
            <Input
              id={`${formId}-topic`}
              placeholder="例如：剑桥真题15 Test3"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          {/* 时长 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-duration`}>时长（分钟）</Label>
            <Input
              id={`${formId}-duration`}
              type="number"
              min={1}
              placeholder="例如：60"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          {/* 评分：滑轴选择雅思分数 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-score`}>雅思分数</Label>
            <IeltsScoreSlider id={`${formId}-score`} value={score} onChange={setScore} />
          </div>

          {/* 备注 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-note`}>备注</Label>
            <Textarea
              id={`${formId}-note`}
              placeholder="练习心得、薄弱环节等..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose render={<Button variant="outline" disabled={isSubmitting} className="w-full sm:w-auto" />}>
            取消
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            aria-busy={isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? '保存中…' : isEdit ? '保存修改' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== 删除确认弹窗 =====
function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  recordTitle,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  recordTitle: string
  pending: boolean
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen)
      }}
    >
      <DialogContent aria-busy={pending} className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除「{recordTitle}」这条练习记录吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose render={<Button variant="outline" disabled={pending} className="w-full sm:w-auto" />}>
            取消
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className="w-full sm:w-auto"
          >
            {pending ? '删除中…' : '删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== 响应式记录视图 =====
function PracticeRecordList({
  records,
  type,
  hasAnyRecords,
  hasActiveFilters,
  onAdd,
  onClearFilters,
  onEdit,
  onDelete,
}: {
  records: PracticeRecord[]
  type: PracticeType
  hasAnyRecords: boolean
  hasActiveFilters: boolean
  onAdd: () => void
  onClearFilters: () => void
  onEdit: (record: PracticeRecord) => void
  onDelete: (record: PracticeRecord) => void
}) {
  const typeLabel = TYPE_LABEL_MAP[type]
  const color = TYPE_COLOR_MAP[type]

  if (records.length === 0) {
    if (!hasAnyRecords) {
      return (
        <EmptyState
          scene="practice"
          title={`还没有${typeLabel}模考记录`}
          description="创建第一条记录，之后可以按主题、备注和日期快速回顾"
          action={(
            <Button type="button" onClick={onAdd}>
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              添加第一条记录
            </Button>
          )}
        />
      )
    }

    return (
      <EmptyState
        scene="practice"
        title="没有匹配的模考记录"
        description="试试调整关键词、日期范围或排序方式"
        action={hasActiveFilters ? (
          <Button type="button" variant="outline" onClick={onClearFilters}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            清空筛选
          </Button>
        ) : undefined}
      />
    )
  }

  const recordLabel = (record: PracticeRecord) =>
    `${record.date} ${record.topic || typeLabel}`

  return (
    <Card className="py-0">
      <div className="hidden max-h-[65vh] overflow-auto lg:block">
        <table className="w-full min-w-[780px] table-fixed border-collapse text-sm">
          <caption className="sr-only">{typeLabel}模考记录列表</caption>
          <colgroup>
            <col className="w-28" />
            <col className="w-48" />
            <col className="w-28" />
            <col className="w-24" />
            <col />
            <col className="w-24" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card/95 text-xs text-muted-foreground shadow-[0_1px_0_0_var(--border)] backdrop-blur">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium">日期</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">主题</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">时长</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">分数</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">备注</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((record) => (
              <tr key={record.id} className="group/row transition-colors hover:bg-accent/50">
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  <time dateTime={record.date} title={record.date}>{formatDateCN(record.date)}</time>
                </td>
                <td className="px-4 py-3">
                  <p className={cn('truncate font-medium', !record.topic && 'text-muted-foreground')} title={record.topic}>
                    {record.topic || '未填写主题'}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                  {formatDuration(record.duration)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums" style={{ color }}>
                  {record.score && record.score > 0 ? formatScore(record.score) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <p className="truncate" title={record.note}>{record.note || '—'}</p>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(record)}
                      className="h-8 w-8"
                      aria-label={`编辑 ${recordLabel(record)} 模考记录`}
                    >
                      <PencilIcon className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(record)}
                      className="h-8 w-8"
                      aria-label={`删除 ${recordLabel(record)} 模考记录`}
                    >
                      <TrashIcon className="size-3.5 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border lg:hidden" aria-label={`${typeLabel}模考记录列表`}>
        {records.map((record) => (
          <li key={record.id} className="px-3 py-3 transition-colors hover:bg-accent/50 sm:px-4">
            <article className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                    <time dateTime={record.date} className="text-xs text-muted-foreground">{formatDateCN(record.date)}</time>
                  </div>
                  <h3 className="mt-1 truncate text-[15px] font-semibold">
                    {record.topic || '未填写主题'}
                  </h3>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold tabular-nums" style={{ color }}>
                    {record.score && record.score > 0 ? formatScore(record.score) : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">雅思分数</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>时长 {formatDuration(record.duration)}</span>
                {record.note && <span className="line-clamp-1 min-w-0 flex-1">{record.note}</span>}
              </div>

              <div className="flex justify-end gap-1 border-t border-border/60 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(record)}
                  aria-label={`编辑 ${recordLabel(record)} 模考记录`}
                >
                  <PencilIcon className="size-3.5" aria-hidden="true" />
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(record)}
                  aria-label={`删除 ${recordLabel(record)} 模考记录`}
                  className="text-destructive hover:text-destructive"
                >
                  <TrashIcon className="size-3.5" aria-hidden="true" />
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

// ===== Tab 内容 =====
function TabPanel({ type, onAdd }: { type: PracticeType; onAdd: () => void }) {
  const allRecords = usePracticeStore((s) => s.records)
  const [editingRecord, setEditingRecord] = useState<PracticeRecord | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PracticeRecord | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const deletingRef = useRef(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [writingCloseConfirmOpen, setWritingCloseConfirmOpen] = useState(false)
  const [writingWorkspaceState, setWritingWorkspaceState] = useState<WritingWorkspaceState>({
    generating: false,
    hasUnsavedResult: false,
  })
  const [reportsExpanded, setReportsExpanded] = useState(true)
  const [selectedWritingReportId, setSelectedWritingReportId] = useState<string | null>(null)
  const [pendingWritingDeleteId, setPendingWritingDeleteId] = useState<string | null>(null)
  const [writingDeleteError, setWritingDeleteError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<PracticeRecordSortOrder>('newest')
  const [currentPage, setCurrentPage] = useState(1)

  const deleteRecord = usePracticeStore((s) => s.deleteRecord)
  const writingReports = useWritingReportStore((s) => s.reports)
  const deleteWritingReport = useWritingReportStore((s) => s.deleteReport)
  const artifactAccess = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(artifactAccess)
  const writingTaskKey = scopeKey
    ? learnerAiTaskKey('writing_feedback', scopeKey, 'practice-writing')
    : null
  const { openRequestedTaskKey } = useLearnerAiTaskState()
  const aiArtifacts = useAiArtifactStore((state) => state.artifacts)
  const deleteAiArtifact = useAiArtifactStore((state) => state.deleteArtifact)
  const writingArtifacts = useMemo(
    () => listAiArtifactsForAccess(aiArtifacts, artifactAccess, 'writing_feedback')
      .filter((artifact): artifact is WritingFeedbackArtifactV2 => artifact.outputSchemaVersion === 2),
    [aiArtifacts, artifactAccess],
  )
  const selectedWritingReport = selectedWritingReportId
    ? writingArtifacts.find((artifact) => artifact.recordId === selectedWritingReportId) ?? null
    : null
  const pendingWritingDelete = pendingWritingDeleteId
    ? writingArtifacts.find((artifact) => artifact.recordId === pendingWritingDeleteId) ?? null
    : null

  const subjectRecordCount = useMemo(
    () => allRecords.filter((record) => record.type === type).length,
    [allRecords, type],
  )
  const filteredRecords = useMemo(
    () => filterAndSortPracticeRecords(allRecords, {
      type,
      searchQuery,
      dateFrom,
      dateTo,
      sortOrder,
    }),
    [allRecords, type, searchQuery, dateFrom, dateTo, sortOrder],
  )
  const totalPages = getDataPageCount(filteredRecords.length)
  const resolvedPage = Math.min(currentPage, totalPages)
  const paginatedRecords = useMemo(
    () => paginateItems(filteredRecords, resolvedPage),
    [filteredRecords, resolvedPage],
  )
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    sortOrder !== 'newest'
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, dateFrom, dateTo, sortOrder])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    if (selectedWritingReportId && !selectedWritingReport) setSelectedWritingReportId(null)
    if (pendingWritingDeleteId && !pendingWritingDelete) {
      setPendingWritingDeleteId(null)
      setWritingDeleteError('')
    }
  }, [pendingWritingDelete, pendingWritingDeleteId, selectedWritingReport, selectedWritingReportId])

  useEffect(() => {
    if (type !== 'writing' || !writingTaskKey || openRequestedTaskKey !== writingTaskKey) return
    setAiOpen(true)
    learnerAiTaskCoordinator.consumeOpenRequest(writingTaskKey)
  }, [openRequestedTaskKey, type, writingTaskKey])

  const clearFilters = () => {
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
    setSortOrder('newest')
    setCurrentPage(1)
  }

  const handleEdit = (record: PracticeRecord) => {
    setEditingRecord(record)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (record: PracticeRecord) => {
    setDeleteTarget(record)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (deletingRef.current || !deleteTarget) return
    deletingRef.current = true
    setIsDeleting(true)
    try {
      const result = await deleteRecord(deleteTarget.id)
      if (result.status !== 'applied' && result.status !== 'not_found') {
        window.alert(result.error?.message ?? '模考记录暂时无法删除，请稍后重试。')
        return
      }
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    } finally {
      deletingRef.current = false
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <StatsSummary type={type} />

      {/* 写作 Tab AI 批改入口 */}
      {type === 'writing' && (
        <Card interactive className="py-0">
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            aria-label="打开 AI 写作批改"
            className="flex min-h-[64px] w-full items-center justify-between gap-3 px-3 text-left md:px-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subject-writing-soft text-subject-writing">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI 写作批改</p>
                <p className="text-xs text-muted-foreground">填写题目与作文，按公开标准生成学习反馈</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">点击展开 →</span>
          </button>
        </Card>
      )}

      <DataToolbar
        aria-label={`筛选${TYPE_LABEL_MAP[type]}模考记录`}
        mobileFilterTitle={`筛选${TYPE_LABEL_MAP[type]}模考记录`}
        mobileFilterCount={
          Number(sortOrder !== 'newest')
          + Number(Boolean(dateFrom))
          + Number(Boolean(dateTo))
        }
        search={(
          <div className="space-y-1.5">
            <Label htmlFor={`practice-${type}-search`} className="text-xs text-muted-foreground">搜索</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id={`practice-${type}-search`}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索主题、备注或日期"
                className="pl-8"
              />
            </div>
          </div>
        )}
        filters={(
          <div className="w-full space-y-1.5 sm:max-w-xs">
            <Label htmlFor={`practice-${type}-sort`} className="text-xs text-muted-foreground">排序</Label>
            <Select value={sortOrder} onValueChange={(value) => value && setSortOrder(value as PracticeRecordSortOrder)}>
              <SelectTrigger id={`practice-${type}-sort`} className="w-full">
                <SelectValue>{SORT_LABELS[sortOrder]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SORT_LABELS) as Array<[PracticeRecordSortOrder, string]>).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            找到 <strong className="font-semibold tabular-nums text-foreground">{filteredRecords.length}</strong> 条记录，每页最多 {DEFAULT_DATA_PAGE_SIZE} 条
          </span>
        )}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`practice-${type}-date-from`} className="text-xs text-muted-foreground">开始日期</Label>
            <Input
              id={`practice-${type}-date-from`}
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              aria-invalid={dateRangeInvalid}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`practice-${type}-date-to`} className="text-xs text-muted-foreground">结束日期</Label>
            <Input
              id={`practice-${type}-date-to`}
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              aria-invalid={dateRangeInvalid}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </div>
        {dateRangeInvalid && (
          <p className="mt-2 text-xs text-destructive" role="alert">开始日期不能晚于结束日期</p>
        )}
      </DataToolbar>

      <PracticeRecordList
        records={paginatedRecords}
        type={type}
        hasAnyRecords={subjectRecordCount > 0}
        hasActiveFilters={hasActiveFilters}
        onAdd={onAdd}
        onClearFilters={clearFilters}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
      />

      <DataPagination
        currentPage={resolvedPage}
        totalPages={totalPages}
        totalItems={filteredRecords.length}
        onPageChange={setCurrentPage}
        itemLabel="条记录"
        aria-label={`${TYPE_LABEL_MAP[type]}模考记录分页`}
      />

      {/* 编辑弹窗 */}
      <PracticeFormDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) setEditingRecord(null)
        }}
        editRecord={editingRecord}
        defaultType={type}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        recordTitle={deleteTarget?.topic || deleteTarget?.date || '该条记录'}
        pending={isDeleting}
      />

      {/* AI 写作批改弹窗 */}
      {type === 'writing' && (
        <Dialog
          open={aiOpen}
          onOpenChange={(open) => {
            if (open) {
              setAiOpen(true)
              return
            }
            if (writingWorkspaceState.hasUnsavedResult) {
              setWritingCloseConfirmOpen(true)
              return
            }
            setAiOpen(false)
            setWritingWorkspaceState({ generating: false, hasUnsavedResult: false })
          }}
        >
          <DialogContent className="!inset-0 !top-0 !left-0 !h-dvh !max-h-none !max-w-none !translate-x-0 !translate-y-0 !rounded-none grid-rows-[auto_minmax(0,1fr)] p-0 sm:!top-1/2 sm:!left-1/2 sm:!h-auto sm:!max-h-[92dvh] sm:!max-w-3xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-xl">
            <DialogHeader className="border-b px-4 pb-3 pt-4 sm:px-5">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                IELTS 写作反馈
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-3 sm:px-5">
              <WritingCorrection onWorkspaceStateChange={setWritingWorkspaceState} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={writingCloseConfirmOpen} onOpenChange={setWritingCloseConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>放弃未保存的写作报告？</DialogTitle>
            <DialogDescription>
              这份 AI 反馈还没有保存。关闭后反馈会丢失，但题目和作文草稿仍会保留。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWritingCloseConfirmOpen(false)}>继续查看</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setWritingCloseConfirmOpen(false)
                if (writingTaskKey) learnerAiTaskCoordinator.clearTerminalTask(writingTaskKey)
                setAiOpen(false)
                setWritingWorkspaceState({ generating: false, hasUnsavedResult: false })
              }}
            >
              放弃并关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 写作报告：V2 使用账号隔离的统一内容仓库；旧报告只读保留。 */}
      {type === 'writing' && (writingArtifacts.length > 0 || writingReports.length > 0) && (
        <Card size="sm" className="mt-3">
          <CardContent>
            <button
              type="button"
              onClick={() => setReportsExpanded(!reportsExpanded)}
              aria-expanded={reportsExpanded}
              aria-controls="writing-report-list"
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-amber-500" />
                <h4 className="font-semibold text-sm">写作反馈报告 ({writingArtifacts.length + writingReports.length})</h4>
              </div>
              {reportsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {reportsExpanded && (
              <div id="writing-report-list" className="mt-2 space-y-2">
                {writingArtifacts.map((report) => (
                  <div key={report.recordId} className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedWritingReportId(report.recordId)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subject-writing-soft text-subject-writing">
                        <FileText className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{report.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {report.content.submission.wordCount} 词 · {report.source === 'managed' ? 'Lexi AI' : '历史外部来源'} · {format(new Date(report.createdAt), 'yyyy-MM-dd HH:mm')}
                        </span>
                      </span>
                    </button>
                    <Button type="button" variant="ghost" size="icon-sm" className="size-10 sm:size-8" onClick={() => downloadWritingReport(report)} aria-label={`导出${report.title}`}>
                      <Download className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-10 text-destructive hover:text-destructive sm:size-8"
                      onClick={() => {
                        setWritingDeleteError('')
                        setPendingWritingDeleteId(report.recordId)
                      }}
                      aria-label={`删除${report.title}`}
                    >
                      <TrashIcon className="size-3.5" />
                    </Button>
                  </div>
                ))}

                {writingReports.length > 0 && (
                  <details className="rounded-lg border border-dashed border-border/70 px-2.5 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      旧版报告（{writingReports.length}）· 缺少题目与评分依据
                    </summary>
                    <div className="mt-2 space-y-2">
                      {writingReports.map((report) => (
                        <WritingReportItem
                          key={report.id}
                          report={report}
                          onDelete={() => deleteWritingReport(report.id)}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={selectedWritingReport !== null} onOpenChange={(open) => { if (!open) setSelectedWritingReportId(null) }}>
        <DialogContent className="!inset-0 !top-0 !left-0 !h-dvh !max-h-none !max-w-none !translate-x-0 !translate-y-0 !rounded-none grid-rows-[auto_minmax(0,1fr)_auto] p-0 sm:!top-1/2 sm:!left-1/2 sm:!h-auto sm:!max-h-[90dvh] sm:!max-w-3xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-xl">
          {selectedWritingReport && (
            <>
              <DialogHeader className="border-b px-4 pb-3 pt-4 sm:px-5">
                <DialogTitle className="pr-8">{selectedWritingReport.title}</DialogTitle>
                <DialogDescription>
                  {selectedWritingReport.content.submission.wordCount} 词 · {selectedWritingReport.source === 'managed' ? 'Lexi AI' : '历史外部来源'} · {format(new Date(selectedWritingReport.createdAt), 'yyyy-MM-dd HH:mm')}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
                <WritingFeedbackContent
                  submission={selectedWritingReport.content.submission}
                  feedback={selectedWritingReport.content.feedback}
                  overallBand={selectedWritingReport.content.overallBand}
                />
                <details className="mt-5 rounded-lg border border-border/70 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">查看原始作文</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedWritingReport.content.submission.essayText}</p>
                </details>
              </div>
              <DialogFooter className="mx-0 mb-0 px-4 py-3 sm:px-5">
                <Button type="button" variant="outline" onClick={() => downloadWritingReport(selectedWritingReport)}>
                  <Download className="size-4" aria-hidden="true" />导出 Markdown
                </Button>
                <Button type="button" onClick={() => setSelectedWritingReportId(null)}>关闭</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingWritingDelete !== null} onOpenChange={(open) => {
        if (!open) {
          setPendingWritingDeleteId(null)
          setWritingDeleteError('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除这份写作报告？</DialogTitle>
            <DialogDescription>删除不会影响作文练习记录，且无法撤销。</DialogDescription>
          </DialogHeader>
          {writingDeleteError && <p className="text-sm text-destructive" role="alert">{writingDeleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingWritingDeleteId(null)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!pendingWritingDelete) return
                try {
                  const deleted = deleteAiArtifact(pendingWritingDelete.recordId, artifactAccess)
                  if (!deleted) {
                    setWritingDeleteError('账号状态已变化，这份报告没有被删除。')
                    return
                  }
                  if (selectedWritingReportId === pendingWritingDelete.recordId) setSelectedWritingReportId(null)
                  setPendingWritingDeleteId(null)
                  setWritingDeleteError('')
                } catch {
                  setWritingDeleteError('删除结果无法写入当前设备，报告保持不变。')
                }
              }}
            >
              删除报告
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ===== 主页面 =====
export default function Practice() {
  const [activeTab, setActiveTab] = useState<PracticeType>('reading')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const artifactAccess = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(artifactAccess)
  const writingTaskKey = scopeKey
    ? learnerAiTaskKey('writing_feedback', scopeKey, 'practice-writing')
    : null
  const { openRequestedTaskKey } = useLearnerAiTaskState()

  useEffect(() => {
    if (writingTaskKey && openRequestedTaskKey === writingTaskKey) setActiveTab('writing')
  }, [openRequestedTaskKey, writingTaskKey])

  const openAddDialog = (type: PracticeType) => {
    setActiveTab(type)
    setAddDialogOpen(true)
  }

  // 动态 Tab 样式：为每个 Tab 自定义底部指示器颜色
  const tabStyle = (type: PracticeType) => ({
    '--tab-color': TYPE_COLOR_MAP[type],
  }) as React.CSSProperties

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        eyebrow="Mock test log"
        title="模考记录"
        description="按听说读写整理模拟考试，用筛选和分数变化定位下一轮训练重点。"
        actions={(
          <Button
            type="button"
            onClick={() => openAddDialog(activeTab)}
            aria-label={`添加${TYPE_LABEL_MAP[activeTab]}模考记录`}
            className="w-full sm:w-auto"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            添加模考
          </Button>
        )}
      />

      {/* Tabs 区域 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PracticeType)}
        className="flex flex-col"
      >
        <TabsList variant="line" className="mb-2 w-full overflow-x-auto" aria-label="雅思模考科目">
          {PRACTICE_TYPE_OPTIONS.map((opt) => (
            <TabsTrigger
              key={opt.value}
              value={opt.value}
              aria-label={`${opt.label}模考记录`}
              className={cn(
                'data-active:text-foreground px-3 md:px-4 py-1.5 text-sm md:text-base',
                'transition-colors transition-transform whitespace-nowrap active:scale-95'
              )}
              style={tabStyle(opt.value as PracticeType)}
            >
              <span
                className={cn(
                  'transition-colors',
                  activeTab === opt.value && 'font-semibold'
                )}
                style={{
                  color: activeTab === opt.value ? opt.color : undefined,
                }}
              >
                {opt.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {PRACTICE_TYPE_OPTIONS.map((opt) => (
          <TabsContent key={opt.value} value={opt.value} className="flex-1" keepMounted>
            <TabPanel
              type={opt.value as PracticeType}
              onAdd={() => openAddDialog(opt.value as PracticeType)}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* 添加练习弹窗（从顶部按钮触发，可选择科目） */}
      <PracticeFormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        editRecord={null}
        defaultType={activeTab}
      />

      {/* 注入全局样式：Tab 指示器颜色 */}
      <style>{`
        [data-variant="line"] [data-active]::after {
          background-color: var(--tab-color, var(--foreground)) !important;
          opacity: 1 !important;
        }
      `}</style>
    </div>
  )
}

// ===== AI 写作批改报告项 =====
function WritingReportItem({ report, onDelete }: { report: WritingReport; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const scoreColor = (score: number) =>
    score >= 7 ? 'text-green-600 dark:text-green-400' :
    score >= 5 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400'

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete()
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={`writing-report-${report.id}`}
        className="w-full flex items-center justify-between p-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {report.essayType === 'task1' ? '小作文' : '大作文'}批改
            </p>
            <p className="text-[11px] text-muted-foreground">
              {format(new Date(report.createdAt), 'yyyy-MM-dd HH:mm')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-base font-bold', scoreColor(report.scores.total))}>
            {report.scores.total}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      
      {expanded && (
        <div id={`writing-report-${report.id}`} className="px-2 pb-2 border-t border-border">
          {/* 评分详情 */}
          <div className="grid grid-cols-4 gap-1.5 mt-2 mb-2">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">TR/TA</p>
              <p className={cn('text-sm font-semibold', scoreColor(report.scores.tr_ta))}>{report.scores.tr_ta}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">CC</p>
              <p className={cn('text-sm font-semibold', scoreColor(report.scores.cc))}>{report.scores.cc}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">LR</p>
              <p className={cn('text-sm font-semibold', scoreColor(report.scores.lr))}>{report.scores.lr}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">GRA</p>
              <p className={cn('text-sm font-semibold', scoreColor(report.scores.gra))}>{report.scores.gra}</p>
            </div>
          </div>
          
          {/* 点评 */}
          <div className="mb-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-0.5">详细点评</p>
            <SafeAIContent content={report.feedback} className="mt-0.5" />
          </div>
          
          {/* 建议 */}
          <div className="mb-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-0.5">总体建议</p>
            <ul className="text-sm space-y-0.5">
              {report.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* 原文预览 */}
          <div className="mb-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-0.5">原文</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{report.essayContent}</p>
          </div>
          
          {/* 删除按钮 */}
          <button
            type="button"
            onClick={handleDelete}
            aria-label={`${confirmDelete ? '确认删除' : '删除'}这份写作批改报告`}
            className={cn(
              'text-xs px-2 py-0.5 rounded transition-colors',
              confirmDelete 
                ? 'bg-destructive text-destructive-foreground' 
                : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
            )}
          >
            <TrashIcon className="h-3 w-3 inline mr-1" />
            {confirmDelete ? '确认删除' : '删除'}
          </button>
        </div>
      )}
    </div>
  )
}
