import { useSyncExternalStore } from 'react'

import type { AiArtifactAccessV2 } from './artifactRepository'
import { AiGatewayError, type AiGatewayErrorCode, type ManagedAiPurpose } from './gateway'
import { STORAGE_PREFIX } from '@/lib/constants'
import {
  executeReadOnlyAi,
  type ReadOnlyAiExecutionRequest,
  type ReadOnlyAiExecutionResult,
} from './readOnlyExecution'

export type LearnerAiTaskStatus =
  | 'running'
  | 'stopping'
  | 'succeeded'
  | 'failed'
  | 'outcome_unknown'

export interface LearnerAiTaskFailure {
  code?: AiGatewayErrorCode | 'LOCAL_SAVE_FAILED' | 'UNKNOWN'
  message: string
  retryable: boolean
  outcomeUnknown: boolean
}

/**
 * This store is intentionally in-memory only. It bridges route changes within
 * one open tab without retaining a learner's writing or AI response after a
 * browser refresh. The gateway currently cannot replay a completed response.
 */
export interface LearnerAiTask<TPurpose extends ManagedAiPurpose = ManagedAiPurpose> {
  id: string
  key: string
  purpose: TPurpose
  scopeKey: string
  label: string
  returnPath: string
  status: LearnerAiTaskStatus
  startedAt: string
  completedAt?: string
  result?: ReadOnlyAiExecutionResult<TPurpose>
  /** Purpose-scoped, non-persisted data needed to render a returned result. */
  context?: unknown
  failure?: LearnerAiTaskFailure
  noticeDismissed: boolean
}

export interface LearnerAiTaskState {
  tasks: Record<string, LearnerAiTask>
  openRequestedTaskKey: string | null
}

export interface StartLearnerAiTaskOptions<TPurpose extends ManagedAiPurpose> {
  key: string
  purpose: TPurpose
  scopeKey: string
  label: string
  returnPath: string
  request: Omit<ReadOnlyAiExecutionRequest<TPurpose>, 'signal'>
  context?: unknown
  onSuccess?: (result: ReadOnlyAiExecutionResult<TPurpose>) => void | Promise<void>
}

export interface LearnerAiTaskCoordinatorDependencies {
  execute?: <TPurpose extends ManagedAiPurpose>(
    request: ReadOnlyAiExecutionRequest<TPurpose>,
  ) => Promise<ReadOnlyAiExecutionResult<TPurpose>>
  now?: () => Date
  createId?: () => string
  storage?: Storage | null
}

export interface LearnerAiTaskCoordinator {
  getState: () => LearnerAiTaskState
  subscribe: (listener: () => void) => () => void
  start: <TPurpose extends ManagedAiPurpose>(
    options: StartLearnerAiTaskOptions<TPurpose>,
  ) => Promise<LearnerAiTask<TPurpose>>
  stopWaiting: (key: string) => void
  requestOpen: (key: string) => void
  consumeOpenRequest: (key: string) => void
  dismissNotice: (key: string) => void
  clearTerminalTask: (key: string) => void
}

const STOPPED_WAITING_MESSAGE = '已停止等待结果，服务端结果未确认。'
const UNKNOWN_OUTCOME_MESSAGE = 'AI 请求结果暂时无法确认，请稍后查看或重新生成。'
const PAGE_RELOADED_MESSAGE = '页面已重新加载，上一条 AI 请求结果未确认。请重新生成。'
const TASK_SESSION_STORAGE_KEY = `${STORAGE_PREFIX}:learnerAiTasksAwaitingOutcomeV1`

interface UnconfirmedTaskSessionRecord {
  id: string
  key: string
  purpose: ManagedAiPurpose
  scopeKey: string
  label: string
  returnPath: string
  startedAt: string
}

export function learnerAiTaskScopeKey(access: AiArtifactAccessV2): string | null {
  if (access.status !== 'ready') return null
  return access.mode === 'account' ? `account:${access.accountUserId}` : 'device'
}

