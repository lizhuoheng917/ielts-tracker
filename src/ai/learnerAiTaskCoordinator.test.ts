import { describe, expect, it, vi } from 'vitest'

import { AiGatewayError, type ManagedAiPurpose } from './gateway'
import {
  LEARNER_AI_TASK_MESSAGES,
  createLearnerAiTaskCoordinator,
  learnerAiTaskKey,
  type LearnerAiTaskCoordinatorDependencies,
} from './learnerAiTaskCoordinator'
import type { ReadOnlyAiExecutionResult } from './readOnlyExecution'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function request<TPurpose extends ManagedAiPurpose>(purpose: TPurpose) {
  return {
    purpose,
    snapshot: {} as never,
    userInput: purpose === 'writing_feedback' ? '' : '生成内容',
  }
}

function result<TPurpose extends ManagedAiPurpose>(purpose: TPurpose): ReadOnlyAiExecutionResult<TPurpose> {
  return {
    source: 'managed',
    content: { kind: purpose } as never,
    warnings: [],
  }
}

function coordinatorWith(
  execute: LearnerAiTaskCoordinatorDependencies['execute'],
  storage?: Storage | null,
) {
  return createLearnerAiTaskCoordinator({
    execute,
    createId: () => 'task-1',
    now: () => new Date('2026-08-03T00:00:00.000Z'),
    storage,
  })
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('learner AI task coordinator', () => {
  it('keeps an in-flight task alive after a route observer disappears and stores its result', async () => {
    const pending = deferred<ReadOnlyAiExecutionResult<'learning_analysis'>>()
    const execute = vi.fn(() => pending.promise) as LearnerAiTaskCoordinatorDependencies['execute']
    const coordinator = coordinatorWith(execute)
    const key = learnerAiTaskKey('learning_analysis', 'account:learner', 'stats')

    const completion = coordinator.start({
      key,
      purpose: 'learning_analysis',
      scopeKey: 'account:learner',
      label: '学习分析',
      returnPath: '/stats',
      context: { from: 'stats-page' },
      request: request('learning_analysis'),
    })

    expect(coordinator.getState().tasks[key]).toMatchObject({ status: 'running', returnPath: '/stats' })
    // A route component would unsubscribe here. The coordinator intentionally
    // has no route-owned cleanup and must still settle the gateway promise.
    pending.resolve(result('learning_analysis'))

    await expect(completion).resolves.toMatchObject({ status: 'succeeded' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordinator.getState().tasks[key]).toMatchObject({
      status: 'succeeded',
      context: { from: 'stats-page' },
      result: { source: 'managed' },
    })
  })

  it('deduplicates a second start for the same running task so it cannot double-call the model', async () => {
    const pending = deferred<ReadOnlyAiExecutionResult<'plan_draft'>>()
    const execute = vi.fn(() => pending.promise) as LearnerAiTaskCoordinatorDependencies['execute']
    const coordinator = coordinatorWith(execute)
    const key = learnerAiTaskKey('plan_draft', 'account:learner', 'plans')
    const onSuccess = vi.fn()
    const options = {
      key,
      purpose: 'plan_draft' as const,
      scopeKey: 'account:learner',
      label: '学习计划草稿',
      returnPath: '/plans',
      request: request('plan_draft'),
      onSuccess,
    }

    const first = coordinator.start(options)
    const second = coordinator.start(options)

    expect(second).toBe(first)
    expect(execute).toHaveBeenCalledTimes(1)
    pending.resolve(result('plan_draft'))
    await first
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('allows a fresh run after a successful terminal task for report regeneration', async () => {
    const execute = vi.fn(async (taskRequest) => result(taskRequest.purpose)) as LearnerAiTaskCoordinatorDependencies['execute']
    const coordinator = coordinatorWith(execute)
    const key = learnerAiTaskKey('learning_analysis', 'account:learner', 'stats')
    const options = {
      key,
      purpose: 'learning_analysis' as const,
      scopeKey: 'account:learner',
      label: '学习分析',
      returnPath: '/stats',
      request: request('learning_analysis'),
    }

    await expect(coordinator.start(options)).resolves.toMatchObject({ status: 'succeeded' })
    await expect(coordinator.start(options)).resolves.toMatchObject({ status: 'succeeded' })
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('reports an explicit stop as an unconfirmed server outcome instead of a false failure', async () => {
    const execute = vi.fn((taskRequest) => new Promise<ReadOnlyAiExecutionResult<'writing_feedback'>>((_, reject) => {
      taskRequest.signal?.addEventListener('abort', () => {
        reject(new AiGatewayError('CANCELLED', '已停止等待 AI 结果。', false, undefined, undefined, true))
      })
    })) as LearnerAiTaskCoordinatorDependencies['execute']
    const coordinator = coordinatorWith(execute)
    const key = learnerAiTaskKey('writing_feedback', 'account:learner', 'practice-writing')

    const completion = coordinator.start({
      key,
      purpose: 'writing_feedback',
      scopeKey: 'account:learner',
      label: '写作反馈',
      returnPath: '/exam',
      request: request('writing_feedback'),
    })
    coordinator.stopWaiting(key)

    expect(coordinator.getState().tasks[key].status).toBe('stopping')
    await expect(completion).resolves.toMatchObject({
      status: 'outcome_unknown',
      failure: { message: LEARNER_AI_TASK_MESSAGES.stoppedWaiting, outcomeUnknown: true },
    })
  })

  it('keeps a definitive provider failure distinct from an unknown outcome', async () => {
    const execute = vi.fn(async () => {
      throw new AiGatewayError('PROVIDER_ERROR', 'AI 服务商暂时没有响应，请稍后再试。', true, 502)
    }) as LearnerAiTaskCoordinatorDependencies['execute']
    const coordinator = coordinatorWith(execute)
    const key = learnerAiTaskKey('daily_suggestion', 'device', 'dashboard')

    await expect(coordinator.start({
      key,
      purpose: 'daily_suggestion',
      scopeKey: 'device',
      label: '今日学习建议',
      returnPath: '/',
      request: request('daily_suggestion'),
    })).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'PROVIDER_ERROR', outcomeUnknown: false },
    })
  })

  it('keeps open requests scoped to the task that owns the result', async () => {
    const execute = vi.fn(async (taskRequest) => result(taskRequest.purpose)) as LearnerAiTaskCoordinatorDependencies['execute']
    const coordinator = coordinatorWith(execute)
    const firstKey = learnerAiTaskKey('daily_suggestion', 'account:one', 'dashboard')
    const secondKey = learnerAiTaskKey('daily_suggestion', 'account:two', 'dashboard')

    await coordinator.start({
      key: firstKey,
      purpose: 'daily_suggestion',
      scopeKey: 'account:one',
      label: '今日学习建议',
      returnPath: '/',
      request: request('daily_suggestion'),
    })
    await coordinator.start({
      key: secondKey,
      purpose: 'daily_suggestion',
      scopeKey: 'account:two',
      label: '今日学习建议',
      returnPath: '/',
      request: request('daily_suggestion'),
    })

    coordinator.requestOpen(firstKey)
    expect(coordinator.getState().openRequestedTaskKey).toBe(firstKey)
    coordinator.consumeOpenRequest(secondKey)
    expect(coordinator.getState().openRequestedTaskKey).toBe(firstKey)
    coordinator.consumeOpenRequest(firstKey)
    expect(coordinator.getState().openRequestedTaskKey).toBeNull()
  })

  it('surfaces a page reload as an unknown outcome without persisting the request content', () => {
    const storage = memoryStorage()
    const pending = deferred<ReadOnlyAiExecutionResult<'writing_feedback'>>()
    const first = coordinatorWith(vi.fn(() => pending.promise) as LearnerAiTaskCoordinatorDependencies['execute'], storage)
    const key = learnerAiTaskKey('writing_feedback', 'account:learner', 'practice-writing')

    void first.start({
      key,
      purpose: 'writing_feedback',
      scopeKey: 'account:learner',
      label: '写作反馈',
      returnPath: '/exam',
      context: { privateEssay: 'must not persist' },
      request: request('writing_feedback'),
    })
    const rawSession = JSON.stringify([...Array(storage.length)].map((_, index) => storage.getItem(storage.key(index)!)))
    expect(rawSession).not.toContain('privateEssay')

    const afterReload = coordinatorWith(vi.fn() as LearnerAiTaskCoordinatorDependencies['execute'], storage)
    expect(afterReload.getState().tasks[key]).toMatchObject({
      status: 'outcome_unknown',
      failure: { message: LEARNER_AI_TASK_MESSAGES.pageReloaded, outcomeUnknown: true },
    })
  })
})
