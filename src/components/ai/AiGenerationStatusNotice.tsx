import { CheckCircle2, CircleAlert, Loader2, X } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  learnerAiTaskCoordinator,
  learnerAiTaskScopeKey,
  type LearnerAiTask,
  useLearnerAiTaskState,
} from '@/ai/learnerAiTaskCoordinator'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function taskPriority(task: LearnerAiTask): number {
  if (task.status === 'running' || task.status === 'stopping') return 2
  return 1
}

function visibleTaskForScope(
  tasks: Record<string, LearnerAiTask>,
  scopeKey: string | null,
): LearnerAiTask | null {
  if (!scopeKey) return null
  return Object.values(tasks)
    .filter((task) => task.scopeKey === scopeKey && !task.noticeDismissed)
    .sort((left, right) => (
      taskPriority(right) - taskPriority(left)
      || right.startedAt.localeCompare(left.startedAt)
    ))[0] ?? null
}

function taskCopy(task: LearnerAiTask): { title: string; detail: string; action: string } {
  if (task.status === 'running') {
    return {
      title: `正在生成${task.label}`,
      detail: '你可以继续浏览，完成后会在这里提示。',
      action: '返回查看',
    }
  }
  if (task.status === 'stopping') {
    return {
      title: `正在停止等待${task.label}`,
      detail: '正在确认本机请求是否已结束。',
      action: '返回查看',
    }
  }
  if (task.status === 'succeeded') {
    return {
      title: `${task.label}已生成`,
      detail: '结果已保留在当前标签页，可随时查看。',
      action: '查看结果',
    }
  }
  if (task.status === 'outcome_unknown') {
    return {
      title: `${task.label}结果未确认`,
      detail: task.failure?.message ?? '本机没有收到可确认的结果，请稍后重新生成。',
      action: '查看详情',
    }
  }
  if (task.failure?.code === 'LOCAL_SAVE_FAILED') {
    return {
      title: `${task.label}已生成，但未保存`,
      detail: task.failure.message,
      action: '查看详情',
    }
  }
  return {
    title: `${task.label}未能生成`,
    detail: task.failure?.message ?? 'AI 暂时不可用，请稍后重试。',
    action: '查看详情',
  }
}

/** A compact, route-independent status surface for one-tab AI work. */
export function AiGenerationStatusNotice() {
  const access = useAiArtifactAccess()
  const scopeKey = learnerAiTaskScopeKey(access)
  const { tasks } = useLearnerAiTaskState()
  const navigate = useNavigate()
  const task = useMemo(() => visibleTaskForScope(tasks, scopeKey), [scopeKey, tasks])

  if (!task) return null
  const copy = taskCopy(task)
  const active = task.status === 'running' || task.status === 'stopping'
  const failed = task.status === 'failed' || task.status === 'outcome_unknown'

  const openTask = () => {
    learnerAiTaskCoordinator.requestOpen(task.key)
    navigate(task.returnPath)
  }

  return (
    <section
      className={cn(
        'fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur md:bottom-6 md:left-auto md:right-6',
        failed ? 'border-amber-500/35' : 'border-primary/20',
      )}
      aria-live="polite"
      aria-label="AI 生成状态"
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full',
          failed ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-primary/10 text-primary',
        )}
      >
        {active ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : failed ? (
          <CircleAlert className="size-4" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-5">{copy.title}</p>
        <p className="truncate text-xs leading-5 text-muted-foreground">{copy.detail}</p>
      </div>
      <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-xs" onClick={openTask}>
        {copy.action}
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-8 shrink-0"
        onClick={() => learnerAiTaskCoordinator.dismissNotice(task.key)}
        aria-label="关闭 AI 状态提示"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </section>
  )
}
