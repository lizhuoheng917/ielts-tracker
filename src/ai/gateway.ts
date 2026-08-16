import type { AiContextSnapshotV1, AiResultEnvelope } from './contracts'
import type { AiStructuredContentV2 } from './structuredOutputs'

export const MANAGED_AI_PURPOSES = [
  'daily_suggestion',
  'learning_analysis',
  'plan_draft',
  'writing_feedback',
  'words_plan_recommendation',
] as const
export type ManagedAiPurpose = (typeof MANAGED_AI_PURPOSES)[number]

export const AI_GATEWAY_FUNCTION_NAME = 'lexi-ai-gateway'
export const AI_GATEWAY_REQUEST_SCHEMA_VERSION = 1 as const
export const AI_GATEWAY_RESPONSE_SCHEMA_VERSION = 2 as const
export const AI_GATEWAY_PRODUCT_ID = 'tracker' as const
export const MAX_AI_GATEWAY_REQUEST_BYTES = 64 * 1024
export const MAX_AI_GATEWAY_DEEP_WRITING_REQUEST_BYTES = 1024 * 1024
export const MAX_AI_GATEWAY_USER_INPUT_LENGTH = 2_000
export const MAX_AI_GATEWAY_RESPONSE_CONTENT_LENGTH = 24_000

export type AiGatewayErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'PROMPT_RECOGNITION_FAILED'
  | 'CANCELLED'
  | 'LOCAL_DATA_UNBOUND'
  | 'LOCAL_DATA_ACCOUNT_MISMATCH'
  | 'LOCAL_DATA_BINDING_UNAVAILABLE'

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode
  readonly retryable: boolean
  readonly status?: number
  readonly retryAfterSeconds?: number
  /**
   * The browser did not receive a definitive terminal result. This is kept
   * separate from `retryable`: retrying can be technically possible while a
   * previous provider call may still have completed.
   */
  readonly outcomeUnknown: boolean

  constructor(
    code: AiGatewayErrorCode,
    message: string,
    retryable = false,
    status?: number,
    retryAfterSeconds?: number,
    outcomeUnknown = false,
  ) {
    super(message)
    this.name = 'AiGatewayError'
    this.code = code
    this.retryable = retryable
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
    this.outcomeUnknown = outcomeUnknown
  }
}

/** Local execution input. `signal` is transport-only and is never serialized. */
export interface AiGatewayRequest {
  requestId: string
  idempotencyKey: string
  purpose: ManagedAiPurpose
  snapshot: AiContextSnapshotV1
  userInput: string
  signal?: AbortSignal
}

/** Stable browser-to-server JSON contract. It deliberately contains no provider routing or prompts. */
export interface AiGatewayWireRequestV1 {
  schemaVersion: typeof AI_GATEWAY_REQUEST_SCHEMA_VERSION
  responseSchemaVersion: typeof AI_GATEWAY_RESPONSE_SCHEMA_VERSION
  productId: typeof AI_GATEWAY_PRODUCT_ID
  requestId: string
  idempotencyKey: string
  purpose: ManagedAiPurpose
  snapshot: AiContextSnapshotV1
  userInput: string
}

export interface AiGateway {
  execute(request: AiGatewayRequest): Promise<AiResultEnvelope<AiStructuredContentV2>>
}
