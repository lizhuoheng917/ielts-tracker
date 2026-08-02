import type { ComponentProps } from 'react'

import {
  ACHIEVEMENT_VISUALS,
  FALLBACK_ACHIEVEMENT_VISUAL,
} from '@/components/achievements/achievement-visuals'
import { cn } from '@/lib/utils'

type AchievementMarkSize = 'sm' | 'md' | 'lg'

interface AchievementMarkProps extends Omit<ComponentProps<'span'>, 'children'> {
  achievementId: string
  isUnlocked?: boolean
  size?: AchievementMarkSize
}

const sizeClasses: Record<AchievementMarkSize, { frame: string; icon: string; marker: string }> = {
  sm: {
    frame: 'size-9 rounded-xl',
    icon: 'size-4.5',
    marker: 'hidden',
  },
  md: {
    frame: 'size-11 rounded-[0.9rem]',
    icon: 'size-5.5',
    marker: 'bottom-0.5 right-0.5 min-w-3.5 px-0.5 text-[7px]',
  },
  lg: {
    frame: 'size-12 rounded-2xl md:size-14',
    icon: 'size-6 md:size-7',
    marker: 'bottom-1 right-1 min-w-4 px-1 text-[8px]',
  },
}

export function AchievementMark({
  achievementId,
  isUnlocked = true,
  size = 'md',
  className,
  ...props
}: AchievementMarkProps) {
  const visual = ACHIEVEMENT_VISUALS[achievementId] ?? FALLBACK_ACHIEVEMENT_VISUAL
  const Icon = visual.icon
  const sizing = sizeClasses[size]

  return (
    <span
      {...props}
      aria-hidden="true"
      data-achievement-id={achievementId}
      data-state={isUnlocked ? 'unlocked' : 'locked'}
      className={cn(
        'relative isolate grid shrink-0 place-items-center overflow-hidden text-white ring-1 ring-inset ring-white/20',
        visual.gradientClass,
        sizing.frame,
        isUnlocked
          ? 'shadow-[0_9px_20px_-12px_currentColor]'
          : 'opacity-70 saturate-50 shadow-none',
        className,
      )}
    >
      <span className="absolute -right-3 -top-3 size-8 rounded-full bg-white/20" />
      <span className="absolute -bottom-4 -left-4 size-9 rounded-full border-[6px] border-white/10" />
      <Icon className={cn('relative drop-shadow-sm', sizing.icon)} strokeWidth={2.15} />
      {visual.marker && (
        <span
          className={cn(
            'absolute grid h-3.5 place-items-center rounded-full bg-slate-950/55 font-bold leading-none tabular-nums text-white ring-1 ring-white/35',
            sizing.marker,
          )}
        >
          {visual.marker}
        </span>
      )}
    </span>
  )
}
