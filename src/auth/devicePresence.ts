import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { requireSupabase } from '@/lib/supabase'

const DEVICE_PRESENCE_KEY = 'lexi-tracker-device-presence-v1'
const HEARTBEAT_MS = 60_000
const FOREGROUND_PRESENCE_DELAY_MS = 900
const MINIMUM_PRESENCE_REFRESH_GAP_MS = 15_000
export const ACTIVE_DEVICE_WINDOW_MS = 150_000

export type UserDevice = {
  deviceId: string
  deviceName: string
  deviceType: 'phone' | 'tablet' | 'computer' | 'other'
  browserName: string
  osName: string
  firstSeenAt: string
  lastSeenAt: string
  current: boolean
  active: boolean
}

type DeviceDescription = Pick<UserDevice, 'deviceName' | 'deviceType' | 'browserName' | 'osName'> & {
  userAgent: string
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tracker-device-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * This is a per-browser installation id, not a fingerprint. It lets the
 * shared Lexi account show recent Tracker sessions without exposing hardware
 * identifiers or trying to correlate browser installations across products.
 */
export function getTrackerPresenceDeviceId(storage: Storage | null = browserStorage()): string {
  if (!storage) return createDeviceId()
  const existing = storage.getItem(DEVICE_PRESENCE_KEY)
  if (existing) return existing
  const created = createDeviceId()
  storage.setItem(DEVICE_PRESENCE_KEY, created)
  return created
}

export function clearTrackerPresenceDeviceId(storage: Storage | null = browserStorage()): void {
  storage?.removeItem(DEVICE_PRESENCE_KEY)
}

function describeCurrentDevice(): DeviceDescription {
  const userAgent = navigator.userAgent.slice(0, 1000)
  const ipad = /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
  const iphone = /iPhone|iPod/i.test(userAgent)
  const android = /Android/i.test(userAgent)
  const androidPhone = android && /Mobile/i.test(userAgent)
  const deviceType: UserDevice['deviceType'] = iphone || androidPhone
    ? 'phone'
    : ipad || android
      ? 'tablet'
      : /Windows|Macintosh|Linux/i.test(userAgent)
        ? 'computer'
        : 'other'
  const osName = ipad || iphone
    ? 'iOS'
    : android
      ? 'Android'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : '未知系统'
  const browserName = /MicroMessenger/i.test(userAgent)
    ? '微信浏览器'
    : /Edg\//i.test(userAgent)
      ? 'Edge'
      : /OPR\//i.test(userAgent)
        ? 'Opera'
        : /CriOS|Chrome\//i.test(userAgent)
          ? 'Chrome'
          : /FxiOS|Firefox\//i.test(userAgent)
            ? 'Firefox'
            : /Safari\//i.test(userAgent)
              ? 'Safari'
              : '浏览器'
  const hardwareName = iphone
    ? 'iPhone'
    : ipad
      ? 'iPad'
      : androidPhone
        ? 'Android 手机'
        : android
          ? 'Android 平板'
          : osName === 'macOS'
            ? 'Mac'
            : osName === 'Windows'
              ? 'Windows 电脑'
              : osName === 'Linux'
                ? 'Linux 电脑'
                : '当前设备'
  return {
    deviceName: `${hardwareName} · ${browserName}`,
    deviceType,
    browserName,
    osName,
    userAgent,
  }
}

function deviceFromRow(row: Record<string, unknown>, currentDeviceId: string): UserDevice {
  const lastSeenAt = String(row.last_seen_at || '')
  const lastSeenTime = new Date(lastSeenAt).getTime()
  return {
    deviceId: String(row.device_id || ''),
    deviceName: String(row.device_name || '未知设备'),
    deviceType: row.device_type === 'phone' || row.device_type === 'tablet' || row.device_type === 'computer'
      ? row.device_type
      : 'other',
    browserName: String(row.browser_name || '浏览器'),
    osName: String(row.os_name || '未知系统'),
    firstSeenAt: String(row.first_seen_at || ''),
    lastSeenAt,
    current: row.device_id === currentDeviceId,
    active: Number.isFinite(lastSeenTime) && Date.now() - lastSeenTime <= ACTIVE_DEVICE_WINDOW_MS,
  }
}

export function useDevicePresence(userId?: string) {
  const [devices, setDevices] = useState<UserDevice[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const [error, setError] = useState('')
  const currentDeviceId = useMemo(() => getTrackerPresenceDeviceId(), [])
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const lastPresenceRefreshAt = useRef(0)

  const refresh = useCallback((touchCurrent = true) => {
    if (!userId) return Promise.resolve()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false)
      return Promise.resolve()
    }
    if (refreshInFlight.current) return refreshInFlight.current

    const task = (async () => {
      try {
        const client = requireSupabase()
        if (touchCurrent) {
          const description = describeCurrentDevice()
          const { error: upsertError } = await client.from('user_devices').upsert({
            user_id: userId,
            device_id: currentDeviceId,
            device_name: description.deviceName,
            device_type: description.deviceType,
            browser_name: description.browserName,
            os_name: description.osName,
            user_agent: description.userAgent,
            last_seen_at: new Date().toISOString(),
          }, { onConflict: 'user_id,device_id' })
          if (upsertError) throw upsertError
          lastPresenceRefreshAt.current = Date.now()
        }
        const { data, error: selectError } = await client
          .from('user_devices')
          .select('device_id,device_name,device_type,browser_name,os_name,first_seen_at,last_seen_at')
          .order('last_seen_at', { ascending: false })
        if (selectError) throw selectError
        setDevices((data || []).map((row) => deviceFromRow(row, currentDeviceId)))
        setError('')
      } catch {
        // Device names are a convenience. Do not surface provider internals in
        // the personal center if this low-priority request fails.
        setError('暂时无法读取设备状态，请稍后重试。')
      } finally {
        setLoading(false)
      }
    })()
    refreshInFlight.current = task
    void task.finally(() => {
      if (refreshInFlight.current === task) refreshInFlight.current = null
    })
    return task
  }, [currentDeviceId, userId])

  useEffect(() => {
    if (!userId) {
      setDevices([])
      setLoading(false)
      setError('')
      return
    }

    setLoading(true)
    void refresh(true)
    let foregroundTimer: number | undefined
    const scheduleForegroundRefresh = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastPresenceRefreshAt.current < MINIMUM_PRESENCE_REFRESH_GAP_MS) return
      if (foregroundTimer !== undefined) window.clearTimeout(foregroundTimer)
      foregroundTimer = window.setTimeout(() => {
        foregroundTimer = undefined
        if (
          document.visibilityState === 'visible'
          && Date.now() - lastPresenceRefreshAt.current >= MINIMUM_PRESENCE_REFRESH_GAP_MS
        ) {
          void refresh(true)
        }
      }, FOREGROUND_PRESENCE_DELAY_MS)
    }
    const heartbeat = window.setInterval(() => {
      if (
        document.visibilityState === 'visible'
        && Date.now() - lastPresenceRefreshAt.current >= HEARTBEAT_MS
      ) {
        void refresh(true)
      }
    }, HEARTBEAT_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (foregroundTimer !== undefined) window.clearTimeout(foregroundTimer)
        foregroundTimer = undefined
        return
      }
      scheduleForegroundRefresh()
    }
    const onOnline = () => scheduleForegroundRefresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(heartbeat)
      if (foregroundTimer !== undefined) window.clearTimeout(foregroundTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh, userId])

  return {
    devices,
    activeDevices: devices.filter((device) => device.active),
    currentDeviceId,
    loading,
    error,
    refresh: () => refresh(true),
  }
}

export async function removeCurrentDevicePresence(userId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  const { error } = await requireSupabase()
    .from('user_devices')
    .delete()
    .eq('user_id', userId)
    .eq('device_id', getTrackerPresenceDeviceId())
  if (error) throw error
}
