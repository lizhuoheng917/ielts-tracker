import type { ReactNode } from 'react'
import {
  EmptyStateIllustration,
  type EmptyStateScene,
} from '@/components/illustrations/empty-state-illustrations'
import { cn } from '@/lib/utils'

export type EmptyStateDensity = 'compact' | 'standard' | 'chart'

interface EmptyStateProps {
  scene?: EmptyStateScene
  density?: EmptyStateDensity
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

const densityClasses: Record<
  EmptyStateDensity,
  { container: string; illustration: string; title: string; description: string; action: string }
> = {
  compact: {
    container: 'p-4 md:p-5',
    illustration: 'mx-auto h-16 w-20 md:h-[4.5rem] md:w-24',
    title: 'mt-2 text-sm',
    description: 'mt-1 max-w-64 text-xs leading-relaxed',
    action: 'mt-3',
  },
  standard: {
    container: 'p-6 md:p-8',
    illustration: 'mx-auto h-24 w-28 md:h-28 md:w-32',
    title: 'mt-3 text-[15px] md:text-base',
    description: 'mt-1.5 max-w-[280px] text-[13px] leading-relaxed md:text-sm',
    action: 'mt-4',
  },
  chart: {
    container: 'p-4 md:p-6',
    illustration: 'mx-auto h-20 w-24 md:h-24 md:w-28',
    title: 'mt-2.5 text-sm md:text-[15px]',
    description: 'mt-1 max-w-[300px] text-xs leading-relaxed md:text-[13px]',
    action: 'mt-3.5',
  },
}

const sceneSurfaceClasses: Record<EmptyStateScene, string> = {
  tasks: 'border-primary/10 bg-primary/5',
  words: 'border-primary/10 bg-primary/5',
  practice: 'border-primary/10 bg-primary/5',
  timer: 'border-primary/10 bg-primary/5',
  diary: 'border-border/80 bg-secondary/50',
  achievements: 'border-primary/10 bg-primary/5',
  plans: 'border-primary/10 bg-primary/5',
  generic: 'border-border/80 bg-muted/45',
  wordTrend: 'border-border/70 bg-muted/35',
  durationChart: 'border-border/70 bg-muted/35',
  radarChart: 'border-border/70 bg-muted/35',
  pieChart: 'border-border/70 bg-muted/35',
}

export function EmptyState({
  scene = 'generic',
  density = 'standard',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const densityClass = densityClasses[density]

  return (
    <div
      data-slot="empty-state"
      data-density={density}
      className={cn(
        'rounded-xl border text-center',
        sceneSurfaceClasses[scene],
        densityClass.container,
        className,
      )}
    >
      <EmptyStateIllustration scene={scene} className={densityClass.illustration} />
      <h3 className={cn('font-semibold text-foreground', densityClass.title)}>{title}</h3>
      {description && (
        <p className={cn('mx-auto text-muted-foreground', densityClass.description)}>
          {description}
        </p>
      )}
      {action && <div className={cn('flex justify-center', densityClass.action)}>{action}</div>}
    </div>
  )
}
