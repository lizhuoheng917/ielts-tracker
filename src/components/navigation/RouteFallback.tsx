export function RouteFallback() {
  return (
    <div
      className="route-fallback"
      role="status"
      aria-live="polite"
      aria-label="正在加载页面"
    >
      <div className="h-7 w-32 rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-2xl bg-muted/70" />
        <div className="h-24 rounded-2xl bg-muted/60" />
        <div className="h-24 rounded-2xl bg-muted/50" />
      </div>
      <span className="sr-only">正在加载页面…</span>
    </div>
  )
}
