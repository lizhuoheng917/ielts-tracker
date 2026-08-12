import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LEXI_WORDS_URL,
  resolveLexiWordsUrl,
} from './productLinks'

describe('Lexi Words product link', () => {
  it('uses the reviewed Words production root when no override is configured', () => {
    expect(resolveLexiWordsUrl()).toBe(`${DEFAULT_LEXI_WORDS_URL}/`)
  })

  it('accepts a secure product root and loopback HTTP only during development', () => {
    expect(resolveLexiWordsUrl({ wordsAppUrl: 'https://words.lexi.example' })).toBe(
      'https://words.lexi.example/',
    )
    expect(resolveLexiWordsUrl({
      wordsAppUrl: 'http://127.0.0.1:5192',
      isDevelopment: true,
    })).toBe('http://127.0.0.1:5192/')
    expect(resolveLexiWordsUrl({ wordsAppUrl: 'http://words.example' })).toBeNull()
  })

  it('fails closed for credentials, deep paths, parameters and unsafe schemes', () => {
    for (const wordsAppUrl of [
      'https://user:password@words.example',
      'https://words.example/study',
      'https://words.example/?token=secret',
      'https://words.example/#study',
      'javascript:alert(1)',
      '//words.example',
    ]) {
      expect(resolveLexiWordsUrl({ wordsAppUrl, isDevelopment: true })).toBeNull()
    }
  })
})
