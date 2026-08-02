import * as React from "react"
import { SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface DataToolbarProps extends React.ComponentProps<"section"> {
  search?: React.ReactNode
  filters?: React.ReactNode
  actions?: React.ReactNode
  summary?: React.ReactNode
  mobileFilterCount?: number
  mobileFilterTitle?: React.ReactNode
  mobileFilterDescription?: React.ReactNode
}

const DESKTOP_TOOLBAR_QUERY = "(min-width: 1024px)"

function subscribeToDesktopToolbar(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined
  }

  const mediaQuery = window.matchMedia(DESKTOP_TOOLBAR_QUERY)
  mediaQuery.addEventListener("change", callback)
  return () => mediaQuery.removeEventListener("change", callback)
}

function getDesktopToolbarSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true
  }

  return window.matchMedia(DESKTOP_TOOLBAR_QUERY).matches
}

function useDesktopToolbar() {
  return React.useSyncExternalStore(
    subscribeToDesktopToolbar,
    getDesktopToolbarSnapshot,
    () => true
  )
}

function DataToolbar({
  search,
  filters,
  actions,
  summary,
  mobileFilterCount = 0,
  mobileFilterTitle = "筛选条件",
  mobileFilterDescription,
  children,
  className,
  "aria-label": ariaLabel = "数据筛选与操作",
  ...props
}: DataToolbarProps) {
  const isDesktop = useDesktopToolbar()
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false)
  const hasAdvancedControls = Boolean(filters || children || actions)
  const normalizedFilterCount = Math.max(0, Math.floor(mobileFilterCount))

  React.useEffect(() => {
    if (isDesktop) {
      setMobileFiltersOpen(false)
    }
  }, [isDesktop])

  return (
    <section
      data-slot="data-toolbar"
      aria-label={ariaLabel}
      className={cn(
        "rounded-xl border border-border bg-surface-raised p-3 shadow-[0_1px_2px_oklch(0_0_0/0.03)] md:p-4",
        className
      )}
      {...props}
    >
      {isDesktop ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {search && (
              <div className="min-w-0 flex-1 lg:max-w-sm">{search}</div>
            )}
            {filters && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {filters}
              </div>
            )}
            {actions && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
                {actions}
              </div>
            )}
          </div>
          {children && <div className="mt-3 border-t pt-3">{children}</div>}
        </>
      ) : (
        <div className="flex min-w-0 items-end gap-2">
          {search && (
            <div className="min-w-0 flex-1 [&_[data-slot=label]]:sr-only">
              {search}
            </div>
          )}
          {hasAdvancedControls && (
            <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <DialogTrigger
                render={(
                  <Button
                    type="button"
                    variant="outline"
                    className="relative h-8 shrink-0 px-2.5"
                    aria-label={normalizedFilterCount > 0
                      ? `打开筛选条件，已启用 ${normalizedFilterCount} 项`
                      : "打开筛选条件"}
                  />
                )}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                <span>筛选</span>
                {normalizedFilterCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground ring-2 ring-surface-raised"
                  >
                    {normalizedFilterCount > 9 ? "9+" : normalizedFilterCount}
                  </span>
                )}
              </DialogTrigger>
              <DialogContent
                className="inset-x-0 bottom-0 left-0 top-auto max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 gap-0 rounded-b-none rounded-t-2xl p-0 sm:max-w-none"
              >
                <DialogHeader className="border-b px-4 pb-3 pt-4 pr-12">
                  <DialogTitle>{mobileFilterTitle}</DialogTitle>
                  <DialogDescription>
                    {mobileFilterDescription ?? (normalizedFilterCount > 0
                      ? `已启用 ${normalizedFilterCount} 项高级条件，结果会即时更新。`
                      : "组合筛选条件，结果会即时更新。")}
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 space-y-4 overflow-y-auto p-4">
                  {filters && (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {filters}
                    </div>
                  )}
                  {children && <div className="border-t pt-4">{children}</div>}
                </div>
                <div className="flex gap-2 border-t bg-muted/35 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  {actions && (
                    <div className="min-w-0 flex-1 [&>[data-slot=button]]:w-full">
                      {actions}
                    </div>
                  )}
                  <DialogClose
                    render={<Button type="button" className="min-w-0 flex-1" />}
                  >
                    查看结果
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
      {summary && (
        <div
          aria-live="polite"
          className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground"
        >
          {summary}
        </div>
      )}
    </section>
  )
}

export { DataToolbar, type DataToolbarProps }
