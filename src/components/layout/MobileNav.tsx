import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Menu, UserRound, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  findRoute,
  isRouteActive,
  mobileMoreRoutes,
  mobilePrimaryRoutes,
  preloadRoute,
} from '@/app/navigation'
import { LEVELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievementStore'
import { BrandMark } from '@/components/brand/brand-mark'
import { useAuth } from '@/auth/authContext'
import { useAccountDialog } from '@/components/account/accountDialogContext'

export function MobileNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLElement>(null)
  const firstMenuItemRef = useRef<HTMLAnchorElement>(null)
  const { pathname } = useLocation()
  const { level } = useAchievementStore()
  const { status: authStatus, user } = useAuth()
  const { openAccountDialog } = useAccountDialog()
  const currentLevel = LEVELS.find((item) => item.level === level) || LEVELS[0]
  const currentRoute = findRoute(pathname)
  const moreIsActive = mobileMoreRoutes.some((route) => isRouteActive(pathname, route))
  const accountDetail = user?.email
    ?? (authStatus === 'signed-out' ? '登录已有账号' : authStatus === 'initializing' ? '读取账号状态…' : '本地模式')

  useEffect(() => {
    if (!menuOpen) return

    const menuButton = menuButtonRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstMenuItemRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }

      if (event.key !== 'Tab' || !menuPanelRef.current) return

      const focusableElements = Array.from(
        menuPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement?.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      menuButton?.focus()
    }
  }, [menuOpen])

  const openMenu = () => {
    setMenuOpen(true)
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border/80 bg-card/85 px-4 shadow-[0_1px_8px_-4px_oklch(0_0_0/0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/75">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {currentRoute?.label ?? 'Lexi Tracker'}
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
              {currentRoute?.description ?? '雅思学习规划与复盘'}
            </p>
          </div>
        </div>
        <div
          className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary min-[380px]:px-2.5 min-[380px]:text-xs"
          aria-label={`${currentLevel.name}，等级 ${level}`}
        >
          <span className="hidden min-[380px]:inline">{currentLevel.name} · </span>Lv.{level}
        </div>
      </header>

      <nav
        aria-label="移动端主导航"
        className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border/80 bg-card/90 px-2 pt-1.5 shadow-[0_-8px_24px_-20px_oklch(0_0_0/0.45)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/80"
      >
        {mobilePrimaryRoutes.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onMouseEnter={() => preloadRoute(item)}
            onFocus={() => preloadRoute(item)}
            onTouchStart={() => preloadRoute(item)}
            className={({ isActive }) =>
              cn(
                'relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium outline-none transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-95',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute top-0 h-0.5 w-5 rounded-full bg-primary transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <item.icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.shortLabel}</span>
              </>
            )}
          </NavLink>
        ))}

        <button
          ref={menuButtonRef}
          type="button"
          onClick={menuOpen ? () => setMenuOpen(false) : openMenu}
          className={cn(
            'relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium outline-none transition-[color,background-color,transform] focus-visible:ring-2 focus-visible:ring-ring',
            menuOpen || moreIsActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-95',
          )}
          aria-expanded={menuOpen}
          aria-controls="mobile-more-menu"
        >
          <span
            className={cn(
              'absolute top-0 h-0.5 w-5 rounded-full bg-primary transition-opacity',
              menuOpen || moreIsActive ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden="true"
          />
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>更多</span>
        </button>
      </nav>

      <div
        className={cn(
          'fixed inset-0 z-[60] transition-[opacity,visibility] duration-200',
          menuOpen ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0',
        )}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          className="absolute inset-0 h-full w-full cursor-default bg-foreground/25 backdrop-blur-[2px]"
          onClick={() => setMenuOpen(false)}
          aria-label="关闭更多菜单"
          tabIndex={-1}
        />

        <section
          ref={menuPanelRef}
          id="mobile-more-menu"
          className={cn(
            'mobile-more-sheet absolute inset-x-0 bottom-0 rounded-t-3xl border border-b-0 border-border bg-card px-4 pb-5 pt-3 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            menuOpen ? 'translate-y-0' : 'translate-y-full',
          )}
          role={menuOpen ? 'dialog' : undefined}
          aria-modal={menuOpen ? 'true' : undefined}
          aria-labelledby={menuOpen ? 'mobile-more-title' : undefined}
          aria-hidden={!menuOpen}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <h2 id="mobile-more-title" className="text-base font-semibold">更多功能</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">记录、回顾与个人设置</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="关闭更多菜单"
              tabIndex={menuOpen ? 0 : -1}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="更多功能" className="grid grid-cols-2 gap-2">
            {mobileMoreRoutes.map((item, index) => (
              <NavLink
                ref={index === 0 ? firstMenuItemRef : undefined}
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                onMouseEnter={() => preloadRoute(item)}
                onFocus={() => preloadRoute(item)}
                onTouchStart={() => preloadRoute(item)}
                tabIndex={menuOpen ? 0 : -1}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-[4.5rem] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left outline-none transition-[color,background-color,border-color,transform,box-shadow] focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'border-primary/30 bg-primary/10 text-primary shadow-sm'
                      : 'border-border/70 bg-background/60 text-foreground hover:border-primary/20 hover:bg-accent active:scale-[0.98]',
                  )
                }
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.shortLabel}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-3 border-t border-border/80 pt-3">
            <button
              type="button"
              tabIndex={menuOpen ? 0 : -1}
              onClick={() => {
                const returnFocus = menuButtonRef.current
                setMenuOpen(false)
                window.requestAnimationFrame(() => openAccountDialog(returnFocus))
              }}
              className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border/70 bg-background/60 px-3 py-2.5 text-left outline-none transition-colors hover:border-primary/20 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="打开 Lexi 账号"
            >
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">Lexi 账号</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{accountDetail}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </>
  )
}
