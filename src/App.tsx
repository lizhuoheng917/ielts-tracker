import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useSettingsStore } from '@/stores/settingsStore'
import { useEffect } from 'react'
import { appRoutes } from '@/app/navigation'
import { NotFoundRoute } from '@/components/navigation/NotFoundRoute'
import { AiArtifactAccessBridge } from '@/components/ai/AiArtifactAccessBridge'

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

function App() {
  return (
    <BrowserRouter>
      <ThemeHandler />
      <AiArtifactAccessBridge />
      <Routes>
        <Route element={<Layout />}>
          {appRoutes.map(({ path, Page }) => (
            <Route key={path} path={path} element={<Page />} />
          ))}
          <Route path="*" element={<NotFoundRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
