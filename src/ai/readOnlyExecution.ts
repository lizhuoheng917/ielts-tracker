import type { AiArtifact, AiRun } from './contracts'
import type { AiContextSnapshotV1 } from './contracts'
import { AiGatewayError, type AiGateway, type ManagedAiPurpose } from './gateway'
import { managedAiGateway } from './managedGateway'
import {
  parseStructuredAiOutput,
  type AiStructuredContentForPurpose,
} from './structuredOutputs'
import { parseWritingSubmission, type WritingSubmission } from './writingFeedback'

export interface ReadOnlyAiExecutionRequest<
  TPurpose extends ManagedAiPurpose = ManagedAiPurpose,
> {
  purpose: TPurpose
  snapshot: AiContextSnapshotV1
  userInput: string
  signal?: AbortSignal
}

export interface ReadOnlyAiExecutionResult<
  TPurpose extends ManagedAiPurpose = ManagedAiPurpose,
> {
  source: 'managed'
  content: AiStructuredContentForPurpose<TPurpose>
  run?: AiRun
  artifact?: AiArtifact<AiStructuredContentForPurpose<TPurpose>>
  warnings: string[]
}

export interface ReadOnlyAiExecutionDependencies {
  managedGateway?: AiGateway
  createId?: () => string
}

function writingSubmissionForRequest(
  request: ReadOnlyAiExecutionRequest,
): WritingSubmission | undefined {
  if (request.purpose !== 'writing_feedback') return undefined
  const data = request.snapshot.data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AiGatewayError('INVALID_REQUEST', '本次写作提交格式无效，请重新填写后再试。')
  }
  try {
    return parseWritingSubmission((data as Record<string, unknown>).submission)
  } catch {
    throw new AiGatewayError('INVALID_REQUEST', '本次写作提交格式无效，请重新填写后再试。')
  }
}

const KNOWN_ERROR_CODES = new Set([
  'NOT_CONFIGURED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'PAYLOAD_TOO_LARGE',
  'PROVIDER_ERROR',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
  'INVALID_RESPONSE',
  'CANCELLED',
  'LOCAL_DATA_UNBOUND',
  'LOCAL_DATA_ACCOUNT_MISMATCH',
  'LOCAL_DATA_BINDING_UNAVAILABLE',
])

function errorFromEnvelope(
  code: string,
  retryable: boolean,
  retryAfterSeconds?: number,
): AiGatewayError {
  const mappedCode = KNOWN_ERROR_CODES.has(code)
    ? code as ConstructorParameters<typeof AiGatewayError>[0]
    : 'SERVICE_UNAVAILABLE'
  const messages: Record<ConstructorParameters<typeof AiGatewayError>[0], string> = {
    NOT_CONFIGURED: '当前环境尚未连接 Lexi AI。',
    UNAUTHORIZED: '请先登录 Lexi 账号，再使用 AI。',
    FORBIDDEN: '当前账号暂时无法使用 AI。',
    RATE_LIMITED: retryAfterSeconds
      ? '今日 AI 使用次数已用完，请在配额提示的重置时间后重试。'
      : 'AI 使用较频繁，请稍后再试。',
    INVALID_REQUEST: '本次 AI 请求无效，请刷新学习数据后重试。',
    PAYLOAD_TOO_LARGE: '本次分析数据过大，请缩短分析范围后重试。',
    PROVIDER_ERROR: 'AI 服务暂时没有响应，请稍后再试。',
    NETWORK_ERROR: '无法连接 AI 服务，请检查网络后重试。',
    SERVICE_UNAVAILABLE: 'AI 暂时不可用，请稍后再试。',
    TIMEOUT: 'AI 分析等待超时，请稍后重试。',
    INVALID_RESPONSE: 'AI 返回了无法识别的结果，请稍后重试。',
    CANCELLED: 'AI 分析已取消。',
    LOCAL_DATA_UNBOUND: '使用 AI 前，请先确认本机学习记录属于当前 Lexi 账号。',
    LOCAL_DATA_ACCOUNT_MISMATCH: '本机学习记录属于另一个 Lexi 账号，AI 已暂停。',
    LOCAL_DATA_BINDING_UNAVAILABLE: '无法安全确认本机学习记录归属，AI 已暂停。请按账号面板中的恢复步骤处理。',
  }
  return new AiGatewayError(mappedCode, messages[mappedCode], retryable, undefined, retryAfterSeconds)
}

/**
 * All learner-facing AI analysis uses the Lexi Gateway. Provider credentials,
 * model selection and prompts stay on the server and are controlled in /admin.
 */
export async function executeReadOnlyAi<TPurpose extends ManagedAiPurpose>(
  request: ReadOnlyAiExecutionRequest<TPurpose>,
  dependencies: ReadOnlyAiExecutionDependencies = {},
): Promise<ReadOnlyAiExecutionResult<TPurpose>> {
  const writingSubmission = writingSubmissionForRequest(request)
  const createId = dependencies.createId ?? (() => crypto.randomUUID())
  const requestId = createId()
  const result = await (dependencies.managedGateway ?? managedAiGateway).execute({
    requestId,
    idempotencyKey: `tracker-ai-${requestId}`,
    purpose: request.purpose,
    snapshot: request.snapshot,
    userInput: request.userInput,
    signal: request.signal,
  })
  if (!result.ok) {
    throw errorFromEnvelope(
      result.error.code,
      result.error.retryable,
      result.error.retryAfterSeconds,
    )
  }

  let content: AiStructuredContentForPurpose<TPurpose>
  try {
    content = parseStructuredAiOutput(result.artifact.content, request.purpose, writingSubmission)
  } catch {
    throw new AiGatewayError(
      'INVALID_RESPONSE',
      'AI 返回了无法识别的结构，请稍后重试。',
      true,
    )
  }
  return {
    source: 'managed',
    content,
    run: result.run,
    artifact: {
      ...result.artifact,
      content,
    },
    warnings: result.warnings,
  }
}
