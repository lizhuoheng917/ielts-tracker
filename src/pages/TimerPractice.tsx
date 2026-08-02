import { useState, useEffect, useMemo, useCallback, useRef, useId, type ReactNode } from 'react'
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
  Plus,
  Search,
  Clock3,
  CalendarRange,
  ListChecks,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { SUBJECT_VISUALS } from '@/lib/subjectVisuals'
import { PageHeader } from '@/components/ui/page-header'
import { MetricGroup } from '@/components/ui/metric-group'
import { DataToolbar } from '@/components/ui/data-toolbar'
import { DataPagination } from '@/components/ui/data-pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEFAULT_DATA_PAGE_SIZE,
  getDataPageCount,
  paginateItems,
} from '@/lib/dataView'
import {
  filterAndSortTimerRecords,
  resolveTimerRecordDuration,
  type TimerRecordSortOrder,
} from '@/lib/timerRecordView'

// ===== 科目配置：标签、图标、颜色 =====
const SUBJECT_CONFIG: Record<TimerSubject, { label: string; icon: ReactNode; badgeClass: string; gradientFrom: string; gradientTo: string }> = {
  reading: { label: SUBJECT_VISUALS.reading.label, icon: <BookOpen className="h-4 w-4" aria-hidden="true" />, badgeClass: SUBJECT_VISUALS.reading.badgeClass, gradientFrom: SUBJECT_VISUALS.reading.chartColor, gradientTo: 'color-mix(in oklch, var(--subject-reading) 72%, var(--primary))' },
  listening: { label: SUBJECT_VISUALS.listening.label, icon: <Headphones className="h-4 w-4" aria-hidden="true" />, badgeClass: SUBJECT_VISUALS.listening.badgeClass, gradientFrom: SUBJECT_VISUALS.listening.chartColor, gradientTo: 'color-mix(in oklch, var(--subject-listening) 72%, var(--primary))' },
  writing: { label: SUBJECT_VISUALS.writing.label, icon: <PenLine className="h-4 w-4" aria-hidden="true" />, badgeClass: SUBJECT_VISUALS.writing.badgeClass, gradientFrom: SUBJECT_VISUALS.writing.chartColor, gradientTo: 'color-mix(in oklch, var(--subject-writing) 72%, var(--primary))' },
  speaking: { label: SUBJECT_VISUALS.speaking.label, icon: <MessageCircle className="h-4 w-4" aria-hidden="true" />, badgeClass: SUBJECT_VISUALS.speaking.badgeClass, gradientFrom: SUBJECT_VISUALS.speaking.chartColor, gradientTo: 'color-mix(in oklch, var(--subject-speaking) 72%, var(--primary))' },
  general: { label: SUBJECT_VISUALS.general.label, icon: <Layers className="h-4 w-4" aria-hidden="true" />, badgeClass: SUBJECT_VISUALS.general.badgeClass, gradientFrom: SUBJECT_VISUALS.general.chartColor, gradientTo: 'color-mix(in oklch, var(--subject-general) 72%, var(--primary))' },
}

// ===== 时长预设 =====
const PRESETS = [25, 45, 60]

const SORT_LABELS: Record<TimerRecordSortOrder, string> = {
  newest: '日期：从新到旧',
  oldest: '日期：从旧到新',
  'duration-desc': '时长：从长到短',
  'duration-asc': '时长：从短到长',
}

// ===== 格式化计时器显示 MM:SS =====
function formatTimerDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// ===== 格式化时长为可读文本，并保留精确秒数 =====
function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60

  if (h > 0) {
    return `${h}小时${m > 0 ? `${m}分钟` : ''}${s > 0 ? `${s}秒` : ''}`
  }
  if (m > 0) {
    return `${m}分钟${s > 0 ? `${s}秒` : ''}`
  }
  return `${s}秒`
}

