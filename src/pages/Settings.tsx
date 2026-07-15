import { useState, useMemo } from 'react'
import { differenceInDays } from 'date-fns'
import { useSettingsStore } from '@/stores/settingsStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
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
  CalendarDays,
  Lock,
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

  const passwordHash = useSettingsStore((s) => s.passwordHash)
  const setPasswordHash = useSettingsStore((s) => s.setPasswordHash)
  const clearPassword = useSettingsStore((s) => s.clearPassword)

  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  // --- 本地 UI 状态 ---
  const [examDateInput, setExamDateInput] = useState(examDate || '')
  const [passwordInput, setPasswordInput] = useState(passwordHash || '')
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
    () => usePracticeStore.getState().records.length,
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
    if (passwordInput) {
      setPasswordHash(passwordInput)
    } else {
      clearPassword()
    }
    setTheme(themeInput)
    alert('设置已保存')
  }

  const handleExport = () => {
    const data = {
      words: useWordStore.getState().records,
      practice: usePracticeStore.getState().records,
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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (data.words) useWordStore.getState().records = data.words
        if (data.practice) usePracticeStore.getState().records = data.practice
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
    useWordStore.getState().records = []
    usePracticeStore.getState().records = []
    usePlanStore.getState().plans = []
    usePlanStore.getState().executions = []
    useDiaryStore.getState().entries = []
    useAchievementStore.setState({
      totalXP: 0,
      level: 1,
      unlockedBadges: [],
    })
    useStreakStore.setState({
      currentStreak: 0,
      longestStreak: 0,
      heatmapData: {},
    })
    clearExamDate()
    clearPassword()
    setTheme('light')
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
            <CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-purple-500" />
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
              <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
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
              <Moon className="h-4 w-4 md:h-5 md:w-5 text-purple-500" />
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
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 ring-2 ring-purple-500/30'
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
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 ring-2 ring-purple-500/30'
                  : 'border-input hover:bg-accent'
              }`}
            >
              <Moon className="h-4 w-4" />
              深色
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 密码设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            <Lock className="h-4 w-4 md:h-5 md:w-5 text-purple-500" />
            密码保护
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="password"
              placeholder="设置访问密码（可选）"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full sm:w-auto"
            />
            {passwordInput && (
              <span className="text-xs text-muted-foreground">已设置密码</span>
            )}
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
              <p className="text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400">
                {totalWords}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground">单词总数</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400">
                {totalPractice}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground">练习次数</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400">
                {totalPlans}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground">计划数量</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400">
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
            <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto">
              <Download className="mr-1 h-4 w-4" />
              导出数据
            </Button>
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
