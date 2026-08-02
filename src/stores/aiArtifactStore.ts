import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  convertLegacyAiArtifacts,
  createDailySuggestionArtifactV2,
  createLearningAnalysisArtifactV2,
  createWritingFeedbackArtifactV2,
  parseAiArtifactRecordV2,
  upsertAiArtifact,
  type AiArtifactAccessV2,
  type AiArtifactRecordV2,
  type SaveDailySuggestionArtifactInputV2,
  type SaveLearningAnalysisArtifactInputV2,
  type SaveWritingFeedbackArtifactInputV2,
} from '@/ai/artifactRepository'
import { STORAGE_PREFIX } from '@/lib/constants'
import type { AiSuggestion } from './aiSuggestionStore'
import type { AnalysisReport } from './reportStore'

export const AI_ARTIFACT_STORAGE_KEY = `${STORAGE_PREFIX}:aiArtifactsV2`

export type AiArtifactRepositoryIntegrity =
  | { status: 'ready' }
  | { status: 'corrupt'; reason: string }

interface AiArtifactMigrationReceiptV1 {
  version: 1
  status: 'pending' | 'complete'
  importedCount: number
  completedAt?: string
}

interface AiArtifactStore {
  artifacts: AiArtifactRecordV2[]
  migration: AiArtifactMigrationReceiptV1
  integrity: AiArtifactRepositoryIntegrity
  saveDailySuggestion: (input: SaveDailySuggestionArtifactInputV2, access: AiArtifactAccessV2) => AiArtifactRecordV2
  saveLearningAnalysis: (input: SaveLearningAnalysisArtifactInputV2, access: AiArtifactAccessV2) => AiArtifactRecordV2
  saveWritingFeedback: (input: SaveWritingFeedbackArtifactInputV2, access: AiArtifactAccessV2) => AiArtifactRecordV2
  deleteArtifact: (recordId: string, access: AiArtifactAccessV2) => boolean
  adoptLocalArtifacts: (accountUserId: string) => number
  replaceArtifactsFromBackup: (artifacts: readonly AiArtifactRecordV2[]) => void
  importLegacyArtifacts: (suggestion: AiSuggestion | null, reports: readonly AnalysisReport[]) => number
}

function artifactBelongsToAccess(artifact: AiArtifactRecordV2, access: AiArtifactAccessV2): boolean {
  if (access.status === 'locked') return false
  if (access.mode === 'device') return artifact.owner.scope === 'local'
  return artifact.owner.scope === 'local' || artifact.owner.accountUserId === access.accountUserId
}

function parsePersistedArtifacts(value: unknown): AiArtifactRecordV2[] {
  if (!Array.isArray(value)) throw new Error('AI artifact list is missing')
  const records: AiArtifactRecordV2[] = []
  for (const candidate of value) {
    records.push(parseAiArtifactRecordV2(candidate))
  }
  return records
}

function inspectInitialIntegrity(): AiArtifactRepositoryIntegrity {
  let storage: Storage | undefined
  try {
    storage = globalThis.localStorage
  } catch {
    return { status: 'corrupt', reason: '无法读取本机 AI 内容存储' }
  }
  if (!storage) return { status: 'ready' }

  try {
    const raw = storage.getItem(AI_ARTIFACT_STORAGE_KEY)
    if (raw === null) return { status: 'ready' }
    const envelope: unknown = JSON.parse(raw)
    if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
      throw new Error('invalid persistence envelope')
    }
    const state = (envelope as Record<string, unknown>).state
    if (typeof state !== 'object' || state === null || Array.isArray(state)) {
      throw new Error('missing persistence state')
    }
    parsePersistedArtifacts((state as Record<string, unknown>).artifacts)
    return { status: 'ready' }
  } catch {
    return { status: 'corrupt', reason: '本机 AI 内容仓库无法完整校验' }
  }
}

const INITIAL_INTEGRITY = inspectInitialIntegrity()

