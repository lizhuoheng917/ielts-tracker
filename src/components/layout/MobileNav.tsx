import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, BookA, ListTodo, PenTool,
  BarChart3, Trophy, BookOpen, Settings, Menu, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievementStore'
import { LEVELS } from '@/lib/constants'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/words', icon: BookA, label: '单词' },
  { to: '/plans', icon: ListTodo, label: '计划' },
  { to: '/practice', icon: PenTool, label: '练习' },
  { to: '/stats', icon: BarChart3, label: '统计' },
  { to: '/achievements', icon: Trophy, label: '成就' },
  { to: '/diary', icon: BookOpen, label: '日记' },
  { to: '/settings', icon: Settings, label: '设置' },
]

export function MobileNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { level } = useAchievementStore()
  const currentLevel = LEVELS.find(l => l.level === level) || LEVELS[0]

  return (
    <>
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
            雅
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight">IELTS Tracker</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">{currentLevel.name} · Lv.{level}</p>
          </div>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
        >
          <div className={cn('transition-transform duration-300', menuOpen && 'rotate-90')}>
            {menuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </div>
        </button>
      </header>

      {/* Full Screen Menu Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-background/95 backdrop-blur-md transition-all duration-300 ease-out',
          menuOpen
            ? 'opacity-100 pointer-events-auto visible'
            : 'opacity-0 pointer-events-none invisible'
        )}
      >
        <div
          className={cn(
            'h-full w-full transition-transform duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          <div
            className={cn(
              'flex flex-col h-full pt-14 transition-opacity duration-300 delay-150',
              menuOpen ? 'opacity-100' : 'opacity-0'
            )}
          >
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {navItems.map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium transition-colors',
                      menuOpen && 'animate-menu-item-in',
                      `stagger-${index + 1}`,
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                坚持每天进步一点点
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
