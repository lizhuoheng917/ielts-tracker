import type * as React from "react"

import { cn } from "@/lib/utils"

interface SectionHeaderProps
  extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  action?: React.ReactNode
  headingLevel?: 2 | 3
  titleId?: string
}

function SectionHeader({
  title,
  description,
  eyebrow,
  action,
  headingLevel = 2,
  titleId,
  className,
  ...props
}: SectionHeaderProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2"

  return (
    <div
      data-slot="section-header"
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </div>
        )}
        <Heading
          id={titleId}
          className="text-pretty text-base font-semibold leading-snug text-foreground md:text-lg"
        >
          {title}
        </Heading>
        {description && (
          <div className="mt-1 text-sm leading-5 text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {action && (
        <div
          role="group"
          aria-label="区块操作"
          className="flex shrink-0 items-center gap-2 sm:justify-end"
        >
          {action}
        </div>
      )}
    </div>
  )
}

export { SectionHeader, type SectionHeaderProps }
