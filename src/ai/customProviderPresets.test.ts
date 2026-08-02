import { describe, expect, it } from 'vitest'

import {
  CUSTOM_AI_PROVIDER_PRESET_OPTIONS,
  CUSTOM_AI_PROVIDER_PRESETS,
  inferCustomAiProviderPreset,
} from './customProviderPresets'

describe('Custom AI provider presets', () => {
  it('keeps the reviewed provider URLs and model names in one registry', () => {
    expect(CUSTOM_AI_PROVIDER_PRESET_OPTIONS.map((preset) => preset.id)).toEqual([
      'agnes',
      'deepseek',
      'openai-compatible',
    ])
    expect(CUSTOM_AI_PROVIDER_PRESETS.agnes).toMatchObject({
      baseURL: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-2.0-flash',
      editableConnection: false,
    })
    expect(CUSTOM_AI_PROVIDER_PRESETS.deepseek).toMatchObject({
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      editableConnection: false,
    })
    expect(CUSTOM_AI_PROVIDER_PRESETS['openai-compatible']).toMatchObject({
      baseURL: '',
      model: '',
      editableConnection: true,
    })
  })

  it('recognizes legacy fixed-provider settings without treating arbitrary hosts as managed routes', () => {
    expect(inferCustomAiProviderPreset('https://apihub.agnes-ai.com/v1', 'agnes-2.0-flash')).toBe('agnes')
    expect(inferCustomAiProviderPreset('https://api.deepseek.com', 'deepseek-v4-flash')).toBe('deepseek')
    expect(inferCustomAiProviderPreset('https://gateway.example.test/v1', 'organization/model')).toBe('openai-compatible')
  })
})
