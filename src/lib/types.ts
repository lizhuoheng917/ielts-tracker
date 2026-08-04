// ===== 单词记录 =====
export interface WordRecord {
  id: string
  date: string // YYYY-MM-DD
  category: string
  subCategory?: string
  count: number
  note?: string
  createdAt: string // ISO datetime
  updatedAt: string // ISO datetime
}

// ===== 学习计划 =====
export type PlanCategory = 'reading' | 'listening' | 'writing' | 'speaking' | 'vocabulary' | 'general'
/**
 * `custom` is a legacy value. New plans use `once`, `daily`, or `weekly` so
 * their schedule can be interpreted consistently on every device.
 */
export type PlanFrequency = 'once' | 'daily' | 'weekly' | 'custom'

export interface StudyPlan {
  id: string
  title: string
  description?: string
  category: PlanCategory
  frequency: PlanFrequency
  /**
   * The concrete local calendar date for a one-time plan. Required when
   * `frequency === 'once'`; omitted for recurring and legacy plans.
   */
  scheduledDate?: string // YYYY-MM-DD
  /**
   * Optional compatibility boundary for recurring plans. New recurring plans
   * provide this date; existing daily/weekly records without it remain valid.
   */
  startDate?: string // YYYY-MM-DD
  /** Optional inclusive end boundary for a recurring plan. */
  endDate?: string // YYYY-MM-DD
  weekDays?: number[] // 0=Sunday, 1=Monday, ... 6=Saturday
  targetTime?: string // HH:mm 格式，计划完成时间
  targetDuration?: number // 分钟
  targetCount?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PlanExecution {
  id: string
  planId: string
  date: string // YYYY-MM-DD
  isCompleted: boolean
  actualDuration?: number
  actualCount?: number
  note?: string
  /** Added for deterministic cross-device conflict ordering; legacy rows may omit it. */
  updatedAt?: string
}

// ===== 练习记录 =====
export type PracticeType = 'reading' | 'listening' | 'writing' | 'speaking'
export type MoodType = 'great' | 'good' | 'normal' | 'bad'

export interface PracticeRecord {
  id: string
  type: PracticeType
  date: string // YYYY-MM-DD
  topic?: string
  duration: number // 分钟
  score?: number // 1-9 雅思评分
  note?: string
  createdAt: string
  updatedAt: string
}

// ===== 计时练习记录 =====
export type TimerSubject = 'reading' | 'listening' | 'writing' | 'speaking' | 'general'

export interface TimerRecord {
  id: string
  subject: TimerSubject
  date: string // YYYY-MM-DD
  duration: number // 实际时长（秒）
  note?: string
  createdAt: string
  updatedAt: string
}

// ===== 学习日记 =====
export interface DiaryEntry {
  id: string
  date: string // YYYY-MM-DD
  mood: MoodType
  content: string
  createdAt: string
  updatedAt: string
}

// ===== 成就系统 =====
export interface Achievement {
  id: string
  name: string
  description: string
  icon: string // emoji
  condition: string // 标识符，用于检测逻辑
  unlockedAt?: string // ISO datetime
}

export interface AchievementState {
  unlockedBadges: string[] // badge id 列表
  totalXP: number
  level: number
  statsViewCount: number // 统计页面访问次数
}

// ===== 设置 =====
export interface Settings {
  examDate?: string // YYYY-MM-DD
  showExamCountdown: boolean // 是否在主页显示考试倒计时
  showAiSuggestions: boolean // 是否在主页显示 AI 学习建议
  theme: 'light' | 'dark' | 'system'
  lastCheckinDate?: string // YYYY-MM-DD
}

// ===== 每日奖励（正式幂等记录） =====
export interface DailyCheckinAward {
  id: string // 与 date 相同，确保一天只有一条奖励
  date: string // YYYY-MM-DD
  awardedXP: number
  awardedAt: string // ISO datetime
  source: 'manual' | 'plan' | 'migration'
  sourceEntityId?: string
}

// ===== 连续打卡 =====
export interface StreakData {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string // YYYY-MM-DD
  heatmapData: Record<string, number> // YYYY-MM-DD -> 活跃度分数
}

// ===== 等级定义 =====
export interface Level {
  level: number
  name: string
  requiredXP: number
}
