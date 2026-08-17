export const AI_PURPOSES = [
  'daily_suggestion',
  'learning_analysis',
  'plan_draft',
  'writing_feedback',
  'writing_revision_coach',
  'words_plan_recommendation',
  'assistant_chat',
] as const

export type AiPurpose = (typeof AI_PURPOSES)[number]

export const AI_DATA_SCOPES = [
  'learning.summary',
  'learning.timeline',
  'practice.summary',
  'plans.summary',
  'diary.excerpts',
  'ai_artifacts.history',
  'writing.submission',
  'words.planning.summary',
] as const

export type AiDataScope = (typeof AI_DATA_SCOPES)[number]

export const AI_COMMAND_ACTIONS = ['plan.create'] as const
export type AiCommandAction = (typeof AI_COMMAND_ACTIONS)[number]

export type AiSnapshotQualityStatus = 'empty' | 'limited' | 'sufficient'
export type AiFreshnessStatus = 'fresh' | 'stale'

export interface AiSnapshotFreshness {
  status: AiFreshnessStatus
  ageSeconds: number
  maxAgeSeconds: number
}

export interface AiSnapshotQuality {
  status: AiSnapshotQualityStatus
  recordCount: number
  warnings: string[]
}

/** Immutable, purpose-limited evidence captured immediately before an AI run. */
export interface AiContextSnapshotV1<TData extends Record<string, unknown> = Record<string, unknown>> {
  schemaVersion: 1
  snapshotId: string
  purpose: AiPurpose
  createdAt: string
  dataAsOf: string
  freshness: AiSnapshotFreshness
  sourceRevision: string
  contextHash: string
  scopes: AiDataScope[]
  privateScopes: AiDataScope[]
  quality: AiSnapshotQuality
  data: TData
}

export type AiRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface AiRun {
  runId: string
  requestId: string
  productId: 'tracker'
  purpose: AiPurpose
  status: AiRunStatus
  idempotencyKey: string
  snapshotId: string
  contextHash: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  modelAlias?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export type AiArtifactKind =
  | 'daily_suggestion'
  | 'learning_analysis'
  | 'plan_draft'
  | 'writing_feedback'
  | 'writing_revision_coach'
  | 'words_plan_recommendation'
  | 'chat_response'

export interface AiArtifact<TContent = unknown> {
  schemaVersion: 1
  /** Present for artifacts whose purpose-specific content uses a versioned output contract. */
  outputSchemaVersion?: 2
  artifactId: string
  runId: string
  kind: AiArtifactKind
  status: 'draft' | 'final' | 'discarded'
  content: TContent
  createdAt: string
  dataAsOf: string
  contextHash: string
}

export interface AiCommandConfirmation {
  required: true
  status: 'pending' | 'confirmed' | 'rejected'
  confirmedAt?: string
}

export interface AiCommandContext {
  snapshotId: string
  contextHash: string
  sourceRevision: string
  routeMode: 'managed' | 'custom'
  accountScopeId: string
  generatedAt: string
  expiresAt: string
}

/** A model may propose this object, but only user confirmation may apply it. */
export interface AiCommandDraft<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  schemaVersion: 1
  draftId: string
  runId: string
  action: AiCommandAction
  targetScope: 'plans'
  payload: TPayload
  idempotencyKey: string
  /** Host-captured provenance. It is never accepted from provider output. */
  context: AiCommandContext
  confirmation: AiCommandConfirmation
  createdAt: string
  updatedAt: string
}

export interface AiCommandReceipt {
  schemaVersion: 1
  receiptId: string
  draftId: string
  action: AiCommandAction
  idempotencyKey: string
  status: 'applied' | 'duplicate' | 'rejected' | 'failed' | 'stale' | 'scope_mismatch'
  createdAt: string
  targetId?: string
  error?: {
    code: string
    message: string
  }
}

export type AiResultEnvelope<T> =
  | {
      ok: true
      run: AiRun
      artifact: AiArtifact<T>
      warnings: string[]
    }
  | {
      ok: false
      run: AiRun
      error: {
        code: string
        message: string
        retryable: boolean
        retryAfterSeconds?: number
      }
    }
