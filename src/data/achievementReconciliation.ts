import { useAchievementStore } from '@/stores/achievementStore'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useStreakStore } from '@/stores/streakStore'
import { useTimerStore } from '@/stores/timerStore'
import { useWordStore } from '@/stores/wordStore'

export function reconcileAchievementBadges(): string[] {
  const achievements = useAchievementStore.getState()
  const unlocked: string[] = []
  const unlock = (id: string) => {
    if (achievements.unlockBadge(id)) unlocked.push(id)
  }

  if (useDailyCheckinStore.getState().awards.length > 0) unlock('first-checkin')

  const longestStreak = useStreakStore.getState().longestStreak
  if (longestStreak >= 7) unlock('streak-7')
  if (longestStreak >= 30) unlock('streak-30')

  const totalWords = useWordStore.getState().records.reduce((sum, record) => sum + record.count, 0)
  if (totalWords >= 100) unlock('words-100')
  if (totalWords >= 1000) unlock('words-1000')

  const practice = usePracticeStore.getState().records
  const timer = useTimerStore.getState().records
  const hasSubject = (subject: 'reading' | 'listening' | 'writing' | 'speaking') => (
    practice.some((record) => record.type === subject)
    || timer.some((record) => record.subject === subject)
  )
  if (hasSubject('writing')) unlock('first-writing')
  if (hasSubject('speaking')) unlock('first-speaking')
  if (
    hasSubject('reading')
    && hasSubject('listening')
    && hasSubject('writing')
    && hasSubject('speaking')
  ) unlock('all-practice')

  if (useDiaryStore.getState().entries.length >= 7) unlock('diary-7')
  if (achievements.statsViewCount >= 10) unlock('stats-viewer')

  return unlocked
}
