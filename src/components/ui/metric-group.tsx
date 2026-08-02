import type * as React from 'react'

import { Card } from '@/components/ui/card'
import type { MetricTone } from '@/components/ui/metric-card'
import { cn } from '@/lib/utils'

const groupToneClasses: Record<MetricTone, string> = {
  neutral: 'bg-surface-subtle text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
  reading: 'bg-subject-reading-soft text-subject-reading',
  listening: 'bg-subject-listening-soft text-subject-listening',
  writing: 'bg-subject-writing-soft text-subject-writing',
  speaking: 'bg-subject-speaking-soft text-subject-speaking',
}

export interface MetricGroupItem {
  label: React.ReactNode
  value: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  tone?: MetricTone
}

interface MetricGroupProps extends Omit<React.ComponentProps<typeof Card>, 'children'> {
  ariaLabel: string
  items: readonly MetricGroupItem[]
  columns?: 2 | 3 | 4
  gridClassName?: string
}

const columnClasses: Record<NonNullable<MetricGroupProps['columns']>, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 min-[480px]:grid-cols-4',
}

function MetricGroup({
  ariaLabel,
  items,
  columns = 4,
  gridClassName,
  className,
  ...props
}: MetricGroupProps) {
  return (
    <Card size="sm" className={cn('gap-0 py-0', className)} {...props}>
      <dl
        aria-label={ariaLabel}
        className={cn('grid gap-px bg-border/80', columnClasses[columns], gridClassName)}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className="min-w-0 bg-surface-raised px-3 py-2.5 sm:px-4 sm:py-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-1.5">
              <dt
                className={cn(
                  'min-w-0 text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs',
                  columns === 3
                    ? 'min-h-8 break-words min-[390px]:min-h-4'
                    : 'truncate',
                )}
              >
                {item.label}
              </dt>
              {item.icon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-lg [&>svg]:size-3.5 sm:size-7 sm:[&>svg]:size-4',
                    columns === 3 && 'max-[389px]:hidden',
                    groupToneClasses[item.tone ?? 'neutral'],
                  )}
                >
                  {item.icon}
                </span>
              )}
            </div>
            <dd
              className={cn(
                'mt-1.5 font-bold tabular-nums tracking-tight text-foreground md:text-2xl',
                columns === 3
                  ? 'break-words text-lg leading-6 min-[390px]:text-xl'
                  : 'truncate text-xl',
              )}
            >
              {item.value}
            </dd>
            {item.description && (
              <dd className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                {item.description}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </Card>
  )
}

export { MetricGroup }
