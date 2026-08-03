import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import {
  BarChart3,
  BookA,
  BookOpen,
  CalendarCheck2,
  ListTodo,
  PenTool,
  Settings,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

type PageModule = { default: ComponentType }
type PageLoader = () => Promise<PageModule>

export type NavigationGroupId = 'learn' | 'review' | 'system'
export type MobilePlacement = 'primary' | 'more'

export interface AppRoute {
  id: string
  path: string
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  group: NavigationGroupId
  mobilePlacement: MobilePlacement
  Page: LazyExoticComponent<ComponentType>
  preload: PageLoader
}

export interface NavigationGroup {
  id: NavigationGroupId
  label: string
  items: AppRoute[]
}

function cachePageLoader(loader: PageLoader): PageLoader {
  let pending: Promise<PageModule> | undefined

  return () => {
    if (!pending) {
      pending = loader().catch((error: unknown) => {
        pending = undefined
        throw error
      })
    }

    return pending
  }
}

function createRoute(
  route: Omit<AppRoute, 'Page' | 'preload'>,
  loader: PageLoader,
): AppRoute {
  const preload = cachePageLoader(loader)

  return {
    ...route,
    Page: lazy(preload),
    preload,
  }
}

export const appRoutes: AppRoute[] = [
  createRoute(
    {
      id: 'today',
      path: '/',
      label: '今日学习',
      shortLabel: '今日',
      description: '今天的学习进度与待办',
      icon: CalendarCheck2,
      group: 'learn',
      mobilePlacement: 'primary',
    },
    () => import('@/pages/Dashboard'),
  ),
  createRoute(
    {
      id: 'practice',
      path: '/practice',
      label: '专注练习',
      shortLabel: '练习',
      description: '计时完成一次专项训练',
      icon: Timer,
      group: 'learn',
      mobilePlacement: 'primary',
    },
    () => import('@/pages/TimerPractice'),
  ),
  createRoute(
    {
      id: 'plans',
      path: '/plans',
      label: '学习计划',
      shortLabel: '计划',
      description: '安排并跟进学习任务',
      icon: ListTodo,
      group: 'learn',
      mobilePlacement: 'primary',
    },
    () => import('@/pages/Plans'),
  ),
  createRoute(
    {
      id: 'words',
      path: '/words',
      label: '单词记录',
      shortLabel: '单词',
      description: '记录词汇学习活动',
      icon: BookA,
      group: 'learn',
      mobilePlacement: 'more',
    },
    () => import('@/pages/Words'),
  ),
  createRoute(
    {
      id: 'exam',
      path: '/exam',
      label: '模考记录',
      shortLabel: '模考',
      description: '记录整套与分科模考',
      icon: PenTool,
      group: 'learn',
      mobilePlacement: 'more',
    },
    () => import('@/pages/Practice'),
  ),
  createRoute(
    {
      id: 'review',
      path: '/stats',
      label: '学习复盘',
      shortLabel: '复盘',
      description: '查看趋势并回顾学习表现',
      icon: BarChart3,
      group: 'review',
      mobilePlacement: 'primary',
    },
    () => import('@/pages/Stats'),
  ),
  createRoute(
    {
      id: 'diary',
      path: '/diary',
      label: '学习日记',
      shortLabel: '日记',
      description: '沉淀每日学习感受',
      icon: BookOpen,
      group: 'review',
      mobilePlacement: 'more',
    },
    () => import('@/pages/Diary'),
  ),
  createRoute(
    {
      id: 'achievements',
      path: '/achievements',
      label: '成就系统',
      shortLabel: '成就',
      description: '查看等级与里程碑',
      icon: Trophy,
      group: 'review',
      mobilePlacement: 'more',
    },
    () => import('@/pages/Achievements'),
  ),
  createRoute(
    {
      id: 'settings',
      path: '/settings',
      label: '设置',
      shortLabel: '设置',
      description: '账号、目标与 AI 权限',
      icon: Settings,
      group: 'system',
      mobilePlacement: 'more',
    },
    () => import('@/pages/Settings'),
  ),
]

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'learn',
    label: '学习',
    items: appRoutes.filter((route) => route.group === 'learn'),
  },
  {
    id: 'review',
    label: '回顾',
    items: appRoutes.filter((route) => route.group === 'review'),
  },
  {
    id: 'system',
    label: '系统',
    items: appRoutes.filter((route) => route.group === 'system'),
  },
]

export const mobilePrimaryRoutes = appRoutes.filter(
  (route) => route.mobilePlacement === 'primary',
)

export const mobileMoreRoutes = appRoutes.filter(
  (route) => route.mobilePlacement === 'more',
)

export function isRouteActive(pathname: string, route: AppRoute) {
  if (route.path === '/') return pathname === '/'
  return pathname === route.path || pathname.startsWith(`${route.path}/`)
}

export function findRoute(pathname: string) {
  return appRoutes.find((route) => isRouteActive(pathname, route))
}

export function preloadRoute(route: AppRoute) {
  void route.preload().catch(() => undefined)
}
