import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { STORAGE_PREFIX } from '@/lib/constants'
import type { PlanExecution } from '@/lib/types'
import type {
  TrackerPhase4bEntityKind,
  TrackerPhase4bLocalSnapshot,
  TrackerPhase4bRemoteEntity,
} from '@/sync/trackerPhase4bRecordSync'

/**
 * This selection metadata is deliberately kept outside learner records. The
 * compact Phase 4B payload remains unchanged and never reveals a local UI
 * choice to another device unless the learner actually opts into cloud sync.
 */
export const TRACKER_CONTENT_CLOUD_POLICY_STORAGE_KEY = `${STORAGE_PREFIX}:contentCloudPolicy:v1`
export const TRACKER_CONTENT_CLOUD_SYNC_EVENT = 'tracker-content-cloud-sync-request-v1'
export const TRACKER_CONTENT_CLOUD_POLICY_REFRESH_EVENT = 'tracker-content-cloud-policy-refresh-request-v1'
export const TRACKER_CONTENT_CLOUD_DEVICE_SCOPE = 'device'

// Some non-browser consumers (notably pure sync tests and SSR tooling) expose
// a partial `localStorage` shim. Policy metadata is an enhancement, never a
// reason to crash the canonical local-data/sync path, so use an ephemeral
// store until a complete browser Storage implementation is available.
const transientStorageValues = new Map<string, string>()
const transientContentCloudPolicyStorage: Storage = {
  get length() { return transientStorageValues.size },
  clear() { transientStorageValues.clear() },
  getItem(key) { return transientStorageValues.get(key) ?? null },
  key(index) { return [...transientStorageValues.keys()][index] ?? null },
  removeItem(key) { transientStorageValues.delete(key) },
  setItem(key, value) { transientStorageValues.set(key, String(value)) },
}

function contentCloudPolicyStorage(): Storage {
  if (
    typeof localStorage !== 'undefined'
    && typeof localStorage.getItem === 'function'
    && typeof localStorage.setItem === 'function'
    && typeof localStorage.removeItem === 'function'
  ) return localStorage
  return transientContentCloudPolicyStorage
}

export type TrackerContentCloudMode = 'local' | 'cloud'
export type TrackerContentCloudSelectableKind = Exclude<TrackerPhase4bEntityKind, 'plan_execution'>
export type TrackerContentCloudPolicyRefreshReason =
  | 'initial'
  | 'focus'
  | 'visibility'
  | 'online'
  | 'interval'
  | 'page-enter'
  | 'before-save'
  | 'after-save'
  | 'manual'

export interface TrackerContentCloudPolicyRefreshRequest {
  /** Explicit saves and page entries may bypass the normal low-frequency gate. */
  force?: boolean
  reason?: TrackerContentCloudPolicyRefreshReason
}

export interface TrackerContentCloudIdentity {
  entityKind: TrackerPhase4bEntityKind
  entityId: string
  /** Executions intentionally inherit their parent plan's save location. */
  planId?: string
}

export interface TrackerContentCloudModeRecord {
  mode: TrackerContentCloudMode
  source: 'legacy' | 'remote' | 'user'
  changedAt: string
  /** Pending local/cloud acknowledgement. Plans additionally use this to keep
   * their parent and executions inside one atomic transfer. */
  transferState?: 'uploading' | 'removing'
}

export interface TrackerContentCloudFailure {
  reason: string
  occurredAt: string
}

export interface TrackerContentCloudQuota {
  limit: number | null
  used: number
  remaining: number | null
  legacyExemptCount?: number
}

export type TrackerContentCloudQuotaByKind = Partial<
  Record<TrackerPhase4bEntityKind, TrackerContentCloudQuota>
>

/** Volatile server revision markers used by the lightweight refresh RPC. */
export interface TrackerContentCloudPolicyStatus {
  policyVersion: number | null
  overrideVersion: number | null
  contentCursor: number | null
}

export type TrackerContentCloudPolicyStatusUpdate = Partial<TrackerContentCloudPolicyStatus>

/** UI-facing, non-persisted state for the small policy/allowance probe. */
export interface TrackerContentCloudPolicyRefreshState {
  phase: 'idle' | 'refreshing' | 'ready' | 'error'
  /** The last time a server response (changed or unchanged) was accepted. */
  lastCheckedAt: string | null
  /** A generic timestamp only; detailed transport errors stay out of learner UI. */
  lastErrorAt: string | null
}

export type TrackerContentCloudPolicyRefreshStateUpdate = Partial<TrackerContentCloudPolicyRefreshState> & {
  phase: TrackerContentCloudPolicyRefreshState['phase']
}

