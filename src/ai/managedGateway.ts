import type { AiResultEnvelope } from './contracts'
import type { AiStructuredContentV2 } from './structuredOutputs'
import { notifyManagedAiQuotaChanged } from './managedAiQuota'
import {
  inspectManagedAiDataBinding,
  type ManagedAiDataBindingState,
} from '@/auth/managedAiDataBinding'
import {
  AI_GATEWAY_FUNCTION_NAME,
  AiGatewayError,
  type AiGateway,
  type AiGatewayRequest,
  type AiGatewayWireRequestV1,
} from './gateway'
import { createAiGatewayWireRequest, parseAiGatewayResponse } from './gatewayValidation'

const DEFAULT_GATEWAY_TIMEOUT_MS = 30_000
// Writing feedback calls Agnes and can legitimately take longer than the
// short, snapshot-based assistant features. Standard feedback keeps the
// historical window; optional deep analysis allows one bounded server-side
// structure repair without making every AI interaction wait longer.
const DEFAULT_WRITING_GATEWAY_TIMEOUT_MS = 55_000
const DEFAULT_DEEP_WRITING_GATEWAY_TIMEOUT_MS = 95_000

function isDeepWritingRequest(request: AiGatewayRequest): boolean {
  if (request.purpose !== 'writing_feedback') return false
  const submission = request.snapshot.data.submission
  return typeof submission === 'object'
    && submission !== null
    && !Array.isArray(submission)
    && (submission as Record<string, unknown>).schemaVersion === 4
    && (submission as Record<string, unknown>).analysisMode === 'deep'
}

function timeoutForRequest(request: AiGatewayRequest, baseTimeoutMs: number): number {
  if (isDeepWritingRequest(request)) {
    return Math.max(baseTimeoutMs, DEFAULT_DEEP_WRITING_GATEWAY_TIMEOUT_MS)
  }
  return request.purpose === 'writing_feedback' || request.purpose === 'writing_revision_coach'
    ? Math.max(baseTimeoutMs, DEFAULT_WRITING_GATEWAY_TIMEOUT_MS)
    : baseTimeoutMs
}

interface InvokeOptions {
  body: AiGatewayWireRequestV1
  signal?: AbortSignal
  timeout: number
}

export interface VerifiedManagedAiIdentity {
  accountUserId: string
  accessToken: string
}

export interface ManagedAiGatewayTransport {
  getVerifiedIdentity: () => Promise<VerifiedManagedAiIdentity | null>
  invoke: (
    functionName: string,
    options: InvokeOptions,
    verifiedAccessToken: string,
  ) => Promise<{ data: unknown; error: unknown; response?: Response }>
}

export interface ManagedAiGatewayOptions {
  transport?: ManagedAiGatewayTransport
  inspectDataBinding?: (accountUserId: string) => ManagedAiDataBindingState
  timeoutMs?: number
  now?: () => Date
}

function retryAfterFromPayload(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const value = (payload as Record<string, unknown>).retryAfterSeconds
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 86_400
    ? value
    : undefined
}

function gatewayCodeFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const value = (payload as Record<string, unknown>).code
  return typeof value === 'string' ? value : undefined
}

function outcomeUnknownFromPayload(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false
  return (payload as Record<string, unknown>).outcomeUnknown === true
}

