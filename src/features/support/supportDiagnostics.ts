import type { SupportDiagnostics } from './supportTypes'

export type TrackerSupportDiagnosticsContext = {
  page: string
  theme: 'light' | 'dark' | 'system'
  syncStatus?: string
  syncPending?: number
  currentFlow?: string
}

export type SupportDiagnosticsPreviewItem = {
  label: string
  value: string
}

function bounded(value: unknown, fallback: string, maximum = 80): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized ? normalized.slice(0, maximum) : fallback
}

function browserFamily(userAgent: string): string {
  if (/Edg\//i.test(userAgent)) return 'Edge'
  if (/OPR\//i.test(userAgent)) return 'Opera'
  if (/CriOS\//i.test(userAgent)) return 'Chrome iOS'
  if (/Chrome\//i.test(userAgent)) return 'Chrome'
  if (/FxiOS\//i.test(userAgent)) return 'Firefox iOS'
  if (/Firefox\//i.test(userAgent)) return 'Firefox'
  if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) return 'Safari'
  return '其他浏览器'
}

function osFamily(userAgent: string, platform: string): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS / iPadOS'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/Macintosh|MacIntel|MacPPC|Mac68K/i.test(`${userAgent} ${platform}`)) return 'macOS'
  if (/Linux/i.test(userAgent)) return 'Linux'
  return '其他系统'
}

function resolvedTheme(theme: TrackerSupportDiagnosticsContext['theme']): 'light' | 'dark' {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light'
}

function buildDetails() {
  return {
    appVersion: bounded(import.meta.env.VITE_APP_VERSION, 'Tracker', 24),
    buildSha: bounded(
      import.meta.env.VITE_CF_PAGES_COMMIT_SHA
        || import.meta.env.VITE_GIT_COMMIT_SHA
        || import.meta.env.VITE_APP_BUILD_SHA,
      '本地构建',
      48,
    ),
  }
}

/**
 * Collects a compact and inspectable opt-in diagnostic snapshot. This helper
 * intentionally does not access cookies, local/session storage, account data,
 * learning records, free-text notes or the full user-agent string.
 */
export function collectTrackerSupportDiagnostics(
  context: TrackerSupportDiagnosticsContext,
): SupportDiagnostics {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform
  const locale = typeof navigator === 'undefined' ? '未知' : bounded(navigator.language, '未知', 24)
  let timezone = '未知'
  try {
    timezone = bounded(Intl.DateTimeFormat().resolvedOptions().timeZone, '未知', 48)
  } catch {
    // Privacy-focused browsers can intentionally restrict this value.
  }

  const build = buildDetails()
  return {
    appVersion: build.appVersion,
    buildSha: build.buildSha,
    page: bounded(context.page, 'unknown', 40),
    theme: resolvedTheme(context.theme),
    online: typeof navigator === 'undefined' ? false : navigator.onLine,
    viewport: {
      width: typeof window === 'undefined' ? 0 : Math.max(0, Math.round(window.innerWidth)),
      height: typeof window === 'undefined' ? 0 : Math.max(0, Math.round(window.innerHeight)),
    },
    browser: browserFamily(userAgent),
    os: osFamily(userAgent, platform),
    locale,
    timezone,
    // The support center must not imply a cloud-sync state that the current
    // Tracker runtime has not supplied. A future sync store can pass its exact
    // state through this explicit context field.
    syncStatus: bounded(context.syncStatus, 'unavailable', 32),
    syncPending: Number.isFinite(context.syncPending)
      ? Math.max(0, Math.min(9999, Math.round(context.syncPending || 0)))
      : 0,
    currentFlow: bounded(context.currentFlow, 'settings', 48),
  }
}

export function supportDiagnosticsPreview(
  diagnostics: SupportDiagnostics,
): SupportDiagnosticsPreviewItem[] {
  return [
    { label: '构建版本', value: `${diagnostics.appVersion} · ${diagnostics.buildSha}` },
    { label: '所在页面', value: diagnostics.page },
    { label: '主题与网络', value: `${diagnostics.theme === 'dark' ? '深色' : '浅色'} · ${diagnostics.online ? '在线' : '离线'}` },
    { label: '窗口大小', value: `${diagnostics.viewport.width} × ${diagnostics.viewport.height}` },
    { label: '浏览器与系统', value: `${diagnostics.browser} · ${diagnostics.os}` },
    { label: '语言与时区', value: `${diagnostics.locale} · ${diagnostics.timezone}` },
    { label: '同步状态', value: `${diagnostics.syncStatus} · 待同步 ${diagnostics.syncPending}` },
    { label: '当前流程', value: diagnostics.currentFlow },
  ]
}