export const useAiArtifactStore = create<AiArtifactStore>()(
  persist(
    (set, get) => {
      const commit = (patch: Pick<AiArtifactStore, 'artifacts'> & Partial<Pick<AiArtifactStore, 'migration'>>) => {
        if (get().integrity.status !== 'ready') {
          throw new Error('AI 内容仓库需要恢复，已停止写入')
        }
        const previous = { artifacts: get().artifacts, migration: get().migration }
        try {
          set(patch)
        } catch (error) {
          // Zustand updates memory before persistence. Restore memory as well so
          // the UI never claims a failed disk write succeeded.
          try {
            set(previous)
          } catch {
            // The same storage failure is expected during rollback; memory was
            // still restored synchronously before the adapter threw.
          }
          throw error
        }
      }

      const persistArtifact = (artifact: AiArtifactRecordV2): AiArtifactRecordV2 => {
        const current = get().artifacts
        const existing = current.find((candidate) => (
          candidate.recordId === artifact.recordId
          || (
            artifact.provenance.providerArtifactId !== undefined
            && candidate.provenance.providerArtifactId === artifact.provenance.providerArtifactId
          )
        ))
        const next = upsertAiArtifact(current, artifact)
        // A validated retry is already durable. Return the canonical persisted
        // object and avoid a redundant localStorage write that could falsely
        // report a quota failure for an operation that had already succeeded.
        if (existing) return existing
        commit({ artifacts: next })
        return artifact
      }

      return {
        artifacts: [],
        migration: { version: 1, status: 'pending', importedCount: 0 },
        integrity: INITIAL_INTEGRITY,
        saveDailySuggestion: (input, access) => {
          const artifact = createDailySuggestionArtifactV2(input, access)
          return persistArtifact(artifact)
        },
        saveLearningAnalysis: (input, access) => {
          const artifact = createLearningAnalysisArtifactV2(input, access)
          return persistArtifact(artifact)
        },
        saveWritingFeedback: (input, access) => {
          const artifact = createWritingFeedbackArtifactV2(input, access)
          return persistArtifact(artifact)
        },
        deleteArtifact: (recordId, access) => {
          const current = get().artifacts.find((artifact) => artifact.recordId === recordId)
          if (!current || !artifactBelongsToAccess(current, access)) return false
          commit({ artifacts: get().artifacts.filter((artifact) => artifact.recordId !== recordId) })
          return true
        },
        adoptLocalArtifacts: (accountUserId) => {
          const localCount = get().artifacts.filter((artifact) => artifact.owner.scope === 'local').length
          if (localCount === 0) return 0
          commit({
            artifacts: get().artifacts.map((artifact) => artifact.owner.scope === 'local'
              ? parseAiArtifactRecordV2({ ...artifact, owner: { scope: 'account', accountUserId } })
              : artifact),
          })
          return localCount
        },
        replaceArtifactsFromBackup: (artifacts) => {
          commit({
            artifacts: artifacts.map((artifact) => parseAiArtifactRecordV2({ ...artifact, owner: { scope: 'local' } })),
            migration: { version: 1, status: 'complete', importedCount: artifacts.length, completedAt: new Date().toISOString() },
          })
        },
        importLegacyArtifacts: (suggestion, reports) => {
          const converted = convertLegacyAiArtifacts(suggestion, reports)
          let next = get().artifacts
          for (const artifact of converted) next = upsertAiArtifact(next, artifact)
          commit({
            artifacts: next,
            migration: { version: 1, status: 'complete', importedCount: converted.length, completedAt: new Date().toISOString() },
          })
          return converted.length
        },
      }
    },
    {
      name: AI_ARTIFACT_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ artifacts: state.artifacts, migration: state.migration }),
      merge: (persisted, current) => {
        if (current.integrity.status === 'corrupt') return current
        if (persisted === undefined) return current
        const candidate = typeof persisted === 'object' && persisted !== null
          ? persisted as Partial<AiArtifactStore>
          : {}
        const migration = candidate.migration?.version === 1
          && (candidate.migration.status === 'pending' || candidate.migration.status === 'complete')
          ? candidate.migration
          : current.migration
        try {
          return {
            ...current,
            artifacts: parsePersistedArtifacts(candidate.artifacts),
            migration,
            integrity: { status: 'ready' },
          }
        } catch {
          return {
            ...current,
            integrity: { status: 'corrupt', reason: '本机 AI 内容仓库无法完整校验' },
          }
        }
      },
    },
  ),
)

function readLegacyState<T>(storage: Storage, key: string, field: string): T | null {
  const raw = storage.getItem(key)
  if (!raw) return null
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const state = (parsed as Record<string, unknown>).state
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return null
  return ((state as Record<string, unknown>)[field] ?? null) as T | null
}

/** One-way, non-destructive import. The two legacy keys remain untouched. */
export function ensureAiArtifactRepositoryInitialized(storage: Storage = localStorage): number {
  const store = useAiArtifactStore.getState()
  if (store.integrity.status !== 'ready') {
    throw new Error(store.integrity.reason)
  }
  if (store.migration.status === 'complete') return 0
  const suggestion = readLegacyState<AiSuggestion>(storage, `${STORAGE_PREFIX}:aiSuggestion`, 'suggestion')
  const reports = readLegacyState<AnalysisReport[]>(storage, `${STORAGE_PREFIX}:reports`, 'reports') ?? []
  return store.importLegacyArtifacts(suggestion, Array.isArray(reports) ? reports : [])
}
