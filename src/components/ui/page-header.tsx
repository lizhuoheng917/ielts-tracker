import type * as React from "react"

import { cn } from "@/lib/utils"

interface PageHeaderProps
  extends Omit<React.ComponentProps<"header">, "title"> {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  meta?: React.ReactNode
}

function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  meta,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </div>
        )}
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5"
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
            {description && (
              <div className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                {description}
              </div>
            )}
          </div>
        </div>
        {meta && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div
          role="group"
          aria-label="页面操作"
          className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
        >
          {actions}
        </div>
      )}
    </header>
  )
}

export { PageHeader, type PageHeaderProps }
