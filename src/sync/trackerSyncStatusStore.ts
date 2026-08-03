import { create } from 'zustand'

export type TrackerCloudSyncPhase =
  | 'idle'
  | 'checking'
  | 'syncing'
  | 'synced'
  | 'needs_choice'
  | 'paused'
  | 'offline'
  | 'error'

export interface TrackerCloudSyncStatus {
  accountUserId: string | null
  phase: TrackerCloudSyncPhase
  lastSyncedAt: string | null
  detail: string
  conflict: { localExamDate: string | null; remoteExamDate: string | null } | null
  resolveConflict: ((choice: 'local' | 'remote') => Promise<void>) | null
}

interface TrackerCloudSyncStatusStore extends TrackerCloudSyncStatus {
  update: (status: Partial<TrackerCloudSyncStatus> & Pick<TrackerCloudSyncStatus, 'phase'>) => void
  reset: (accountUserId?: string | null) => void
}

const initialStatus = (accountUserId: string | null = null): TrackerCloudSyncStatus => ({
  accountUserId,
  phase: 'idle',
  lastSyncedAt: null,
  detail: '',
  conflict: null,
  resolveConflict: null,
})

export const useTrackerSyncStatusStore = create<TrackerCloudSyncStatusStore>((set) => ({
  ...initialStatus(),
  update: (status) => set((current) => ({
    ...current,
    ...status,
  })),
  reset: (accountUserId = null) => set(initialStatus(accountUserId)),
}))