interface TrackerContentCloudPolicyScope {
  initialized: boolean
  revision: number
  modes: Record<string, TrackerContentCloudModeRecord>
  /** Explicit local → cloud is the learner's tombstone-restore consent. */
  restoreRequests: Record<string, string>
  failures: Record<string, TrackerContentCloudFailure>
}

export interface TrackerContentCloudPolicyReadState {
  activeScope: string
  scopes: Record<string, TrackerContentCloudPolicyScope>
}

interface TrackerContentCloudPolicyState extends TrackerContentCloudPolicyReadState {
  schemaVersion: 1
  /** Once a real account has claimed pre-feature device choices, a later
   * signed-out interval must never rebuild that bridge from account A data. */
  deviceScopeClaimed: boolean
  selectiveCloudAvailableByScope: Record<string, boolean>
  quotaByScope: Record<string, TrackerContentCloudQuotaByKind | null>
  contentCloudStatusByScope: Record<string, TrackerContentCloudPolicyStatus>
  contentCloudRefreshByScope: Record<string, TrackerContentCloudPolicyRefreshState>
  activateScope: (scope: string, options?: { adoptDeviceScope?: boolean }) => void
  clearScope: (scope: string) => void
  ensureLegacyContent: (entities: readonly TrackerContentCloudIdentity[], now?: string) => void
  markRemoteContent: (entities: readonly TrackerContentCloudIdentity[], now?: string) => void
  setMode: (
    entityKind: TrackerContentCloudSelectableKind,
    entityId: string,
    mode: TrackerContentCloudMode,
    options?: { now?: string; retry?: boolean; planTransfer?: 'uploading' | 'removing' },
  ) => void
  completeContentTransfer: (
    entityKind: TrackerContentCloudSelectableKind,
    entityId: string,
    mode: TrackerContentCloudMode,
  ) => void
  completePlanTransfer: (planId: string, mode: TrackerContentCloudMode) => void
  markRejected: (entityKind: TrackerPhase4bEntityKind, entityId: string, reason: string, now?: string) => void
  clearFailure: (entityKind: TrackerPhase4bEntityKind, entityId: string) => void
  acknowledgeRestore: (entityKind: TrackerPhase4bEntityKind, entityId: string) => void
  setSelectiveCloudAvailable: (available: boolean) => void
  setQuota: (quota: TrackerContentCloudQuotaByKind | null) => void
  /** Applies a server capability response only to the account scope that asked
   * for it. A late response must never overwrite a newly signed-in account. */
  setCapabilitiesForScope: (scope: string, input: {
    selectiveCloudAvailable: boolean
    quota: TrackerContentCloudQuotaByKind | null
    status?: TrackerContentCloudPolicyStatusUpdate
  }) => boolean
  setStatusForScope: (scope: string, status: TrackerContentCloudPolicyStatusUpdate) => boolean
  setRefreshStateForScope: (scope: string, input: TrackerContentCloudPolicyRefreshStateUpdate) => boolean
}

function keyFor(entityKind: TrackerPhase4bEntityKind, entityId: string): string {
  return `${entityKind}\u0000${entityId}`
}

function nowIso(now?: string): string {
  return now ?? new Date().toISOString()
}

function selectableKind(entityKind: TrackerPhase4bEntityKind): entityKind is TrackerContentCloudSelectableKind {
  return entityKind !== 'plan_execution'
}

function emptyScope(): TrackerContentCloudPolicyScope {
  return { initialized: false, revision: 0, modes: {}, restoreRequests: {}, failures: {} }
}

function scopeFor(state: TrackerContentCloudPolicyReadState): TrackerContentCloudPolicyScope {
  return state.scopes[state.activeScope] ?? emptyScope()
}

/** Missing quota data is intentionally non-blocking: the server remains the
 * authority, while the UI must not strand a learner during a capability
 * refresh. `null` remaining means the administrator chose no numeric cap. */
export function trackerContentCloudQuotaHasCapacity(
  quota: TrackerContentCloudQuota | null | undefined,
  required = 1,
): boolean {
  return required <= 0 || !quota || quota.remaining === null || quota.remaining >= required
}