export function mapAiGatewayHttpStatus(status: number, payload?: unknown): AiGatewayError {
  const retryAfterSeconds = retryAfterFromPayload(payload)
  const outcomeUnknown = outcomeUnknownFromPayload(payload)
  const gatewayCode = gatewayCodeFromPayload(payload)
  if (status === 503 && gatewayCode === 'feature_unavailable') {
    return new AiGatewayError(
      'SERVICE_UNAVAILABLE',
      '此 AI 功能当前未开放。',
      false,
      status,
      undefined,
      outcomeUnknown,
    )
  }
  if (status === 502 && gatewayCode === 'generation_failed') {
    return new AiGatewayError(
      'INVALID_RESPONSE',
      '本次 AI 未生成可用结果，未保存且未计入额度。请重试。',
      true,
      status,
      undefined,
      outcomeUnknown,
    )
  }
  if (status === 422 && gatewayCode === 'prompt_recognition_failed') {
    return new AiGatewayError(
      'PROMPT_RECOGNITION_FAILED',
      '未能从图片中可靠识别写作题目，本次未计入 2 个额度单位。请换一张更清晰、完整的图片后重试。',
      false,
      status,
    )
  }
  if (status === 503 && gatewayCode === 'vision_route_unavailable') {
    return new AiGatewayError(
      'SERVICE_UNAVAILABLE',
      '当前写作模型暂不支持题目图片，本次未计入 2 个额度单位。你可以改用题目文字。',
      false,
      status,
    )
  }
  if (status === 400 || status === 422) {
    return new AiGatewayError('INVALID_REQUEST', '本次 AI 请求无效，请刷新学习数据后重试。', false, status, undefined, outcomeUnknown)
  }
  if (status === 401) {
    return new AiGatewayError('UNAUTHORIZED', '请先登录 Lexi 账号，再使用内置 AI。', false, status, undefined, outcomeUnknown)
  }
  if (status === 403) {
    return new AiGatewayError('FORBIDDEN', '当前账号暂时无法使用 Lexi 内置 AI。', false, status, undefined, outcomeUnknown)
  }
  if (status === 413) {
    return new AiGatewayError('PAYLOAD_TOO_LARGE', '本次分析数据过大，请缩短分析范围后重试。', false, status, undefined, outcomeUnknown)
  }
  if (status === 429) {
    return new AiGatewayError(
      'RATE_LIMITED',
      retryAfterSeconds
        ? '今日 AI 使用次数已用完，请在配额提示的重置时间后重试。'
        : 'AI 使用较频繁，请稍后再试。',
      true,
      status,
      retryAfterSeconds,
      outcomeUnknown,
    )
  }
  if (status === 502) {
    return new AiGatewayError('PROVIDER_ERROR', 'AI 服务商暂时没有响应；未生成可用结果不会计入额度。请稍后再试。', true, status, undefined, outcomeUnknown)
  }
  if (status === 504) {
    return new AiGatewayError('TIMEOUT', 'AI 分析等待超时，请稍后重试。', true, status, undefined, outcomeUnknown)
  }
  if (status === 404) {
    return new AiGatewayError('SERVICE_UNAVAILABLE', 'Lexi 内置 AI 尚未在当前环境启用。', true, status, undefined, outcomeUnknown)
  }
  if (status >= 500) {
    return new AiGatewayError('SERVICE_UNAVAILABLE', 'Lexi 内置 AI 暂时不可用，请稍后再试。', true, status, undefined, outcomeUnknown)
  }
  return new AiGatewayError('INVALID_REQUEST', 'Lexi 内置 AI 无法处理本次请求。', false, status, undefined, outcomeUnknown)
}

async function safeResponsePayload(response: Response | undefined): Promise<unknown> {
  if (!response) return undefined
  try {
    return await response.clone().json()
  } catch {
    return undefined
  }
}

async function mapInvokeError(
  error: unknown,
  response: Response | undefined,
  callerSignal: AbortSignal | undefined,
): Promise<AiGatewayError> {
  const {
    FunctionsFetchError,
    FunctionsHttpError,
    FunctionsRelayError,
  } = await import('@supabase/supabase-js')
  if (callerSignal?.aborted) {
    return new AiGatewayError('CANCELLED', '已停止等待 AI 结果。', false, undefined, undefined, true)
  }
  if (error instanceof FunctionsHttpError) {
    const context = error.context instanceof Response ? error.context : response
    return mapAiGatewayHttpStatus(context?.status ?? 500, await safeResponsePayload(context))
  }
  if (error instanceof FunctionsRelayError) {
    const context = error.context instanceof Response ? error.context : response
    return mapAiGatewayHttpStatus(context?.status ?? 503)
  }
  if (error instanceof FunctionsFetchError) {
    const cause = error.context
    if (
      (typeof DOMException !== 'undefined' && cause instanceof DOMException && cause.name === 'AbortError') ||
      (typeof cause === 'object' && cause !== null && (cause as { name?: unknown }).name === 'AbortError')
    ) {
      return new AiGatewayError('TIMEOUT', 'AI 分析等待超时；若未生成可用结果，临时占用的额度会自动恢复。', true, 504, undefined, true)
    }
    return new AiGatewayError('NETWORK_ERROR', '无法连接 Lexi 内置 AI；若未生成可用结果，临时占用的额度会自动恢复。请检查网络后重试。', true, undefined, undefined, true)
  }
  return new AiGatewayError('SERVICE_UNAVAILABLE', 'Lexi 内置 AI 暂时不可用，请稍后再试。', true, undefined, undefined, true)
}

