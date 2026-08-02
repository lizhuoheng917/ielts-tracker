import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { WordRecord } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { createActivityTransactionPlan } from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import { createEntityCollectionPatch } from '@/data/localMutationJournal'

interface WordStore {
  records: WordRecord[]
  addRecord: (record: Omit<WordRecord, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateRecord: (id: string, data: Partial<Omit<WordRecord, 'id' | 'createdAt'>>) => void
  deleteRecord: (id: string) => void
  getRecordsByDate: (date: string) => WordRecord[]
  getRecordsByDateRange: (start: string, end: string) => WordRecord[]
}

const generateId = () => crypto.randomUUID()
const WORD_STORAGE_KEY = `${STORAGE_PREFIX}:wordRecords`

export const useWordStore = create<WordStore>()(
  persist(
    (set, get) => ({
      records: [],
      addRecord: (data) => {
        const now = new Date().toISOString()
        const record: WordRecord = {
          ...data,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        }
        const plan = createActivityTransactionPlan({
          action: 'word.create',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: WORD_STORAGE_KEY,
            collection: 'records',
            changes: [{ id: record.id, before: null, beforeIndex: 0, expectedAfter: record }],
          })],
          events: [{
            entityKind: 'word_record',
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
        import('@/lib/achievementService').then(({ checkWordBadges }) => {
          checkWordBadges()
        })
      },
      updateRecord: (id, data) => {
        const oldRecord = get().records.find((r) => r.id === id)
        if (!oldRecord) return
        const now = new Date().toISOString()
        const nextRecord: WordRecord = { ...oldRecord, ...data, updatedAt: now }

        const beforeIndex = get().records.findIndex((record) => record.id === id)
        const plan = createActivityTransactionPlan({
          action: 'word.update',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: WORD_STORAGE_KEY,
            collection: 'records',
            changes: [{ id, before: oldRecord, beforeIndex, expectedAfter: nextRecord }],
          })],
          events: [{
            entityKind: 'word_record',
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
        import('@/lib/achievementService').then(({ checkWordBadges }) => {
          checkWordBadges()
        })
      },
      deleteRecord: (id) => {
        const record = get().records.find((r) => r.id === id)
        if (!record) return
        const occurredAt = new Date().toISOString()

        const beforeIndex = get().records.findIndex((candidate) => candidate.id === id)
        const plan = createActivityTransactionPlan({
          action: 'word.delete',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: WORD_STORAGE_KEY,
            collection: 'records',
            changes: [{ id, before: record, beforeIndex, expectedAfter: null }],
          })],
          events: [{
            entityKind: 'word_record',
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
        import('@/lib/achievementService').then(({ checkWordBadges }) => {
          checkWordBadges()
        })
      },
      getRecordsByDate: (date) => {
        return get().records.filter((r) => r.date === date)
      },
      getRecordsByDateRange: (start, end) => {
        return get().records.filter((r) => r.date >= start && r.date <= end)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:wordRecords`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