function validScope(value: string): boolean {
  return value === TRACKER_CONTENT_CLOUD_DEVICE_SCOPE
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeScope(value: string): string {
  return validScope(value) ? value : TRACKER_CONTENT_CLOUD_DEVICE_SCOPE
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nextScope(
  state: TrackerContentCloudPolicyState,
  updated: TrackerContentCloudPolicyScope,
): Pick<TrackerContentCloudPolicyState, 'scopes'> {
  return { scopes: { ...state.scopes, [state.activeScope]: updated } }
}

function modeFor(
  state: TrackerContentCloudPolicyReadState,
  entityKind: TrackerContentCloudSelectableKind,
  entityId: string,
): TrackerContentCloudMode {
  const scope = scopeFor(state)
  const mode = scope.modes[keyFor(entityKind, entityId)]?.mode
  if (mode) return mode
  // The bridge adopts existing content before it starts sync. Until then,
  // unknown records are treated as legacy cloud data rather than deleted.
  return scope.initialized ? 'local' : 'cloud'
}

function projectPlanToCloud(
  state: TrackerContentCloudPolicyReadState,
  planId: string,
): boolean {
  const scope = scopeFor(state)
  const record = scope.modes[keyFor('study_plan', planId)]
  // A plan upload uses a paired endpoint so its executions can never arrive
  // without their parent. Keep it out of the ordinary per-entity projection
  // until that endpoint has accepted the complete package.
  if (record?.transferState === 'uploading') return false
  if (record?.transferState === 'removing') return true
  return modeFor(state, 'study_plan', planId) === 'cloud'
}

export const useTrackerContentCloudPolicyStore = create<TrackerContentCloudPolicyState>()(
  persist(
    (set, get) => ({
      schemaVersion: 1,
      activeScope: TRACKER_CONTENT_CLOUD_DEVICE_SCOPE,
      scopes: { [TRACKER_CONTENT_CLOUD_DEVICE_SCOPE]: emptyScope() },
      deviceScopeClaimed: false,
      selectiveCloudAvailableByScope: {},
      quotaByScope: {},
      contentCloudStatusByScope: {},
      contentCloudRefreshByScope: {},
      activateScope: (scope, options) => {
        const nextScopeKey = safeScope(scope)
        set((state) => {
          if (state.activeScope === nextScopeKey && state.scopes[nextScopeKey]) return state
          let scopes = state.scopes
          if (!scopes[nextScopeKey]) {
            const device = scopes[TRACKER_CONTENT_CLOUD_DEVICE_SCOPE]
            const adoptsDeviceScope = Boolean(
              options?.adoptDeviceScope
              && device
              && nextScopeKey !== TRACKER_CONTENT_CLOUD_DEVICE_SCOPE
              // The device bridge may only ever be claimed by the first
              // verified account. A later account sees the same browser rows
              // as local-only, never as its own historical cloud choices.
              && !state.deviceScopeClaimed,
            )
            scopes = {
              ...scopes,
              [nextScopeKey]: adoptsDeviceScope && device
                ? clone(device)
                : state.deviceScopeClaimed && nextScopeKey !== TRACKER_CONTENT_CLOUD_DEVICE_SCOPE
                  ? { ...emptyScope(), initialized: true }
                : emptyScope(),
              // A device-only policy is a one-time bridge into the first
              // confirmed account. Leaving it behind would let a later
              // account on the same browser inherit account A's choices.
              ...(adoptsDeviceScope
                ? { [TRACKER_CONTENT_CLOUD_DEVICE_SCOPE]: emptyScope() }
                : {}),
            }
          } else if (
            state.deviceScopeClaimed
            && nextScopeKey !== TRACKER_CONTENT_CLOUD_DEVICE_SCOPE
            && !scopes[nextScopeKey].initialized
          ) {
            // Repair an interrupted older session safely: existing explicit
            // modes survive, while unknown browser rows default to local.
            const current = scopes[nextScopeKey]
            scopes = {
              ...scopes,
              [nextScopeKey]: { ...current, initialized: true, revision: current.revision + 1 },
            }
          }
          return {
            activeScope: nextScopeKey,
            scopes,
            ...(options?.adoptDeviceScope && nextScopeKey !== TRACKER_CONTENT_CLOUD_DEVICE_SCOPE
              ? { deviceScopeClaimed: true }
              : {}),
          }
        })
      },
      clearScope: (scope) => {
        const target = safeScope(scope)
        set((state) => {
          const scopes = { ...state.scopes, [target]: emptyScope() }
          const quotaByScope = { ...state.quotaByScope }
          const selectiveCloudAvailableByScope = { ...state.selectiveCloudAvailableByScope }
          const contentCloudStatusByScope = { ...state.contentCloudStatusByScope }
          const contentCloudRefreshByScope = { ...state.contentCloudRefreshByScope }
          delete quotaByScope[target]
          delete selectiveCloudAvailableByScope[target]
          delete contentCloudStatusByScope[target]
          delete contentCloudRefreshByScope[target]
          return {
            scopes,
            quotaByScope,
            selectiveCloudAvailableByScope,
            contentCloudStatusByScope,
            contentCloudRefreshByScope,
          }
        })
      },
      ensureLegacyContent: (entities, now) => {
        set((state) => {
          const scope = scopeFor(state)
          // The device-only bridge is intentionally one-shot. After account A
          // signs out, current local rows still belong to A's browser state;
          // copying a newly rebuilt device policy into B would leak A's cloud
          // choices and potentially upload A's content under B.
          if (state.activeScope === TRACKER_CONTENT_CLOUD_DEVICE_SCOPE && state.deviceScopeClaimed) {
            return state
          }
          if (scope.initialized) return state
          const changedAt = nowIso(now)
          const modes = { ...scope.modes }
          entities.forEach((entity) => {
            if (!selectableKind(entity.entityKind)) return
            const key = keyFor(entity.entityKind, entity.entityId)
            if (!modes[key]) modes[key] = { mode: 'cloud', source: 'legacy', changedAt }
          })
          return nextScope(state, {
            ...scope,
            initialized: true,
            modes,
            revision: scope.revision + 1,
          })
        })
      },
      markRemoteContent: (entities, now) => {
        set((state) => {
          const scope = scopeFor(state)
          const changedAt = nowIso(now)
          const modes = { ...scope.modes }
          let changed = false
          entities.forEach((entity) => {
            if (!selectableKind(entity.entityKind)) return
            const key = keyFor(entity.entityKind, entity.entityId)
            // A local-only decision on this device must win over a delayed
            // snapshot from an earlier cloud state.
            if (!modes[key]) {
              modes[key] = { mode: 'cloud', source: 'remote', changedAt }
              changed = true
            }
          })
          return changed
            ? nextScope(state, { ...scope, modes, revision: scope.revision + 1 })
            : state
        })
      },
      setMode: (entityKind, entityId, mode, options) => {
        set((state) => {
          const scope = scopeFor(state)
          const changedAt = nowIso(options?.now)
          const key = keyFor(entityKind, entityId)
          const previous = modeFor(state, entityKind, entityId)
          // Only plans carry a transfer state. Their parent/execution package
          // must use the paired RPC, whereas independent records are handled
          // by the normal idempotent sync queue. Giving independent records a
          // speculative "removing" state can leave the UI waiting forever
          // when an earlier upload never created a remote baseline.
          const transferState = entityKind === 'study_plan' ? options?.planTransfer : undefined
          const modes = {
            ...scope.modes,
            [key]: {
              mode,
              source: 'user' as const,
              changedAt,
              ...(transferState ? { transferState } : {}),
            },
          }
          const restoreRequests = { ...scope.restoreRequests }
          const failures = { ...scope.failures }
          if (mode === 'cloud' && previous === 'local') restoreRequests[key] = changedAt
          if (mode === 'local') delete restoreRequests[key]
          if (options?.retry || previous !== mode) delete failures[key]
          return nextScope(state, {
            ...scope,
            modes,
            restoreRequests,
            failures,
            revision: scope.revision + 1,
          })
        })
      },
      completeContentTransfer: (entityKind, entityId, mode) => {
        set((state) => {
          const scope = scopeFor(state)
          const key = keyFor(entityKind, entityId)
          const current = scope.modes[key]
          if (!current || current.mode !== mode || !current.transferState) return state
          return nextScope(state, {
            ...scope,
            modes: {
              ...scope.modes,
              [key]: { ...current, transferState: undefined },
            },
            revision: scope.revision + 1,
          })
        })
      },
      completePlanTransfer: (planId, mode) => {
        set((state) => {
          const scope = scopeFor(state)
          const key = keyFor('study_plan', planId)
          const current = scope.modes[key]
          if (!current || current.mode !== mode || !current.transferState) return state
          return nextScope(state, {
            ...scope,
            modes: {
              ...scope.modes,
              [key]: { ...current, transferState: undefined },
            },
            revision: scope.revision + 1,
          })
        })
      },
      markRejected: (entityKind, entityId, reason, now) => {
        set((state) => {
          const scope = scopeFor(state)
          const key = keyFor(entityKind, entityId)
          const current = selectableKind(entityKind) ? scope.modes[key] : undefined
          return nextScope(state, {
            ...scope,
            modes: current && entityKind !== 'study_plan'
              ? {
                  ...scope.modes,
                  [key]: { ...current, transferState: undefined },
                }
              : scope.modes,
            failures: {
              ...scope.failures,
              [key]: { reason, occurredAt: nowIso(now) },
            },
            revision: scope.revision + 1,
          })
        })
      },
      clearFailure: (entityKind, entityId) => {
        set((state) => {
          const scope = scopeFor(state)
          const key = keyFor(entityKind, entityId)
          if (!scope.failures[key]) return state
          const failures = { ...scope.failures }
          delete failures[key]
          return nextScope(state, { ...scope, failures, revision: scope.revision + 1 })
        })
      },
      acknowledgeRestore: (entityKind, entityId) => {
        set((state) => {
          const scope = scopeFor(state)
          const key = keyFor(entityKind, entityId)
          if (!scope.restoreRequests[key]) return state
          const restoreRequests = { ...scope.restoreRequests }
          delete restoreRequests[key]
          return nextScope(state, { ...scope, restoreRequests, revision: scope.revision + 1 })
        })
      },
      setSelectiveCloudAvailable: (available) => set((state) => ({
        selectiveCloudAvailableByScope: {
          ...state.selectiveCloudAvailableByScope,
          [state.activeScope]: available,
        },
      })),
      setQuota: (quota) => set((state) => ({
        quotaByScope: {
          ...state.quotaByScope,
          [state.activeScope]: quota ? clone(quota) : null,
        },
      })),
      setCapabilitiesForScope: (scope, input) => {
        const target = safeScope(scope)
        // Capability responses are volatile account state. Do not let a
        // delayed request populate device scope or the next account's scope.
        if (target !== scope || get().activeScope !== target) return false
        set((state) => {
          if (state.activeScope !== target) return state
          return {
            selectiveCloudAvailableByScope: {
              ...state.selectiveCloudAvailableByScope,
              [target]: input.selectiveCloudAvailable,
            },
            quotaByScope: {
              ...state.quotaByScope,
              [target]: input.quota ? clone(input.quota) : null,
            },
            ...(input.status
              ? {
                  contentCloudStatusByScope: {
                    ...state.contentCloudStatusByScope,
                    [target]: {
                      ...(state.contentCloudStatusByScope[target] ?? {
                        policyVersion: null,
                        overrideVersion: null,
                        contentCursor: null,
                      }),
                      ...input.status,
                    },
                  },
                }
              : {}),
          }
        })
        return true
      },
      setStatusForScope: (scope, status) => {
        const target = safeScope(scope)
        if (target !== scope || get().activeScope !== target) return false
        set((state) => {
          if (state.activeScope !== target) return state
          return {
            contentCloudStatusByScope: {
              ...state.contentCloudStatusByScope,
              [target]: {
                ...(state.contentCloudStatusByScope[target] ?? {
                  policyVersion: null,
                  overrideVersion: null,
                  contentCursor: null,
                }),
                ...status,
              },
            },
          }
        })
        return true
      },
      setRefreshStateForScope: (scope, input) => {
        const target = safeScope(scope)
        if (target !== scope || get().activeScope !== target) return false
        set((state) => {
          if (state.activeScope !== target) return state
          return {
            contentCloudRefreshByScope: {
              ...state.contentCloudRefreshByScope,
              [target]: {
                ...(state.contentCloudRefreshByScope[target] ?? {
                  phase: 'idle',
                  lastCheckedAt: null,
                  lastErrorAt: null,
                }),
                ...input,
              },
            },
          }
        })
        return true
      },
    }),
    {
      name: TRACKER_CONTENT_CLOUD_POLICY_STORAGE_KEY,
      storage: createJSONStorage(contentCloudPolicyStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        scopes: state.scopes,
        deviceScopeClaimed: state.deviceScopeClaimed,
      }),
      merge: (persisted, current) => {
        const candidate = persisted as Partial<TrackerContentCloudPolicyState> | undefined
        if (candidate?.schemaVersion !== 1 || !candidate.scopes) return current
        const scopes = Object.fromEntries(Object.entries(candidate.scopes)
          .filter(([scope, value]) => validScope(scope) && Boolean(value))
          .map(([scope, value]) => [scope, value])) as Record<string, TrackerContentCloudPolicyScope>
        return {
          ...current,
          scopes: {
            [TRACKER_CONTENT_CLOUD_DEVICE_SCOPE]: emptyScope(),
            ...scopes,
          },
          deviceScopeClaimed: candidate.deviceScopeClaimed === true,
          activeScope: TRACKER_CONTENT_CLOUD_DEVICE_SCOPE,
        }
      },
    },
  ),
)

export function trackerContentCloudMode(
  entity: TrackerContentCloudIdentity,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): TrackerContentCloudMode {
  if (entity.entityKind === 'plan_execution') {
    return entity.planId && projectPlanToCloud(state, entity.planId) ? 'cloud' : 'local'
  }
  return modeFor(state, entity.entityKind, entity.entityId)
}

export function isTrackerContentCloudSelected(
  entity: TrackerContentCloudIdentity,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): boolean {
  return trackerContentCloudMode(entity, state) === 'cloud'
}

export function isTrackerContentCloudProjected(
  entity: TrackerContentCloudIdentity,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): boolean {
  if (entity.entityKind === 'plan_execution') return Boolean(entity.planId && projectPlanToCloud(state, entity.planId))
  if (entity.entityKind === 'study_plan') return projectPlanToCloud(state, entity.entityId)
  return isTrackerContentCloudSelected(entity, state)
}

export function trackerContentCloudFailure(
  entityKind: TrackerPhase4bEntityKind,
  entityId: string,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): TrackerContentCloudFailure | null {
  return scopeFor(state).failures[keyFor(entityKind, entityId)] ?? null
}

/**
 * A plan owns its execution records in the UI. The failure itself stays on the
 * exact execution operation so retry remains precise, while this helper lets
 * the parent plan editor surface the first relevant child failure.
 */
export function trackerContentCloudFirstFailureId(
  entityKind: TrackerPhase4bEntityKind,
  entityIds: readonly string[],
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): string | null {
  const scope = scopeFor(state)
  return entityIds.find((entityId) => Boolean(scope.failures[keyFor(entityKind, entityId)])) ?? null
}

export function trackerContentCloudRestoreRequested(
  entityKind: TrackerPhase4bEntityKind,
  entityId: string,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): boolean {
  return Boolean(scopeFor(state).restoreRequests[keyFor(entityKind, entityId)])
}

export function trackerContentCloudPolicyRevision(
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): number {
  return scopeFor(state).revision
}

export function trackerContentCloudPlanTransferState(
  planId: string,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): 'uploading' | 'removing' | null {
  return scopeFor(state).modes[keyFor('study_plan', planId)]?.transferState ?? null
}

export function trackerContentCloudTransferState(
  entityKind: TrackerContentCloudSelectableKind,
  entityId: string,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): 'uploading' | 'removing' | null {
  if (entityKind !== 'study_plan') return null
  return scopeFor(state).modes[keyFor(entityKind, entityId)]?.transferState ?? null
}

function projectCollection<T extends { id: string }>(
  values: readonly T[],
  entityKind: Exclude<TrackerPhase4bEntityKind, 'plan_execution'>,
  state: TrackerContentCloudPolicyReadState,
): T[] {
  return values.filter((value) => isTrackerContentCloudProjected({ entityKind, entityId: value.id }, state))
}

/** Builds the only projection eligible for ordinary Phase 4B synchronization. */
export function projectTrackerContentCloudSnapshot(
  snapshot: TrackerPhase4bLocalSnapshot,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): TrackerPhase4bLocalSnapshot {
  const studyPlans = projectCollection(snapshot.studyPlans, 'study_plan', state)
  const cloudPlanIds = new Set(studyPlans.map((plan) => plan.id))
  return {
    studyPlans,
    planExecutions: snapshot.planExecutions.filter((execution) => cloudPlanIds.has(execution.planId)),
    practiceRecords: projectCollection(snapshot.practiceRecords, 'practice_record', state),
    timerRecords: projectCollection(snapshot.timerRecords, 'timer_record', state),
    wordRecords: projectCollection(snapshot.wordRecords, 'word_record', state),
  }
}

function unionById<T extends { id: string }>(localOnly: readonly T[], cloud: readonly T[]): T[] {
  const localIds = new Set(localOnly.map((value) => value.id))
  return [...localOnly, ...cloud.filter((value) => !localIds.has(value.id))]
}

/**
 * A cloud pull can only alter the selected projection. The local-only portion
 * is merged back before the canonical local-store transaction so changing a
 * record to local never erases its current-device copy.
 */
export function mergeTrackerContentCloudSnapshot(
  cloud: TrackerPhase4bLocalSnapshot,
  local: TrackerPhase4bLocalSnapshot,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
): TrackerPhase4bLocalSnapshot {
  // A plan being detached deliberately remains in the ordinary cloud
  // projection to suppress an unsafe parent/child delete. Its desired mode is
  // already local, though, so a delayed cloud pull must not overwrite the
  // current-device copy while the paired detach is pending.
  const localPlans = local.studyPlans.filter((plan) => (
    trackerContentCloudMode({ entityKind: 'study_plan', entityId: plan.id }, state) === 'local'
    // Uploading plans are deliberately absent from the ordinary projection
    // until the paired endpoint accepts them. Preserve their local package if
    // a concurrent cloud pull arrives before that acknowledgement.
    || trackerContentCloudTransferState('study_plan', plan.id, state) === 'uploading'
  ))
  const localPlanIds = new Set(localPlans.map((plan) => plan.id))
  const localExecutions = local.planExecutions.filter((execution) => localPlanIds.has(execution.planId))
  return {
    studyPlans: unionById(localPlans, cloud.studyPlans),
    planExecutions: unionById(localExecutions, cloud.planExecutions),
    practiceRecords: unionById(
      local.practiceRecords.filter((record) => !isTrackerContentCloudProjected({
        entityKind: 'practice_record', entityId: record.id,
      }, state)),
      cloud.practiceRecords,
    ),
    timerRecords: unionById(
      local.timerRecords.filter((record) => !isTrackerContentCloudProjected({
        entityKind: 'timer_record', entityId: record.id,
      }, state)),
      cloud.timerRecords,
    ),
    wordRecords: unionById(
      local.wordRecords.filter((record) => !isTrackerContentCloudProjected({
        entityKind: 'word_record', entityId: record.id,
      }, state)),
      cloud.wordRecords,
    ),
  }
}

/**
 * Non-plan content can use an ordinary per-entity tombstone. Plans return no
 * ordinary delete intent: their parent + executions require the paired atomic
 * transfer endpoint, so they stay projected while `removing` is pending.
 */
export function localOnlyRemoteDeleteIntents(
  remote: readonly TrackerPhase4bRemoteEntity[],
  occurredAt: string,
  state: TrackerContentCloudPolicyReadState = useTrackerContentCloudPolicyStore.getState(),
) {
  return remote.flatMap((entity) => {
    if (entity.deletedAt !== null || entity.entityKind === 'study_plan' || entity.entityKind === 'plan_execution') return []
    if (!selectableKind(entity.entityKind)) return []
    return !isTrackerContentCloudProjected({ entityKind: entity.entityKind, entityId: entity.entityId }, state)
      ? [{
          entityKind: entity.entityKind,
          entityId: entity.entityId,
          action: 'delete' as const,
          baseVersion: entity.version,
          occurredAt,
        }]
      : []
  })
}

export function identitiesFromTrackerContentSnapshot(snapshot: TrackerPhase4bLocalSnapshot): TrackerContentCloudIdentity[] {
  return [
    ...snapshot.studyPlans.map((record) => ({ entityKind: 'study_plan' as const, entityId: record.id })),
    ...snapshot.planExecutions.map((record) => ({ entityKind: 'plan_execution' as const, entityId: record.id, planId: record.planId })),
    ...snapshot.practiceRecords.map((record) => ({ entityKind: 'practice_record' as const, entityId: record.id })),
    ...snapshot.timerRecords.map((record) => ({ entityKind: 'timer_record' as const, entityId: record.id })),
    ...snapshot.wordRecords.map((record) => ({ entityKind: 'word_record' as const, entityId: record.id })),
  ]
}

export function identitiesFromRemoteTrackerContent(entities: readonly TrackerPhase4bRemoteEntity[]): TrackerContentCloudIdentity[] {
  return entities.flatMap<TrackerContentCloudIdentity>((entity) => {
    if (entity.deletedAt !== null || entity.payload === null) return []
    if (entity.entityKind === 'plan_execution') {
      return [{ entityKind: entity.entityKind, entityId: entity.entityId, planId: (entity.payload as PlanExecution).planId }]
    }
    return [{ entityKind: entity.entityKind, entityId: entity.entityId }]
  })
}

export function requestTrackerContentCloudSync(input: {
  entityKind: TrackerPhase4bEntityKind
  entityId: string
  immediate?: boolean
  retry?: boolean
  planTransfer?: 'uploading' | 'removing'
}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TRACKER_CONTENT_CLOUD_SYNC_EVENT, { detail: input }))
}