export function learnerAiTaskKey(
  purpose: ManagedAiPurpose,
  scopeKey: string,
  namespace = 'default',
): string {
  return `${namespace}:${purpose}:${scopeKey}`
}

function taskFailureFrom(error: unknown, stoppedByLearner: boolean): LearnerAiTaskFailure {
  if (stoppedByLearner) {
    return {
      code: 'CANCELLED',
      message: STOPPED_WAITING_MESSAGE,
      retryable: false,
      outcomeUnknown: true,
    }
  }
  if (error instanceof AiGatewayError) {
    if (error.outcomeUnknown) {
      const message = error.code === 'NETWORK_ERROR'
        ? '网络连接中断，AI 请求结果暂时无法确认，请稍后查看或重新生成。'
        : error.code === 'TIMEOUT'
          ? '等待超时，AI 请求结果暂时无法确认，请稍后查看或重新生成。'
          : UNKNOWN_OUTCOME_MESSAGE
      return {
        code: error.code,
        message,
        retryable: error.retryable,
        outcomeUnknown: true,
      }
    }
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      outcomeUnknown: false,
    }
  }
  return {
    code: 'UNKNOWN',
    message: 'AI 暂时无法生成内容，请稍后重试。',
    retryable: true,
    outcomeUnknown: false,
  }
}

function localSaveFailure(): LearnerAiTaskFailure {
  return {
    code: 'LOCAL_SAVE_FAILED',
    message: 'AI 已生成内容，但暂时无法保存到这台设备。请稍后重试。',
    retryable: true,
    outcomeUnknown: false,
  }
}

function browserSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function isManagedPurpose(value: unknown): value is ManagedAiPurpose {
  return typeof value === 'string' && [
    'daily_suggestion',
    'learning_analysis',
    'plan_draft',
    'writing_feedback',
    'words_plan_recommendation',
  ].includes(value)
}

function unconfirmedTaskRecords(storage: Storage | null): UnconfirmedTaskSessionRecord[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(TASK_SESSION_STORAGE_KEY)
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.flatMap((candidate) => {
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return []
      const record = candidate as Record<string, unknown>
      if (
        typeof record.id !== 'string'
        || typeof record.key !== 'string'
        || !isManagedPurpose(record.purpose)
        || typeof record.scopeKey !== 'string'
        || typeof record.label !== 'string'
        || typeof record.returnPath !== 'string'
        || !record.returnPath.startsWith('/')
        || typeof record.startedAt !== 'string'
        || !Number.isFinite(Date.parse(record.startedAt))
      ) return []
      return [{
        id: record.id.slice(0, 160),
        key: record.key.slice(0, 240),
        purpose: record.purpose,
        scopeKey: record.scopeKey.slice(0, 240),
        label: record.label.slice(0, 120),
        returnPath: record.returnPath.slice(0, 240),
        startedAt: record.startedAt,
      }]
    }).slice(0, 8)
  } catch {
    return []
  }
}

function persistUnconfirmedTaskRecords(
  storage: Storage | null,
  records: readonly UnconfirmedTaskSessionRecord[],
): void {
  if (!storage) return
  try {
    if (records.length === 0) {
      storage.removeItem(TASK_SESSION_STORAGE_KEY)
      return
    }
    storage.setItem(TASK_SESSION_STORAGE_KEY, JSON.stringify(records.slice(-8)))
  } catch {
    // Session metadata is only a recovery hint; AI execution must not fail if
    // private browsing or storage policies reject it.
  }
}

function copyTask<TPurpose extends ManagedAiPurpose>(
  task: LearnerAiTask<TPurpose>,
): LearnerAiTask<TPurpose> {
  return { ...task }
}

/**
 * A route-independent, one-tab coordinator for learner-visible AI runs.
 * Navigation never aborts a task. Only `stopWaiting` aborts the browser's
 * transport, and it deliberately reports an unconfirmed server outcome.
 */
