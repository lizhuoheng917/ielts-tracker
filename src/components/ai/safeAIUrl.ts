function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) return true
  }
  return false
}

/**
 * AI output is untrusted. Only absolute HTTP(S) destinations may become links.
 * Relative URLs and all active/local protocols stay visible as text instead.
 */
export function sanitizeAIExternalUrl(value: string | undefined): string | undefined {
  if (!value || containsControlCharacter(value)) return undefined

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url.href
  } catch {
    return undefined
  }
}
