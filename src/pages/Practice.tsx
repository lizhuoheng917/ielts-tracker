import { useState, useMemo, useEffect } from 'react'
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
import { PlusIcon, PencilIcon, TrashIcon, Sparkles, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { WritingCorrection } from '@/components/ai/WritingCorrection'
import { useWritingReportStore, type WritingReport } from '@/stores/writingReportStore'

// ===== 雅思分数滑轴组件（方案 B：极简 + 端点提示） =====
function IeltsScoreSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (score: number) => void
}) {
  // 内部步进值：0~18 对应分数 0, 1, 1.5, 2, 2.5 ... 9
  const stepIndex = value === 0 ? 0 : Math.round((value - 1) * 2) + 1

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10)
    if (idx === 0) {
      onChange(0)
    } else {
      onChange(1 + (idx - 1) * 0.5)
    }
  }

  const displayScore = value > 0 ? (Number.isInteger(value) ? value.toString() : value.toFixed(1)) : '未评分'

  return (
    <div className="flex flex-col gap-3">
      {/* 标签行：提示文字 + 实时分数徽章 */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted-foreground">雅思分数</span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-md min-w-[4rem] justify-center transition-all',
            value > 0
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
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
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted-foreground/20 dark:bg-white/20" />
        {/* 输入滑块（透明背景，只显示拖拽按钮） */}
        <input
          type="range"
          min={0}
          max={18}
          step={1}
          value={stepIndex}
          onChange={handleChange}
          className="relative w-full h-7 appearance-none cursor-pointer bg-transparent z-10
            [&::-webkit-slider-container]:h-7 [&::-webkit-slider-container]:flex [&::-webkit-slider-container]:items-center
            [&::-webkit-slider-track]:h-0 [&::-webkit-slider-track]:bg-transparent
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-indigo-600 dark:[&::-webkit-slider-thumb]:bg-indigo-400
            [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white dark:[&::-webkit-slider-thumb]:border-slate-900
            [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(79,70,229,0.35)]
            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95
            [&::-moz-range-track]:h-0 [&::-moz-range-track]:bg-transparent
            [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-indigo-600 dark:[&::-moz-range-thumb]:bg-indigo-400
            [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white dark:[&::-moz-range-thumb]:border-slate-900
            [&::-moz-range-thumb]:shadow-[0_2px_8px_rgba(79,70,229,0.35)]
            [&::-moz-range-thumb]:cursor-pointer"
        />
      </div>

      {/* 端点提示 */}
      <div className="flex justify-between -mt-1">
        <span className="text-[11px] text-muted-foreground/60 dark:text-white/50">未评分</span>
        <span className="text-[11px] text-muted-foreground/60 dark:text-white/50">9</span>
      </div>
    </div>
  )
}

// ===== 科目颜色映射 =====
const TYPE_COLOR_MAP: Record<PracticeType, string> = {
  reading: '#3B82F6',
  listening: '#8B5CF6',
  writing: '#F59E0B',
  speaking: '#10B981',
}

const TYPE_LABEL_MAP: Record<PracticeType, string> = {
  reading: '阅读',
  listening: '听力',
  writing: '写作',
  speaking: '口语',
}

// ===== 格式化分数显示 =====
const formatScore = (s: number) => {
  if (Number.isInteger(s)) return s.toString()
  return s.toFixed(1)
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

  const color = TYPE_COLOR_MAP[type]

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}分钟`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}小时${m}分` : `${h}小时`
  }

  return (
    <div className="grid grid-cols-3 gap-2 md:gap-3 mb-3 md:mb-4">
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[13px] md:text-xs text-muted-foreground mb-0.5">平均分</div>
          <div className="text-lg md:text-lg font-bold" style={{ color }}>
            {avgScore !== undefined ? avgScore.toFixed(1) : '--'}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[13px] md:text-xs text-muted-foreground mb-0.5">总时长</div>
          <div className="text-lg md:text-lg font-bold" style={{ color }}>
            {totalDuration > 0 ? formatDuration(totalDuration) : '--'}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[13px] md:text-xs text-muted-foreground mb-0.5">练习次数</div>
          <div className="text-lg md:text-lg font-bold" style={{ color }}>
            {count > 0 ? count : '--'}
          </div>
        </CardContent>
      </Card>
    </div>
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

  const handleSubmit = () => {
    const durationNum = parseInt(duration, 10)
    if (!date || !durationNum || durationNum <= 0) return

    const data = {
      type,
      date,
      topic: topic.trim() || undefined,
      duration: durationNum,
      score: score > 0 ? score : undefined,
      note: note.trim() || undefined,
    }

    if (isEdit && editRecord) {
      updateRecord(editRecord.id, data)
    } else {
      addRecord(data)
    }

    onOpenChange(false)
  }

  const canSubmit = date && parseInt(duration, 10) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑模考' : '添加模考'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改这条模考记录的信息。' : '记录一次模考练习。'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 科目选择（添加模式下可选） */}
          <div className="flex flex-col gap-1.5">
            <Label>科目</Label>
            {isEdit ? (
              <div
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
                <SelectTrigger className="w-full">
                  <SelectValue />
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
            <Label>日期</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* 主题 */}
          <div className="flex flex-col gap-1.5">
            <Label>主题</Label>
            <Input
              placeholder="例如：剑桥真题15 Test3"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          {/* 时长 */}
          <div className="flex flex-col gap-1.5">
            <Label>时长（分钟）</Label>
            <Input
              type="number"
              min={1}
              placeholder="例如：60"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          {/* 评分：滑轴选择雅思分数 */}
          <div className="flex flex-col gap-1.5">
            <Label>雅思分数</Label>
            <IeltsScoreSlider value={score} onChange={setScore} />
          </div>

          {/* 备注 */}
          <div className="flex flex-col gap-1.5">
            <Label>备注</Label>
            <Textarea
              placeholder="练习心得、薄弱环节等..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose render={<Button variant="outline" className="w-full sm:w-auto" />}>
            取消
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
            {isEdit ? '保存修改' : '添加'}
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  recordTitle: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除「{recordTitle}」这条练习记录吗？此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose render={<Button variant="outline" className="w-full sm:w-auto" />}>
            取消
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} className="w-full sm:w-auto">
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== 记录卡片 =====
function RecordItem({
  record,
  onEdit,
  onDelete,
  className,
}: {
  record: PracticeRecord
  onEdit: () => void
  onDelete: () => void
  className?: string
}) {
  const color = TYPE_COLOR_MAP[record.type]

  return (
    <div className={cn('group/row flex items-start justify-between gap-3 px-3 md:px-4 py-3 md:py-3.5 hover:bg-accent/50 transition-colors', className)}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-[13px] text-muted-foreground">{record.date}</span>
          {record.topic && (
            <span className="text-[15px] font-medium truncate">{record.topic}</span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-[13px] text-muted-foreground">
            时长：{record.duration}分钟
          </span>
          {record.score !== undefined && record.score > 0 && (
            <span className="text-[13px] font-medium" style={{ color }}>
              雅思 {formatScore(record.score)}
            </span>
          )}
        </div>

        {record.note && (
          <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-2">
            {record.note}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="编辑" className="h-8 w-8">
          <PencilIcon className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="删除" className="h-8 w-8">
          <TrashIcon className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

// ===== Tab 内容 =====
function TabPanel({ type }: { type: PracticeType }) {
  const allRecords = usePracticeStore((s) => s.records)
  const [editingRecord, setEditingRecord] = useState<PracticeRecord | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PracticeRecord | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [reportsExpanded, setReportsExpanded] = useState(true)

  const deleteRecord = usePracticeStore((s) => s.deleteRecord)
  const writingReports = useWritingReportStore((s) => s.reports)
  const deleteWritingReport = useWritingReportStore((s) => s.deleteReport)

  const records = useMemo(
    () =>
      allRecords
        .filter((r) => r.type === type)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [allRecords, type]
  )

  const handleEdit = (record: PracticeRecord) => {
    setEditingRecord(record)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (record: PracticeRecord) => {
    setDeleteTarget(record)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteRecord(deleteTarget.id)
    }
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }

  return (
    <>
      <StatsSummary type={type} />

      {/* 写作 Tab AI 批改入口 */}
      {type === 'writing' && (
        <Card className="mb-4 py-0 cursor-pointer hover:border-amber-300/60 dark:hover:border-amber-700/40 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 transition-all active:scale-[0.99]" onClick={() => setAiOpen(true)}>
          <CardContent className="flex items-center justify-between py-0 px-3 md:px-4 min-h-[60px]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
                <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI 写作批改</p>
                <p className="text-xs text-muted-foreground">粘贴作文，AI 按评分标准批改</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">点击展开 →</span>
          </CardContent>
        </Card>
      )}

      {records.length === 0 ? (
        <EmptyState
          scene="practice"
          title="暂无练习记录"
          description="开始你的第一次练习吧，勤加练习才能稳步提升"
        />
      ) : (
        <Card className="py-0">
          <div className="divide-y divide-border">
            {records.map((record) => (
              <RecordItem
                key={record.id}
                record={record}
                onEdit={() => handleEdit(record)}
                onDelete={() => handleDeleteClick(record)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* 编辑弹窗 */}
      <PracticeFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editRecord={editingRecord}
        defaultType={type}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        recordTitle={deleteTarget?.topic || deleteTarget?.date || '该条记录'}
      />

      {/* AI 写作批改弹窗 */}
      {type === 'writing' && (
        <Dialog open={aiOpen} onOpenChange={setAiOpen}>
          <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-4 pt-4 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                AI 写作批改
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col flex-1 min-h-0 px-4 pb-4 overflow-y-auto">
              <WritingCorrection onSuccess={() => setAiOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* AI 写作批改报告列表 */}
      {type === 'writing' && writingReports.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <button
              onClick={() => setReportsExpanded(!reportsExpanded)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-500" />
                <h4 className="font-semibold text-sm">AI 写作批改报告 ({writingReports.length})</h4>
              </div>
              {reportsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {reportsExpanded && (
              <div className="mt-3 space-y-2">
                {writingReports.map((report) => (
                  <WritingReportItem
                    key={report.id}
                    report={report}
                    onDelete={() => deleteWritingReport(report.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}

// ===== 主页面 =====
export default function Practice() {
  const [activeTab, setActiveTab] = useState<PracticeType>('reading')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // 动态 Tab 样式：为每个 Tab 自定义底部指示器颜色
  const tabStyle = (type: PracticeType) => ({
    '--tab-color': TYPE_COLOR_MAP[type],
  }) as React.CSSProperties

  return (
    <div className="flex flex-col h-full">
      {/* 顶部标题和操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-[22px] md:text-2xl font-bold">模考</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">记录你的雅思模拟考试</p>
        <Button onClick={() => setAddDialogOpen(true)} className="w-full sm:w-auto">
          <PlusIcon className="h-4 w-4" />
          添加模考
        </Button>
      </div>

      {/* Tabs 区域 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PracticeType)}
        className="flex-1 flex flex-col"
      >
        <TabsList variant="line" className="mb-2 w-full overflow-x-auto">
          {PRACTICE_TYPE_OPTIONS.map((opt) => (
            <TabsTrigger
              key={opt.value}
              value={opt.value}
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
          <TabsContent key={opt.value} value={opt.value} className="flex-1 overflow-y-auto">
            <TabPanel type={opt.value as PracticeType} />
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
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {report.essayType === 'task1' ? '小作文' : '大作文'}批改
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(report.createdAt), 'yyyy-MM-dd HH:mm')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-lg font-bold', scoreColor(report.scores.total))}>
            {report.scores.total}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      
      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          {/* 评分详情 */}
          <div className="grid grid-cols-4 gap-2 mt-3 mb-3">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">TR/TA</p>
              <p className={cn('font-semibold', scoreColor(report.scores.tr_ta))}>{report.scores.tr_ta}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">CC</p>
              <p className={cn('font-semibold', scoreColor(report.scores.cc))}>{report.scores.cc}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">LR</p>
              <p className={cn('font-semibold', scoreColor(report.scores.lr))}>{report.scores.lr}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">GRA</p>
              <p className={cn('font-semibold', scoreColor(report.scores.gra))}>{report.scores.gra}</p>
            </div>
          </div>
          
          {/* 点评 */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">详细点评</p>
            <p className="text-sm whitespace-pre-wrap">{report.feedback}</p>
          </div>
          
          {/* 建议 */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">总体建议</p>
            <ul className="text-sm space-y-1">
              {report.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* 原文预览 */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">原文</p>
            <p className="text-xs text-muted-foreground line-clamp-3">{report.essayContent}</p>
          </div>
          
          {/* 删除按钮 */}
          <button
            onClick={handleDelete}
            className={cn(
              'text-xs px-2 py-1 rounded transition-colors',
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