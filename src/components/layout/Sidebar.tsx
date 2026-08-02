import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievementStore'
import { LEVELS } from '@/lib/constants'
import { navigationGroups, preloadRoute } from '@/app/navigation'
import { BrandMark } from '@/components/brand/brand-mark'
import { ChevronRight, UserRound } from 'lucide-react'
import { useAuth } from '@/auth/authContext'
import { useAccountDialog } from '@/components/account/accountDialogContext'

export function Sidebar() {
  const { level } = useAchievementStore()
  const { status: authStatus, user } = useAuth()
  const { openAccountDialog } = useAccountDialog()
  const currentLevel = LEVELS.find(l => l.level === level) || LEVELS[0]
  const accountDetail = user?.email
    ?? (authStatus === 'signed-out' ? '登录已有账号' : authStatus === 'initializing' ? '读取账号状态…' : '本地模式')

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-[2px_0_16px_-8px_oklch(0_0_0/0.16)] backdrop-blur-xl">
      <div className="animate-logo-in flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <BrandMark className="size-10" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight">Lexi Tracker</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">Lexi IELTS 学习总控台</p>
        </div>
      </div>

      <div className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/70 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/12 font-semibold text-sidebar-primary ring-1 ring-sidebar-primary/15">
            {level}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{currentLevel.name}</p>
            <p className="text-xs text-muted-foreground">当前等级 · Lv.{level}</p>
          </div>
        </div>
      </div>

      <nav aria-label="主导航" className="flex-1 overflow-y-auto px-3 py-3">
        {navigationGroups.map((group) => (
          <div key={group.id} className="mb-3 last:mb-0">
            <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onMouseEnter={() => preloadRoute(item)}
                  onFocus={() => preloadRoute(item)}
                  onTouchStart={() => preloadRoute(item)}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-[color,background-color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-primary/20'
                        : 'text-muted-foreground hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          'absolute left-0 h-5 w-1 rounded-r-full bg-sidebar-primary-foreground transition-opacity',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden="true"
                      />
                      <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        <button
          type="button"
          onClick={(event) => openAccountDialog(event.currentTarget)}
          className="group flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="打开 Lexi 账号"
        >
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-sidebar-foreground">Lexi 账号</span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{accountDetail}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
        <p className="text-center text-xs text-muted-foreground">坚持每天进步一点点</p>
      </div>
    </aside>
  )
}
