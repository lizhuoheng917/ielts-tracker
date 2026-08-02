import type {
  DiaryEntry,
  PlanExecution,
  PracticeRecord,
  PracticeType,
  StudyPlan,
  TimerRecord,
  TimerSubject,
  WordRecord,
} from '@/lib/types'
import { countActiveDays, getRollingDateRange, type StatsRangeDays } from '@/lib/statsAnalytics'
import type { AiArtifactKindV2, AiArtifactRecordV2 } from './artifactRepository'
import type { AIPrivacyPreferences } from '@/stores/aiPrivacyStore'
import { resolveAiScopes } from './capabilities'
import type { AiContextSnapshotV1, AiPurpose } from './contracts'
import { canonicalizePlanExecutions } from '@/lib/planExecution'

const PRACTICE_TYPES: readonly PracticeType[] = ['reading', 'listening', 'writing', 'speaking']
const TIMER_SUBJECTS: readonly TimerSubject[] = ['reading', 'listening', 'writing', 'speaking', 'general']
const MAX_SNAPSHOT_AGE_SECONDS = 300

export interface LearningContextSource {
  wordRecords: readonly WordRecord[]
  practiceRecords: readonly PracticeRecord[]
  timerRecords: readonly TimerRecord[]
  plans: readonly StudyPlan[]
  planExecutions: readonly PlanExecution[]
  diaryEntries: readonly DiaryEntry[]
  aiArtifacts: readonly AiArtifactRecordV2[]
  streak: {
    currentStreak: number
    longestStreak: number
    heatmapData: Readonly<Record<string, number>>
  }
  achievement: {
    totalXP: number
    level: number
    levelName: string
  }
}

export interface BuildLearningContextOptions {
  purpose: AiPurpose
  rangeDays: StatsRangeDays
  privacy: AIPrivacyPreferences
  now?: Date
  createId?: () => string
}

interface PracticeContextSummary {
  count: number
  scoredCount: number
  averageScore: number | null
  totalDurationMinutes: number
}

interface TimerContextSummary {
  count: number
  totalDurationSeconds: number
  displayMinutes: number
}

export interface LearningContextData extends Record<string, unknown> {
  range: {
    days: StatsRangeDays
    startDate: string
    endDate: string
  }
  recordCounts: {
    wordRecords: number
    practiceRecords: number
    timerRecords: number
    planExecutions: number
    diaryEntries: number
    priorAiArtifacts: number
  }
  learner: {
    currentStreak: number
    longestStreak: number
    totalActiveDays: number
    totalXP: number
    level: number
    levelName: string
  }
  overview: {
    learnedWordCount: number
    practiceCount: number
    timerSessionCount: number
    totalStudySeconds: number
    recordedPlanExecutionCount: number
    completedPlanExecutionCount: number
    recordedPlanCompletionRate: number | null
  }
  practiceByType: Record<PracticeType, PracticeContextSummary>
  timerBySubject: Record<TimerSubject, TimerContextSummary>
  planProfile: {
    totalPlans: number
    activePlans: number
    byCategory: Record<string, number>
    byFrequency: Record<string, number>
  }
  timeline: Array<{
    date: string
    active: boolean
    wordCount: number
    practiceCount: number
    timerSessionCount: number
    studySeconds: number
    completedPlanCount: number
  }>
  recentPractice: Array<{
    date: string
    type: PracticeType
    score: number | null
    durationMinutes: number
  }>
  recentTimer: Array<{
    date: string
    subject: TimerSubject
    durationSeconds: number
  }>
  diaryExcerpts?: Array<{
    date: string
    mood: DiaryEntry['mood']
    excerpt: string
  }>
  priorAiArtifacts?: Array<{
    createdAt: string
    type: AiArtifactKindV2
    content: string
    evidenceClass: 'secondary_ai_output'
  }>
}

function assertRangeDays(value: number): asserts value is StatsRangeDays {
  if (value !== 7 && value !== 30 && value !== 90) {
    throw new Error(`Unsupported AI context range: ${value}`)
  }
}

function inRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

function sanitizeText(value: string, maxLength: number): string {
  const withoutControlCharacters = Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    })
    .join('')

  return withoutControlCharacters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function toDataTimestamp(candidates: readonly string[], fallback: string): string {
  const valid = candidates.filter((candidate) => Number.isFinite(Date.parse(candidate))).sort()
  return valid.at(-1) ?? fallback
}

