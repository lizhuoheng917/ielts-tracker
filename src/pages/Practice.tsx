import { useState, useMemo } from 'react'
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
import { PlusIcon, PencilIcon, TrashIcon } from 'lucide-react'

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

// ===== 空状态鼓励文字 =====
const EMPTY_MESSAGES: Record<PracticeType, string> = {
  reading: '还没有阅读练习记录，开始第一篇阅读吧！',
  listening: '还没有听力练习记录，打开听力材料练起来！',
  writing: '还没有写作练习记录，动笔写第一篇作文吧！',
  speaking: '还没有口语练习记录，开口练习第一次吧！',
}

// ===== 星级评分组件（支持 0.5 分增量） =====
function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'md',
  showNumber = false,
}: {
  value: number | undefined
  onChange?: (v: number) => void
  readonly?: boolean
  size?: 'sm' | 'md'
  showNumber?: boolean
}) {
  const starSize = size === 'sm' ? 'text-sm' : 'text-base md:text-lg'
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const displayValue = hoverValue ?? value ?? 0

  // 计算第 index 颗星的填充百分比（0 / 50 / 100）
  const getStarFill = (index: number): number => {
    const starNum = index + 1
    if (displayValue >= starNum) return 100
    if (displayValue >= starNum - 0.5) return 50
    return 0
  }

  // 格式化分数显示
  const formatScore = (s: number) => {
    if (Number.isInteger(s)) return s.toString()
    return s.toFixed(1)
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 9 }, (_, i) => {
        const fillPercent = getStarFill(i)
        const halfScore = i + 0.5
        const fullScore = i + 1
        return (
          <span
            key={i}
            className={cn(
              'relative inline-block select-none leading-none',
              starSize,
              !readonly && 'cursor-pointer'
            )}
            style={{ width: '1em', height: '1em' }}
          >
            {/* 底层：空星 */}
            <span className="absolute inset-0 text-gray-300 dark:text-gray-600">
              {'\u2605'}
            </span>
            {/* 上层：填充星，通过宽度裁切实现半星效果 */}
            <span
              className={cn(
                'absolute inset-0 text-yellow-400 overflow-hidden whitespace-nowrap',
                !readonly && 'transition-all duration-100'
              )}
              style={{ width: `${fillPercent}%` }}
            >
              {'\u2605'}
            </span>
            {/* 交互层：左右两半 */}
            {!readonly && onChange && (
              <>
                <span
                  className="absolute left-0 top-0 w-1/2 h-full z-10"
                  onMouseEnter={() => setHoverValue(halfScore)}
                  onMouseLeave={() => setHoverValue(null)}
                  onClick={() => {
                    onChange(value === halfScore ? 0 : halfScore)
                  }}
                  onTouchStart={() => {
                    onChange(value === halfScore ? 0 : halfScore)
                  }}
                  role="button"
                  aria-label={`${halfScore}分`}
                />
                <span
                  className="absolute right-0 top-0 w-1/2 h-full z-10"
                  onMouseEnter={() => setHoverValue(fullScore)}
                  onMouseLeave={() => setHoverValue(null)}
                  onClick={() => {
                    onChange(value === fullScore ? 0 : fullScore)
                  }}
                  onTouchStart={() => {
                    onChange(value === fullScore ? 0 : fullScore)
                  }}
                  role="button"
                  aria-label={`${fullScore}分`}
                />
              </>
            )}
          </span>
        )
      })}
      {showNumber && value !== undefined && value > 0 && (
        <span className="ml-1 text-xs md:text-sm font-medium text-foreground">
          {formatScore(value)} / 9
        </span>
      )}
    </span>
  )
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
          <div className="text-[10px] md:text-xs text-muted-foreground mb-0.5">平均分</div>
          <div className="text-base md:text-lg font-bold" style={{ color }}>
            {avgScore !== undefined ? avgScore.toFixed(1) : '--'}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[10px] md:text-xs text-muted-foreground mb-0.5">总时长</div>
          <div className="text-base md:text-lg font-bold" style={{ color }}>
            {totalDuration > 0 ? formatDuration(totalDuration) : '--'}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[10px] md:text-xs text-muted-foreground mb-0.5">练习次数</div>
          <div className="text-base md:text-lg font-bold" style={{ color }}>
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

  // 当弹窗打开时初始化表单
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
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
    onOpenChange(nextOpen)
  }

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑练习' : '添加练习'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改这条练习记录的信息。' : '记录一次听说读写练习。'}
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

          {/* 评分 */}
          <div className="flex flex-col gap-1.5">
            <Label>评分（雅思1-9分，支持0.5分）</Label>
            <StarRating value={score || undefined} onChange={setScore} showNumber />
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
}: {
  record: PracticeRecord
  onEdit: () => void
  onDelete: () => void
}) {
  const color = TYPE_COLOR_MAP[record.type]

  return (
    <Card size="sm" className="group/card">
      <CardContent className="py-2.5 md:py-3 px-3 md:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-muted-foreground">{record.date}</span>
              {record.topic && (
                <span className="text-sm font-medium truncate">{record.topic}</span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">
                时长：{record.duration}分钟
              </span>
              {record.score !== undefined && record.score > 0 && (
                <span className="flex items-center gap-1">
                  <StarRating value={record.score} readonly size="sm" />
                  <span className="text-xs font-medium" style={{ color }}>
                    {Number.isInteger(record.score) ? record.score : record.score.toFixed(1)}
                  </span>
                </span>
              )}
            </div>

            {record.note && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {record.note}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="编辑" className="h-8 w-8">
              <PencilIcon className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="删除" className="h-8 w-8">
              <TrashIcon className="size-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ===== Tab 内容 =====
function TabPanel({ type }: { type: PracticeType }) {
  const allRecords = usePracticeStore((s) => s.records)
  const [editingRecord, setEditingRecord] = useState<PracticeRecord | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PracticeRecord | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const deleteRecord = usePracticeStore((s) => s.deleteRecord)

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

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center">
          <span className="text-3xl md:text-4xl mb-4">
            {type === 'reading' && '\uD83D\uDCD6'}
            {type === 'listening' && '\uD83C\uDFA7'}
            {type === 'writing' && '\u270D\uFE0F'}
            {type === 'speaking' && '\uD83C\uDFA4'}
          </span>
          <p className="text-sm text-muted-foreground px-4">{EMPTY_MESSAGES[type]}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((record) => (
            <RecordItem
              key={record.id}
              record={record}
              onEdit={() => handleEdit(record)}
              onDelete={() => handleDeleteClick(record)}
            />
          ))}
        </div>
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
        <h1 className="text-xl md:text-2xl font-bold">听说读写</h1>
        <Button onClick={() => setAddDialogOpen(true)} className="w-full sm:w-auto">
          <PlusIcon className="h-4 w-4" />
          添加练习
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
                'transition-colors whitespace-nowrap'
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
