export const CUSTOM_AI_PROVIDER_PRESET_IDS = [
  'agnes',
  'deepseek',
  'openai-compatible',
] as const

export type CustomAiProviderPresetId = (typeof CUSTOM_AI_PROVIDER_PRESET_IDS)[number]

export interface CustomAiProviderPreset {
  id: CustomAiProviderPresetId
  label: string
  description: string
  keyPlaceholder: string
  baseURL: string
  model: string
  editableConnection: boolean
}

/**
 * Device-only Custom AI presets. Managed AI routing must never read or serialize
 * this registry; its provider credentials and model selection stay server-side.
 */
export const CUSTOM_AI_PROVIDER_PRESETS = {
  agnes: {
    id: 'agnes',
    label: 'Agnes 2.0 Flash',
    description: '使用 Agnes 的 OpenAI-compatible 接口。',
    keyPlaceholder: '输入 Agnes API Key',
    baseURL: 'https://apihub.agnes-ai.com/v1',
    model: 'agnes-2.0-flash',
    editableConnection: false,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek V4 Flash',
    description: '使用 DeepSeek 官方 OpenAI-compatible 接口。',
    keyPlaceholder: '输入 DeepSeek API Key',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    editableConnection: false,
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: '通用 OpenAI-compatible',
    description: '连接其他兼容 Chat Completions 的 HTTPS 服务。',
    keyPlaceholder: '输入服务商 API Key',
    baseURL: '',
    model: '',
    editableConnection: true,
  },
} as const satisfies Record<CustomAiProviderPresetId, CustomAiProviderPreset>

export const CUSTOM_AI_PROVIDER_PRESET_OPTIONS = CUSTOM_AI_PROVIDER_PRESET_IDS.map(
  (id) => CUSTOM_AI_PROVIDER_PRESETS[id],
)

export const DEFAULT_CUSTOM_AI_PROVIDER_PRESET_ID: CustomAiProviderPresetId = 'agnes'

export function isCustomAiProviderPresetId(value: unknown): value is CustomAiProviderPresetId {
  return typeof value === 'string'
    && (CUSTOM_AI_PROVIDER_PRESET_IDS as readonly string[]).includes(value)
}

export function getCustomAiProviderPreset(
  id: CustomAiProviderPresetId,
): CustomAiProviderPreset {
  return CUSTOM_AI_PROVIDER_PRESETS[id]
}

export function inferCustomAiProviderPreset(
  baseURL: unknown,
  model: unknown,
): CustomAiProviderPresetId {
  const normalizedURL = typeof baseURL === 'string' ? baseURL.trim().toLowerCase() : ''
  const normalizedModel = typeof model === 'string' ? model.trim().toLowerCase() : ''

  if (normalizedURL.includes('agnes-ai.com') || normalizedModel.startsWith('agnes-')) {
    return 'agnes'
  }
  if (normalizedURL.includes('deepseek.com') || normalizedModel.startsWith('deepseek-')) {
    return 'deepseek'
  }
  return 'openai-compatible'
}