const supabaseTransport: ManagedAiGatewayTransport = {
  getVerifiedIdentity: async () => {
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) throw new AiGatewayError('NOT_CONFIGURED', '当前环境尚未连接 Lexi 内置 AI。')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) return null
      const accessToken = sessionData.session.access_token
      const { data, error } = await supabase.auth.getUser(accessToken)
      if (error) {
        const status = typeof error.status === 'number' ? error.status : undefined
        if (status === 401 || status === 403) return null
        throw new AiGatewayError(
          'NETWORK_ERROR',
          '暂时无法向账号服务确认当前身份，请稍后重试。',
          true,
          status,
        )
      }
      if (!data.user) return null
      return { accountUserId: data.user.id, accessToken }
    } catch (error) {
      if (error instanceof AiGatewayError) throw error
      throw new AiGatewayError('NETWORK_ERROR', '暂时无法向账号服务确认当前身份，请稍后重试。', true)
    }
  },
  invoke: async (functionName, options, verifiedAccessToken) => {
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) throw new AiGatewayError('NOT_CONFIGURED', '当前环境尚未连接 Lexi 内置 AI。')
    return supabase.functions.invoke(functionName, {
      ...options,
      // Pin invocation to the exact token that getUser(accessToken) verified.
      // The token is transport-only and never enters the JSON wire contract.
      headers: { Authorization: `Bearer ${verifiedAccessToken}` },
    })
  },
}

export class ManagedAiGateway implements AiGateway {
  private readonly transport: ManagedAiGatewayTransport
  private readonly inspectDataBinding: (accountUserId: string) => ManagedAiDataBindingState
  private readonly timeoutMs: number
  private readonly now: () => Date

  constructor(options: ManagedAiGatewayOptions = {}) {
    this.transport = options.transport ?? supabaseTransport
    this.inspectDataBinding = options.inspectDataBinding ?? inspectManagedAiDataBinding
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GATEWAY_TIMEOUT_MS
    this.now = options.now ?? (() => new Date())
  }

  async execute(
    request: AiGatewayRequest,
  ): Promise<AiResultEnvelope<AiStructuredContentV2>> {
    const wire = createAiGatewayWireRequest(request, this.now())
    const identity = await this.transport.getVerifiedIdentity()
    if (!identity) {
      throw new AiGatewayError('UNAUTHORIZED', '请先登录 Lexi 账号，再使用内置 AI。', false, 401)
    }

    const binding = this.inspectDataBinding(identity.accountUserId)
    if (binding.status === 'unbound') {
      throw new AiGatewayError(
        'LOCAL_DATA_UNBOUND',
        '使用内置 AI 前，请先在 Lexi 账号面板确认本机学习记录属于当前账号。',
      )
    }
    if (binding.status === 'mismatch') {
      throw new AiGatewayError(
        'LOCAL_DATA_ACCOUNT_MISMATCH',
        '为避免把其他账号的本机学习记录误发给 AI，内置 AI 已暂停。请切回原账号，或确认无需保留这些记录后清空本机数据。',
      )
    }
    if (binding.status === 'invalid' || binding.status === 'unavailable') {
      throw new AiGatewayError(
        'LOCAL_DATA_BINDING_UNAVAILABLE',
        binding.status === 'invalid'
          ? '本机账号归属信息异常，内置 AI 已暂停。请重新登录后重试；若仍无法恢复，请确认无需保留后清空本机数据。'
          : '暂时无法确认本机学习记录的账号归属，内置 AI 已暂停。请稍后重试；本机学习不受影响。',
      )
    }

    let result: { data: unknown; error: unknown; response?: Response }
    try {
      result = await this.transport.invoke(AI_GATEWAY_FUNCTION_NAME, {
        body: wire,
        signal: request.signal,
        timeout: timeoutForRequest(request, this.timeoutMs),
      }, identity.accessToken)
    } catch (error) {
      if (error instanceof AiGatewayError) throw error
      throw await mapInvokeError(error, undefined, request.signal)
    } finally {
      // A reservation can be consumed even if a provider call later fails or
      // the browser times out. Open dialogs refresh their own small preview.
      notifyManagedAiQuotaChanged(request.purpose)
    }
    if (result.error) throw await mapInvokeError(result.error, result.response, request.signal)
    return parseAiGatewayResponse(result.data, wire)
  }
}

export const managedAiGateway = new ManagedAiGateway()
