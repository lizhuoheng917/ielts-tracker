import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useSettingsStore } from '@/stores/settingsStore'
import { useEffect } from 'react'
import { appRoutes } from '@/app/navigation'
import { NotFoundRoute } from '@/components/navigation/NotFoundRoute'
import { AiArtifactAccessBridge } from '@/components/ai/AiArtifactAccessBridge'
import { TrackerShadowSyncBridge } from '@/components/sync/TrackerShadowSyncBridge'
import { useAuth } from '@/auth/authContext'
import { authModeForPath, safeAuthReturnPath } from '@/auth/authRouting'
import { shouldHandleTrackerEmailConfirmation } from '@/auth/emailConfirmation'
import {
  TrackerAuthLoading,
  TrackerAuthScreen,
  TrackerEmailConfirmationScreen,
  TrackerUpdatePasswordScreen,
} from '@/auth/TrackerAuthScreen'

function ThemeHandler() {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    const applyTheme = () => {
      let isDark = theme === 'dark'
      if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      }
      document.documentElement.classList.toggle('dark', isDark)
    }

    applyTheme()

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', applyTheme)
      return () => mq.removeEventListener('change', applyTheme)
    }
  }, [theme])

  return null
}

function TrackerWorkspace() {
  return (
    <>
      <AiArtifactAccessBridge />
      <TrackerShadowSyncBridge />
      <Routes>
        <Route element={<Layout />}>
          {appRoutes.map(({ path, Page }) => (
            <Route key={path} path={path} element={<Page />} />
          ))}
          <Route path="*" element={<NotFoundRoute />} />
        </Route>
      </Routes>
    </>
  )
}

function AuthGate() {
  const { status, guestMode, recoveryMode } = useAuth()
  const location = useLocation()
  const isPublicAuthPage = location.pathname === '/login'
    || location.pathname === '/register'
    || location.pathname === '/forgot-password'

  if (shouldHandleTrackerEmailConfirmation(location)) return <TrackerEmailConfirmationScreen />
  if (recoveryMode) return <TrackerUpdatePasswordScreen />
  if (status === 'initializing') return <TrackerAuthLoading />
  if (isPublicAuthPage && status !== 'signed-in') {
    return <TrackerAuthScreen initialMode={authModeForPath(location.pathname)} />
  }

  const appAccessible = status === 'signed-in'
    || guestMode
    || status === 'unconfigured'
    || status === 'misconfigured'
    || status === 'unavailable'

  if (!appAccessible) {
    const returnTo = safeAuthReturnPath(`${location.pathname}${location.search}${location.hash}`)
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  if (isPublicAuthPage) return <Navigate to="/" replace />
  return <TrackerWorkspace />
}

function App() {
  return (
    <BrowserRouter>
      <ThemeHandler />
      <AuthGate />
    </BrowserRouter>
  )
}

export default App
