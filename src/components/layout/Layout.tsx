import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { RouteFallback } from '@/components/navigation/RouteFallback'
import { findRoute } from '@/app/navigation'

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const currentRoute = findRoute(pathname)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.title = `${currentRoute?.label ?? '页面未找到'} · Lexi Tracker`

    const focusFrame = window.requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(focusFrame)
  }, [currentRoute?.label, pathname])

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        跳到主要内容
      </a>

      <div
        className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_top_right,oklch(0.65_0.2_275/0.08),transparent_38rem)]"
        aria-hidden="true"
      />

      <div className="hidden md:block">
        <Sidebar />
      </div>

      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        aria-label={currentRoute?.label ?? '主要内容'}
        className="relative min-h-screen pt-16 md:ml-64 md:pt-0"
      >
        <div className="mx-auto max-w-6xl p-4 pb-28 sm:p-6 sm:pb-28 md:pb-8 lg:p-8">
          <Suspense fallback={<RouteFallback />}>
            <div key={pathname} className="route-page">
              <Outlet />
            </div>
          </Suspense>
        </div>
      </main>

      <div className="md:hidden">
        <MobileNav />
      </div>
    </div>
  )
}
