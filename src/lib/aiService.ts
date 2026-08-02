import { useAIStore } from '@/stores/aiStore'
import { createCurrentLearningContext } from '@/ai/runtimeContext'

/** @deprecated Prefer a purpose-specific snapshot from createCurrentLearningContext. */
export function getAllLearningData() {
  return createCurrentLearningContext({ purpose: 'learning_analysis' }).data
}

// ===== AI 对话消息类型 =====
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AIStreamCallbacks {
  onContent?: (content: string) => void
  onToolCall?: (toolCall: ToolCall) => void
  onError?: (error: string) => void
  onDone?: () => void
}

export class AIConnectionConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIConnectionConfigError'
  }
}

export function normalizeOpenAICompatibleBaseURL(value: string): string {
  const input = value.trim()
  if (!input) throw new AIConnectionConfigError('请填写 API 地址。')
  if (input.length > 2_048) throw new AIConnectionConfigError('API 地址过长，请检查后重试。')

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new AIConnectionConfigError('API 地址格式无效，请填写完整的 HTTPS 地址。')
  }

  if (url.protocol !== 'https:') {
    throw new AIConnectionConfigError('为保护 API Key，自定义 AI 只允许使用 HTTPS 地址。')
  }
  if (url.username || url.password) {
    throw new AIConnectionConfigError('API 地址不能包含用户名或密码。')
  }
  if (url.search || url.hash) {
    throw new AIConnectionConfigError('API 地址不能包含查询参数或页面锚点。')
  }

  let pathname = url.pathname.replace(/\/+$/, '')
  if (pathname.endsWith('/chat/completions')) {
    pathname = pathname.slice(0, -'/chat/completions'.length)
  }
  url.pathname = pathname || '/'

  const normalizedPath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
  return `${url.origin}${normalizedPath}`
}

export function buildOpenAICompatibleChatCompletionsURL(baseURL: string): string {
  return `${normalizeOpenAICompatibleBaseURL(baseURL)}/chat/completions`
}

interface CustomAIConnection {
  apiKey: string
  baseURL: string
  model: string
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
  })
}

function readCustomAIConnection(): CustomAIConnection {
  const state = useAIStore.getState()
  const apiKey = state.apiKey.trim()
  const model = state.model.trim()

  if (!apiKey) throw new AIConnectionConfigError('请先在 AI 高级设置中填写自定义 AI 的 API Key。')
  if (apiKey.length > 4_096 || containsControlCharacter(apiKey)) {
    throw new AIConnectionConfigError('API Key 格式无效，请检查后重试。')
  }
  if (!model) throw new AIConnectionConfigError('请填写要使用的模型名称。')
  if (model.length > 200 || containsControlCharacter(model)) {
    throw new AIConnectionConfigError('模型名称格式无效，请检查后重试。')
  }

  return {
    apiKey,
    baseURL: normalizeOpenAICompatibleBaseURL(state.baseURL),
    model,
  }
}

export function customAIHttpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return `API 错误 (${status})：凭证无效或没有访问权限。`
  if (status === 404) return 'API 错误 (404)：接口地址或模型不可用。'
  if (status === 408 || status === 504) return `API 错误 (${status})：服务商响应超时，请稍后重试。`
  if (status === 413) return 'API 错误 (413)：本次请求内容过大。'
  if (status === 429) return 'API 错误 (429)：调用过于频繁或已达服务商限额。'
  if (status >= 500) return `API 错误 (${status})：服务商暂时无法完成请求。`
  return `API 错误 (${status})：自定义 AI 无法完成请求。`
}

function safeCustomAINetworkMessage(): string {
  return '无法连接自定义 AI，请检查网络、API 地址与服务商的浏览器跨域支持。'
}

// ===== 调用 OpenAI-compatible 自定义 AI（流式） =====
export async function streamAIChat(
  messages: AIMessage[],
  callbacks: AIStreamCallbacks,
  options?: { temperature?: number; max_tokens?: number; signal?: AbortSignal }
) {
  let connection: CustomAIConnection
  try {
    connection = readCustomAIConnection()
  } catch (error) {
    callbacks.onError?.(error instanceof AIConnectionConfigError ? error.message : safeCustomAINetworkMessage())
    return
  }

  try {
    const response = await fetch(buildOpenAICompatibleChatCompletionsURL(connection.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.apiKey}`,
      },
      signal: options?.signal,
      body: JSON.stringify({
        model: connection.model,
        messages,
        stream: true,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
      }),
    })

    if (!response.ok) {
      callbacks.onError?.(customAIHttpErrorMessage(response.status))
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError?.('无法读取响应')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let currentContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const data = JSON.parse(trimmed.slice(6))
          const delta = data.choices?.[0]?.delta
          if (!delta) continue

          // 文本内容
          if (delta.content) {
            currentContent += delta.content
            callbacks.onContent?.(currentContent)
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                callbacks.onToolCall?.({
                  id: tc.id || '',
                  type: 'function',
                  function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                  },
                })
              }
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    callbacks.onDone?.()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      callbacks.onError?.('流式生成已中断')
      return
    }
    callbacks.onError?.(safeCustomAINetworkMessage())
  }
}

// ===== 非流式调用（用于简单请求） =====
export async function chatAI(messages: AIMessage[], options?: { temperature?: number; max_tokens?: number }) {
  const connection = readCustomAIConnection()

  let response: Response
  try {
    response = await fetch(buildOpenAICompatibleChatCompletionsURL(connection.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.apiKey}`,
      },
      body: JSON.stringify({
        model: connection.model,
        messages,
        stream: false,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
      }),
    })
  } catch {
    throw new Error(safeCustomAINetworkMessage())
  }

  if (!response.ok) {
    throw new Error(customAIHttpErrorMessage(response.status))
  }

  let data: { choices?: Array<{ message?: unknown }> }
  try {
    data = await response.json() as { choices?: Array<{ message?: unknown }> }
  } catch {
    throw new Error('自定义 AI 返回了无法识别的内容，请稍后重试。')
  }
  return data.choices?.[0]?.message
}

// ===== 检测 API 连接 =====
export async function testAIConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const connection = readCustomAIConnection()
    const response = await fetch(buildOpenAICompatibleChatCompletionsURL(connection.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connection.apiKey}`,
      },
      body: JSON.stringify({
        model: connection.model,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
        max_tokens: 5,
      }),
    })

    if (response.ok) {
      return { ok: true, message: '连接成功' }
    }
    return { ok: false, message: customAIHttpErrorMessage(response.status) }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof AIConnectionConfigError ? error.message : safeCustomAINetworkMessage(),
    }
  }
}
