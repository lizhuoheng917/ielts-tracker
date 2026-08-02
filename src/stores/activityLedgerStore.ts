import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  createActivityEvent,
  replayActivityLedger,
  type ActivityEvent,
  type ActivityEventInput,
  type ActivityLedgerBaseline,
  type ActivityLedgerSnapshot,
} from '@/data/activityLedger'
import { STORAGE_PREFIX } from '@/lib/constants'
import { toLocalDate } from '@/lib/localDate'

export const ACTIVITY_LEDGER_MAX_EVENTS = 500

export type ActivityLedgerAppendInput = Omit<
  ActivityEventInput,
  'eventId' | 'revision' | 'idempotencyKey'
> & {
  idempotencyKey?: string
}

interface ActivityLedgerStoreState {
  schemaVersion: 1
  baseline: ActivityLedgerBaseline | null
  events: ActivityEvent[]
}

interface ActivityLedgerStoreActions {
  initialize: (snapshot: ActivityLedgerSnapshot) => boolean
  replace: (snapshot: ActivityLedgerSnapshot) => void
  append: (input: ActivityLedgerAppendInput) => ActivityEvent | null
  clear: () => void
}

export type ActivityLedgerStore = ActivityLedgerStoreState & ActivityLedgerStoreActions

const EMPTY_LEDGER_STATE: ActivityLedgerStoreState = {
  schemaVersion: 1,
  baseline: null,
  events: [],
}

function snapshotState(snapshot: ActivityLedgerSnapshot): ActivityLedgerStoreState {
  return {
    schemaVersion: snapshot.schemaVersion,
    baseline: structuredClone(snapshot.baseline),
    events: structuredClone(snapshot.events),
  }
}

let hasWarnedAboutPersistence = false

function warnLedgerFailure(error: unknown) {
  if (hasWarnedAboutPersistence) return
  hasWarnedAboutPersistence = true
  const detail = error instanceof Error ? error.message : 'unknown storage error'
  console.warn(`[activity-ledger] shadow persistence degraded: ${detail}`)
}

const failureIsolatedStorage = {
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name)
    } catch (error) {
      warnLedgerFailure(error)
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value)
    } catch (error) {
      // The ledger is a rebuildable shadow cache. A quota/storage failure must
      // never make a canonical learning mutation or app startup fail.
      warnLedgerFailure(error)
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name)
    } catch (error) {
      warnLedgerFailure(error)
    }
  },
}

function isPersistedEvent(value: unknown): value is ActivityEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Partial<ActivityEvent>
  return event.schemaVersion === 1
    && typeof event.eventId === 'string'
    && typeof event.idempotencyKey === 'string'
    && typeof event.entityKind === 'string'
    && typeof event.entityId === 'string'
    && Number.isInteger(event.revision)
    && typeof event.operation === 'string'
    && typeof event.occurredAt === 'string'
    && typeof event.source === 'string'
    && typeof event.effects === 'object'
    && event.effects !== null
    && Number.isFinite(event.effects.xpDelta)
    && Array.isArray(event.effects.activityDeltas)
}

function mergePersistedLedger(
  persistedState: unknown,
  currentState: ActivityLedgerStore,
): ActivityLedgerStore {
  if (typeof persistedState !== 'object' || persistedState === null) return currentState
  const persisted = persistedState as Partial<ActivityLedgerStoreState>
  if (persisted.schemaVersion !== 1 || !Array.isArray(persisted.events)) return currentState
  if (!persisted.events.every(isPersistedEvent)) {
    warnLedgerFailure(new Error('invalid persisted event data'))
    return currentState
  }
  if (persisted.baseline === null) {
    return { ...currentState, schemaVersion: 1, baseline: null, events: persisted.events }
  }
  if (typeof persisted.baseline !== 'object' || persisted.baseline === null) return currentState

  const baseline = persisted.baseline as Partial<ActivityLedgerBaseline>
  if (
    typeof baseline.capturedAt !== 'string'
    || typeof baseline.achievements !== 'object'
    || baseline.achievements === null
    || typeof baseline.streak !== 'object'
    || baseline.streak === null
  ) {
    warnLedgerFailure(new Error('invalid persisted baseline data'))
    return currentState
  }

  return {
    ...currentState,
    schemaVersion: 1,
    baseline: {
      ...(baseline as ActivityLedgerBaseline),
      source: baseline.source ?? 'migration',
      rewardedCheckinDates: Array.isArray(baseline.rewardedCheckinDates)
        ? baseline.rewardedCheckinDates.filter((date): date is string => typeof date === 'string')
        : baseline.lastCheckinDate ? [baseline.lastCheckinDate] : [],
    },
    events: persisted.events,
  }
}

export const useActivityLedgerStore = create<ActivityLedgerStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_LEDGER_STATE,
      initialize: (snapshot) => {
        if (get().baseline !== null) return false
        try {
          set(snapshotState(snapshot))
          return true
        } catch (error) {
          warnLedgerFailure(error)
          return false
        }
      },
      replace: (snapshot) => {
        try {
          set(snapshotState(snapshot))
        } catch (error) {
          warnLedgerFailure(error)
        }
      },
      append: (input) => {
        try {
          const state = get()
          if (input.idempotencyKey && state.events.some(
            (event) => event.idempotencyKey === input.idempotencyKey,
          )) {
            return null
          }

          let baseline = state.baseline
          let events = state.events
          if (baseline && events.length >= ACTIVITY_LEDGER_MAX_EVENTS) {
            const replayed = replayActivityLedger({
              schemaVersion: state.schemaVersion,
              baseline,
              events,
            }, toLocalDate())
            baseline = {
              capturedAt: input.occurredAt,
              source: 'rebase',
              achievements: replayed.achievements,
              streak: replayed.streak,
              lastCheckinDate: replayed.lastCheckinDate,
              rewardedCheckinDates: replayed.rewardedCheckinDates,
            }
            events = []
          }

          const revision = events.reduce(
            (maximum, event) =>
              event.entityKind === input.entityKind && event.entityId === input.entityId
                ? Math.max(maximum, event.revision)
                : maximum,
            0,
          ) + 1
          const idempotencyKey = input.idempotencyKey
            ?? `${input.entityKind}:${input.entityId}:r${revision}:${input.operation}`

          if (events.some((event) => event.idempotencyKey === idempotencyKey)) return null

          const event = createActivityEvent({
            ...input,
            eventId: crypto.randomUUID(),
            revision,
            idempotencyKey,
          })
          set({ baseline, events: [...events, event] })
          return event
        } catch (error) {
          warnLedgerFailure(error)
          return null
        }
      },
      clear: () => {
        set({ ...EMPTY_LEDGER_STATE })
      },
    }),
    {
      name: `${STORAGE_PREFIX}:activityLedger`,
      version: 1,
      storage: createJSONStorage(() => failureIsolatedStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        baseline: state.baseline,
        events: state.events,
      }),
      merge: mergePersistedLedger,
    },
  ),
)
