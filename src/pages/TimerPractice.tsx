import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { format } from 'date-fns'
import type { TimerSubject, TimerRecord } from '@/lib/types'
import { useTimerStore } from '@/stores/timerStore'
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
  DialogClose,
} from '@/components/ui/dialog'
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Trash2,
  Pencil,
  BookOpen,
  Headphones,
  PenLine,
  MessageCircle,
  Layers,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

// ===== 科目配置：标签、图标、颜色 =====
const SUBJECT_CONFIG: Record<TimerSubject, { label: string; icon: ReactNode; color: string; badgeClass: string; ringColor: string; gradientFrom: string; gradientTo: string }> = {
  reading: { label: '阅读', icon: <BookOpen className="h-4 w-4" />, color: 'text-blue-500', badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', ringColor: 'ring-blue-400', gradientFrom: '#3B82F6', gradientTo: '#6366F1' },
  listening: { label: '听力', icon: <Headphones className="h-4 w-4" />, color: 'text-violet-500', badgeClass: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', ringColor: 'ring-violet-400', gradientFrom: '#8B5CF6', gradientTo: '#A78BFA' },
  writing: { label: '写作', icon: <PenLine className="h-4 w-4" />, color: 'text-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', ringColor: 'ring-emerald-400', gradientFrom: '#10B981', gradientTo: '#34D399' },
  speaking: { label: '口语', icon: <MessageCircle className="h-4 w-4" />, color: 'text-orange-500', badgeClass: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', ringColor: 'ring-orange-400', gradientFrom: '#F97316', gradientTo: '#FB923C' },
  general: { label: '综合', icon: <Layers className="h-4 w-4" />, color: 'text-indigo-500', badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', ringColor: 'ring-indigo-400', gradientFrom: '#4F46E5', gradientTo: '#6366F1' },
}

// ===== 时长预设 =====
const PRESETS = [25, 45, 60]

// ===== 格式化计时器显示 MM:SS =====
function formatTimerDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// ===== 格式化时长为可读文本 =====
function formatDurationMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}小时${rm}分钟` : `${h}小时`
}

// ===== 统计摘要卡片 =====
function StatsSummary() {
  const records = useTimerStore((s) => s.records)

  // 今日练习时长（秒）
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayDuration = useMemo(
    () => records.filter((r) => r.date === todayStr).reduce((sum, r) => sum + r.duration, 0),
    [records, todayStr]
  )

  // 本周练习时长（秒）
  const weekDuration = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1 // 周一为起点
    const monday = new Date(now)
    monday.setDate(now.getDate() - dayOfWeek)
    const mondayStr = format(monday, 'yyyy-MM-dd')
    return records.filter((r) => r.date >= mondayStr).reduce((sum, r) => sum + r.duration, 0)
  }, [records])

  // 总练习次数
  const totalCount = records.length

  return (
    <div className="grid grid-cols-3 gap-2 md:gap-3 mb-3 md:mb-4">
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[13px] md:text-xs text-muted-foreground mb-0.5">今日练习</div>
          <div className="text-lg md:text-lg font-bold text-indigo-500">
            {todayDuration > 0 ? formatDurationMinutes(todayDuration) : '--'}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[13px] md:text-xs text-muted-foreground mb-0.5">本周练习</div>
          <div className="text-lg md:text-lg font-bold text-indigo-500">
            {weekDuration > 0 ? formatDurationMinutes(weekDuration) : '--'}
          </div>
        </CardContent>
      </Card>
      <Card size="sm" className="flex-1">
        <CardContent className="text-center py-2 px-2">
          <div className="text-[13px] md:text-xs text-muted-foreground mb-0.5">总练习次数</div>
          <div className="text-lg md:text-lg font-bold text-indigo-500">
            {totalCount > 0 ? totalCount : '--'}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ===== 计时器区域 =====
function TimerSection() {
  const {
    status,
    mode,
    subject,
    presetMinutes,
    remainingSeconds,
    elapsedSeconds,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    resetTimer,
    tick,
  } = useTimerStore()

  // 本地 UI 状态
  const [selectedMode, setSelectedMode] = useState<'countdown' | 'stopwatch'>(mode)
  const [selectedSubject, setSelectedSubject] = useState<TimerSubject>(subject)
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(presetMinutes)
  const [customMinutes, setCustomMinutes] = useState<string>('')
  const [showRecordDialog, setShowRecordDialog] = useState(false)
  const [recordDuration, setRecordDuration] = useState(0) // 记录弹窗中的实际时长（秒）

  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'
  const isFinished = status === 'finished'
  const isCustom = selectedPreset === 'custom'

  // 当前显示的秒数
  const displaySeconds = selectedMode === 'countdown' ? remainingSeconds : elapsedSeconds

  // 计时结束检测，弹出记录弹窗
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (status === 'finished' && prevStatusRef.current !== 'finished') {
      // 倒计时结束，自动弹出记录弹窗
      setRecordDuration(elapsedSeconds || presetMinutes * 60)
      setShowRecordDialog(true)
    }
    prevStatusRef.current = status
  }, [status, elapsedSeconds, presetMinutes])

  // 每秒 tick
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      tick()
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, tick])

  // 获取实际要使用的分钟数
  const getMinutes = useCallback((): number => {
    if (isCustom) {
      const val = parseInt(customMinutes, 10)
      return val > 0 ? val : 25
    }
    return selectedPreset as number
  }, [isCustom, customMinutes, selectedPreset])

  // 开始计时
  const handleStart = useCallback(() => {
    const minutes = getMinutes()
    startTimer(selectedMode, selectedSubject, minutes)
  }, [selectedMode, selectedSubject, getMinutes, startTimer])

  // 暂停
  const handlePause = useCallback(() => {
    pauseTimer()
  }, [pauseTimer])

  // 继续
  const handleResume = useCallback(() => {
    resumeTimer()
  }, [resumeTimer])

  // 停止（手动停止，弹出记录弹窗）
  const handleStop = useCallback(() => {
    const actualSeconds = stopTimer()
    if (actualSeconds > 0) {
      setRecordDuration(actualSeconds)
      setShowRecordDialog(true)
    }
  }, [stopTimer])

  // 取消/重置（不弹出记录弹窗）
  const handleCancel = useCallback(() => {
    resetTimer()
  }, [resetTimer])

  // 计时中禁止切换模式/科目/时长
  const canSwitch = isIdle

  // SVG 圆环进度计算
  const totalSeconds = mode === 'countdown' ? presetMinutes * 60 : 0
  const progress = mode === 'countdown' && totalSeconds > 0
    ? 1 - (remainingSeconds / totalSeconds)
    : 0
  const radius = 90
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  // 根据科目获取对应颜色
  const subjectConfig = SUBJECT_CONFIG[selectedSubject]

  return (
    <>
      <Card
        className={cn(
          'mb-4 overflow-hidden rounded-2xl transition-all duration-500',
          isRunning && 'ring-2 ring-indigo-500/40 shadow-[0_0_20px_rgba(79,70,229,0.12)]',
          isPaused && 'ring-2 ring-amber-400/40 shadow-[0_0_20px_rgba(251,191,36,0.12)]',
          isFinished && 'ring-2 ring-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.12)]',
        )}
      >
        <CardContent className="py-8 md:py-10 px-6">
          {/* 科目选择 */}
          <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
            {(Object.keys(SUBJECT_CONFIG) as TimerSubject[]).map((key) => {
              const config = SUBJECT_CONFIG[key]
              const isActive = selectedSubject === key
              return (
                <button
                  key={key}
                  onClick={() => canSwitch && setSelectedSubject(key)}
                  disabled={!canSwitch}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-all',
                    isActive
                      ? `${config.badgeClass} ring-2 ${config.ringColor} shadow-sm`
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                    !canSwitch && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {config.icon}
                  {config.label}
                </button>
              )
            })}
          </div>

          {/* SVG 圆形进度环 + 时间显示 */}
          <div className="flex items-center justify-center mb-6">
            <svg width="192" height="192" viewBox="0 0 200 200" className="w-48 h-48 md:w-56 md:h-56">
              {/* 背景圆 */}
              <circle cx="100" cy="100" r={radius} fill="none" stroke="oklch(0.92 0.01 270)" strokeWidth="6" strokeLinecap="round" />
              {/* 进度圆 */}
              <circle
                cx="100" cy="100" r={radius}
                fill="none"
                stroke={subjectConfig.gradientFrom}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 100 100)"
                className="transition-all duration-1000 ease-linear"
                style={{ opacity: mode === 'countdown' ? 1 : 0.25 }}
              />
              {/* 中心时间文本 */}
              <text
                x="100" y="92"
                textAnchor="middle"
                fill="oklch(0.17 0.02 270)"
                fontSize="42"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
                fontWeight="bold"
              >
                {formatTimerDisplay(displaySeconds)}
              </text>
              {/* 状态标签 */}
              {isRunning && (
                <text x="100" y="120" textAnchor="middle" fill="#4F46E5" fontSize="12" fontWeight="500">
                  进行中
                </text>
              )}
              {isPaused && (
                <text x="100" y="120" textAnchor="middle" fill="#D97706" fontSize="12" fontWeight="500">
                  已暂停
                </text>
              )}
              {!isRunning && !isPaused && !isFinished && (
                <text x="100" y="120" textAnchor="middle" fill="oklch(0.5 0.02 270)" fontSize="12" fontWeight="500">
                  {subjectConfig.label}
                </text>
              )}
              {isFinished && (
                <text x="100" y="120" textAnchor="middle" fill="#059669" fontSize="12" fontWeight="500">
                  已完成
                </text>
              )}
            </svg>
          </div>

          {/* 模式切换 + 时长预设 */}
          <div className="flex items-center justify-center gap-1 mb-3">
            <button
              onClick={() => canSwitch && setSelectedMode('countdown')}
              disabled={!canSwitch}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all',
                selectedMode === 'countdown'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              倒计时
            </button>
            <button
              onClick={() => canSwitch && setSelectedMode('stopwatch')}
              disabled={!canSwitch}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all',
                selectedMode === 'stopwatch'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              正计时
            </button>
          </div>

          {/* 时长预设（仅倒计时模式显示） */}
          {selectedMode === 'countdown' && (
            <div className="flex items-center justify-center gap-1.5 flex-wrap mt-2">
              {PRESETS.map((min) => (
                <button
                  key={min}
                  onClick={() => canSwitch && setSelectedPreset(min)}
                  disabled={!canSwitch}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[13px] font-medium transition-all',
                    selectedPreset === min
                      ? `${subjectConfig.badgeClass} shadow-sm`
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {min}min
                </button>
              ))}
              <button
                onClick={() => canSwitch && setSelectedPreset('custom')}
                disabled={!canSwitch}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[13px] font-medium transition-all',
                  isCustom
                    ? `${subjectConfig.badgeClass} shadow-sm`
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                自定义
              </button>
            </div>
          )}

          {/* 自定义时长输入 */}
          {selectedMode === 'countdown' && isCustom && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <input
                type="number"
                min={1}
                max={180}
                placeholder="分钟"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                className="w-20 text-center bg-background border border-input rounded-lg px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                disabled={!canSwitch}
              />
            </div>
          )}

          {/* 控制按钮 */}
          <div className="flex items-center justify-center gap-4 mt-6">
            {isIdle && (
              <button
                onClick={handleStart}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/35 transition-all hover:scale-105 active:scale-95"
              >
                <Play className="h-6 w-6 ml-0.5" />
              </button>
            )}
            {isRunning && (
              <>
                <button
                  onClick={handlePause}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all active:scale-95 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                >
                  <Pause className="h-5 w-5" />
                </button>
                <button
                  onClick={handleStop}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-all active:scale-95 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                >
                  <Square className="h-4 w-4" />
                </button>
              </>
            )}
            {isPaused && (
              <>
                <button
                  onClick={handleStop}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-all active:scale-95 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                >
                  <Square className="h-4 w-4" />
                </button>
                <button
                  onClick={handleResume}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/35 transition-all hover:scale-105 active:scale-95"
                >
                  <Play className="h-6 w-6 ml-0.5" />
                </button>
                <button
                  onClick={handleCancel}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all active:scale-95"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              </>
            )}
            {isFinished && (
              <button
                onClick={handleCancel}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/35 transition-all hover:scale-105 active:scale-95"
              >
                <RotateCcw className="h-6 w-6" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 记录弹窗 */}
      <RecordFormDialog
        open={showRecordDialog}
        onOpenChange={setShowRecordDialog}
        defaultSubject={selectedSubject}
        defaultDuration={recordDuration}
      />
    </>
  )
}

// ===== 练习记录表单弹窗（计时结束后 / 手动添加） =====
function RecordFormDialog({
  open,
  onOpenChange,
  defaultSubject,
  defaultDuration,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSubject: TimerSubject
  defaultDuration: number // 实际时长（秒）
}) {
  const addRecord = useTimerStore((s) => s.addRecord)

  const [subject, setSubject] = useState<TimerSubject>(defaultSubject)
  const [durationMinutes, setDurationMinutes] = useState('')
  const [note, setNote] = useState('')

  // 弹窗打开时初始化表单
  useEffect(() => {
    if (open) {
      setSubject(defaultSubject)
      const mins = Math.max(1, Math.round(defaultDuration / 60))
      setDurationMinutes(String(mins))
      setNote('')
    }
  }, [open, defaultSubject, defaultDuration])

  const handleSubmit = () => {
    const mins = parseInt(durationMinutes, 10)
    if (!mins || mins <= 0) return

    addRecord({
      subject,
      date: format(new Date(), 'yyyy-MM-dd'),
      duration: mins * 60,
      note: note.trim() || undefined,
    })

    onOpenChange(false)
  }

  const canSubmit = durationMinutes && parseInt(durationMinutes, 10) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>记录练习</DialogTitle>
          <DialogDescription>记录本次练习的科目、时长和心得。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 科目选择 */}
          <div className="flex flex-col gap-1.5">
            <Label>科目</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {(Object.keys(SUBJECT_CONFIG) as TimerSubject[]).map((key) => {
                const config = SUBJECT_CONFIG[key]
                const isActive = subject === key
                return (
                  <Button
                    key={key}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSubject(key)}
                    className="text-sm gap-1.5"
                  >
                    {config.icon}
                    {config.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* 实际时长 */}
          <div className="flex flex-col gap-1.5">
            <Label>实际时长（分钟）</Label>
            <Input
              type="number"
              min={1}
              placeholder="例如：25"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>

          {/* 内容/心得 */}
          <div className="flex flex-col gap-1.5">
            <Label>内容 / 心得</Label>
            <Textarea
              placeholder="记录练习内容、遇到的难点、收获等..."
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
            保存记录
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== 编辑记录弹窗 =====
function EditRecordDialog({
  open,
  onOpenChange,
  record,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: TimerRecord | null
}) {
  const updateRecord = useTimerStore((s) => s.updateRecord)

  const [subject, setSubject] = useState<TimerSubject>('general')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [note, setNote] = useState('')

  // 弹窗打开时初始化
  useEffect(() => {
    if (open && record) {
      setSubject(record.subject)
      setDurationMinutes(String(Math.max(1, Math.round(record.duration / 60))))
      setNote(record.note ?? '')
    }
  }, [open, record])

  const handleSubmit = () => {
    if (!record) return
    const mins = parseInt(durationMinutes, 10)
    if (!mins || mins <= 0) return

    updateRecord(record.id, {
      subject,
      duration: mins * 60,
      note: note.trim() || undefined,
    })

    onOpenChange(false)
  }

  const canSubmit = durationMinutes && parseInt(durationMinutes, 10) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑记录</DialogTitle>
          <DialogDescription>修改这条练习记录的信息。</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 科目选择 */}
          <div className="flex flex-col gap-1.5">
            <Label>科目</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {(Object.keys(SUBJECT_CONFIG) as TimerSubject[]).map((key) => {
                const config = SUBJECT_CONFIG[key]
                const isActive = subject === key
                return (
                  <Button
                    key={key}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSubject(key)}
                    className="text-sm gap-1.5"
                  >
                    {config.icon}
                    {config.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* 日期（只读展示） */}
          <div className="flex flex-col gap-1.5">
            <Label>日期</Label>
            <div className="h-9 px-3 flex items-center rounded-lg border border-input text-sm text-muted-foreground">
              {record?.date ?? '--'}
            </div>
          </div>

          {/* 时长 */}
          <div className="flex flex-col gap-1.5">
            <Label>时长（分钟）</Label>
            <Input
              type="number"
              min={1}
              placeholder="例如：25"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>

          {/* 内容/心得 */}
          <div className="flex flex-col gap-1.5">
            <Label>内容 / 心得</Label>
            <Textarea
              placeholder="记录练习内容、遇到的难点、收获等..."
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
            保存修改
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
  record: TimerRecord
  onEdit: () => void
  onDelete: () => void
  className?: string
}) {
  const config = SUBJECT_CONFIG[record.subject]

  return (
    <Card size="sm" className={cn('group/card', className)}>
      <CardContent className="py-2.5 md:py-3 px-3 md:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="secondary" className={cn('gap-1 text-xs font-medium', config.badgeClass)}>
                {config.icon}
                {config.label}
              </Badge>
              <span className="text-[13px] text-muted-foreground">{record.date}</span>
            </div>

            <div className="flex items-center gap-3 mt-1">
              <span className="text-[13px] text-muted-foreground">
                时长：{formatDurationMinutes(record.duration)}
              </span>
            </div>

            {record.note && (
              <p className="text-[13px] text-muted-foreground mt-2 line-clamp-2">
                {record.note}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="编辑" className="h-8 w-8">
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="删除" className="h-8 w-8">
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ===== 练习记录列表 =====
function RecordList() {
  const records = useTimerStore((s) => s.records)
  const deleteRecord = useTimerStore((s) => s.deleteRecord)

  // 按日期倒序排列
  const sortedRecords = useMemo(
    () =>
      [...records].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      ),
    [records]
  )

  // 编辑弹窗状态
  const [editTarget, setEditTarget] = useState<TimerRecord | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  // 删除弹窗状态
  const [deleteTarget, setDeleteTarget] = useState<TimerRecord | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleEdit = (record: TimerRecord) => {
    setEditTarget(record)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (record: TimerRecord) => {
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
      <h2 className="text-base md:text-lg font-semibold mb-3 mt-6 flex items-center gap-2">
        <span className="h-px flex-1 bg-border" />
        <span>练习记录</span>
        <span className="h-px flex-1 bg-border" />
      </h2>

      {sortedRecords.length === 0 ? (
        <EmptyState
          scene="practice"
          title="暂无练习记录"
          description="开始你的第一次计时练习吧，坚持练习才能稳步提升"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sortedRecords.map((record, index) => (
            <RecordItem
              key={record.id}
              record={record}
              onEdit={() => handleEdit(record)}
              onDelete={() => handleDeleteClick(record)}
              className={`animate-stagger-up stagger-${(index % 8) + 1}`}
            />
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      <EditRecordDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        record={editTarget}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        recordTitle={deleteTarget ? `${SUBJECT_CONFIG[deleteTarget.subject].label} ${deleteTarget.date}` : '该条记录'}
      />
    </>
  )
}

// ===== 主页面 =====
export default function TimerPractice() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 顶部标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-[22px] md:text-2xl font-bold animate-stagger-up stagger-1">
          计时练习
        </h1>
      </div>

      {/* 统计摘要 */}
      <div className="animate-stagger-up stagger-2">
        <StatsSummary />
      </div>

      {/* 计时器主区域 */}
      <div className="mb-4 animate-stagger-up stagger-3">
        <TimerSection />
      </div>

      {/* 练习记录列表 */}
      <div className="flex-1 animate-stagger-up stagger-4">
        <RecordList />
      </div>
    </div>
  )
}
