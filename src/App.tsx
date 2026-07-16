import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useSettingsStore } from '@/stores/settingsStore'
import { useEffect } from 'react'

import Dashboard from '@/pages/Dashboard'
import Words from '@/pages/Words'
import Plans from '@/pages/Plans'
import Practice from '@/pages/Practice'
import TimerPractice from '@/pages/TimerPractice'
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

function App() {
  return (
    <BrowserRouter>
      <ThemeHandler />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/words" element={<Words />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/exam" element={<Practice />} />
          <Route path="/practice" element={<TimerPractice />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
