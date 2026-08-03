import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { AiCommandReceipt } from '@/ai/contracts'
import {
  parsePlanCreateCommandPayload,
  planCommandPayloadToStudyPlan,
  type PlanCreateCommandDraft,
} from '@/ai/planCommands'
import {
  announceCanonicalMutation,
  CanonicalMutationBusyError,
  installCanonicalMutationPulseListener,
  readCanonicalMutationEpoch,
  withCanonicalMutationLock,
} from '@/data/canonicalMutationCoordinator'
import { rebuildActivityLedger } from '@/data/activityLedgerBootstrap'
import {
  createActivityTransactionPlan,
  projectActivityEvents,
  type LedgerEventDraft,
} from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import { createDailyCheckinMutation } from '@/data/dailyCheckin'
import {
  createEntityCollectionPatch,
  createStateFieldsPatch,
  readPendingLocalMutation,
  recoverPendingLocalMutation,
  type LocalMutationPatch,
} from '@/data/localMutationJournal'
import { STORAGE_PREFIX } from '@/lib/constants'
import {
  canonicalizePlanExecutions,
  createPlanExecutionId,
  findPlanExecutionForDate,
  samePlanExecutionValue,
} from '@/lib/planExecution'
import type { PlanExecution, StudyPlan } from '@/lib/types'
import { useAchievementStore } from '@/stores/achievementStore'
import { useActivityLedgerStore } from '@/stores/activityLedgerStore'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'

export type PlanMutationStatus = 'applied' | 'duplicate' | 'not_found' | 'busy' | 'failed'

export interface PlanMutationResult {
  status: PlanMutationStatus
  targetId?: string
  removedCount?: number
  error?: {
    code: string
    message: string
  }
}

export type SetPlanExecutionInput = Omit<PlanExecution, 'id' | 'updatedAt'>

