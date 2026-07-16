import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useSettingsStore } from '@/stores/settingsStore'
import { useEffect, useRef } from 'react'

import Dashboard from '@/pages/Dashboard'
import Words from '@/pages/Words'
import Plans from '@/pages/Plans'
import Practice from '@/pages/Practice'
import Stats from '@/pages/Stats'
import Achievements from '@/pages/Achievements'
import Diary from '@/pages/Diary'
import Settings from '@/pages/Settings'

function ThemeHandler() {
  const theme = useSettingsStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return null
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    el.classList.remove('page-transition-enter')

    const timer = setTimeout(() => {
      requestAnimationFrame(() => {
        el.classList.add('page-transition-enter')
      })
    }, 50)

    return () => clearTimeout(timer)
  }, [location.pathname])

  return (
    <div ref={ref} key={location.pathname}>
      {children}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeHandler />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
          <Route path="/words" element={<PageTransition><Words /></PageTransition>} />
          <Route path="/plans" element={<PageTransition><Plans /></PageTransition>} />
          <Route path="/practice" element={<PageTransition><Practice /></PageTransition>} />
          <Route path="/stats" element={<PageTransition><Stats /></PageTransition>} />
          <Route path="/achievements" element={<PageTransition><Achievements /></PageTransition>} />
          <Route path="/diary" element={<PageTransition><Diary /></PageTransition>} />
          <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