export function createLearnerAiTaskCoordinator(
  dependencies: LearnerAiTaskCoordinatorDependencies = {},
): LearnerAiTaskCoordinator {
  const execute = dependencies.execute ?? executeReadOnlyAi
  const now = dependencies.now ?? (() => new Date())
  const createId = dependencies.createId ?? (() => crypto.randomUUID())
  const storage = dependencies.storage === undefined ? browserSessionStorage() : dependencies.storage
  const restoredTasks = Object.fromEntries(unconfirmedTaskRecords(storage).map((record) => [record.key, {
    ...record,
    status: 'outcome_unknown' as const,
    completedAt: now().toISOString(),
    failure: {
      code: 'CANCELLED' as const,
      message: PAGE_RELOADED_MESSAGE,
      retryable: false,
      outcomeUnknown: true,
    },
    noticeDismissed: false,
  } satisfies LearnerAiTask])) as Record<string, LearnerAiTask>
  // Once surfaced, a previous tab's request has no recoverable response body.
  // Clear only the metadata so a dismiss/retry does not resurrect it again.
  persistUnconfirmedTaskRecords(storage, [])
  let state: LearnerAiTaskState = { tasks: restoredTasks, openRequestedTaskKey: null }
  const listeners = new Set<() => void>()
  const controllers = new Map<string, AbortController>()
  const inFlight = new Map<string, Promise<LearnerAiTask>>()

  const publish = (next: LearnerAiTaskState) => {
    state = next
    listeners.forEach((listener) => listener())
  }

  const patchTask = <TPurpose extends ManagedAiPurpose>(
    key: string,
    patch: Partial<LearnerAiTask<TPurpose>>,
  ): LearnerAiTask<TPurpose> | null => {
    const current = state.tasks[key] as LearnerAiTask<TPurpose> | undefined
    if (!current) return null
    const next = { ...current, ...patch }
    publish({ ...state, tasks: { ...state.tasks, [key]: next } })
    return next
  }

  const readTask = <TPurpose extends ManagedAiPurpose>(key: string): LearnerAiTask<TPurpose> | null => (
    (state.tasks[key] as LearnerAiTask<TPurpose> | undefined) ?? null
  )

  const rememberAwaitingOutcome = (task: LearnerAiTask) => {
    const records = unconfirmedTaskRecords(storage)
      .filter((record) => record.key !== task.key)
    records.push({
      id: task.id,
      key: task.key,
      purpose: task.purpose,
      scopeKey: task.scopeKey,
      label: task.label,
      returnPath: task.returnPath,
      startedAt: task.startedAt,
    })
    persistUnconfirmedTaskRecords(storage, records)
  }

  const forgetAwaitingOutcome = (key: string) => {
    persistUnconfirmedTaskRecords(
      storage,
      unconfirmedTaskRecords(storage).filter((record) => record.key !== key),
    )
  }

  const coordinator: LearnerAiTaskCoordinator = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start: <TPurpose extends ManagedAiPurpose>(options: StartLearnerAiTaskOptions<TPurpose>) => {
      const existing = readTask<TPurpose>(options.key)
      if (existing && (existing.status === 'running' || existing.status === 'stopping')) {
        return (inFlight.get(options.key) as Promise<LearnerAiTask<TPurpose>> | undefined)
          ?? Promise.resolve(copyTask(existing))
      }

      const controller = new AbortController()
      const task: LearnerAiTask<TPurpose> = {
        id: createId(),
        key: options.key,
        purpose: options.purpose,
        scopeKey: options.scopeKey,
        label: options.label,
        returnPath: options.returnPath,
        status: 'running',
        startedAt: now().toISOString(),
        context: options.context,
        noticeDismissed: false,
      }
      controllers.set(options.key, controller)
      rememberAwaitingOutcome(task)
      publish({
        ...state,
        tasks: { ...state.tasks, [options.key]: task },
        openRequestedTaskKey: state.openRequestedTaskKey === options.key
          ? null
          : state.openRequestedTaskKey,
      })

      const completion = (async (): Promise<LearnerAiTask<TPurpose>> => {
        try {
          const result = await execute({ ...options.request, signal: controller.signal })
          const current = readTask<TPurpose>(options.key)
          const stoppedByLearner = controller.signal.aborted || current?.status === 'stopping'
          if (stoppedByLearner) {
            forgetAwaitingOutcome(options.key)
            return patchTask<TPurpose>(options.key, {
              status: 'outcome_unknown',
              completedAt: now().toISOString(),
              failure: taskFailureFrom(null, true),
              noticeDismissed: false,
            }) ?? copyTask(task)
          }
          try {
            await options.onSuccess?.(result)
          } catch (error) {
            const failure = error instanceof AiGatewayError
              ? taskFailureFrom(error, false)
              : localSaveFailure()
            forgetAwaitingOutcome(options.key)
            return patchTask<TPurpose>(options.key, {
              status: failure.outcomeUnknown ? 'outcome_unknown' : 'failed',
              completedAt: now().toISOString(),
              failure,
              noticeDismissed: false,
            }) ?? copyTask(task)
          }
          forgetAwaitingOutcome(options.key)
          return patchTask<TPurpose>(options.key, {
            status: 'succeeded',
            completedAt: now().toISOString(),
            result,
            failure: undefined,
            noticeDismissed: false,
          }) ?? copyTask(task)
        } catch (error) {
          const current = readTask<TPurpose>(options.key)
          const failure = taskFailureFrom(error, controller.signal.aborted || current?.status === 'stopping')
          forgetAwaitingOutcome(options.key)
          return patchTask<TPurpose>(options.key, {
            status: failure.outcomeUnknown ? 'outcome_unknown' : 'failed',
            completedAt: now().toISOString(),
            failure,
            noticeDismissed: false,
          }) ?? copyTask(task)
        } finally {
          controllers.delete(options.key)
          inFlight.delete(options.key)
        }
      })()
      inFlight.set(options.key, completion as Promise<LearnerAiTask>)
      return completion
    },
    stopWaiting: (key) => {
      const task = readTask(key)
      if (!task || task.status !== 'running') return
      patchTask(key, { status: 'stopping' })
      const controller = controllers.get(key)
      if (controller) {
        controller.abort()
        return
      }
      forgetAwaitingOutcome(key)
      patchTask(key, {
        status: 'outcome_unknown',
        completedAt: now().toISOString(),
        failure: taskFailureFrom(null, true),
        noticeDismissed: false,
      })
    },
    requestOpen: (key) => {
      if (!state.tasks[key]) return
      publish({ ...state, openRequestedTaskKey: key })
    },
    consumeOpenRequest: (key) => {
      if (state.openRequestedTaskKey !== key) return
      publish({ ...state, openRequestedTaskKey: null })
    },
    dismissNotice: (key) => {
      patchTask(key, { noticeDismissed: true })
    },
    clearTerminalTask: (key) => {
      const task = readTask(key)
      if (!task || task.status === 'running' || task.status === 'stopping') return
      const { [key]: _removed, ...tasks } = state.tasks
      publish({
        tasks,
        openRequestedTaskKey: state.openRequestedTaskKey === key ? null : state.openRequestedTaskKey,
      })
    },
  }

  return coordinator
}

export const learnerAiTaskCoordinator = createLearnerAiTaskCoordinator()

export function useLearnerAiTaskState(): LearnerAiTaskState {
  return useSyncExternalStore(
    learnerAiTaskCoordinator.subscribe,
    learnerAiTaskCoordinator.getState,
    learnerAiTaskCoordinator.getState,
  )
}

export const LEARNER_AI_TASK_MESSAGES = {
  stoppedWaiting: STOPPED_WAITING_MESSAGE,
  outcomeUnknown: UNKNOWN_OUTCOME_MESSAGE,
  pageReloaded: PAGE_RELOADED_MESSAGE,
} as const
