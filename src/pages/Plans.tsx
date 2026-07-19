import { useState, useMemo } from 'react'
import type { StudyPlan } from '@/lib/types'
import { usePlanStore } from '@/stores/planStore'
import { useReportStore } from '@/stores/reportStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Plus, CheckCircle, Circle, Pencil, Trash2, ListTodo, Play, Pause, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { AIChatPanel } from '@/components/ai/AIChatPanel'
import { getAllLearningData } from '@/lib/aiService'

const FREQUENCY_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
}

const WEEKDAY_OPTIONS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
]

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export default function Plans() {
  const plans = usePlanStore((s) => s.plans)
  const executions = usePlanStore((s) => s.executions)
  const addPlan = usePlanStore((s) => s.addPlan)
  const reports = useReportStore((s) => s.reports)
  const updatePlan = usePlanStore((s) => s.updatePlan)
  const deletePlan = usePlanStore((s) => s.deletePlan)
  const addExecution = usePlanStore((s) => s.addExecution)
  const updateExecution = usePlanStore((s) => s.updateExecution)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formCategory, setFormCategory] = useState<string>('general')
  const [formFreq, setFormFreq] = useState<'daily' | 'weekly'>('daily')
  const [formWeekDays, setFormWeekDays] = useState<number[]>([])
  const [formTime, setFormTime] = useState('')
  const [formActive, setFormActive] = useState(true)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)

  const aiSystemPrompt = useMemo(() => {
    const data = getAllLearningData()
    let reportSection = ''
    if (reports.length > 0) {
      // 按时间倒序（reportStore 新报告在数组开头），取最近 3 份报告
      const recentReports = reports.slice(0, 3)
      reportSection = `
## 历史学习分析报告（共 ${reports.length} 份，以下展示最近 ${recentReports.length} 份）
${recentReports.map((r, i) => {
  const content = r.content.length > 1500 ? r.content.slice(0, 1500) + '...(已截断)' : r.content
  return `### 报告 ${i + 1}（${r.createdAt}）\n${content}`
}).join('\n\n---\n\n')}

请综合分析以上所有历史报告中的关键发现、薄弱环节与改进建议，有针对性地生成学习计划。重点关注：
1. 报告中反复提到的薄弱项（多次出现的问题优先解决）
2. 报告中给出的具体建议（转化为可执行的学习计划）
3. 用户学习数据与报告建议之间的差距（补充缺失的练习）`
    }
    return `你是 IELTS Tracker 的 AI 学习计划助手。你是一位经验丰富的雅思备考教练。

## 用户学习数据
${JSON.stringify(data, null, 2)}
${reportSection}

## 你的职责
根据用户的学习数据${reports.length > 0 ? '和历史学习分析报告' : ''}，为其生成个性化的学习计划建议。

## ⚠️ 格式要求（极其重要，必须严格遵守）
- 每个计划**必须且只能**使用一个独立的 [ACTION:create_plan]...[/ACTION] 标记
- **绝对不要**在一个标记内放入多个计划
- **绝对不要**把多个计划的标题放在同一个标记内
- 每个标记块的格式严格如下（共4部分，缺一不可）：

第1行：计划标题（简洁，不超过20字）
第2行：计划内容/描述（详细说明该计划的具体做法，**必须填写，不能为空**）
第3行起：元数据字段（category、frequency、weekdays、time），每个字段独占一行

⚠️ 注意：第2行的计划描述是必须的，不能跳过直接写元数据。描述应具体说明做什么、怎么做。

## 可用字段值
- 分类（category）：reading | listening | writing | speaking | vocabulary | general
- 频率（frequency）：daily | weekly
- 星期（weekdays）：逗号分隔数字，0=周日 1=周一 2=周二 3=周三 4=周四 5=周五 6=周六
  - daily 频率不需要此项
  - weekly 频率**必须**指定，如 1,3,5 = 周一三五
- 时间（time）：HH:mm 格式（24小时制，如 08:00、19:30）

## 正确示例（每个标记只包含一个计划，注意第2行是计划描述）

[ACTION:create_plan]
早晨听力训练
每天早 8:00 完成一套剑桥听力真题，重点精听 Section 3，记录错题并分析原因
category:listening
frequency:daily
time:08:00
[/ACTION]

