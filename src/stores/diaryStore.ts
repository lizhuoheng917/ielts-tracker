import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DiaryEntry } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { createActivityTransactionPlan } from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import { createEntityCollectionPatch } from '@/data/localMutationJournal'

interface DiaryStore {
  entries: DiaryEntry[]
  addEntry: (entry: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateEntry: (id: string, data: Partial<Omit<DiaryEntry, 'id' | 'createdAt'>>) => void
  deleteEntry: (id: string) => void
  getEntryByDate: (date: string) => DiaryEntry | undefined
}

const generateId = () => crypto.randomUUID()
const DIARY_STORAGE_KEY = `${STORAGE_PREFIX}:diaryEntries`

export const useDiaryStore = create<DiaryStore>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (data) => {
        const now = new Date().toISOString()
        const entry: DiaryEntry = { ...data, id: generateId(), createdAt: now, updatedAt: now }
        const plan = createActivityTransactionPlan({
          action: 'diary.create',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: DIARY_STORAGE_KEY,
            collection: 'entries',
            changes: [{ id: entry.id, before: null, beforeIndex: 0, expectedAfter: entry }],
          })],
          events: [{
            entityKind: 'diary_entry',
            entityId: entry.id,
            operation: 'created',
            effectiveDate: entry.date,
            occurredAt: now,
            source: 'user',
            after: entry,
          }],
          achievements: useAchievementStore.getState(),
          streak: useStreakStore.getState(),
          lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
          createdAt: now,
        })
        const committed = commitActivityTransaction(plan, () => {
          set((state) => ({ entries: [entry, ...state.entries] }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkDiaryBadges }) => {
          checkDiaryBadges()
        })
      },
      updateEntry: (id, data) => {
        const oldEntry = get().entries.find((entry) => entry.id === id)
        if (!oldEntry) return
        const now = new Date().toISOString()
        const nextEntry: DiaryEntry = { ...oldEntry, ...data, updatedAt: now }
        const beforeIndex = get().entries.findIndex((entry) => entry.id === id)
        const plan = createActivityTransactionPlan({
          action: 'diary.update',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: DIARY_STORAGE_KEY,
            collection: 'entries',
            changes: [{ id, before: oldEntry, beforeIndex, expectedAfter: nextEntry }],
          })],
          events: [{
            entityKind: 'diary_entry',
            entityId: id,
            operation: 'updated',
            effectiveDate: nextEntry.date,
            occurredAt: now,
            source: 'user',
            before: oldEntry,
            after: nextEntry,
          }],
          achievements: useAchievementStore.getState(),
          streak: useStreakStore.getState(),
          lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
          createdAt: now,
        })
        const committed = commitActivityTransaction(plan, () => {
          set((state) => ({
            entries: state.entries.map((entry) => (entry.id === id ? nextEntry : entry)),
          }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkDiaryBadges }) => {
          checkDiaryBadges()
        })
      },
      deleteEntry: (id) => {
        const entry = get().entries.find((candidate) => candidate.id === id)
        if (!entry) return
        const occurredAt = new Date().toISOString()
        const beforeIndex = get().entries.findIndex((candidate) => candidate.id === id)
        const plan = createActivityTransactionPlan({
          action: 'diary.delete',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: DIARY_STORAGE_KEY,
            collection: 'entries',
            changes: [{ id, before: entry, beforeIndex, expectedAfter: null }],
          })],
          events: [{
            entityKind: 'diary_entry',
            entityId: id,
            operation: 'deleted',
            effectiveDate: entry.date,
            occurredAt,
            source: 'user',
            before: entry,
          }],
          achievements: useAchievementStore.getState(),
          streak: useStreakStore.getState(),
          lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
          createdAt: occurredAt,
        })
        const committed = commitActivityTransaction(plan, () => {
          set((state) => ({ entries: state.entries.filter((candidate) => candidate.id !== id) }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkDiaryBadges }) => {
          checkDiaryBadges()
        })
      },
      getEntryByDate: (date) => {
        return get().entries.find((e) => e.date === date)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:diaryEntries`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
