import { useState, useMemo } from 'react'
import { differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { usePlanStore } from '@/stores/planStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useStreakStore } from '@/stores/streakStore'
import { useReportStore } from '@/stores/reportStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  CalendarDays,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  Moon,
  Sun,
  Sparkles,
  KeyRound,
  Eye,
  EyeOff,
  Link as LinkIcon,
  CheckCircle2,
  XCircle,
  Monitor,
} from 'lucide-react'
import { useAIStore } from '@/stores/aiStore'
import { testAIConnection } from '@/lib/aiService'

export default function Settings() {
  // --- 核心状态（实时同步到 store） ---
  const examDate = useSettingsStore((s) => s.examDate)
  const setExamDate = useSettingsStore((s) => s.setExamDate)
  const clearExamDate = useSettingsStore((s) => s.clearExamDate)
  const showExamCountdown = useSettingsStore((s) => s.showExamCountdown)
  const setShowExamCountdown = useSettingsStore((s) => s.setShowExamCountdown)

  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  // --- AI 配置（实时同步到 store） ---
  const aiApiKey = useAIStore((s) => s.apiKey)
  const aiBaseURL = useAIStore((s) => s.baseURL)
  const aiModel = useAIStore((s) => s.model)
  const setAiApiKey = useAIStore((s) => s.setApiKey)
  const setAiBaseURL = useAIStore((s) => s.setBaseURL)
  const setAiModel = useAIStore((s) => s.setModel)
  const clearAiConfig = useAIStore((s) => s.clearConfig)

  const [showAiKey, setShowAiKey] = useState(false)
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [aiTestMessage, setAiTestMessage] = useState('')

  const handleTestAI = async () => {
    setAiTestStatus('testing')
    setAiTestMessage('')
    const result = await testAIConnection()
    setAiTestStatus(result.ok ? 'success' : 'error')
    setAiTestMessage(result.ok ? '连接成功' : result.message)
  }

  // --- 考试倒计时 ---
  const daysUntilExam = useMemo(() => {
    if (!examDate) return null
    const exam = new Date(examDate)
    const now = new Date()
    const diff = differenceInDays(exam, now)
    return diff >= 0 ? diff : 0
  }, [examDate])

  // --- 统计 ---
  const totalWords = useMemo(
    () => useWordStore.getState().records.reduce((sum, r) => sum + r.count, 0),
    []
  )
  const totalPractice = useMemo(
    () => usePracticeStore.getState().records.length + useTimerStore.getState().records.length,
    []
  )
  const totalPlans = useMemo(
    () => usePlanStore.getState().plans.length,
    []
  )
  const totalDiary = useMemo(
    () => useDiaryStore.getState().entries.length,
    []
  )

  // --- 事件处理 ---

  const handleExport = () => {
    const data = {
      version: 1,
      words: useWordStore.getState().records,
      practice: usePracticeStore.getState().records,
      timer: useTimerStore.getState().records,
      plans: usePlanStore.getState().plans,
      executions: usePlanStore.getState().executions,
      diary: useDiaryStore.getState().entries,
      reports: useReportStore.getState().reports,
      achievements: {
        totalXP: useAchievementStore.getState().totalXP,
        level: useAchievementStore.getState().level,
        unlockedBadges: useAchievementStore.getState().unlockedBadges,
      },
      streak: {
        currentStreak: useStreakStore.getState().currentStreak,
        longestStreak: useStreakStore.getState().longestStreak,
        heatmapData: useStreakStore.getState().heatmapData,
      },
      settings: {
        examDate,
        theme,
      },
      aiConfig: {
        apiKey: useAIStore.getState().apiKey,
        baseURL: useAIStore.getState().baseURL,
        model: useAIStore.getState().model,
      },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ielts-tracker-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // CSV 导出
  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const handleExportCSV = () => {
    const dateStr = new Date().toISOString().split('T')[0]

    // 单词记录
    const wordsHeader = '日期,分类,子分类,数量,备注'
    const wordsRows = useWordStore.getState().records.map((r) =>
      [r.date, r.category, r.subCategory ?? '', r.count, r.note ?? ''].map(escapeCsv).join(',')
    )
    const wordsCsv = [wordsHeader, ...wordsRows].join('\n')

    // 模考记录
    const practiceHeader = '日期,科目,时长(分钟),分数,备注'
    const practiceRows = usePracticeStore.getState().records.map((r) =>
      [r.date, r.type, r.duration, r.score ?? '', r.note ?? ''].map(escapeCsv).join(',')
    )
    const practiceCsv = [practiceHeader, ...practiceRows].join('\n')

    // 练习记录
    const timerHeader = '日期,科目,时长(分钟),内容'
    const timerRows = useTimerStore.getState().records.map((r) =>
      [r.date, r.subject, Math.floor(r.duration / 60), r.note ?? ''].map(escapeCsv).join(',')
    )
    const timerCsv = [timerHeader, ...timerRows].join('\n')

    // 合并为一个文件，用空行分隔
    const fullCsv = [
      '=== 单词记录 ===',
      wordsCsv,
      '',
      '=== 模考记录 ===',
      practiceCsv,
      '',
      '=== 练习记录 ===',
      timerCsv,
    ].join('\n')

    const blob = new Blob(['\uFEFF' + fullCsv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ielts-tracker-data-${dateStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        // 使用 setState() 确保 persist middleware 正确触发
        if (data.words) useWordStore.setState({ records: data.words })
        if (data.practice) usePracticeStore.setState({ records: data.practice })
        if (data.timer) useTimerStore.setState({ records: data.timer })
        if (data.plans) usePlanStore.setState({ plans: data.plans })
        if (data.executions) usePlanStore.setState({ executions: data.executions })
        if (data.diary) useDiaryStore.setState({ entries: data.diary })
        if (data.reports) useReportStore.setState({ reports: data.reports })
        if (data.achievements) {
          useAchievementStore.setState({
            totalXP: data.achievements.totalXP,
            level: data.achievements.level,
            unlockedBadges: data.achievements.unlockedBadges,
          })
        }
        if (data.streak) {
          useStreakStore.setState({
            currentStreak: data.streak.currentStreak,
            longestStreak: data.streak.longestStreak,
            heatmapData: data.streak.heatmapData,
          })
        }
        if (data.settings) {
          if (data.settings.examDate) setExamDate(data.settings.examDate)
          if (data.settings.theme) setTheme(data.settings.theme)
        }
        if (data.aiConfig) {
          if (data.aiConfig.apiKey) setAiApiKey(data.aiConfig.apiKey)
          if (data.aiConfig.baseURL) setAiBaseURL(data.aiConfig.baseURL)
          if (data.aiConfig.model) setAiModel(data.aiConfig.model)
        }
        alert('数据导入成功')
        window.location.reload()
      } catch (err) {
        alert('导入失败：文件格式错误')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleClearAll = () => {
    // 使用 setState 通过 set() 方法重置，确保 persist middleware 正确触发
    useWordStore.setState({ records: [] })
    usePracticeStore.setState({ records: [] })
    useTimerStore.setState({ records: [] })
    usePlanStore.setState({ plans: [], executions: [] })
    useDiaryStore.setState({ entries: [] })
    useReportStore.setState({ reports: [] })
    useAchievementStore.setState({
      totalXP: 0,
      level: 1,
      unlockedBadges: [],
    })
    useStreakStore.setState({
      currentStreak: 0,
      longestStreak: 0,
      heatmapData: {},
      lastActiveDate: undefined,
    })

    // 清除 localStorage 中所有持久化数据
    useSettingsStore.getState().clearAllData()

    setClearDialogOpen(false)
    alert('所有数据已清空')
    window.location.reload()
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理你的应用设置</p>
      </div>

      {/* 考试日期 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-indigo-500" />
            考试日期
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={examDate || ''}
              onChange={(e) => {
                const val = e.target.value
                if (val) setExamDate(val)
                else clearExamDate()
              }}
              className="w-full sm:w-auto"
            />
            {daysUntilExam !== null && (
              <span className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                距离考试还有 {daysUntilExam} 天
              </span>
            )}
          </div>
          {examDate && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="text-sm">
                <p className="font-medium">在主页显示倒计时</p>
                <p className="text-xs text-muted-foreground">关闭后主页将不显示考试倒计时卡片</p>
              </div>
              <button
                onClick={() => setShowExamCountdown(!showExamCountdown)}
                className={cn(
                  'relative w-[44px] h-[24px] rounded-full transition-all duration-200 shrink-0',
                  showExamCountdown ? 'bg-indigo-500' : 'bg-muted'
                )}
                aria-label="在主页显示倒计时"
              >
                <span
                  className={cn(
                    'absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow-sm transition-all duration-200',
                    showExamCountdown ? 'left-[22px]' : 'left-[2px]'
                  )}
                />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 主题设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            <Sun className="h-4 w-4 md:h-5 md:w-5 text-orange-500" />
            主题
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* 亮暗模式 toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm">{theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? '深色模式' : '浅色模式') : theme === 'dark' ? '深色模式' : '浅色模式'}</span>
              <button
                onClick={() => {
                  if (theme === 'system') {
                    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
                    setTheme(isDark ? 'light' : 'dark')
                  } else {
                    setTheme(theme === 'light' ? 'dark' : 'light')
                  }
                }}
                disabled={theme === 'system'}
                className={cn(
                  'relative w-[56px] h-[30px] rounded-full transition-all duration-300 ease-in-out shrink-0',
                  theme === 'system'
                    ? 'bg-muted opacity-50 cursor-not-allowed'
                    : theme === 'dark'
                      ? 'bg-gradient-to-r from-indigo-700 to-violet-800'
                      : 'bg-gradient-to-r from-amber-100 to-orange-100'
                )}
                aria-label="切换主题"
              >
                <span
                  className={cn(
                    'absolute top-[3px] w-[24px] h-[24px] rounded-full bg-white shadow-md transition-all duration-300 ease-in-out flex items-center justify-center',
                    theme === 'system'
                      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'left-[29px]' : 'left-[3px]')
                      : theme === 'dark' ? 'left-[29px]' : 'left-[3px]'
                  )}
                >
                  {theme === 'light' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches) ? (
                    <Sun className="h-3 w-3 text-orange-500" />
                  ) : (
                    <Moon className="h-3 w-3 text-indigo-500" />
                  )}
                </span>
              </button>
            </div>

            {/* 跟随系统 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">跟随系统</span>
              </div>
              <button
                onClick={() => setTheme(theme === 'system' ? 'light' : 'system')}
                className={cn(
                  'relative w-[44px] h-[24px] rounded-full transition-all duration-200 shrink-0',
                  theme === 'system' ? 'bg-indigo-500' : 'bg-muted'
                )}
                aria-label="跟随系统主题"
              >
                <span
                  className={cn(
                    'absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white shadow-sm transition-all duration-200',
                    theme === 'system' ? 'left-[22px]' : 'left-[2px]'
                  )}
                />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI 智能助手配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-indigo-500" />
            AI 智能助手
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              API Key
            </label>
            <div className="relative">
              <Input
                type={showAiKey ? 'text' : 'password'}
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="输入你的 Agnes AI API Key"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowAiKey(!showAiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
              API 地址
            </label>
            <Input
              value={aiBaseURL}
              onChange={(e) => setAiBaseURL(e.target.value)}
              placeholder="https://api.hub.agnes-ai.com/v1"
            />
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">模型</label>
            <Input
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="agnes-2.5-flash"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleTestAI}
              disabled={aiTestStatus === 'testing' || !aiApiKey}
              className="w-full sm:w-auto"
            >
              {aiTestStatus === 'testing' ? (
                <span className="animate-pulse">检测中...</span>
              ) : '检测连接'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                clearAiConfig()
                setAiTestStatus('idle')
                setAiTestMessage('')
              }}
              className="w-full sm:w-auto"
            >
              重置
            </Button>
          </div>

          {/* 连接状态提示 */}
          {aiTestStatus === 'success' && (
            <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {aiTestMessage}
            </p>
          )}
          {aiTestStatus === 'error' && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              {aiTestMessage}
            </p>
          )}

          {/* 隐私提示 */}
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">隐私说明</p>
            <p>API Key 仅存储在你的本地浏览器中，不会上传到任何服务器。所有 AI 交互通过你的 Key 直接发送到 Agnes AI。</p>
          </div>
        </CardContent>
      </Card>

      {/* 数据统计 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base">数据统计概览</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {totalWords}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground">单词总数</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {totalPractice}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground">练习次数</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {totalPlans}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground">计划数量</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {totalDiary}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground">日记数量</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 数据管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base">数据管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full sm:w-auto">
                <Button variant="outline" className="w-full">
                  <Download className="mr-1 h-4 w-4" />
                  导出数据
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleExport}>
                  导出为 JSON（完整备份）
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCSV}>
                  导出为 CSV（Excel 可打开）
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" className="w-full sm:w-auto relative">
              <Upload className="mr-1 h-4 w-4" />
              导入数据
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </Button>
            <Button
              variant="destructive"
              onClick={() => setClearDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              清空所有数据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 清空确认弹窗 */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              确认清空所有数据
            </DialogTitle>
            <DialogDescription>
              此操作将永久删除所有学习记录、计划、日记和成就数据，且无法恢复。请确认是否继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setClearDialogOpen(false)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button variant="destructive" onClick={handleClearAll} className="w-full sm:w-auto">
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