[ACTION:create_plan]
晚间阅读积累
每周一三五阅读一篇经济学人文章，做词汇笔记和段落大意总结
category:reading
frequency:weekly
weekdays:1,3,5
time:21:00
[/ACTION]

## 风格要求
- 用中文回复
- 语气友好、鼓励但不失专业
- 建议要具体，避免空泛的"多练习"
- 回复使用 Markdown 格式`
  }, [reports])

  const today = getTodayStr()
  const dayOfWeek = new Date().getDay()

  // 活跃计划（按创建时间倒序）
  const activePlans = useMemo(
    () => plans.filter((p) => p.isActive).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [plans]
  )

  // 已暂停计划
  const pausedPlans = useMemo(
    () => plans.filter((p) => !p.isActive).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [plans]
  )

  // 今日计划（根据频率筛选）
  const todayPlans = useMemo(() => {
    return activePlans.filter((p) => {
      if (p.frequency === 'daily') return true
      if (p.frequency === 'weekly') return p.weekDays?.includes(dayOfWeek)
      return false
    })
  }, [activePlans, dayOfWeek])

  // 今日执行记录映射（状态 + ID）
  const todayExecMap = useMemo(() => {
    const map: Record<string, { completed: boolean; id: string }> = {}
    executions.forEach((e) => {
      if (e.date === today) {
        map[e.planId] = { completed: e.isCompleted, id: e.id }
      }
    })
    return map
  }, [executions, today])

  const togglePlanComplete = (planId: string) => {
    const exec = todayExecMap[planId]
    if (exec) {
      // 已有记录，切换状态
      updateExecution(exec.id, { isCompleted: !exec.completed })
    } else {
      // 没有记录，创建完成状态
      addExecution({ planId, date: today, isCompleted: true })
    }
  }

  const openAdd = () => {
    setEditingId(null)
    setFormTitle('')
    setFormDescription('')
    setFormCategory('general')
    setFormFreq('daily')
    setFormWeekDays([])
    setFormTime('')
    setFormActive(true)
    setFormOpen(true)
  }

  const openEdit = (plan: StudyPlan) => {
    setEditingId(plan.id)
    setFormTitle(plan.title)
    setFormDescription(plan.description || '')
    setFormCategory(plan.category)
    setFormFreq(plan.frequency as 'daily' | 'weekly')
    setFormWeekDays(plan.weekDays || [])
    setFormTime(plan.targetTime || '')
    setFormActive(plan.isActive)
    setFormOpen(true)
  }

  const handleSave = () => {
    if (!formTitle.trim()) return
    const data = {
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      category: formCategory as 'reading' | 'listening' | 'writing' | 'speaking' | 'vocabulary' | 'general',
      frequency: formFreq as 'daily' | 'weekly',
      weekDays: formFreq === 'weekly' ? formWeekDays : undefined,
      targetTime: formTime || undefined,
      isActive: formActive,
    }
    if (editingId) {
      updatePlan(editingId, data)
    } else {
      addPlan(data)
    }
    setFormOpen(false)
  }

  const handleDelete = () => {
    if (deleteId) {
      deletePlan(deleteId)
      setDeleteId(null)
    }
  }

  const toggleWeekDay = (day: number) => {
    setFormWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* 标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[22px] md:text-2xl font-bold">学习计划</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">管理你的每日学习任务</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setAiOpen(true)} className="w-full sm:w-auto">
            <Sparkles className="h-4 w-4 mr-1 text-violet-500" />
            AI 生成
          </Button>
          <Button onClick={openAdd} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            添加计划
          </Button>
        </div>
      </div>

      {/* 今日待办 */}
      <Card>
        <CardContent className="pt-4 pb-3 px-3 md:px-4">
          <h3 className="text-[15px] md:text-base font-semibold mb-3 flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-indigo-500" />
            今日待办 ({todayPlans.length})
          </h3>
          {todayPlans.length === 0 ? (
            <EmptyState
              scene="tasks"
              title="今天没有待办任务"
              description="创建一个学习计划来安排你的每日任务"
            />
          ) : (
            <div className="space-y-2">
              {todayPlans.map((plan, index) => {
                const exec = todayExecMap[plan.id]
                const isCompleted = exec?.completed ?? false
                return (
                  <button
                    key={plan.id}
                    onClick={() => togglePlanComplete(plan.id)}
                    className={cn(
                      `animate-stagger-up stagger-${index + 1} flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all`,
                      isCompleted
                        ? 'border-green-200 bg-green-50 dark:bg-green-900/30 dark:border-green-800/50'
                        : 'border-border bg-background hover:bg-accent active:bg-accent/80'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4 md:h-5 md:w-5 shrink-0 text-green-500" />
                    ) : (
                      <Circle className="h-4 w-4 md:h-5 md:w-5 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        'text-sm flex-1',
                        isCompleted && 'line-through text-muted-foreground'
                      )}
                    >
                      {plan.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {plan.targetTime && (
                        <span className="text-[12px] text-indigo-500 dark:text-indigo-400 font-medium">
                          {plan.targetTime}
                        </span>
                      )}
                      <Badge variant="outline" className="text-[12px] md:text-xs shrink-0">
                        {FREQUENCY_LABELS[plan.frequency]}
                      </Badge>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 所有活跃计划 */}
      <div className="space-y-2 md:space-y-3">
        <h3 className="text-[15px] md:text-base font-semibold">活跃计划 ({activePlans.length})</h3>
        {activePlans.length === 0 ? (
          <EmptyState
            scene="plans"
            title="还没有创建学习计划"
            description="创建你的第一个学习计划，让每天的雅思备考更有条理"
          />
        ) : (
          <Card className="py-0">
            <div className="divide-y divide-border">
              {activePlans.map((plan) => (
                <div key={plan.id} className="group/row flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3 md:py-3.5 hover:bg-accent/50 transition-colors">
                  <span
                    className={cn(
                      'shrink-0 inline-block w-2 h-2 rounded-full',
                      plan.isActive ? 'bg-green-500' : 'bg-muted-foreground/30'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{plan.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge variant="outline" className="text-[12px] md:text-xs">
                        {FREQUENCY_LABELS[plan.frequency]}
                      </Badge>
                      {plan.targetTime && (
                        <Badge variant="outline" className="text-[12px] md:text-xs text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800">
                          {plan.targetTime}
                        </Badge>
                      )}
                      {plan.frequency === 'weekly' && plan.weekDays && (
                        <span className="text-[12px] md:text-xs text-muted-foreground">
                          周{plan.weekDays.map((d) => WEEKDAY_OPTIONS.find((o) => o.value === d)?.label).join('、')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEdit(plan)}
                      className="h-8 w-8"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeleteId(plan.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* 已暂停计划 */}
      {pausedPlans.length > 0 && (
        <div className="space-y-2 md:space-y-3">
          <h3 className="text-[15px] md:text-base font-semibold flex items-center gap-2 text-muted-foreground">
            <Pause className="h-4 w-4" />
            已暂停计划 ({pausedPlans.length})
          </h3>
          <Card className="py-0">
            <div className="divide-y divide-border">
              {pausedPlans.map((plan) => (
                <div key={plan.id} className="group/row flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3 md:py-3.5 hover:bg-accent/50 transition-colors">
                  <span className="shrink-0 inline-block w-2 h-2 rounded-full bg-muted-foreground/30" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-muted-foreground">{plan.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge variant="outline" className="text-[12px] md:text-xs">
                        {FREQUENCY_LABELS[plan.frequency]}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => updatePlan(plan.id, { isActive: true })}
                      className="h-8 w-8 text-green-500 hover:text-green-600"
                      title="重新启用"
                    >
                      <Play className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEdit(plan)}
                      className="h-8 w-8"
                      title="编辑"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeleteId(plan.id)}
                      className="h-8 w-8"
                      title="删除"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑计划' : '添加计划'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改这个学习计划的设置' : '创建一个新的学习计划'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>计划名称</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="例如：每天背诵50个单词"
              />
            </div>

            <div className="space-y-2">
              <Label>计划内容</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="详细描述你的学习计划（可选）"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={formCategory} onValueChange={(v) => v && setFormCategory(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reading">阅读</SelectItem>
                  <SelectItem value="listening">听力</SelectItem>
                  <SelectItem value="writing">写作</SelectItem>
                  <SelectItem value="speaking">口语</SelectItem>
                  <SelectItem value="vocabulary">词汇</SelectItem>
                  <SelectItem value="general">综合</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>频率</Label>
              <Select value={formFreq} onValueChange={(v) => setFormFreq(v as 'daily' | 'weekly')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">每日</SelectItem>
                  <SelectItem value="weekly">每周</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formFreq === 'weekly' && (
              <div className="space-y-2">
                <Label>星期</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <button
                      key={day.value}
                      onClick={() => toggleWeekDay(day.value)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-all',
                        formWeekDays.includes(day.value)
                          ? 'bg-indigo-600 text-white'
                          : 'border bg-background hover:bg-accent'
                      )}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>完成时间（可选）</Label>
              <Input
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="active" className="text-sm cursor-pointer">
                启用此计划
              </label>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button onClick={handleSave} disabled={!formTitle.trim()} className="w-full sm:w-auto">
              {editingId ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除这个学习计划吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="w-full sm:w-auto">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="w-full sm:w-auto">
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 生成计划弹窗 */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              AI 生成学习计划
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 px-4 pb-4">
            <AIChatPanel
              systemPrompt={aiSystemPrompt}
              placeholder="让 AI 根据你的学习数据生成计划..."
              chatContext="plans"
              suggestions={
                reports.length > 0
                  ? [
                      '根据我的历史学习报告，分析薄弱项并生成针对性的学习计划',
                      '帮我制定一个为期四周的听力提升计划',
                      '根据我的基础，每天应该怎么安排学习？',
                      '我阅读比较弱，帮我设计一个阅读专项训练',
                      '帮我规划周末的集中练习时间',
                    ]
                  : [
                      '帮我制定一个为期四周的听力提升计划',
                      '根据我的基础，每天应该怎么安排学习？',
                      '我阅读比较弱，帮我设计一个阅读专项训练',
                      '我想每天早上和晚上各安排一个任务',
                      '帮我规划周末的集中练习时间',
                    ]
              }
              onActionConfirm={(action) => {
                if (action.type === 'create_plan') {
                  const title = action.title || 'AI 建议计划'
                  const lines = action.description.split('\n').map((l) => l.trim()).filter(Boolean)

                  // 提取元数据字段
                  let category: string = 'general'
                  let frequency: string = 'daily'
                  let targetTime: string | undefined
                  let weekDays: number[] | undefined
                  const descLines: string[] = []

                  for (const line of lines) {
                    const catMatch = line.match(/^category:(.+)/i)
                    const freqMatch = line.match(/^frequency:(.+)/i)
                    const timeMatch = line.match(/^time:(.+)/i)
                    const wdMatch = line.match(/^weekdays:(.+)/i)
                    if (catMatch) {
                      const val = catMatch[1].trim().toLowerCase()
                      if (['reading', 'listening', 'writing', 'speaking', 'vocabulary', 'general'].includes(val)) {
                        category = val
                      }
                    } else if (freqMatch) {
                      const val = freqMatch[1].trim().toLowerCase()
                      if (['daily', 'weekly'].includes(val)) {
                        frequency = val
                      }
                    } else if (timeMatch) {
                      targetTime = timeMatch[1].trim()
                    } else if (wdMatch) {
                      weekDays = wdMatch[1]
                        .split(',')
                        .map((s) => parseInt(s.trim(), 10))
                        .filter((n) => !isNaN(n) && n >= 0 && n <= 6)
                    } else {
                      descLines.push(line)
                    }
                  }

                  // 兼容旧格式：从描述行中查找分类关键词
                  if (category === 'general') {
                    const catLine = lines.find((l) => /^(reading|listening|writing|speaking|general)$/i.test(l))
                    if (catLine) category = catLine.toLowerCase()
                  }

                  const description = descLines.join('\n') || ''
                  addPlan({
                    title,
                    description,
                    category: category as 'reading' | 'listening' | 'writing' | 'speaking' | 'vocabulary' | 'general',
                    frequency: frequency as 'daily' | 'weekly',
                    targetTime: targetTime || undefined,
                    weekDays: frequency === 'weekly' ? (weekDays && weekDays.length > 0 ? weekDays : undefined) : undefined,
                    isActive: true,
                  })
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
