import type { Level, Achievement, AchievementState } from './types'

// ===== 单词分类预设 =====
export const DEFAULT_WORD_CATEGORIES = [
  { id: 'academic', name: '学术词汇' },
  { id: 'high-frequency', name: '高频词汇' },
  { id: 'scene', name: '场景词汇' },
  { id: 'synonym', name: '同义替换词' },
] as const

// ===== 计划分类 =====
export const PLAN_CATEGORY_OPTIONS = [
  { value: 'reading', label: '阅读', icon: 'BookOpen' },
  { value: 'listening', label: '听力', icon: 'Headphones' },
  { value: 'writing', label: '写作', icon: 'PenTool' },
  { value: 'speaking', label: '口语', icon: 'Mic' },
  { value: 'vocabulary', label: '词汇', icon: 'BookA' },
  { value: 'general', label: '综合', icon: 'Target' },
] as const

// ===== 练习类型 =====
export const PRACTICE_TYPE_OPTIONS = [
  { value: 'reading', label: '阅读', color: '#3B82F6' },
  { value: 'listening', label: '听力', color: '#8B5CF6' },
  { value: 'writing', label: '写作', color: '#F59E0B' },
  { value: 'speaking', label: '口语', color: '#10B981' },
] as const

// ===== 心情选项 =====
export const MOOD_OPTIONS = [
  { value: 'great', label: '很棒', emoji: '😄' },
  { value: 'good', label: '不错', emoji: '🙂' },
  { value: 'normal', label: '一般', emoji: '😐' },
  { value: 'bad', label: '不好', emoji: '😞' },
] as const

// ===== 等级定义 =====
export const LEVELS: Level[] = [
  { level: 1, name: '雅思新手', requiredXP: 0 },
  { level: 2, name: '词汇萌新', requiredXP: 100 },
  { level: 3, name: '听力入门', requiredXP: 300 },
  { level: 4, name: '阅读探索', requiredXP: 600 },
  { level: 5, name: '写作练习生', requiredXP: 1000 },
  { level: 6, name: '口语达人', requiredXP: 1500 },
  { level: 7, name: '雅思战士', requiredXP: 2200 },
  { level: 8, name: '备考骑士', requiredXP: 3000 },
  { level: 9, name: '冲刺王者', requiredXP: 4000 },
  { level: 10, name: '雅思大师', requiredXP: 5500 },
]

// ===== 成就徽章定义 =====
export const BADGES: Achievement[] = [
  { id: 'first-checkin', name: '初次打卡', description: '完成第一次每日打卡', icon: '🌱', condition: 'first-checkin' },
  { id: 'streak-7', name: '连续7天', description: '连续打卡7天', icon: '🔥', condition: 'streak-7' },
  { id: 'streak-30', name: '连续30天', description: '连续打卡30天', icon: '🔥🔥', condition: 'streak-30' },
  { id: 'words-100', name: '百词达人', description: '累计背诵100个单词', icon: '📚', condition: 'words-100' },
  { id: 'words-1000', name: '千词王者', description: '累计背诵1000个单词', icon: '📖', condition: 'words-1000' },
  { id: 'first-writing', name: '写作先锋', description: '完成第一次写作练习', icon: '✍️', condition: 'first-writing' },
  { id: 'first-speaking', name: '口语挑战者', description: '完成第一次口语练习', icon: '🎙️', condition: 'first-speaking' },
  { id: 'stats-viewer', name: '数据分析师', description: '查看统计页面10次', icon: '📊', condition: 'stats-viewer' },
  { id: 'diary-7', name: '日记达人', description: '写满7篇学习日记', icon: '📝', condition: 'diary-7' },
  { id: 'all-practice', name: '全科覆盖', description: '听说读写四科都至少练习过', icon: '⭐', condition: 'all-practice' },
  { id: 'week-champion', name: '周冠军', description: '一周内全部计划完成', icon: '🏆', condition: 'week-champion' },
  { id: 'monthly-star', name: '月度之星', description: '一个月内计划完成率>90%', icon: '💎', condition: 'monthly-star' },
]

// ===== XP 获取规则 =====
export const XP_RULES = {
  DAILY_CHECKIN: 10,
  WORDS_PER_10: 5, // 每10个单词获得5XP
  PRACTICE_PER_30MIN: 15, // 每30分钟练习获得15XP
  STREAK_BONUS_AFTER_7: 20, // 连续7天以上额外奖励
  DIARY: 8,
} as const

// ===== localStorage key 前缀 =====
export const STORAGE_PREFIX = 'ielts-tracker'

// ===== 默认成就状态 =====
export const DEFAULT_ACHIEVEMENT_STATE: AchievementState = {
  unlockedBadges: [],
  totalXP: 0,
  level: 1,
  statsViewCount: 0,
}

// ===== 默认设置 =====
export const DEFAULT_SETTINGS = {
  theme: 'light' as const,
  showExamCountdown: true,
  showAiSuggestions: true,
}

// ===== 默认连续打卡数据 =====
export const DEFAULT_STREAK_DATA = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  heatmapData: {} as Record<string, number>,
}

// ===== 星期几映射 =====
export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const