/**
 * Requests a fresh server view of the administrator's content-cloud switch and
 * per-kind allowance. The bridge owns the authenticated network request, so a
 * page can safely call this without importing credentials or mutating policy
 * state itself. It is intentionally best-effort: local saves never depend on
 * a refresh succeeding.
 */
export function requestTrackerContentCloudPolicyRefresh(
  input: TrackerContentCloudPolicyRefreshRequest = {},
): void {
  if (
    typeof window === 'undefined'
    || typeof window.dispatchEvent !== 'function'
    || typeof CustomEvent !== 'function'
  ) return
  window.dispatchEvent(new CustomEvent(TRACKER_CONTENT_CLOUD_POLICY_REFRESH_EVENT, {
    detail: {
      ...(input.force ? { force: true } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  }))
}

/** Applies a verified server response to its matching active account scope. */
export function applyTrackerContentCloudCapabilities(input: {
  accountUserId: string
  selectiveCloudAvailable: boolean
  quota: TrackerContentCloudQuotaByKind | null
  status?: TrackerContentCloudPolicyStatusUpdate
}): boolean {
  return useTrackerContentCloudPolicyStore.getState().setCapabilitiesForScope(
    input.accountUserId,
    input,
  )
}

export function trackerContentCloudPolicyStatus(
  scope = useTrackerContentCloudPolicyStore.getState().activeScope,
): TrackerContentCloudPolicyStatus {
  return useTrackerContentCloudPolicyStore.getState().contentCloudStatusByScope[scope] ?? {
    policyVersion: null,
    overrideVersion: null,
    contentCursor: null,
  }
}

export function applyTrackerContentCloudPolicyStatus(input: {
  accountUserId: string
  status: TrackerContentCloudPolicyStatusUpdate
}): boolean {
  return useTrackerContentCloudPolicyStore.getState().setStatusForScope(
    input.accountUserId,
    input.status,
  )
}

export function trackerContentCloudPolicyRefreshState(
  scope = useTrackerContentCloudPolicyStore.getState().activeScope,
): TrackerContentCloudPolicyRefreshState {
  return useTrackerContentCloudPolicyStore.getState().contentCloudRefreshByScope[scope] ?? {
    phase: 'idle',
    lastCheckedAt: null,
    lastErrorAt: null,
  }
}

export function applyTrackerContentCloudPolicyRefreshState(input: {
  accountUserId: string
  state: TrackerContentCloudPolicyRefreshStateUpdate
}): boolean {
  return useTrackerContentCloudPolicyStore.getState().setRefreshStateForScope(
    input.accountUserId,
    input.state,
  )
}

/** Commits a saved record's location only after its local-store write succeeds. */
export function setTrackerContentCloudLocation(input: {
  entityKind: TrackerContentCloudSelectableKind
  entityId: string
  mode: TrackerContentCloudMode
}): void {
  // Ask for the current administrator policy before the following sync work.
  // The server remains authoritative if the response is still in flight.
  requestTrackerContentCloudPolicyRefresh({ force: true, reason: 'before-save' })
  const state = useTrackerContentCloudPolicyStore.getState()
  const previous = trackerContentCloudMode({
    entityKind: input.entityKind,
    entityId: input.entityId,
  }, state)
  const desiredPlanTransfer: 'uploading' | 'removing' = input.mode === 'cloud' ? 'uploading' : 'removing'
  const currentPlanTransfer = input.entityKind === 'study_plan'
    ? trackerContentCloudTransferState(input.entityKind, input.entityId, state)
    : null
  // A plan only starts/retries its paired operation when its desired location
  // changes or a compatible pending operation already exists. In particular,
  // changing a failed upload back to local must request a detach/no-op local
  // acknowledgement, never replay the stale upload direction.
  const transferState = input.entityKind === 'study_plan'
    ? previous !== input.mode
      ? desiredPlanTransfer
      : currentPlanTransfer === desiredPlanTransfer
        ? desiredPlanTransfer
        : undefined
    : undefined
  const options = transferState ? { planTransfer: transferState } : undefined
  useTrackerContentCloudPolicyStore.getState().setMode(
    input.entityKind,
    input.entityId,
    input.mode,
    options,
  )
  requestTrackerContentCloudSync({
    entityKind: input.entityKind,
    entityId: input.entityId,
    immediate: true,
    ...(transferState ? { planTransfer: transferState } : {}),
  })
}

export function readableTrackerContentCloudFailure(reason: string): string {
  if (reason === 'cloud_quota_reached') return '云端额度已用完，本机内容仍已保留；额度调整后可再次上传。'
  if (reason === 'content_cloud_not_available') return '当前账号暂未开放内容上云，本机内容已保留。'
  if (reason === 'account_binding_required') return '请先确认这台设备的数据归属，再操作云端内容。'
  if (reason === 'cloud_transfer_failed') return '云端操作暂未完成，本机内容已保留；网络恢复后可重新尝试。'
  if (reason === 'account_epoch_changed') return '账号数据已更新，正在重新确认云端状态；本机内容已保留。'
  if (reason === 'local_plan_missing') return '本机计划已不存在，未执行云端操作。'
  if (reason === 'restore_confirmation_required') return '云端副本已删除，请再次确认上传以恢复云端副本。'
  if (reason === 'parent_plan_missing') return '请先将所属学习计划上传至云端。'
  if (reason === 'live_plan_executions_remain') return '计划执行记录正在撤回云端，请稍后重试。'
  return '云端未接受这条内容，本机内容仍已保留。'
}
