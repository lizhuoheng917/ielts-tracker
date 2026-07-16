import { useState, useMemo } from 'react'
import { differenceInDays } from 'date-fns'
import { useSettingsStore } from '@/stores/settingsStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { usePlanStore } from '@/stores/planStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useStreakStore } from '@/stores/streakStore'
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
} from 'lucide-react'

export default function Settings() {
  // --- 核心状态 ---
  const examDate = useSettingsStore((s) => s.examDate)
  const setExamDate = useSettingsStore((s) => s.setExamDate)
  const clearExamDate = useSettingsStore((s) => s.clearExamDate)

  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  // --- 本地 UI 状态 ---
  const [examDateInput, setExamDateInput] = useState(examDate || '')
  const [themeInput, setThemeInput] = useState<'light' | 'dark'>(theme)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

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

  const handleSave = () => {
    if (examDateInput) {
      setExamDate(examDateInput)
    } else {
      clearExamDate()
    }
    setTheme(themeInput)
    alert('设置已保存')
  }

  const handleExport = () => {
    const data = {
      words: useWordStore.getState().records,
      practice: usePracticeStore.getState().records,
      timer: useTimerStore.getState().records,
      plans: usePlanStore.getState().plans,
      executions: usePlanStore.getState().executions,
      diary: useDiaryStore.getState().entries,
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
        theme: themeInput,
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
        if (data.words) useWordStore.getState().records = data.words
        if (data.practice) usePracticeStore.getState().records = data.practice
        if (data.timer) useTimerStore.getState().records = data.timer
        if (data.plans) usePlanStore.getState().plans = data.plans
        if (data.executions) usePlanStore.getState().executions = data.executions
        if (data.diary) useDiaryStore.getState().entries = data.diary
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
              value={examDateInput}
              onChange={(e) => setExamDateInput(e.target.value)}
              className="w-full sm:w-auto"
            />
            {daysUntilExam !== null && (
              <span className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                距离考试还有 {daysUntilExam} 天
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 主题设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            {themeInput === 'dark' ? (
              <Moon className="h-4 w-4 md:h-5 md:w-5 text-indigo-500" />
            ) : (
              <Sun className="h-4 w-4 md:h-5 md:w-5 text-orange-500" />
            )}
            主题
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setThemeInput('light')}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                themeInput === 'light'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 ring-2 ring-indigo-500/30'
                  : 'border-input hover:bg-accent'
              }`}
            >
              <Sun className="h-4 w-4" />
              浅色
            </button>
            <button
              onClick={() => setThemeInput('dark')}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                themeInput === 'dark'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 ring-2 ring-indigo-500/30'
                  : 'border-input hover:bg-accent'
              }`}
            >
              <Moon className="h-4 w-4" />
              深色
            </button>
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

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button onClick={handleSave} className="w-full sm:w-auto">
          保存设置
        </Button>
      </div>

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
