import { useState, useMemo } from 'react'
import type { StudyPlan } from '@/lib/types'
import { usePlanStore } from '@/stores/planStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { Plus, CheckCircle, Circle, Pencil, Trash2, ListTodo, Play, Pause } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

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
  const updatePlan = usePlanStore((s) => s.updatePlan)
  const deletePlan = usePlanStore((s) => s.deletePlan)
  const addExecution = usePlanStore((s) => s.addExecution)
  const updateExecution = usePlanStore((s) => s.updateExecution)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState<string>('general')
  const [formFreq, setFormFreq] = useState<'daily' | 'weekly'>('daily')
  const [formWeekDays, setFormWeekDays] = useState<number[]>([])
  const [formActive, setFormActive] = useState(true)

  const [deleteId, setDeleteId] = useState<string | null>(null)

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
    setFormCategory('general')
    setFormFreq('daily')
    setFormWeekDays([])
    setFormActive(true)
    setFormOpen(true)
  }

  const openEdit = (plan: StudyPlan) => {
    setEditingId(plan.id)
    setFormTitle(plan.title)
    setFormCategory(plan.category)
    setFormFreq(plan.frequency as 'daily' | 'weekly')
    setFormWeekDays(plan.weekDays || [])
    setFormActive(plan.isActive)
    setFormOpen(true)
  }

  const handleSave = () => {
    if (!formTitle.trim()) return
    const data = {
      title: formTitle.trim(),
      category: formCategory as 'reading' | 'listening' | 'writing' | 'speaking' | 'vocabulary' | 'general',
      frequency: formFreq as 'daily' | 'weekly',
      weekDays: formFreq === 'weekly' ? formWeekDays : undefined,
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
        <Button onClick={openAdd} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          添加计划
        </Button>
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
                    <Badge variant="outline" className="text-[12px] md:text-xs shrink-0">
                      {FREQUENCY_LABELS[plan.frequency]}
                    </Badge>
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
    </div>
  )
}
