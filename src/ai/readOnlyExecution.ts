import { streamAIChat, type AIMessage } from '@/lib/aiService'
import { useAIStore, type AiRouteMode } from '@/stores/aiStore'

import type { AiArtifact, AiRun } from './contracts'
import { AiGatewayError, type AiGateway, type ManagedAiPurpose } from './gateway'
import { managedAiGateway } from './managedGateway'
import {
  buildPlanSystemPrompt,
  buildStatsAnalysisSystemPrompt,
  buildSuggestionSystemPrompt,
  buildWritingFeedbackSystemPrompt,
} from './prompts'
import type { AiContextSnapshotV1 } from './contracts'
import {
  parseStructuredAiOutput,
  parseStructuredAiOutputJson,
  type AiStructuredContentForPurpose,
} from './structuredOutputs'
import { parseWritingSubmissionV2, type WritingSubmissionV2 } from './writingFeedback'

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
  source: 'managed' | 'custom'
  content: AiStructuredContentForPurpose<TPurpose>
  run?: AiRun
  /** Managed provenance returned by the Gateway. Custom executions create a local artifact instead. */
  artifact?: AiArtifact<AiStructuredContentForPurpose<TPurpose>>
  warnings: string[]
}

export type CustomReadOnlyExecutor = (
  messages: AIMessage[],
  options: { signal?: AbortSignal },
) => Promise<string>

export interface ReadOnlyAiExecutionDependencies {
  routeMode?: AiRouteMode
  managedGateway?: AiGateway
  customExecutor?: CustomReadOnlyExecutor
  customApiKey?: string
  createId?: () => string
}

function safeCustomError(error: string): AiGatewayError {
  if (error.includes('API Key')) {
    return new AiGatewayError('NOT_CONFIGURED', '请先在高级设置中配置自定义 AI。')
  }
  if (/\b(401|403)\b/.test(error)) {
    return new AiGatewayError('UNAUTHORIZED', '自定义 AI 的凭证无效，请检查高级设置。')
  }
  if (/\b429\b/.test(error)) {
    return new AiGatewayError('RATE_LIMITED', '自定义 AI 使用较频繁，请稍后再试。', true, 429)
  }
  if (error.includes('中断')) return new AiGatewayError('CANCELLED', 'AI 分析已取消。')
  return new AiGatewayError('PROVIDER_ERROR', '自定义 AI 暂时没有响应，请稍后再试。', true)
}

export const collectCustomReadOnlyResponse: CustomReadOnlyExecutor = async (messages, options) => {
  let content = ''
  await new Promise<void>((resolve, reject) => {
    void streamAIChat(messages, {
      onContent: (nextContent) => {
        content = nextContent
      },
      onError: (error) => reject(safeCustomError(error)),
      onDone: resolve,
    }, { signal: options.signal })
  })
  if (!content.trim()) throw new AiGatewayError('INVALID_RESPONSE', 'AI 没有返回可用内容，请重试。', true)
  return content
}

function buildCustomMessages(request: ReadOnlyAiExecutionRequest): AIMessage[] {
  const systemPrompt = request.purpose === 'daily_suggestion'
    ? buildSuggestionSystemPrompt(request.snapshot)
    : request.purpose === 'learning_analysis'
      ? buildStatsAnalysisSystemPrompt(request.snapshot)
      : request.purpose === 'plan_draft'
        ? buildPlanSystemPrompt(request.snapshot)
        : buildWritingFeedbackSystemPrompt(request.snapshot)
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: request.purpose === 'writing_feedback'
        ? '请根据已提交的写作快照生成 WritingFeedbackV2。'
        : request.userInput,
    },
  ]
}

function writingSubmissionForRequest(
  request: ReadOnlyAiExecutionRequest,
): WritingSubmissionV2 | undefined {
  if (request.purpose !== 'writing_feedback') return undefined
  const data = request.snapshot.data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AiGatewayError('INVALID_REQUEST', '本次写作提交格式无效，请重新填写后再试。')
  }
  try {
    return parseWritingSubmissionV2((data as Record<string, unknown>).submission)
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
    NOT_CONFIGURED: '当前环境尚未连接 Lexi 内置 AI。',
    UNAUTHORIZED: '请先登录 Lexi 账号，再使用内置 AI。',
    FORBIDDEN: '当前账号暂时无法使用 Lexi 内置 AI。',
    RATE_LIMITED: retryAfterSeconds
      ? `AI 使用较频繁，请在 ${retryAfterSeconds} 秒后重试。`
      : 'AI 使用较频繁，请稍后再试。',
    INVALID_REQUEST: '本次 AI 请求无效，请刷新学习数据后重试。',
    PAYLOAD_TOO_LARGE: '本次分析数据过大，请缩短分析范围后重试。',
    PROVIDER_ERROR: 'AI 服务商暂时没有响应，请稍后再试。',
    NETWORK_ERROR: '无法连接 Lexi 内置 AI，请检查网络后重试。',
    SERVICE_UNAVAILABLE: 'Lexi 内置 AI 暂时不可用，请稍后再试。',
    TIMEOUT: 'AI 分析等待超时，请稍后重试。',
    INVALID_RESPONSE: 'AI 返回了无法识别的结果，请稍后重试。',
    CANCELLED: 'AI 分析已取消。',
    LOCAL_DATA_UNBOUND: '使用内置 AI 前，请先确认本机学习记录属于当前 Lexi 账号。',
    LOCAL_DATA_ACCOUNT_MISMATCH: '本机学习记录属于另一个 Lexi 账号，内置 AI 已停止发送。',
    LOCAL_DATA_BINDING_UNAVAILABLE: '无法安全确认本机学习记录归属，内置 AI 已停止发送。请按账号面板中的恢复步骤处理。',
  }
  return new AiGatewayError(mappedCode, messages[mappedCode], retryable, undefined, retryAfterSeconds)
}

export async function executeReadOnlyAi<TPurpose extends ManagedAiPurpose>(
  request: ReadOnlyAiExecutionRequest<TPurpose>,
  dependencies: ReadOnlyAiExecutionDependencies = {},
): Promise<ReadOnlyAiExecutionResult<TPurpose>> {
  const aiState = useAIStore.getState()
  const routeMode = dependencies.routeMode ?? aiState.routeMode
  const writingSubmission = writingSubmissionForRequest(request)

  if (routeMode === 'custom') {
    const customApiKey = dependencies.customApiKey ?? aiState.apiKey
    if (!customApiKey.trim()) throw new AiGatewayError('NOT_CONFIGURED', '请先在高级设置中配置自定义 AI。')
    const rawContent = await (dependencies.customExecutor ?? collectCustomReadOnlyResponse)(
      buildCustomMessages(request),
      { signal: request.signal },
    )
    let content: AiStructuredContentForPurpose<TPurpose>
    try {
      content = parseStructuredAiOutputJson(rawContent, request.purpose, writingSubmission)
    } catch {
      throw new AiGatewayError(
        'INVALID_RESPONSE',
        '自定义 AI 返回的结果不符合当前分析格式，请重试或检查模型设置。',
        true,
      )
    }
    return { source: 'custom', content, warnings: [] }
  }

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
