import {
  useId,
  type ComponentProps,
  type ReactNode,
} from 'react'

import type { EmptyStateScene } from '@/components/illustrations/empty-state-illustrations'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

export type ChartRange = 7 | 30 | 90

export interface ChartRangeOption {
  value: ChartRange
  label: string
}

const DEFAULT_CHART_RANGE_OPTIONS: readonly ChartRangeOption[] = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
]

export interface ChartRangeControlProps {
  value: ChartRange
  onValueChange: (value: ChartRange) => void
  options?: readonly ChartRangeOption[]
  ariaLabel?: string
  className?: string
  disabled?: boolean
}

/**
 * Compact segmented control intended for a ChartCard action slot.
 * Native buttons keep the selected range keyboard and screen-reader accessible.
 */
export function ChartRangeControl({
  value,
  onValueChange,
  options = DEFAULT_CHART_RANGE_OPTIONS,
  ariaLabel = '统计时间范围',
  className,
  disabled = false,
}: ChartRangeControlProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 rounded-lg border border-border/70 bg-muted/70 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              'disabled:pointer-events-none disabled:opacity-50',
              selected
                ? 'bg-surface-raised text-foreground shadow-sm ring-1 ring-border/70'
                : 'text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export interface ChartLegendItem {
  label: ReactNode
  color: string
  value?: ReactNode
  marker?: 'dot' | 'line' | 'square'
}

export interface ChartLegendProps extends ComponentProps<'div'> {
  items: readonly ChartLegendItem[]
  ariaLabel?: string
}

/** A token-friendly legend for charts that do not need Recharts' built-in legend. */
export function ChartLegend({
  items,
  ariaLabel = '图表图例',
  className,
  ...props
}: ChartLegendProps) {
  if (items.length === 0) return null

  return (
    <div
      role="list"
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      {items.map((item, index) => {
        const marker = item.marker ?? 'dot'

        return (
          <div
            key={typeof item.label === 'string' ? item.label : index}
            role="listitem"
            className="flex min-w-0 items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                'shrink-0',
                marker === 'dot' && 'h-2.5 w-2.5 rounded-full',
                marker === 'square' && 'h-2.5 w-2.5 rounded-[3px]',
                marker === 'line' && 'h-0.5 w-4 rounded-full',
              )}
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate">{item.label}</span>
            {item.value !== undefined && (
              <span className="shrink-0 font-medium tabular-nums text-foreground">
                {item.value}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export type ChartCardHeight = 'compact' | 'default' | 'tall'

const chartHeightClasses: Record<ChartCardHeight, string> = {
  compact: 'h-[180px] md:h-[220px]',
  default: 'h-[240px] md:h-[300px]',
  tall: 'h-[280px] md:h-[340px]',
}

export interface ChartCardEmptyState {
  scene?: EmptyStateScene
  title: string
  description?: string
  action?: ReactNode
}

export interface ChartCardProps
  extends Omit<ComponentProps<typeof Card>, 'title' | 'children'> {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  legend?: ReactNode
  legendItems?: readonly ChartLegendItem[]
  children: ReactNode
  hasData?: boolean
  emptyState?: ChartCardEmptyState
  height?: ChartCardHeight
  headingLevel?: 2 | 3
  titleId?: string
  contentClassName?: string
  chartClassName?: string
  chartInset?: boolean
}

/**
 * Shared shell for analytical charts.
 *
 * Keep chart-library details in `children`; this component owns the responsive
 * height, header/actions, legend, empty state, clipping and accessible labelling.
 */
export function ChartCard({
  title,
  description,
  action,
  legend,
  legendItems,
  children,
  hasData = true,
  emptyState,
  height = 'default',
  headingLevel = 2,
  titleId,
  contentClassName,
  chartClassName,
  chartInset = true,
  className,
  ...cardProps
}: ChartCardProps) {
  const generatedId = useId()
  const resolvedTitleId = titleId ?? `chart-card-title-${generatedId}`
  const descriptionId = description
    ? `chart-card-description-${generatedId}`
    : undefined
  const resolvedEmptyState = emptyState ?? {
    scene: 'generic' as const,
    title: '暂无统计数据',
    description: '添加学习记录后，这里将展示趋势。',
  }

  return (
    <Card
      {...cardProps}
      role="region"
      aria-labelledby={resolvedTitleId}
      aria-describedby={descriptionId}
      className={cn('min-w-0', className)}
    >
      <CardHeader className="flex flex-col gap-3 pb-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle
            id={resolvedTitleId}
            role="heading"
            aria-level={headingLevel}
            className="text-pretty text-[15px] md:text-base"
          >
            {title}
          </CardTitle>
          {description && (
            <CardDescription id={descriptionId} className="mt-1 leading-5">
              {description}
            </CardDescription>
          )}
        </div>
        {action && (
          <div
            role="group"
            aria-label="图表操作"
            className="flex max-w-full shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          >
            {action}
          </div>
        )}
      </CardHeader>

      <CardContent
        className={cn('flex min-w-0 flex-col gap-3', contentClassName)}
      >
        {legendItems && <ChartLegend items={legendItems} />}
        {legend && (
          <div
            role="group"
            aria-label="图表图例"
            className="min-w-0 overflow-hidden text-xs text-muted-foreground"
          >
            {legend}
          </div>
        )}

        <div
          role="group"
          aria-labelledby={resolvedTitleId}
          aria-describedby={descriptionId}
          className={cn(
            'relative isolate min-w-0 w-full overflow-hidden rounded-xl border border-border/70 bg-surface-subtle/35',
            chartHeightClasses[height],
            chartClassName,
          )}
        >
          {hasData ? (
            <div
              className={cn(
                'h-full min-h-0 min-w-0 w-full [&_.recharts-responsive-container]:max-w-full [&_.recharts-wrapper]:max-w-full',
                chartInset && 'p-2 pt-3 sm:p-3',
              )}
            >
              {children}
            </div>
          ) : (
            <EmptyState
              scene={resolvedEmptyState.scene}
              density="chart"
              title={resolvedEmptyState.title}
              description={resolvedEmptyState.description}
              action={resolvedEmptyState.action}
              className="flex h-full w-full flex-col items-center justify-center rounded-none border-0 bg-transparent"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
