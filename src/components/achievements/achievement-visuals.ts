import {
  Award,
  BarChart3,
  BookOpenCheck,
  CalendarCheck2,
  Flame,
  Gem,
  LayoutGrid,
  LibraryBig,
  Mic2,
  NotebookPen,
  PenLine,
  Sprout,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

export interface AchievementVisual {
  icon: LucideIcon
  gradientClass: string
  marker?: string
}

export const FALLBACK_ACHIEVEMENT_VISUAL: AchievementVisual = {
  icon: Award,
  gradientClass: 'bg-gradient-to-br from-indigo-500 to-violet-600',
}

export const ACHIEVEMENT_VISUALS: Record<string, AchievementVisual> = {
  'first-checkin': {
    icon: Sprout,
    gradientClass: 'bg-gradient-to-br from-emerald-400 to-teal-600',
  },
  'streak-7': {
    icon: Flame,
    gradientClass: 'bg-gradient-to-br from-amber-400 to-orange-600',
    marker: '7',
  },
  'streak-30': {
    icon: CalendarCheck2,
    gradientClass: 'bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600',
    marker: '30',
  },
  'words-100': {
    icon: BookOpenCheck,
    gradientClass: 'bg-gradient-to-br from-sky-400 to-blue-600',
    marker: '100',
  },
  'words-1000': {
    icon: LibraryBig,
    gradientClass: 'bg-gradient-to-br from-indigo-500 to-violet-700',
    marker: '1K',
  },
  'first-writing': {
    icon: PenLine,
    gradientClass: 'bg-gradient-to-br from-amber-400 to-rose-500',
  },
  'first-speaking': {
    icon: Mic2,
    gradientClass: 'bg-gradient-to-br from-emerald-400 to-cyan-600',
  },
  'stats-viewer': {
    icon: BarChart3,
    gradientClass: 'bg-gradient-to-br from-cyan-400 to-indigo-600',
    marker: '10',
  },
  'diary-7': {
    icon: NotebookPen,
    gradientClass: 'bg-gradient-to-br from-pink-400 to-violet-600',
    marker: '7',
  },
  'all-practice': {
    icon: LayoutGrid,
    gradientClass: 'bg-[conic-gradient(from_45deg,#38bdf8,#8b5cf6,#f59e0b,#22c55e,#38bdf8)]',
    marker: '4',
  },
  'week-champion': {
    icon: Trophy,
    gradientClass: 'bg-gradient-to-br from-amber-300 via-yellow-500 to-orange-600',
    marker: '7',
  },
  'monthly-star': {
    icon: Gem,
    gradientClass: 'bg-gradient-to-br from-violet-500 to-fuchsia-600',
    marker: '90',
  },
}