function formatDateCN(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${parseInt(month)}月${parseInt(day)}日`
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
    <MetricGroup
      ariaLabel="计时练习概览"
      columns={3}
      items={[
        {
          label: '今日练习',
          value: todayDuration > 0 ? formatDuration(todayDuration) : '—',
          description: '今天累计专注时长',
          icon: <Clock3 />,
          tone: 'primary',
        },
        {
          label: '本周练习',
          value: weekDuration > 0 ? formatDuration(weekDuration) : '—',
          description: '本周一至今',
          icon: <CalendarRange />,
          tone: 'success',
        },
        {
          label: '总练习次数',
          value: totalCount > 0 ? totalCount : '—',
          description: '已保存的计时记录',
          icon: <ListChecks />,
          tone: 'neutral',
        },
      ]}
    />
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
  const [pendingSession, setPendingSession] = useState<{
    subject: TimerSubject
    duration: number
  } | null>(null)

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
      setPendingSession({
        subject,
        duration: elapsedSeconds || presetMinutes * 60,
      })
      setShowRecordDialog(true)
    }
    prevStatusRef.current = status
  }, [status, elapsedSeconds, presetMinutes, subject])

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
    if (pendingSession) return
    const minutes = getMinutes()
    startTimer(selectedMode, selectedSubject, minutes)
  }, [pendingSession, selectedMode, selectedSubject, getMinutes, startTimer])

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
      setPendingSession({ subject, duration: actualSeconds })
      setShowRecordDialog(true)
    }
  }, [stopTimer, subject])

  const handleRecordSaved = useCallback(() => {
    setPendingSession(null)
    resetTimer()
  }, [resetTimer])

  const handleDiscardPending = useCallback(() => {
    setShowRecordDialog(false)
    setPendingSession(null)
    resetTimer()
  }, [resetTimer])

  // 取消/重置（不弹出记录弹窗）
  const handleCancel = useCallback(() => {
    resetTimer()
  }, [resetTimer])

  // 计时中禁止切换模式/科目/时长
  const canSwitch = isIdle && !pendingSession

  // SVG 圆环进度计算
  const totalSeconds = mode === 'countdown' ? presetMinutes * 60 : 0
  const progress = mode === 'countdown' && totalSeconds > 0
    ? 1 - (remainingSeconds / totalSeconds)
    : 0
  const radius = 88
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  const subjectConfig = SUBJECT_CONFIG[selectedSubject]
  const gradientId = `ring-gradient-${selectedSubject}`

  return (
    <>
      <Card
        className={cn(
          'mb-4 overflow-hidden rounded-2xl transition-all duration-500',
          isRunning && 'ring-2 ring-primary/30',
          isPaused && 'ring-2 ring-warning/30',
          isFinished && 'ring-2 ring-success/30',
        )}
      >
        <CardContent className="py-6 md:py-8 px-5 md:px-6">
          {/* 科目选择：文字标签 + 图标 */}
          <div className="flex items-center justify-center gap-1.5 md:gap-2 flex-wrap mb-5 md:mb-6">
            {(Object.keys(SUBJECT_CONFIG) as TimerSubject[]).map((key) => {
              const config = SUBJECT_CONFIG[key]
              const isActive = selectedSubject === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => canSwitch && setSelectedSubject(key)}
                  disabled={!canSwitch}
                  aria-pressed={isActive}
                  aria-label={`选择${config.label}练习`}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1.5 md:px-3 md:py-2 rounded-xl text-[13px] md:text-[14px] font-medium transition-all',
                    isActive
                      ? `${config.badgeClass} shadow-sm`
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    !canSwitch && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  {config.icon}
                  {config.label}
                </button>
              )
            })}
          </div>

          {/* SVG 圆形进度环 */}
          <div className="flex items-center justify-center mb-5 md:mb-6">
            <svg
              width="200"
              height="200"
              viewBox="0 0 200 200"
              role="img"
              aria-label={`${subjectConfig.label}${selectedMode === 'countdown' ? '倒计时' : '正计时'} ${formatTimerDisplay(displaySeconds)}`}
              className="h-[180px] w-[180px] md:h-[240px] md:w-[240px]"
            >
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={subjectConfig.gradientFrom} />
                  <stop offset="100%" stopColor={subjectConfig.gradientTo} />
                </linearGradient>
              </defs>
              {/* 背景圆 */}
              <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" className="text-border" strokeWidth="8" strokeLinecap="round" />
              {/* 进度圆 */}
              <circle
                cx="100" cy="100" r={radius}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 100 100)"
                className="transition-all duration-1000 ease-linear"
                style={{ opacity: mode === 'countdown' ? 1 : 0.2 }}
              />
              {/* 时间文字 */}
              <text
                x="100" y="96"
                textAnchor="middle"
                fill="currentColor"
                className="text-foreground"
                fontSize="44"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
                fontWeight="700"
                letterSpacing="-2"
              >
                {formatTimerDisplay(displaySeconds)}
              </text>
              {/* 状态文字 */}
              {isRunning && (
                <text x="100" y="124" textAnchor="middle" fill={subjectConfig.gradientFrom} fontSize="13" fontFamily="'Space Grotesk', system-ui, sans-serif" fontWeight="500">
                  进行中
                </text>
              )}
              {isPaused && (
                <text x="100" y="124" textAnchor="middle" fill="var(--status-warning)" fontSize="13" fontFamily="'Space Grotesk', system-ui, sans-serif" fontWeight="500">
                  已暂停
                </text>
              )}
              {isFinished && (
                <text x="100" y="124" textAnchor="middle" fill="var(--status-success)" fontSize="13" fontFamily="'Space Grotesk', system-ui, sans-serif" fontWeight="500">
                  已完成
                </text>
              )}
              {!isRunning && !isPaused && !isFinished && (
                <text x="100" y="124" textAnchor="middle" fill="currentColor" className="text-muted-foreground" fontSize="13" fontFamily="'Space Grotesk', system-ui, sans-serif" fontWeight="500">
                  {mode === 'countdown' ? `${presetMinutes} 分钟` : '正计时'}
                </text>
              )}
            </svg>
          </div>

          {/* 模式切换 + 时长预设（紧凑一行） */}
          <div className="flex items-center justify-center gap-2 flex-wrap mb-1">
            {/* 模式切换 */}
            <div className="flex items-center bg-muted rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => canSwitch && setSelectedMode('countdown')}
                disabled={!canSwitch}
                aria-pressed={selectedMode === 'countdown'}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[12px] md:text-[13px] font-medium transition-all',
                  selectedMode === 'countdown'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
              >
                倒计时
              </button>
              <button
                type="button"
                onClick={() => canSwitch && setSelectedMode('stopwatch')}
                disabled={!canSwitch}
                aria-pressed={selectedMode === 'stopwatch'}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[12px] md:text-[13px] font-medium transition-all',
                  selectedMode === 'stopwatch'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
              >
                正计时
              </button>
            </div>

            {/* 时长预设（仅倒计时模式显示，分隔线随之出现/隐藏） */}
            {selectedMode === 'countdown' && (
              <>
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-1">
                {PRESETS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => canSwitch && setSelectedPreset(min)}
                    disabled={!canSwitch}
                    aria-pressed={selectedPreset === min}
                    aria-label={`设置倒计时 ${min} 分钟`}
                    className={cn(
                      'px-2 py-1 rounded-md text-[12px] md:text-[13px] font-medium transition-all',
                      selectedPreset === min
                        ? `${subjectConfig.badgeClass}`
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {min}m
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => canSwitch && setSelectedPreset('custom')}
                  disabled={!canSwitch}
                  aria-pressed={isCustom}
                  className={cn(
                    'px-2 py-1 rounded-md text-[12px] md:text-[13px] font-medium transition-all',
                    isCustom
                      ? `${subjectConfig.badgeClass}`
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  自定义
                </button>
                </div>
              </>
            )}
          </div>

          {/* 自定义时长输入 */}
          {selectedMode === 'countdown' && isCustom && (
            <div className="flex items-center justify-center mt-3">
              <input
                aria-label="自定义倒计时分钟数"
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
          <div className="flex items-center justify-center gap-3 md:gap-4 mt-4 md:mt-5">
            {isIdle && !pendingSession && (
              <button
                type="button"
                onClick={handleStart}
                aria-label="开始计时"
                className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95"
                style={{ background: `linear-gradient(135deg, ${subjectConfig.gradientFrom}, ${subjectConfig.gradientTo})` }}
              >
                <Play className="h-5 w-5 md:h-6 md:w-6 ml-0.5" />
              </button>
            )}
            {isRunning && (
              <>
                <button
                  type="button"
                  onClick={handlePause}
                  aria-label="暂停计时"
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-warning-border text-warning transition-all hover:bg-warning-surface active:scale-95 md:h-11 md:w-11"
                >
                  <Pause className="h-4 w-4 md:h-5 md:w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="结束并记录练习"
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-danger-border text-danger transition-all hover:bg-danger-surface active:scale-95 md:h-11 md:w-11"
                >
                  <Square className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </button>
              </>
            )}
            {isPaused && (
              <>
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="结束并记录练习"
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-danger-border text-danger transition-all hover:bg-danger-surface active:scale-95 md:h-11 md:w-11"
                >
                  <Square className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResume}
                  aria-label="继续计时"
                  className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${subjectConfig.gradientFrom}, ${subjectConfig.gradientTo})` }}
                >
                  <Play className="h-5 w-5 md:h-6 md:w-6 ml-0.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  aria-label="取消本次计时"
                  className="flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-full border-2 border-border text-muted-foreground hover:bg-muted transition-all active:scale-95"
                >
                  <RotateCcw className="h-4 w-4 md:h-5 md:w-5" />
                </button>
              </>
            )}
            {isFinished && !pendingSession && (
              <button
                type="button"
                onClick={handleCancel}
                aria-label="重新开始计时"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg transition-all hover:scale-105 active:scale-95 md:h-14 md:w-14"
              >
                <RotateCcw className="h-5 w-5 md:h-6 md:w-6" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {pendingSession && (
        <div
          className="mb-4 flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
          aria-live="polite"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">本次练习尚未保存</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {SUBJECT_CONFIG[pendingSession.subject].label} · {formatDuration(pendingSession.duration)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setShowRecordDialog(true)}>
              继续填写
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleDiscardPending}>
              丢弃本次
            </Button>
          </div>
        </div>
      )}

      {/* 记录弹窗 */}
      {pendingSession && (
        <RecordFormDialog
          open={showRecordDialog}
          onOpenChange={setShowRecordDialog}
          onSaved={handleRecordSaved}
          defaultSubject={pendingSession.subject}
          defaultDuration={pendingSession.duration}
        />
      )}
    </>
  )
}

