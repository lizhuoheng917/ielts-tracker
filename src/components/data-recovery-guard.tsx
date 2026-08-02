import type { LocalRecoveryReport } from '@/data/localMutationJournal'

export function DataRecoveryGuard({ report }: { report: LocalRecoveryReport }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Data recovery
        </p>
        <h1 className="mt-2 text-xl font-semibold">本地数据恢复已暂停</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          检测到恢复或兼容迁移暂时无法安全完成。系统没有继续覆盖记录，请暂时不要清除浏览器数据。
        </p>
        {report.detail && (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm">{report.detail}</p>
        )}
        <button
          type="button"
          className="mt-5 min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          重新尝试恢复
        </button>
      </section>
    </main>
  )
}
