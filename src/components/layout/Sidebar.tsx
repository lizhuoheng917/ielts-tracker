import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, BookA, ListTodo, PenTool, Timer,
  BarChart3, Trophy, BookOpen, Settings
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievementStore'
import { LEVELS } from '@/lib/constants'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/words', icon: BookA, label: '单词记录' },
  { to: '/plans', icon: ListTodo, label: '学习计划' },
  { to: '/practice', icon: Timer, label: '练习' },
  { to: '/exam', icon: PenTool, label: '模考' },
  { to: '/stats', icon: BarChart3, label: '数据统计' },
  { to: '/achievements', icon: Trophy, label: '成就系统' },
  { to: '/diary', icon: BookOpen, label: '学习日记' },
  { to: '/settings', icon: Settings, label: '设置' },
]

export function Sidebar() {
  const { level } = useAchievementStore()
  const currentLevel = LEVELS.find(l => l.level === level) || LEVELS[0]

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 border-r border-border bg-card flex flex-col shadow-[2px_0_8px_-2px_oklch(0_0_0/0.04)]">
      {/* Logo / Brand */}
      <div className="animate-logo-in flex items-center gap-3 px-5 py-6 border-b border-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
          雅
        </div>
        <div>
          <h1 className="font-semibold text-sm leading-tight">IELTS Tracker</h1>
          <p className="text-xs text-muted-foreground">雅思学习追踪</p>
        </div>
      </div>

      {/* User Level */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold shadow-sm">
            {level}
          </div>
          <div>
            <p className="text-sm font-medium">{currentLevel.name}</p>
            <p className="text-xs text-muted-foreground">Lv.{level}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item, index) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'animate-sidebar-item-in relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:scale-[1.01] hover:shadow-sm',
                `stagger-${index + 1}`,
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary-foreground transition-all duration-300',
                    isActive ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 -translate-x-2 scale-75'
                  )}
                />
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          坚持每天进步一点点
        </p>
      </div>
    </aside>
  )
}
