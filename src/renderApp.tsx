import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/App'
import { AuthProvider } from '@/auth/AuthProvider'
import { AccountDialogProvider } from '@/components/account/AccountDialogProvider'
import { DataRecoveryGuard } from '@/components/data-recovery-guard'
import { reconcileAchievementBadges } from '@/data/achievementReconciliation'
import { ensureActivityLedgerInitialized } from '@/data/activityLedgerBootstrap'
import { ensureDailyCheckinAwardsInitialized } from '@/data/dailyCheckinBootstrap'
import type { LocalRecoveryReport } from '@/data/localMutationJournal'
import { installTrackerCanonicalCrossTabSync } from '@/data/trackerCanonicalCrossTabSync'
import { retireLegacyCustomAiConfig } from '@/ai/retireLegacyCustomAiConfig'
import { ensureAiArtifactRepositoryInitialized } from '@/stores/aiArtifactStore'
import { usePlanStore } from '@/stores/planStore'

export async function renderApp(recoveryReport: LocalRecoveryReport) {
  const root = createRoot(document.getElementById('root')!)
  retireLegacyCustomAiConfig()
  if (recoveryReport.status === 'conflict' || recoveryReport.status === 'failed') {
    root.render(<DataRecoveryGuard report={recoveryReport} />)
    return
  }

  try {
    ensureDailyCheckinAwardsInitialized()
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown daily-checkin migration error'
    root.render(<DataRecoveryGuard report={{
      status: 'failed',
      checkedAt: new Date().toISOString(),
      detail: `每日打卡防重复数据初始化失败：${detail}`,
      requiresLedgerRebuild: false,
    }} />)
    return
  }

  try {
    ensureActivityLedgerInitialized(
      new Date().toISOString(),
      recoveryReport.requiresLedgerRebuild ? 'recovery' : 'migration',
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown bootstrap error'
    console.warn(`[data-bootstrap] optional shadow ledger initialization skipped: ${detail}`)
  }

  const executionRepair = await usePlanStore.getState().repairDuplicatePlanExecutions()
  if (executionRepair.status === 'busy' || executionRepair.status === 'failed') {
    root.render(<DataRecoveryGuard report={{
      status: 'failed',
      checkedAt: new Date().toISOString(),
      detail: executionRepair.error?.message || '计划执行唯一性检查失败。',
      requiresLedgerRebuild: false,
    }} />)
    return
  }

  installTrackerCanonicalCrossTabSync()

  try {
    reconcileAchievementBadges()
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown reconciliation error'
    console.warn(`[data-bootstrap] optional achievement reconciliation skipped: ${detail}`)
  }

  try {
    ensureAiArtifactRepositoryInitialized()
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown AI artifact migration error'
    console.warn(`[data-bootstrap] legacy AI artifact import deferred: ${detail}`)
  }

  root.render(
    <StrictMode>
      <AuthProvider>
        <AccountDialogProvider>
          <App />
        </AccountDialogProvider>
      </AuthProvider>
    </StrictMode>,
  )
}