function sortRecent<T extends { date: string; createdAt: string }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
}

export function buildLearningContextSnapshot(
  source: LearningContextSource,
  options: BuildLearningContextOptions,
): AiContextSnapshotV1<LearningContextData> {
  assertRangeDays(options.rangeDays)
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid AI context timestamp')

  const createdAt = now.toISOString()
  const range = getRollingDateRange(options.rangeDays, now)
  const words = source.wordRecords.filter((record) => inRange(record.date, range.startDate, range.endDate))
  const practice = source.practiceRecords.filter((record) => inRange(record.date, range.startDate, range.endDate))
  const timer = source.timerRecords.filter((record) => inRange(record.date, range.startDate, range.endDate))
  const executions = canonicalizePlanExecutions(source.planExecutions).executions
    .filter((record) => inRange(record.date, range.startDate, range.endDate))
  const diaries = source.diaryEntries.filter((record) => inRange(record.date, range.startDate, range.endDate))

  const requestedPrivateScopes = [
    ...(options.privacy.includeDiaryExcerpts ? ['diary.excerpts' as const] : []),
    ...(options.privacy.includePriorAIArtifacts ? ['ai_artifacts.history' as const] : []),
  ]
  const resolvedScopes = resolveAiScopes(
    options.purpose,
    requestedPrivateScopes,
    requestedPrivateScopes,
  )
  const includeDiaries = resolvedScopes.privateScopes.includes('diary.excerpts')
  const includeArtifacts = resolvedScopes.privateScopes.includes('ai_artifacts.history')

  const practiceByType = Object.fromEntries(PRACTICE_TYPES.map((type) => {
    const records = practice.filter((record) => record.type === type)
    const scored = records.filter((record) => typeof record.score === 'number' && record.score > 0)
    return [type, {
      count: records.length,
      scoredCount: scored.length,
      averageScore: scored.length > 0
        ? roundOne(scored.reduce((total, record) => total + (record.score ?? 0), 0) / scored.length)
        : null,
      totalDurationMinutes: records.reduce((total, record) => total + record.duration, 0),
    }]
  })) as Record<PracticeType, PracticeContextSummary>

  const timerBySubject = Object.fromEntries(TIMER_SUBJECTS.map((subject) => {
    const records = timer.filter((record) => record.subject === subject)
    const totalDurationSeconds = records.reduce((total, record) => total + record.duration, 0)
    return [subject, {
      count: records.length,
      totalDurationSeconds,
      displayMinutes: Math.floor(totalDurationSeconds / 60),
    }]
  })) as Record<TimerSubject, TimerContextSummary>

  const byCategory: Record<string, number> = {}
  const byFrequency: Record<string, number> = {}
  for (const plan of source.plans) {
    byCategory[plan.category] = (byCategory[plan.category] ?? 0) + 1
    byFrequency[plan.frequency] = (byFrequency[plan.frequency] ?? 0) + 1
  }

  const daily = new Map<string, LearningContextData['timeline'][number]>()
  for (let offset = options.rangeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    daily.set(localDate, {
      date: localDate,
      active: (source.streak.heatmapData[localDate] ?? 0) > 0,
      wordCount: 0,
      practiceCount: 0,
      timerSessionCount: 0,
      studySeconds: 0,
      completedPlanCount: 0,
    })
  }
  for (const record of words) daily.get(record.date)!.wordCount += record.count
  for (const record of practice) {
    daily.get(record.date)!.practiceCount += 1
    daily.get(record.date)!.studySeconds += record.duration * 60
  }
  for (const record of timer) {
    daily.get(record.date)!.timerSessionCount += 1
    daily.get(record.date)!.studySeconds += record.duration
  }
  for (const record of executions) {
    if (record.isCompleted) daily.get(record.date)!.completedPlanCount += 1
  }

  const completedExecutions = executions.filter((record) => record.isCompleted).length
  const diaryExcerpts = includeDiaries
    ? sortRecent(diaries).slice(0, 5).map((entry) => ({
        date: entry.date,
        mood: entry.mood,
        excerpt: sanitizeText(entry.content, 240),
      }))
    : undefined
  const priorAiArtifacts = includeArtifacts
    ? [...source.aiArtifacts]
        .filter((artifact) => artifact.kind === 'learning_analysis')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3)
        .map((artifact) => ({
          createdAt: artifact.createdAt,
          type: artifact.kind,
          content: sanitizeText(artifact.markdownProjection, 1200),
          evidenceClass: 'secondary_ai_output' as const,
        }))
    : undefined

  const data: LearningContextData = {
    range: { days: options.rangeDays, startDate: range.startDate, endDate: range.endDate },
    recordCounts: {
      wordRecords: words.length,
      practiceRecords: practice.length,
      timerRecords: timer.length,
      planExecutions: executions.length,
      diaryEntries: includeDiaries ? diaryExcerpts?.length ?? 0 : 0,
      priorAiArtifacts: includeArtifacts ? priorAiArtifacts?.length ?? 0 : 0,
    },
    learner: {
      currentStreak: source.streak.currentStreak,
      longestStreak: source.streak.longestStreak,
      totalActiveDays: countActiveDays(source.streak.heatmapData, now),
      totalXP: source.achievement.totalXP,
      level: source.achievement.level,
      levelName: source.achievement.levelName,
    },
    overview: {
      learnedWordCount: words.reduce((total, record) => total + record.count, 0),
      practiceCount: practice.length,
      timerSessionCount: timer.length,
      totalStudySeconds:
        practice.reduce((total, record) => total + record.duration * 60, 0) +
        timer.reduce((total, record) => total + record.duration, 0),
      recordedPlanExecutionCount: executions.length,
      completedPlanExecutionCount: completedExecutions,
      recordedPlanCompletionRate: executions.length > 0
        ? roundOne((completedExecutions / executions.length) * 100)
        : null,
    },
    practiceByType,
    timerBySubject,
    planProfile: {
      totalPlans: source.plans.length,
      activePlans: source.plans.filter((plan) => plan.isActive).length,
      byCategory,
      byFrequency,
    },
    timeline: [...daily.values()],
    recentPractice: sortRecent(practice).slice(0, 5).map((record) => ({
      date: record.date,
      type: record.type,
      score: record.score ?? null,
      durationMinutes: record.duration,
    })),
    recentTimer: sortRecent(timer).slice(0, 5).map((record) => ({
      date: record.date,
      subject: record.subject,
      durationSeconds: record.duration,
    })),
    ...(diaryExcerpts ? { diaryExcerpts } : {}),
    ...(priorAiArtifacts ? { priorAiArtifacts } : {}),
  }

  const recordCount = words.length + practice.length + timer.length + executions.length
  const warnings: string[] = []
  if (recordCount === 0) warnings.push('当前日期范围内没有学习记录，只能给出建立基线的建议。')
  else if (recordCount < 5) warnings.push('当前样本较少，不适合得出稳定的能力趋势。')
  if (practice.length > 0 && practice.every((record) => !record.score || record.score <= 0)) {
    warnings.push('练习记录没有有效分数，不能判断科目得分水平。')
  }

  const sourceSignature = {
    data,
    scopes: resolvedScopes.scopes,
  }
  const sourceRevision = `src-${stableHash(sourceSignature)}`
  const contextHash = `ctx-${stableHash({ purpose: options.purpose, ...sourceSignature })}`
  const dataAsOf = toDataTimestamp([
    ...words.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...practice.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...timer.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...source.plans.flatMap((plan) => [plan.createdAt, plan.updatedAt]),
    ...(includeDiaries ? diaries.flatMap((entry) => [entry.createdAt, entry.updatedAt]) : []),
    ...(includeArtifacts ? source.aiArtifacts.map((artifact) => artifact.createdAt) : []),
  ], createdAt)

  return {
    schemaVersion: 1,
    snapshotId: options.createId?.() ?? crypto.randomUUID(),
    purpose: options.purpose,
    createdAt,
    dataAsOf,
    freshness: { status: 'fresh', ageSeconds: 0, maxAgeSeconds: MAX_SNAPSHOT_AGE_SECONDS },
    sourceRevision,
    contextHash,
    scopes: resolvedScopes.scopes,
    privateScopes: resolvedScopes.privateScopes,
    quality: {
      status: recordCount === 0 ? 'empty' : recordCount < 5 ? 'limited' : 'sufficient',
      recordCount,
      warnings,
    },
    data,
  }
}
