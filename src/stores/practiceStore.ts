import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PracticeRecord } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { createActivityTransactionPlan } from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import { createEntityCollectionPatch } from '@/data/localMutationJournal'

interface PracticeStore {
  records: PracticeRecord[]
  addRecord: (record: Omit<PracticeRecord, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateRecord: (id: string, data: Partial<Omit<PracticeRecord, 'id' | 'createdAt'>>) => void
  deleteRecord: (id: string) => void
  getRecordsByType: (type: PracticeRecord['type']) => PracticeRecord[]
  getRecordsByDateRange: (start: string, end: string) => PracticeRecord[]
}

const generateId = () => crypto.randomUUID()
const PRACTICE_STORAGE_KEY = `${STORAGE_PREFIX}:practiceRecords`

export const usePracticeStore = create<PracticeStore>()(
  persist(
    (set, get) => ({
      records: [],
      addRecord: (data) => {
        const now = new Date().toISOString()
        const record: PracticeRecord = { ...data, id: generateId(), createdAt: now, updatedAt: now }
        const plan = createActivityTransactionPlan({
          action: 'practice.create',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: PRACTICE_STORAGE_KEY,
            collection: 'records',
            changes: [{ id: record.id, before: null, beforeIndex: 0, expectedAfter: record }],
          })],
          events: [{
            entityKind: 'practice_record',
            entityId: record.id,
            operation: 'created',
            effectiveDate: record.date,
            occurredAt: now,
            source: 'user',
            after: record,
          }],
          achievements: useAchievementStore.getState(),
          streak: useStreakStore.getState(),
          lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
          createdAt: now,
        })
        const committed = commitActivityTransaction(plan, () => {
          set((state) => ({ records: [record, ...state.records] }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
          checkPracticeBadges()
        })
      },
      updateRecord: (id, data) => {
        const oldRecord = get().records.find((r) => r.id === id)
        if (!oldRecord) return
        const now = new Date().toISOString()
        const nextRecord: PracticeRecord = { ...oldRecord, ...data, updatedAt: now }

        const beforeIndex = get().records.findIndex((record) => record.id === id)
        const plan = createActivityTransactionPlan({
          action: 'practice.update',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: PRACTICE_STORAGE_KEY,
            collection: 'records',
            changes: [{ id, before: oldRecord, beforeIndex, expectedAfter: nextRecord }],
          })],
          events: [{
            entityKind: 'practice_record',
            entityId: id,
            operation: 'updated',
            effectiveDate: nextRecord.date,
            occurredAt: now,
            source: 'user',
            before: oldRecord,
            after: nextRecord,
          }],
          achievements: useAchievementStore.getState(),
          streak: useStreakStore.getState(),
          lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
          createdAt: now,
        })
        const committed = commitActivityTransaction(plan, () => {
          set((state) => ({
            records: state.records.map((record) => (record.id === id ? nextRecord : record)),
          }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
          checkPracticeBadges()
        })
      },
      deleteRecord: (id) => {
        const record = get().records.find((r) => r.id === id)
        if (!record) return
        const occurredAt = new Date().toISOString()

        const beforeIndex = get().records.findIndex((candidate) => candidate.id === id)
        const plan = createActivityTransactionPlan({
          action: 'practice.delete',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: PRACTICE_STORAGE_KEY,
            collection: 'records',
            changes: [{ id, before: record, beforeIndex, expectedAfter: null }],
          })],
          events: [{
            entityKind: 'practice_record',
            entityId: id,
            operation: 'deleted',
            effectiveDate: record.date,
            occurredAt,
            source: 'user',
            before: record,
          }],
          achievements: useAchievementStore.getState(),
          streak: useStreakStore.getState(),
          lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
          createdAt: occurredAt,
        })
        const committed = commitActivityTransaction(plan, () => {
          set((state) => ({ records: state.records.filter((candidate) => candidate.id !== id) }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
          checkPracticeBadges()
        })
      },
      getRecordsByType: (type) => {
        return get().records.filter((r) => r.type === type)
      },
      getRecordsByDateRange: (start, end) => {
        return get().records.filter((r) => r.date >= start && r.date <= end)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:practiceRecords`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
