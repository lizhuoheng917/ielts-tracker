import {
  AI_COMMAND_ACTIONS,
  AI_DATA_SCOPES,
  AI_PURPOSES,
  type AiCommandAction,
  type AiContextSnapshotV1,
  type AiDataScope,
  type AiPurpose,
} from './contracts'

export class AiContractValidationError extends Error {
  readonly code: 'UNKNOWN_PURPOSE' | 'UNKNOWN_SCOPE' | 'UNKNOWN_ACTION' | 'INVALID_SNAPSHOT' | 'STALE_SNAPSHOT'

  constructor(
    code: 'UNKNOWN_PURPOSE' | 'UNKNOWN_SCOPE' | 'UNKNOWN_ACTION' | 'INVALID_SNAPSHOT' | 'STALE_SNAPSHOT',
    message: string,
  ) {
    super(message)
    this.name = 'AiContractValidationError'
    this.code = code
  }
}

export function parseAiPurpose(value: unknown): AiPurpose {
  if (typeof value === 'string' && (AI_PURPOSES as readonly string[]).includes(value)) {
    return value as AiPurpose
  }
  throw new AiContractValidationError('UNKNOWN_PURPOSE', `Unknown AI purpose: ${String(value)}`)
}

export function parseAiDataScope(value: unknown): AiDataScope {
  if (typeof value === 'string' && (AI_DATA_SCOPES as readonly string[]).includes(value)) {
    return value as AiDataScope
  }
  throw new AiContractValidationError('UNKNOWN_SCOPE', `Unknown AI data scope: ${String(value)}`)
}

export function parseAiCommandAction(value: unknown): AiCommandAction {
  if (typeof value === 'string' && (AI_COMMAND_ACTIONS as readonly string[]).includes(value)) {
    return value as AiCommandAction
  }
  throw new AiContractValidationError('UNKNOWN_ACTION', `Unknown AI command action: ${String(value)}`)
}

export function assertFreshAiSnapshot(
  snapshot: AiContextSnapshotV1,
  now: Date = new Date(),
): void {
  const createdAt = Date.parse(snapshot.createdAt)
  if (!Number.isFinite(createdAt) || snapshot.schemaVersion !== 1) {
    throw new AiContractValidationError('INVALID_SNAPSHOT', 'AI context snapshot is invalid')
  }

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - createdAt) / 1000))
  if (snapshot.freshness.status === 'stale' || ageSeconds > snapshot.freshness.maxAgeSeconds) {
    throw new AiContractValidationError('STALE_SNAPSHOT', 'AI context snapshot is stale')
  }
}
