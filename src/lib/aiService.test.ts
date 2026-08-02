import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const memoryStorage = new MemoryStorage()
const MESSAGES = [{ role: 'user' as const, content: 'Hello' }]

let useAIStore: typeof import('@/stores/aiStore').useAIStore
let AIConnectionConfigError: typeof import('./aiService').AIConnectionConfigError
let buildOpenAICompatibleChatCompletionsURL: typeof import('./aiService').buildOpenAICompatibleChatCompletionsURL
let chatAI: typeof import('./aiService').chatAI
let customAIHttpErrorMessage: typeof import('./aiService').customAIHttpErrorMessage
let normalizeOpenAICompatibleBaseURL: typeof import('./aiService').normalizeOpenAICompatibleBaseURL
let streamAIChat: typeof import('./aiService').streamAIChat
let testAIConnection: typeof import('./aiService').testAIConnection

beforeAll(async () => {
  vi.stubGlobal('localStorage', memoryStorage)
  ;({ useAIStore } = await import('@/stores/aiStore'))
  ;({
    AIConnectionConfigError,
    buildOpenAICompatibleChatCompletionsURL,
    chatAI,
    customAIHttpErrorMessage,
    normalizeOpenAICompatibleBaseURL,
    streamAIChat,
    testAIConnection,
  } = await import('./aiService'))
})

function configureGenericConnection() {
  useAIStore.setState({
    routeMode: 'custom',
    providerPreset: 'openai-compatible',
    apiKey: '  device-secret  ',
    baseURL: 'https://gateway.example.test/openai/v1/chat/completions/',
    model: '  organization/model  ',
  })
}

describe('OpenAI-compatible Custom AI transport', () => {
  beforeEach(() => {
    memoryStorage.clear()
    useAIStore.getState().clearConfig()
    configureGenericConnection()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', memoryStorage)
    vi.restoreAllMocks()
  })

  it('normalizes a base URL or complete Chat Completions URL exactly once', () => {
    expect(normalizeOpenAICompatibleBaseURL(' https://EXAMPLE.test/v1/// ')).toBe('https://example.test/v1')
    expect(buildOpenAICompatibleChatCompletionsURL(
      'https://example.test/v1/chat/completions/',
    )).toBe('https://example.test/v1/chat/completions')
  })

  it.each([
    'http://example.test/v1',
    'https://user:password@example.test/v1',
    'https://example.test/v1?token=secret',
    'https://example.test/v1#fragment',
    'not-a-url',
  ])('rejects unsafe or malformed endpoint %s', (value) => {
    expect(() => normalizeOpenAICompatibleBaseURL(value)).toThrow(AIConnectionConfigError)
  })

  it('sends the normalized URL, trimmed key and selected model', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Hi' } }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(chatAI(MESSAGES)).resolves.toEqual({ role: 'assistant', content: 'Hi' })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gateway.example.test/openai/v1/chat/completions')
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer device-secret' }))
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'organization/model',
      stream: false,
    })
  })

  it('maps provider failures without reading or exposing the raw response body', async () => {
    const rawBody = vi.fn(async () => 'upstream secret diagnostics and private route')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      text: rawBody,
    } as unknown as Response)))

    await expect(chatAI(MESSAGES)).rejects.toThrow('凭证无效')
    await expect(testAIConnection()).resolves.toEqual({
      ok: false,
      message: 'API 错误 (401)：凭证无效或没有访问权限。',
    })
    expect(rawBody).not.toHaveBeenCalled()
  })

  it('does not expose a rejected fetch URL or provider diagnostic to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('request to https://secret-provider.example/private failed')
    }))

    await expect(testAIConnection()).resolves.toEqual({
      ok: false,
      message: '无法连接自定义 AI，请检查网络、API 地址与服务商的浏览器跨域支持。',
    })
    await expect(chatAI(MESSAGES)).rejects.not.toThrow('secret-provider.example')

    const onError = vi.fn()
    await streamAIChat(MESSAGES, { onError })
    expect(onError).toHaveBeenCalledWith(expect.not.stringContaining('secret-provider.example'))
  })

  it('keeps public error messages stable across common HTTP failures', () => {
    expect(customAIHttpErrorMessage(404)).toContain('接口地址或模型不可用')
    expect(customAIHttpErrorMessage(429)).toContain('服务商限额')
    expect(customAIHttpErrorMessage(502)).toContain('服务商暂时无法')
  })
})
