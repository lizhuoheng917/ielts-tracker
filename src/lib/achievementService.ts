import { useAchievementStore } from '@/stores/achievementStore'
import { useStreakStore } from '@/stores/streakStore'
import { useWordStore } from '@/stores/wordStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { XP_RULES } from '@/lib/constants'

// ===== XP 相关 =====

/**
 * 添加 XP
 * @param amount XP 数量（可以为负数表示扣除）
 */
export function addXP(amount: number) {
  useAchievementStore.getState().addXP(amount)
}

/**
 * 根据单词数量变化计算 XP 增量
 * 每 10 个单词 +5 XP
 */
export function calculateWordXP(deltaCount: number): number {
  if (deltaCount === 0) return 0
  const units = deltaCount / 10
  return Math.round(units * XP_RULES.WORDS_PER_10)
}

/**
 * 根据练习时长变化计算 XP 增量
 * 每 30 分钟 +15 XP
 */
export function calculatePracticeXP(deltaMinutes: number): number {
  if (deltaMinutes === 0) return 0
  const units = deltaMinutes / 30
  return Math.round(units * XP_RULES.PRACTICE_PER_30MIN)
}

// ===== 徽章检测 =====

/**
 * 检测单词相关徽章
 */
export function checkWordBadges() {
  const totalWords = useWordStore.getState().records.reduce((sum, r) => sum + r.count, 0)
  const { unlockBadge } = useAchievementStore.getState()
  if (totalWords >= 100) unlockBadge('words-100')
  if (totalWords >= 1000) unlockBadge('words-1000')
}

/**
 * 检测练习相关徽章（模考 + 计时练习合并检测）
 */
export function checkPracticeBadges() {
  const examRecords = usePracticeStore.getState().records
  const timerRecords = useTimerStore.getState().records
  const { unlockBadge } = useAchievementStore.getState()
  const hasWriting =
    examRecords.some((r) => r.type === 'writing') ||
    timerRecords.some((r) => r.subject === 'writing')
  const hasSpeaking =
    examRecords.some((r) => r.type === 'speaking') ||
    timerRecords.some((r) => r.subject === 'speaking')
  const hasReading =
    examRecords.some((r) => r.type === 'reading') ||
    timerRecords.some((r) => r.subject === 'reading')
  const hasListening =
    examRecords.some((r) => r.type === 'listening') ||
    timerRecords.some((r) => r.subject === 'listening')
  if (hasWriting) unlockBadge('first-writing')
  if (hasSpeaking) unlockBadge('first-speaking')
  if (hasWriting && hasSpeaking && hasReading && hasListening) unlockBadge('all-practice')
}

/**
 * 检测日记相关徽章
 */
export function checkDiaryBadges() {
  const count = useDiaryStore.getState().entries.length
  const { unlockBadge } = useAchievementStore.getState()
  if (count >= 7) unlockBadge('diary-7')
}

/**
 * 检测连续打卡徽章
 */
export function checkStreakBadges() {
  const { currentStreak } = useStreakStore.getState()
  const { unlockBadge } = useAchievementStore.getState()
  if (currentStreak >= 7) unlockBadge('streak-7')
  if (currentStreak >= 30) unlockBadge('streak-30')
}

/**
 * 首次打卡检测
 */
export function checkFirstCheckin() {
  const { unlockBadge, isBadgeUnlocked } = useAchievementStore.getState()
  if (!isBadgeUnlocked('first-checkin')) {
    unlockBadge('first-checkin')
  }
}

// ===== 打卡相关 =====

/**
 * 处理打卡完成后的成就联动
 * 包括：首次打卡徽章、每日打卡 XP、连续打卡更新、连续打卡奖励、连续打卡徽章
 * 注意：每日打卡 XP 和 streak 更新每天只触发一次（根据 streakStore 的 lastActiveDate 判断）
 */
export function handleCheckinCompleted() {
  // 记录活动到热力图 + 自动更新连续天数（recordActivity 内部已重算 streak）
  const { isNewDay, streakExtended } = useStreakStore.getState().recordActivity()

  if (isNewDay) {
    // 新的一天第一次打卡：给每日打卡 XP
    addXP(XP_RULES.DAILY_CHECKIN)

    // 首次打卡徽章
    checkFirstCheckin()

    // 连续打卡徽章检测
    checkStreakBadges()

    // 连续 7 天以上额外奖励
    if (streakExtended) {
      const { currentStreak } = useStreakStore.getState()
      if (currentStreak >= 7) {
        addXP(XP_RULES.STREAK_BONUS_AFTER_7)
      }
    }
  } else {
    // 同一天内的后续打卡：只检查徽章（确保数据一致性）
    checkStreakBadges()
  }
}

// ===== 统计页面访问 =====

/**
 * 记录统计页面访问，并检测 stats-viewer 徽章
 */
export function recordStatsView() {
  const { incrementStatsView, unlockBadge, isBadgeUnlocked } = useAchievementStore.getState()
  const newCount = incrementStatsView()
  if (newCount >= 10 && !isBadgeUnlocked('stats-viewer')) {
    unlockBadge('stats-viewer')
  }
}

// ===== 周冠军 / 月度之星 检测 =====

/**
 * 检测周冠军徽章（一周内全部计划完成）
 * 在每周日调用
 */
export function checkWeekChampion() {
  // 此功能较为复杂，需要根据计划和执行记录计算
  // 暂时保留接口，后续可在合适时机调用
}

/**
 * 检测月度之星徽章（月度完成率 > 90%）
 * 在每月最后一天调用
 */
export function checkMonthlyStar() {
  // 此功能较为复杂，需要根据计划和执行记录计算
  // 暂时保留接口，后续可在合适时机调用
}