// ===== 练习记录表单弹窗（计时结束后 / 手动添加） =====
function RecordFormDialog({
  open,
  onOpenChange,
  onSaved,
  defaultSubject,
  defaultDuration,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
  defaultSubject: TimerSubject
  defaultDuration: number // 实际时长（秒）
}) {
  const addRecord = useTimerStore((s) => s.addRecord)
  const fieldId = useId()
  const subjectLabelId = `${fieldId}-subject-label`
  const durationId = `${fieldId}-duration`
  const noteId = `${fieldId}-note`

  const [subject, setSubject] = useState<TimerSubject>(defaultSubject)
  const [durationMinutes, setDurationMinutes] = useState('')
  const [durationEdited, setDurationEdited] = useState(false)
  const [note, setNote] = useState('')

  // 弹窗打开时初始化表单
  useEffect(() => {
    if (open) {
      setSubject(defaultSubject)
      const mins = Math.max(1, Math.round(defaultDuration / 60))
      setDurationMinutes(String(mins))
      setDurationEdited(false)
      setNote('')
    }
  }, [open, defaultSubject, defaultDuration])

  const handleSubmit = () => {
    const resolvedDuration = resolveTimerRecordDuration(
      defaultDuration,
      durationMinutes,
      durationEdited,
    )
    if (resolvedDuration === undefined) return

    addRecord({
      subject,
      date: format(new Date(), 'yyyy-MM-dd'),
      duration: resolvedDuration,
      note: note.trim() || undefined,
    })

    onSaved?.()
    onOpenChange(false)
  }

  const canSubmit = resolveTimerRecordDuration(
    defaultDuration,
    durationMinutes,
    durationEdited,
  ) !== undefined

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
            <Label id={subjectLabelId}>科目</Label>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={subjectLabelId}>
              {(Object.keys(SUBJECT_CONFIG) as TimerSubject[]).map((key) => {
                const config = SUBJECT_CONFIG[key]
                const isActive = subject === key
                return (
                  <Button
                    key={key}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    type="button"
                    onClick={() => setSubject(key)}
                    aria-pressed={isActive}
                    aria-label={`选择${config.label}科目`}
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
            <Label htmlFor={durationId}>实际时长（分钟）</Label>
            <Input
              id={durationId}
              type="number"
              min={1}
              placeholder="例如：25"
              value={durationMinutes}
              onChange={(e) => {
                setDurationMinutes(e.target.value)
                setDurationEdited(true)
              }}
            />
            {!durationEdited && defaultDuration % 60 !== 0 && (
              <p className="text-xs text-muted-foreground">
                实际计时为 {formatDuration(defaultDuration)}；不修改分钟数将保留精确秒数。
              </p>
            )}
          </div>

          {/* 内容/心得 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>内容 / 心得</Label>
            <Textarea
              id={noteId}
              placeholder="记录练习内容、遇到的难点、收获等..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose render={<Button type="button" variant="outline" className="w-full sm:w-auto" />}>
            取消
          </DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
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
  const fieldId = useId()
  const subjectLabelId = `${fieldId}-subject-label`
  const dateId = `${fieldId}-date`
  const durationId = `${fieldId}-duration`
  const noteId = `${fieldId}-note`

  const [subject, setSubject] = useState<TimerSubject>('general')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [durationEdited, setDurationEdited] = useState(false)
  const [note, setNote] = useState('')

  // 弹窗打开时初始化
  useEffect(() => {
    if (open && record) {
      setSubject(record.subject)
      setDurationMinutes(String(Math.max(1, Math.round(record.duration / 60))))
      setDurationEdited(false)
      setNote(record.note ?? '')
    }
  }, [open, record])

  const handleSubmit = () => {
    if (!record) return
    const resolvedDuration = resolveTimerRecordDuration(
      record.duration,
      durationMinutes,
      durationEdited,
    )
    if (resolvedDuration === undefined) return

    updateRecord(record.id, {
      subject,
      duration: resolvedDuration,
      note: note.trim() || undefined,
    })

    onOpenChange(false)
  }

  const canSubmit = record !== null && resolveTimerRecordDuration(
    record.duration,
    durationMinutes,
    durationEdited,
  ) !== undefined

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
            <Label id={subjectLabelId}>科目</Label>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={subjectLabelId}>
              {(Object.keys(SUBJECT_CONFIG) as TimerSubject[]).map((key) => {
                const config = SUBJECT_CONFIG[key]
                const isActive = subject === key
                return (
                  <Button
                    key={key}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    type="button"
                    onClick={() => setSubject(key)}
                    aria-pressed={isActive}
                    aria-label={`选择${config.label}科目`}
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
            <Label htmlFor={dateId}>日期</Label>
            <Input id={dateId} value={record?.date ?? ''} readOnly />
          </div>

          {/* 时长 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={durationId}>时长（分钟）</Label>
            <Input
              id={durationId}
              type="number"
              min={1}
              placeholder="例如：25"
              value={durationMinutes}
              onChange={(e) => {
                setDurationMinutes(e.target.value)
                setDurationEdited(true)
              }}
            />
            {!durationEdited && record && record.duration % 60 !== 0 && (
              <p className="text-xs text-muted-foreground">
                原始时长为 {formatDuration(record.duration)}；不修改分钟数将保留精确秒数。
              </p>
            )}
          </div>

          {/* 内容/心得 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>内容 / 心得</Label>
            <Textarea
              id={noteId}
              placeholder="记录练习内容、遇到的难点、收获等..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <DialogClose render={<Button type="button" variant="outline" className="w-full sm:w-auto" />}>
            取消
          </DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
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
          <DialogClose render={<Button type="button" variant="outline" className="w-full sm:w-auto" />}>
            取消
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm} className="w-full sm:w-auto">
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ===== 练习记录列表 =====
function RecordList({ onAdd }: { onAdd: () => void }) {
  const records = useTimerStore((s) => s.records)
  const deleteRecord = useTimerStore((s) => s.deleteRecord)

  const [searchQuery, setSearchQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState<TimerSubject | 'all'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<TimerRecordSortOrder>('newest')
  const [currentPage, setCurrentPage] = useState(1)

  const filteredRecords = useMemo(
    () => filterAndSortTimerRecords(records, {
      searchQuery,
      subject: subjectFilter,
      dateFrom,
      dateTo,
      sortOrder,
    }),
    [records, searchQuery, subjectFilter, dateFrom, dateTo, sortOrder],
  )

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    subjectFilter !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    sortOrder !== 'newest'
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const totalPages = getDataPageCount(filteredRecords.length)
  const resolvedPage = Math.min(currentPage, totalPages)
  const paginatedRecords = useMemo(
    () => paginateItems(filteredRecords, resolvedPage),
    [filteredRecords, resolvedPage],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, subjectFilter, dateFrom, dateTo, sortOrder])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

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

  const clearFilters = () => {
    setSearchQuery('')
    setSubjectFilter('all')
    setDateFrom('')
    setDateTo('')
    setSortOrder('newest')
  }

  return (
    <>
      <section className="space-y-4" aria-labelledby="timer-records-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Practice history</p>
            <h2 id="timer-records-heading" className="mt-1 text-lg font-semibold tracking-tight md:text-xl">练习记录</h2>
            <p className="mt-1 text-sm text-muted-foreground">回顾每次专注时长、练习科目和心得。</p>
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            共 <span className="font-medium tabular-nums text-foreground">{filteredRecords.length}</span> 条记录
          </p>
        </div>

        <DataToolbar
          aria-label="筛选计时练习记录"
          mobileFilterTitle="筛选计时练习记录"
          mobileFilterCount={
            Number(subjectFilter !== 'all')
            + Number(sortOrder !== 'newest')
            + Number(Boolean(dateFrom))
            + Number(Boolean(dateTo))
          }
          search={(
            <div className="space-y-1.5">
              <Label htmlFor="timer-record-search" className="text-xs text-muted-foreground">搜索</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="timer-record-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索备注或日期"
                  className="pl-8"
                />
              </div>
            </div>
          )}
          filters={(
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="timer-subject-filter" className="text-xs text-muted-foreground">科目</Label>
                <Select
                  value={subjectFilter}
                  onValueChange={(value) => value && setSubjectFilter(value as TimerSubject | 'all')}
                >
                  <SelectTrigger id="timer-subject-filter" className="w-full">
                    <SelectValue>
                      {subjectFilter === 'all' ? '全部科目' : SUBJECT_CONFIG[subjectFilter].label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部科目</SelectItem>
                    {(Object.keys(SUBJECT_CONFIG) as TimerSubject[]).map((subject) => (
                      <SelectItem key={subject} value={subject}>{SUBJECT_CONFIG[subject].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="timer-sort-order" className="text-xs text-muted-foreground">排序</Label>
                <Select
                  value={sortOrder}
                  onValueChange={(value) => value && setSortOrder(value as TimerRecordSortOrder)}
                >
                  <SelectTrigger id="timer-sort-order" className="w-full">
                    <SelectValue>{SORT_LABELS[sortOrder]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SORT_LABELS) as Array<[TimerRecordSortOrder, string]>).map(([value, label]) => (
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
              找到 <strong className="font-semibold tabular-nums text-foreground">{filteredRecords.length}</strong> 条记录，每页最多 {DEFAULT_DATA_PAGE_SIZE} 条
            </span>
          )}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="timer-date-from" className="text-xs text-muted-foreground">开始日期</Label>
              <Input
                id="timer-date-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                aria-invalid={dateRangeInvalid}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timer-date-to" className="text-xs text-muted-foreground">结束日期</Label>
              <Input
                id="timer-date-to"
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

        {paginatedRecords.length === 0 ? (
          records.length === 0 ? (
            <EmptyState
              scene="timer"
              title="还没有计时练习记录"
              description="开始一次计时练习，或手动补录今天的专注时长。"
              action={(
                <Button type="button" onClick={onAdd}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  添加第一条记录
                </Button>
              )}
            />
          ) : (
            <EmptyState
              scene="timer"
              title="没有匹配的记录"
              description="试试调整关键词、科目或日期范围。"
              action={hasActiveFilters ? (
                <Button type="button" variant="outline" onClick={clearFilters}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  清空筛选
                </Button>
              ) : undefined}
            />
          )
        ) : (
          <Card className="py-0">
            <div className="hidden max-h-[65vh] overflow-auto lg:block">
              <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                <caption className="sr-only">计时练习历史记录</caption>
                <colgroup>
                  <col className="w-28" />
                  <col className="w-32" />
                  <col className="w-32" />
                  <col />
                  <col className="w-24" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-card/95 text-xs text-muted-foreground shadow-[0_1px_0_0_var(--border)] backdrop-blur">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">日期</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">科目</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">时长</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">内容 / 心得</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedRecords.map((record) => {
                    const config = SUBJECT_CONFIG[record.subject]
                    return (
                      <tr key={record.id} className="group/row transition-colors hover:bg-accent/50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          <time dateTime={record.date} title={record.date}>{formatDateCN(record.date)}</time>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn('gap-1 border text-xs font-medium', config.badgeClass)}>
                            {config.icon}
                            {config.label}
                          </Badge>
                        </td>
                        <td className={cn('whitespace-nowrap px-4 py-3 font-semibold tabular-nums', SUBJECT_VISUALS[record.subject].textClass)}>
                          {formatDuration(record.duration)}
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
                              onClick={() => handleEdit(record)}
                              className="h-8 w-8"
                              aria-label={`编辑 ${record.date} ${config.label}计时记录`}
                            >
                              <Pencil className="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDeleteClick(record)}
                              className="h-8 w-8"
                              aria-label={`删除 ${record.date} ${config.label}计时记录`}
                            >
                              <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border lg:hidden" aria-label="计时练习历史记录">
              {paginatedRecords.map((record) => {
                const config = SUBJECT_CONFIG[record.subject]
                return (
                  <li key={record.id} className="px-3 py-3 transition-colors hover:bg-accent/50 sm:px-4">
                    <article className="space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <time dateTime={record.date} className="text-sm font-medium">{formatDateCN(record.date)}</time>
                            <Badge variant="outline" className={cn('gap-1 border text-xs font-medium', config.badgeClass)}>
                              {config.icon}
                              {config.label}
                            </Badge>
                          </div>
                          {record.note && (
                            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{record.note}</p>
                          )}
                        </div>
                        <span className={cn('shrink-0 text-base font-bold tabular-nums', SUBJECT_VISUALS[record.subject].textClass)}>
                          {formatDuration(record.duration)}
                        </span>
                      </div>
                      <div className="flex justify-end gap-1 border-t border-border/60 pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(record)}
                          aria-label={`编辑 ${record.date} ${config.label}计时记录`}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          编辑
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(record)}
                          aria-label={`删除 ${record.date} ${config.label}计时记录`}
                        >
                          <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                          删除
                        </Button>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <DataPagination
          currentPage={resolvedPage}
          totalPages={totalPages}
          totalItems={filteredRecords.length}
          onPageChange={setCurrentPage}
          itemLabel="条记录"
          aria-label="计时练习记录分页"
        />
      </section>

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
  const [manualRecordOpen, setManualRecordOpen] = useState(false)

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-4">
      <div className="animate-stagger-up stagger-1">
        <PageHeader
          eyebrow="Focused practice"
          title="计时练习"
          description="用结构化计时保持专注，并把每一次练习沉淀为可检索的学习记录。"
          icon={<Clock3 />}
          actions={(
            <Button type="button" onClick={() => setManualRecordOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              手动添加记录
            </Button>
          )}
        />
      </div>

      {/* 计时器主区域：核心任务优先出现在首屏 */}
      <div className="mt-5 animate-stagger-up stagger-2">
        <TimerSection />
      </div>

      {/* 统计摘要 */}
      <div className="mt-1 animate-stagger-up stagger-3">
        <StatsSummary />
      </div>

      {/* 练习记录列表 */}
      <div className="mt-5 flex-1 animate-stagger-up stagger-4">
        <RecordList onAdd={() => setManualRecordOpen(true)} />
      </div>

      <RecordFormDialog
        open={manualRecordOpen}
        onOpenChange={setManualRecordOpen}
        defaultSubject="general"
        defaultDuration={25 * 60}
      />
    </div>
  )
}
