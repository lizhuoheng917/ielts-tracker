import './index.css'
import { withCanonicalMutationLock } from '@/data/canonicalMutationCoordinator'
import {
  readPendingLocalMutation,
  recoverPendingLocalMutation,
} from '@/data/localMutationJournal'
import { installTrackerRuntimeTelemetry } from '@/lib/runtimeTelemetry'

installTrackerRuntimeTelemetry()

async function recoverAfterActiveWriterSettles() {
  const pending = readPendingLocalMutation()
  if (pending?.phase === 'prepared') {
    // Older record stores do not yet participate in the async coordinator. A
    // new tab can observe their short synchronous journal window, so give an
    // active writer one turn to finish before treating the marker as a crash.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 60))
  }
  return recoverPendingLocalMutation()
}

void withCanonicalMutationLock(recoverAfterActiveWriterSettles)
  .then(async (recoveryReport) => {
    const { renderApp } = await import('./renderApp')
    await renderApp(recoveryReport)
  })
  .catch(async (error) => {
    const { renderApp } = await import('./renderApp')
    await renderApp({
      status: 'failed',
      checkedAt: new Date().toISOString(),
      detail: error instanceof Error ? error.message : '本地数据锁初始化失败。',
      requiresLedgerRebuild: false,
    })
  })
