import type * as React from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type MetricTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "reading"
  | "listening"
  | "writing"
  | "speaking"

type MetricTrend = {
  value: React.ReactNode
  label?: React.ReactNode
  direction?: "up" | "down" | "neutral"
  intent?: "positive" | "negative" | "neutral"
}

interface MetricCardProps
  extends Omit<React.ComponentProps<typeof Card>, "children"> {
  label: React.ReactNode
  value: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  trend?: MetricTrend
  tone?: MetricTone
}

const toneClasses: Record<MetricTone, string> = {
  neutral: "bg-surface-subtle text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  reading: "bg-subject-reading-soft text-subject-reading",
  listening: "bg-subject-listening-soft text-subject-listening",
  writing: "bg-subject-writing-soft text-subject-writing",
  speaking: "bg-subject-speaking-soft text-subject-speaking",
}

const trendClasses: Record<NonNullable<MetricTrend["intent"]>, string> = {
  positive: "text-success",
  negative: "text-danger",
  neutral: "text-muted-foreground",
}

const trendIcons = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: ArrowRight,
}

const trendLabels = {
  up: "上升",
  down: "下降",
  neutral: "持平",
}

function MetricCard({
  label,
  value,
  description,
  icon,
  trend,
  tone = "neutral",
  className,
  ...props
}: MetricCardProps) {
  const direction = trend?.direction ?? "neutral"
  const TrendIcon = trendIcons[direction]

  return (
    <Card
      size="sm"
      className={cn("min-w-0", className)}
      {...props}
    >
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <p className="min-w-0 text-xs font-medium leading-5 text-muted-foreground sm:text-sm">
            {label}
          </p>
          {icon && (
            <span
              aria-hidden="true"
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl sm:size-9 [&>svg]:size-4 sm:[&>svg]:size-4.5",
                toneClasses[tone]
              )}
            >
              {icon}
            </span>
          )}
        </div>
        <div>
          <p className="break-words text-2xl font-bold tabular-nums tracking-tight text-foreground md:text-[1.75rem]">
            {value}
          </p>
          {(description || trend) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5">
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                    trendClasses[trend.intent ?? "neutral"]
                  )}
                >
                  <TrendIcon aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{trendLabels[direction]}</span>
                  {trend.value}
                  {trend.label && (
                    <span className="font-normal text-muted-foreground">
                      {trend.label}
                    </span>
                  )}
                </span>
              )}
              {description && (
                <span className="text-muted-foreground">{description}</span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export {
  MetricCard,
  type MetricCardProps,
  type MetricTone,
  type MetricTrend,
}
