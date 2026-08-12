export const DEFAULT_LEXI_WORDS_URL = 'https://lexi-ielts.pages.dev'

export type LexiWordsLinkEnvironment = {
  wordsAppUrl?: unknown
  isDevelopment?: boolean
}

function configuredUrl(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  return value.trim()
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Resolves the public Lexi Words product root without accepting credentials,
 * query parameters or fragments from browser-visible deployment settings.
 * HTTP remains available only for a loopback development server.
 */
export function resolveLexiWordsUrl(
  environment: LexiWordsLinkEnvironment = {},
): string | null {
  const configured = configuredUrl(environment.wordsAppUrl)
  if (configured === null) return null

  try {
    const url = new URL(configured || DEFAULT_LEXI_WORDS_URL)
    const isSecureRemoteUrl = url.protocol === 'https:'
    const isAllowedLocalUrl = Boolean(environment.isDevelopment)
      && url.protocol === 'http:'
      && isLoopbackHost(url.hostname)

    if (!isSecureRemoteUrl && !isAllowedLocalUrl) return null
    if (url.username || url.password || url.search || url.hash) return null
    if (url.pathname !== '/' && url.pathname !== '') return null

    return url.toString()
  } catch {
    return null
  }
}