interface PlanStore {
  plans: StudyPlan[]
  executions: PlanExecution[]
  aiCommandReceipts: AiCommandReceipt[]
  mutationRevision: number
  addPlan: (plan: Omit<StudyPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PlanMutationResult>
  /** User confirmation is the trusted input; the model can only propose the draft payload. */
  applyConfirmedAiPlanDraft: (
    draft: PlanCreateCommandDraft,
    scope: { routeMode: 'managed' | 'custom'; accountScopeId: string; now?: Date },
  ) => Promise<AiCommandReceipt>
  rejectAiPlanDraft: (draft: PlanCreateCommandDraft) => Promise<AiCommandReceipt>
  updatePlan: (
    id: string,
    data: Partial<Omit<StudyPlan, 'id' | 'createdAt'>>,
  ) => Promise<PlanMutationResult>
  deletePlan: (id: string) => Promise<PlanMutationResult>
  togglePlanActive: (id: string) => Promise<PlanMutationResult>
  setExecutionForDate: (execution: SetPlanExecutionInput) => Promise<PlanMutationResult>
  deleteExecution: (id: string) => Promise<PlanMutationResult>
  repairDuplicatePlanExecutions: () => Promise<PlanMutationResult>
  getTodayExecutions: (date: string) => PlanExecution[]
  getActivePlans: () => StudyPlan[]
}

const generateId = () => crypto.randomUUID()
const PLAN_STORAGE_KEY = `${STORAGE_PREFIX}:studyPlans`
const DAILY_CHECKIN_STORAGE_KEY = `${STORAGE_PREFIX}:dailyCheckins`
const MAX_AI_COMMAND_RECEIPTS = 200
const PLAN_MUTATION_SCOPE = 'studyPlans'

function appendAiCommandReceipt(
  receipts: readonly AiCommandReceipt[],
  receipt: AiCommandReceipt,
): AiCommandReceipt[] {
  return [receipt, ...receipts].slice(0, MAX_AI_COMMAND_RECEIPTS)
}

function createAiCommandReceipt(
  draft: PlanCreateCommandDraft,
  status: AiCommandReceipt['status'],
  options: { targetId?: string; code?: string; message?: string } = {},
): AiCommandReceipt {
  return {
    schemaVersion: 1,
    receiptId: generateId(),
    draftId: draft.draftId,
    action: 'plan.create',
    idempotencyKey: draft.idempotencyKey,
    status,
    createdAt: new Date().toISOString(),
    ...(options.targetId ? { targetId: options.targetId } : {}),
    ...(options.code && options.message
      ? { error: { code: options.code, message: options.message } }
      : {}),
  }
}

function failedPlanMutation(error: unknown): PlanMutationResult {
  if (error instanceof CanonicalMutationBusyError) {
    return {
      status: 'busy',
      error: { code: 'CANONICAL_MUTATION_BUSY', message: error.message },
    }
  }
  return {
    status: 'failed',
    error: {
      code: 'PLAN_MUTATION_FAILED',
      message: error instanceof Error ? error.message : '计划暂时无法保存，请稍后重试。',
    },
  }
}

function failedAiReceipt(draft: PlanCreateCommandDraft, error: unknown): AiCommandReceipt {
  const busy = error instanceof CanonicalMutationBusyError
  return createAiCommandReceipt(draft, 'failed', {
    code: busy ? 'CANONICAL_MUTATION_BUSY' : 'STORAGE_WRITE_FAILED',
    message: busy ? error.message : '本机存储写入失败，计划没有被确认保存。',
  })
}

async function rehydratePlanMutationStores(): Promise<void> {
  await Promise.resolve(usePlanStore.persist.rehydrate())
  await Promise.resolve(useDailyCheckinStore.persist.rehydrate())
  await Promise.resolve(useAchievementStore.persist.rehydrate())
  await Promise.resolve(useStreakStore.persist.rehydrate())
  await Promise.resolve(useSettingsStore.persist.rehydrate())
  await Promise.resolve(useActivityLedgerStore.persist.rehydrate())
}

let observedCanonicalMutationEpoch = readCanonicalMutationEpoch()

function assertCanonicalEpochIsCurrent(): void {
  const currentEpoch = readCanonicalMutationEpoch()
  if (currentEpoch !== observedCanonicalMutationEpoch) {
    throw new CanonicalMutationBusyError('数据已在另一个页面整体更新，请刷新后再继续。')
  }
}

function recoverPlanSafePendingMutation() {
  const pending = readPendingLocalMutation()
  if (
    pending?.phase === 'prepared'
    && !pending.action.startsWith('plan.')
  ) {
    throw new CanonicalMutationBusyError('另一个页面正在保存学习记录，请稍后重试。')
  }
  return recoverPendingLocalMutation()
}

async function withFreshPlanMutation<T>(
  task: () => T | PromiseLike<T>,
): Promise<T> {
  return withCanonicalMutationLock(async () => {
    assertCanonicalEpochIsCurrent()
    const recovery = recoverPlanSafePendingMutation()
    if (recovery.status === 'conflict' || recovery.status === 'failed') {
      throw new Error(recovery.detail || '检测到未完成的数据事务，请重新加载后重试。')
    }

    await rehydratePlanMutationStores()
    if (recovery.requiresLedgerRebuild) rebuildActivityLedger(new Date().toISOString(), 'recovery')
    return task()
  })
}

function announceCurrentPlanRevision(): void {
  announceCanonicalMutation(PLAN_MUTATION_SCOPE, usePlanStore.getState().mutationRevision)
}

function stateFieldRevisionPatch(beforeRevision: number, afterRevision: number) {
  return createStateFieldsPatch({
    storage: localStorage,
    storageKey: PLAN_STORAGE_KEY,
    beforeState: { mutationRevision: beforeRevision },
    expectedAfterState: { mutationRevision: afterRevision },
    fields: ['mutationRevision'],
  })
}

function sameStudyPlan(left: StudyPlan, right: StudyPlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const usePlanStore = create<PlanStore>()(
  persist(
    (set, get) => {
      const setEnvelope = (
        updater: (state: PlanStore) => Partial<PlanStore>,
      ): void => {
        const before = get()
        try {
          set(updater)
        } catch (error) {
          try {
            set({
              plans: before.plans,
              executions: before.executions,
              aiCommandReceipts: before.aiCommandReceipts,
              mutationRevision: before.mutationRevision,
            })
          } catch {
            // Zustand updates memory before persistence; this restores the visible
            // snapshot even when the rollback cannot be written to storage.
          }
          throw error
        }
      }

      return {
        plans: [],
        executions: [],
        aiCommandReceipts: [],
        mutationRevision: 0,

        addPlan: async (data) => {
          try {
            const result = await withFreshPlanMutation(() => {
              const now = new Date().toISOString()
              const plan: StudyPlan = {
                ...data,
                id: generateId(),
                createdAt: now,
                updatedAt: now,
              }
              setEnvelope((state) => ({
                plans: [plan, ...state.plans],
                mutationRevision: state.mutationRevision + 1,
              }))
              return { status: 'applied', targetId: plan.id } satisfies PlanMutationResult
            })
            announceCurrentPlanRevision()
            return result
          } catch (error) {
            return failedPlanMutation(error)
          }
        },

        applyConfirmedAiPlanDraft: async (draft, scope) => {
          const scopeNow = scope.now ?? new Date()
          if (
            !Number.isFinite(Date.parse(draft.context.expiresAt))
            || scopeNow.getTime() > Date.parse(draft.context.expiresAt)
          ) {
            try {
              const receipt = await withFreshPlanMutation(() => {
                const stale = createAiCommandReceipt(draft, 'stale', {
                  code: 'PLAN_DRAFT_EXPIRED',
                  message: '这条草稿已过期，请根据最新学习记录重新生成。',
                })
                setEnvelope((state) => ({
                  aiCommandReceipts: appendAiCommandReceipt(state.aiCommandReceipts, stale),
                  mutationRevision: state.mutationRevision + 1,
                }))
                return stale
              })
              announceCurrentPlanRevision()
              return receipt
            } catch (error) {
              return failedAiReceipt(draft, error)
            }
          }

          if (
            draft.context.routeMode !== scope.routeMode
            || draft.context.accountScopeId !== scope.accountScopeId
          ) {
            try {
              const receipt = await withFreshPlanMutation(() => {
                const mismatch = createAiCommandReceipt(draft, 'scope_mismatch', {
                  code: 'PLAN_DRAFT_SCOPE_MISMATCH',
                  message: 'AI 来源或账号已经变化，请在当前状态下重新生成计划。',
                })
                setEnvelope((state) => ({
                  aiCommandReceipts: appendAiCommandReceipt(state.aiCommandReceipts, mismatch),
                  mutationRevision: state.mutationRevision + 1,
                }))
                return mismatch
              })
              announceCurrentPlanRevision()
              return receipt
            } catch (error) {
              return failedAiReceipt(draft, error)
            }
          }

          let payload: ReturnType<typeof parsePlanCreateCommandPayload>
          try {
            payload = parsePlanCreateCommandPayload(draft.payload)
          } catch {
            return createAiCommandReceipt(draft, 'failed', {
              code: 'INVALID_PLAN_DRAFT',
              message: '计划草稿格式无效，请重新生成。',
            })
          }

          try {
            const receipt = await withFreshPlanMutation(() => {
              const state = get()
              const previous = state.aiCommandReceipts.find((candidate) => (
                candidate.idempotencyKey === draft.idempotencyKey
                && (candidate.status === 'applied' || candidate.status === 'duplicate')
              ))
              const targetId = previous?.targetId
                ?? (state.plans.some((plan) => plan.id === draft.draftId) ? draft.draftId : undefined)

              if (previous || targetId) {
                const duplicate = createAiCommandReceipt(draft, 'duplicate', { targetId })
                setEnvelope((current) => ({
                  aiCommandReceipts: appendAiCommandReceipt(current.aiCommandReceipts, duplicate),
                  mutationRevision: current.mutationRevision + 1,
                }))
                return duplicate
              }

              const applied = createAiCommandReceipt(draft, 'applied', { targetId: draft.draftId })
              const now = new Date().toISOString()
              const plan: StudyPlan = {
                ...planCommandPayloadToStudyPlan(payload),
                id: draft.draftId,
                createdAt: now,
                updatedAt: now,
              }
              setEnvelope((current) => ({
                plans: [plan, ...current.plans],
                aiCommandReceipts: appendAiCommandReceipt(current.aiCommandReceipts, applied),
                mutationRevision: current.mutationRevision + 1,
              }))
              return applied
            })
            announceCurrentPlanRevision()
            return receipt
          } catch (error) {
            return failedAiReceipt(draft, error)
          }
        },

        rejectAiPlanDraft: async (draft) => {
          try {
            const receipt = await withFreshPlanMutation(() => {
              const rejected = createAiCommandReceipt(draft, 'rejected', {
                code: 'USER_REJECTED',
                message: '用户已忽略这条计划草稿。',
              })
              setEnvelope((state) => ({
                aiCommandReceipts: appendAiCommandReceipt(state.aiCommandReceipts, rejected),
                mutationRevision: state.mutationRevision + 1,
              }))
              return rejected
            })
            announceCurrentPlanRevision()
            return receipt
          } catch (error) {
            return failedAiReceipt(draft, error)
          }
        },

        updatePlan: async (id, data) => {
          try {
            const result = await withFreshPlanMutation(() => {
              const current = get().plans.find((plan) => plan.id === id)
              if (!current) return { status: 'not_found' } satisfies PlanMutationResult
              const next: StudyPlan = { ...current, ...data, updatedAt: new Date().toISOString() }
              if (sameStudyPlan(current, next)) {
                return { status: 'duplicate', targetId: id } satisfies PlanMutationResult
              }
              setEnvelope((state) => ({
                plans: state.plans.map((plan) => (plan.id === id ? next : plan)),
                mutationRevision: state.mutationRevision + 1,
              }))
              return { status: 'applied', targetId: id } satisfies PlanMutationResult
            })
            if (result.status === 'applied') announceCurrentPlanRevision()
            return result
          } catch (error) {
            return failedPlanMutation(error)
          }
        },

        deletePlan: async (id) => {
          try {
            const result = await withFreshPlanMutation(() => {
              const state = get()
              const removedPlan = state.plans.find((plan) => plan.id === id)
              const removedExecutions = state.executions.filter((execution) => execution.planId === id)
              if (!removedPlan && removedExecutions.length === 0) {
                return { status: 'not_found' } satisfies PlanMutationResult
              }

              const occurredAt = new Date().toISOString()
              const nextRevision = state.mutationRevision + 1
              const domainPatches: LocalMutationPatch[] = []
              if (removedPlan) {
                domainPatches.push(createEntityCollectionPatch({
                  storage: localStorage,
                  storageKey: PLAN_STORAGE_KEY,
                  collection: 'plans',
                  changes: [{
                    id,
                    before: removedPlan,
                    beforeIndex: state.plans.findIndex((plan) => plan.id === id),
                    expectedAfter: null,
                  }],
                }))
              }
              if (removedExecutions.length > 0) {
                domainPatches.push(createEntityCollectionPatch({
                  storage: localStorage,
                  storageKey: PLAN_STORAGE_KEY,
                  collection: 'executions',
                  changes: removedExecutions.map((execution) => ({
                    id: execution.id,
                    before: execution,
                    beforeIndex: state.executions.findIndex((candidate) => candidate.id === execution.id),
                    expectedAfter: null,
                  })),
                }))
              }
              domainPatches.push(stateFieldRevisionPatch(state.mutationRevision, nextRevision))

              const events: LedgerEventDraft[] = removedExecutions.map((execution) => ({
                entityKind: 'plan_execution',
                entityId: execution.id,
                operation: 'deleted',
                effectiveDate: execution.date,
                occurredAt,
                source: 'user',
                before: execution,
              }))
              const transaction = createActivityTransactionPlan({
                action: 'plan.delete',
                domainPatches,
                events,
                achievements: useAchievementStore.getState(),
                streak: useStreakStore.getState(),
                lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                createdAt: occurredAt,
              })
              const committed = commitActivityTransaction(transaction, () => {
                set((current) => ({
                  plans: current.plans.filter((plan) => plan.id !== id),
                  executions: current.executions.filter((execution) => execution.planId !== id),
                  mutationRevision: nextRevision,
                }))
              })
              return committed
                ? { status: 'applied', targetId: id } satisfies PlanMutationResult
                : failedPlanMutation(new Error('删除计划的数据事务未提交。'))
            })
            if (result.status === 'applied') announceCurrentPlanRevision()
            return result
          } catch (error) {
            return failedPlanMutation(error)
          }
        },

        togglePlanActive: async (id) => {
          try {
            const result = await withFreshPlanMutation(() => {
              const current = get().plans.find((plan) => plan.id === id)
              if (!current) return { status: 'not_found' } satisfies PlanMutationResult
              const next = {
                ...current,
                isActive: !current.isActive,
                updatedAt: new Date().toISOString(),
              }
              setEnvelope((state) => ({
                plans: state.plans.map((plan) => (plan.id === id ? next : plan)),
                mutationRevision: state.mutationRevision + 1,
              }))
              return { status: 'applied', targetId: id } satisfies PlanMutationResult
            })
            if (result.status === 'applied') announceCurrentPlanRevision()
            return result
          } catch (error) {
            return failedPlanMutation(error)
          }
        },

        setExecutionForDate: async (input) => {
          try {
            const result = await withFreshPlanMutation(() => {
              const state = get()
              const normalized = canonicalizePlanExecutions(state.executions)
              const existing = findPlanExecutionForDate(
                normalized.executions,
                input.planId,
                input.date,
              )
              if (!existing && !input.isCompleted && normalized.duplicates.length === 0) {
                return { status: 'duplicate' } satisfies PlanMutationResult
              }

              const occurredAt = new Date().toISOString()
              const nextRevision = state.mutationRevision + 1
              const changes: Array<{
                id: string
                before: PlanExecution | null
                beforeIndex: number
                expectedAfter: PlanExecution | null
              }> = []
              const events: LedgerEventDraft[] = []
              let nextExecutions = normalized.executions
              let targetExecution: PlanExecution | undefined

              if (existing) {
                const nextExecution: PlanExecution = {
                  ...existing,
                  ...input,
                  id: existing.id,
                  updatedAt: occurredAt,
                }
                targetExecution = nextExecution
                if (!samePlanExecutionValue(existing, nextExecution)) {
                  changes.push({
                    id: existing.id,
                    before: existing,
                    beforeIndex: state.executions.findIndex((candidate) => candidate.id === existing.id),
                    expectedAfter: nextExecution,
                  })
                  events.push({
                    entityKind: 'plan_execution',
                    entityId: existing.id,
                    operation: 'updated',
                    effectiveDate: nextExecution.date,
                    occurredAt,
                    source: 'user',
                    before: existing,
                    after: nextExecution,
                  })
                  nextExecutions = normalized.executions.map((execution) => (
                    execution.id === existing.id ? nextExecution : execution
                  ))
                }
              } else {
                const execution: PlanExecution = {
                  ...input,
                  id: createPlanExecutionId(input.planId, input.date),
                  updatedAt: occurredAt,
                }
                targetExecution = execution
                changes.push({
                  id: execution.id,
                  before: null,
                  beforeIndex: 0,
                  expectedAfter: execution,
                })
                events.push({
                  entityKind: 'plan_execution',
                  entityId: execution.id,
                  operation: 'created',
                  effectiveDate: execution.date,
                  occurredAt,
                  source: 'user',
                  after: execution,
                })
                nextExecutions = [execution, ...normalized.executions]
              }

              for (const duplicate of normalized.duplicates) {
                changes.push({
                  id: duplicate.id,
                  before: duplicate,
                  beforeIndex: state.executions.findIndex((candidate) => candidate.id === duplicate.id),
                  expectedAfter: null,
                })
                events.push({
                  entityKind: 'plan_execution',
                  entityId: duplicate.id,
                  operation: 'deleted',
                  effectiveDate: duplicate.date,
                  occurredAt,
                  source: 'migration',
                  before: duplicate,
                })
              }

              if (changes.length === 0) {
                return {
                  status: 'duplicate',
                  targetId: targetExecution?.id,
                } satisfies PlanMutationResult
              }

              const dailyCheckins = useDailyCheckinStore.getState()
              let checkin: ReturnType<typeof createDailyCheckinMutation> | null = null
              if (
                targetExecution?.isCompleted
                && !existing?.isCompleted
                && !dailyCheckins.hasAward(targetExecution.date)
              ) {
                const interim = projectActivityEvents({
                  events,
                  achievements: useAchievementStore.getState(),
                  streak: useStreakStore.getState(),
                  lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                })
                checkin = createDailyCheckinMutation({
                  date: targetExecution.date,
                  occurredAt,
                  streak: interim.streak,
                  recordActivity: false,
                  source: 'plan',
                  sourceEntityId: targetExecution.id,
                })
                events.push(checkin.event)
              }

              const domainPatches: LocalMutationPatch[] = [
                createEntityCollectionPatch({
                  storage: localStorage,
                  storageKey: PLAN_STORAGE_KEY,
                  collection: 'executions',
                  changes,
                }),
                stateFieldRevisionPatch(state.mutationRevision, nextRevision),
              ]
              if (checkin) {
                domainPatches.push(createEntityCollectionPatch({
                  storage: localStorage,
                  storageKey: DAILY_CHECKIN_STORAGE_KEY,
                  collection: 'awards',
                  changes: [{
                    id: checkin.award.id,
                    before: null,
                    beforeIndex: dailyCheckins.awards.length,
                    expectedAfter: checkin.award,
                  }],
                }))
              }

              const transaction = createActivityTransactionPlan({
                action: normalized.duplicates.length > 0
                  ? 'plan.execution.reconcile'
                  : existing ? 'plan.execution.update' : 'plan.execution.create',
                domainPatches,
                events,
                achievements: useAchievementStore.getState(),
                streak: useStreakStore.getState(),
                lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                createdAt: occurredAt,
              })
              const committed = commitActivityTransaction(transaction, () => {
                set({ executions: nextExecutions, mutationRevision: nextRevision })
                if (checkin) {
                  useDailyCheckinStore.setState({
                    awards: [...dailyCheckins.awards, checkin.award]
                      .sort((left, right) => left.date.localeCompare(right.date)),
                  })
                }
              })
              if (!committed) return failedPlanMutation(new Error('计划执行的数据事务未提交。'))

              return {
                status: 'applied',
                targetId: targetExecution?.id,
                removedCount: normalized.duplicates.length,
              } satisfies PlanMutationResult
            })
            if (result.status === 'applied') announceCurrentPlanRevision()
            return result
          } catch (error) {
            return failedPlanMutation(error)
          }
        },

        deleteExecution: async (id) => {
          try {
            const result = await withFreshPlanMutation(() => {
              const state = get()
              const execution = state.executions.find((candidate) => candidate.id === id)
              if (!execution) return { status: 'not_found' } satisfies PlanMutationResult
              const occurredAt = new Date().toISOString()
              const nextRevision = state.mutationRevision + 1
              const transaction = createActivityTransactionPlan({
                action: 'plan.execution.delete',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: PLAN_STORAGE_KEY,
                    collection: 'executions',
                    changes: [{
                      id,
                      before: execution,
                      beforeIndex: state.executions.findIndex((candidate) => candidate.id === id),
                      expectedAfter: null,
                    }],
                  }),
                  stateFieldRevisionPatch(state.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'plan_execution',
                  entityId: id,
                  operation: 'deleted',
                  effectiveDate: execution.date,
                  occurredAt,
                  source: 'user',
                  before: execution,
                }],
                achievements: useAchievementStore.getState(),
                streak: useStreakStore.getState(),
                lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                createdAt: occurredAt,
              })
              const committed = commitActivityTransaction(transaction, () => {
                set((current) => ({
                  executions: current.executions.filter((candidate) => candidate.id !== id),
                  mutationRevision: nextRevision,
                }))
              })
              return committed
                ? { status: 'applied', targetId: id } satisfies PlanMutationResult
                : failedPlanMutation(new Error('删除计划执行的数据事务未提交。'))
            })
            if (result.status === 'applied') announceCurrentPlanRevision()
            return result
          } catch (error) {
            return failedPlanMutation(error)
          }
        },

        repairDuplicatePlanExecutions: async () => {
          try {
            const result = await withFreshPlanMutation(() => {
              const state = get()
              const normalized = canonicalizePlanExecutions(state.executions)
              if (normalized.duplicates.length === 0) {
                return { status: 'duplicate', removedCount: 0 } satisfies PlanMutationResult
              }

              const occurredAt = new Date().toISOString()
              const nextRevision = state.mutationRevision + 1
              const transaction = createActivityTransactionPlan({
                action: 'plan.execution.reconcile',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: PLAN_STORAGE_KEY,
                    collection: 'executions',
                    changes: normalized.duplicates.map((execution) => ({
                      id: execution.id,
                      before: execution,
                      beforeIndex: state.executions.findIndex((candidate) => candidate.id === execution.id),
                      expectedAfter: null,
                    })),
                  }),
                  stateFieldRevisionPatch(state.mutationRevision, nextRevision),
                ],
                events: normalized.duplicates.map((execution) => ({
                  entityKind: 'plan_execution' as const,
                  entityId: execution.id,
                  operation: 'deleted' as const,
                  effectiveDate: execution.date,
                  occurredAt,
                  source: 'migration' as const,
                  before: execution,
                })),
                achievements: useAchievementStore.getState(),
                streak: useStreakStore.getState(),
                lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                createdAt: occurredAt,
              })
              const committed = commitActivityTransaction(transaction, () => {
                set({ executions: normalized.executions, mutationRevision: nextRevision })
              })
              return committed
                ? {
                    status: 'applied',
                    removedCount: normalized.duplicates.length,
                  } satisfies PlanMutationResult
                : failedPlanMutation(new Error('旧计划执行记录整理失败。'))
            })
            if (result.status === 'applied') announceCurrentPlanRevision()
            return result
          } catch (error) {
            return failedPlanMutation(error)
          }
        },

        getTodayExecutions: (date) => canonicalizePlanExecutions(
          get().executions.filter((execution) => execution.date === date),
        ).executions,
        getActivePlans: () => get().plans.filter((plan) => plan.isActive),
      }
    },
    {
      name: PLAN_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        plans: state.plans,
        executions: state.executions,
        aiCommandReceipts: state.aiCommandReceipts,
        mutationRevision: state.mutationRevision,
      }),
    },
  ),
)

let crossTabSyncInstalled = false

export function installPlanStoreCrossTabSync(): void {
  if (crossTabSyncInstalled || typeof window === 'undefined') return
  crossTabSyncInstalled = true

  const refresh = async () => {
    try {
      await withCanonicalMutationLock(async () => {
        if (readCanonicalMutationEpoch() !== observedCanonicalMutationEpoch) {
          window.location.reload()
          return
        }
        const recovery = recoverPlanSafePendingMutation()
        if (recovery.status === 'conflict' || recovery.status === 'failed') return
        await rehydratePlanMutationStores()
        if (recovery.requiresLedgerRebuild) {
          rebuildActivityLedger(new Date().toISOString(), 'recovery')
        }
      })
    } catch {
      // The next focus, storage pulse or explicit mutation retries the refresh.
    }
  }

  installCanonicalMutationPulseListener(async (scope) => {
    if (scope === 'all') {
      window.location.reload()
      return
    }
    if (scope === PLAN_MUTATION_SCOPE) await refresh()
  })
  window.addEventListener('focus', () => { void refresh() })
}
