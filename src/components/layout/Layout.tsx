import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'

export function Layout() {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="min-h-screen md:ml-60 pt-14 md:pt-0">
        <div className="p-4 sm:p-6 max-w-6xl pb-20 md:pb-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden">
        <MobileNav />
      </div>
    </div>
  )
}
