import { isLocalDate } from '@/lib/localDate'
import {
  parseDailySuggestionV2,
  parseLearningAnalysisV2,
  parsePlanDraftV2,
} from '@/ai/structuredOutputs'
import { parsePlanCreateCommandDraft, type PlanCreateCommandDraft } from '@/ai/planCommands'
import type { AiCommandReceipt } from '@/ai/contracts'
import {
  convertLegacyAiArtifacts,
  makePortableAiArtifacts,
  parseAiArtifactRecordV2,
  type AiArtifactRecordV2,
} from '@/ai/artifactRepository'
import type {
  AchievementState,
  DailyCheckinAward,
  DiaryEntry,
  PlanExecution,
  PracticeRecord,
  StreakData,
  StudyPlan,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import type { AiSuggestion } from '@/stores/aiSuggestionStore'
import type { ChatMessageRecord } from '@/stores/chatStore'
import type { AnalysisReport } from '@/stores/reportStore'
import type { WritingReport } from '@/stores/writingReportStore'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupDataV3,
  type BackupImportResult,
  type BackupSettings,
  type BackupV3,
} from './backupTypes'

type UnknownRecord = Record<string, unknown>

const PRACTICE_TYPES = ['reading', 'listening', 'writing', 'speaking'] as const
const TIMER_SUBJECTS = [...PRACTICE_TYPES, 'general'] as const
const PLAN_CATEGORIES = [...PRACTICE_TYPES, 'vocabulary', 'general'] as const
const PLAN_FREQUENCIES = ['once', 'daily', 'weekly', 'custom'] as const
const MOODS = ['great', 'good', 'normal', 'bad'] as const
const THEMES = ['light', 'dark', 'system'] as const
const CHAT_ROLES = ['user', 'assistant'] as const
const CHAT_STATUSES = ['streaming', 'done', 'error'] as const
const ESSAY_TYPES = ['task1', 'task2'] as const
const REPORT_TYPES = ['learning_analysis', 'writing_correction'] as const
const AI_SUGGESTION_SOURCES = ['managed', 'custom'] as const
const AI_COMMAND_RECEIPT_STATUSES = [
  'applied',
  'duplicate',
  'rejected',
  'failed',
  'stale',
  'scope_mismatch',
] as const

export class BackupValidationError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'BackupValidationError'
    this.path = path
  }
}

function fail(path: string, message: string): never {
  throw new BackupValidationError(path, message)
}

function asObject(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, '应为对象')
  }
  return value as UnknownRecord
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, '应为数组')
  return value
}

function asString(value: unknown, path: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    fail(path, allowEmpty ? '应为字符串' : '应为非空字符串')
  }
  return value
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, '应为布尔值')
  return value
}

function asFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, '应为有限数字')
  return value
}

function asNonNegativeNumber(value: unknown, path: string): number {
  const number = asFiniteNumber(value, path)
  if (number < 0) fail(path, '不能为负数')
  return number
}

function asNonNegativeInteger(value: unknown, path: string): number {
  const number = asNonNegativeNumber(value, path)
  if (!Number.isInteger(number)) fail(path, '应为整数')
  return number
}

function asPositiveInteger(value: unknown, path: string): number {
  const number = asNonNegativeInteger(value, path)
  if (number < 1) fail(path, '应大于等于 1')
  return number
}

function asEnum<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    fail(path, `应为 ${values.join(' | ')}`)
  }
  return value as T[number]
}

function asLocalDate(value: unknown, path: string, allowEmpty = false): string {
  if (allowEmpty && value === '') return ''
  if (!isLocalDate(value)) fail(path, '应为有效的本地日期 YYYY-MM-DD')
  return value
}

function asIsoDateTime(value: unknown, path: string): string {
  const dateTime = asString(value, path, false)
  if (Number.isNaN(Date.parse(dateTime))) fail(path, '应为有效的 ISO 日期时间')
  return dateTime
}

function optionalString(object: UnknownRecord, key: string, path: string): string | undefined {
  if (object[key] === undefined) return undefined
  return asString(object[key], `${path}.${key}`)
}

function optionalLocalDate(object: UnknownRecord, key: string, path: string): string | undefined {
  if (object[key] === undefined) return undefined
  return asLocalDate(object[key], `${path}.${key}`)
}

function optionalNonNegativeNumber(
  object: UnknownRecord,
  key: string,
  path: string
): number | undefined {
  if (object[key] === undefined) return undefined
  return asNonNegativeNumber(object[key], `${path}.${key}`)
}

function assertJsonValue(value: unknown, path: string, depth = 0): void {
  if (depth > 50) fail(path, '嵌套层级过深')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    asFiniteNumber(value, path)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, depth + 1))
    return
  }
  if (typeof value === 'object') {
    Object.entries(value as UnknownRecord).forEach(([key, item]) => {
      assertJsonValue(item, `${path}.${key}`, depth + 1)
    })
    return
  }
  fail(path, '应为可 JSON 序列化的值')
}

function validateWordRecord(value: unknown, path: string): WordRecord {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asLocalDate(object.date, `${path}.date`)
  asString(object.category, `${path}.category`, false)
  optionalString(object, 'subCategory', path)
  asNonNegativeNumber(object.count, `${path}.count`)
  optionalString(object, 'note', path)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  asIsoDateTime(object.updatedAt, `${path}.updatedAt`)
  return object as unknown as WordRecord
}

function validatePracticeRecord(value: unknown, path: string): PracticeRecord {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asEnum(object.type, PRACTICE_TYPES, `${path}.type`)
  asLocalDate(object.date, `${path}.date`)
  optionalString(object, 'topic', path)
  asNonNegativeNumber(object.duration, `${path}.duration`)
  const score = optionalNonNegativeNumber(object, 'score', path)
  if (score !== undefined && score > 9) fail(`${path}.score`, '不能大于 9')
  optionalString(object, 'note', path)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  asIsoDateTime(object.updatedAt, `${path}.updatedAt`)
  return object as unknown as PracticeRecord
}

function validateTimerRecord(value: unknown, path: string): TimerRecord {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asEnum(object.subject, TIMER_SUBJECTS, `${path}.subject`)
  asLocalDate(object.date, `${path}.date`)
  asNonNegativeNumber(object.duration, `${path}.duration`)
  optionalString(object, 'note', path)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  asIsoDateTime(object.updatedAt, `${path}.updatedAt`)
  return object as unknown as TimerRecord
}

function validateStudyPlan(value: unknown, path: string): StudyPlan {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asString(object.title, `${path}.title`, false)
  optionalString(object, 'description', path)
  asEnum(object.category, PLAN_CATEGORIES, `${path}.category`)
  const frequency = asEnum(object.frequency, PLAN_FREQUENCIES, `${path}.frequency`)
  const scheduledDate = optionalLocalDate(object, 'scheduledDate', path)
  const startDate = optionalLocalDate(object, 'startDate', path)
  const endDate = optionalLocalDate(object, 'endDate', path)
  if (frequency === 'once') {
    if (scheduledDate === undefined) {
      fail(`${path}.scheduledDate`, '单次计划必须提供安排日期')
    }
    if (startDate !== undefined || endDate !== undefined) {
      fail(path, '单次计划不能包含重复计划的起止日期')
    }
  } else if (frequency === 'daily' || frequency === 'weekly') {
    if (scheduledDate !== undefined) {
      fail(`${path}.scheduledDate`, '仅单次计划可以提供安排日期')
    }
    // Pre-scheduling daily/weekly plans legitimately have neither date. An
    // explicit end date, however, has no safe interpretation without a start.
    if (endDate !== undefined && startDate === undefined) {
      fail(`${path}.endDate`, '需要同时提供 startDate')
    }
    if (startDate !== undefined && endDate !== undefined && endDate < startDate) {
      fail(`${path}.endDate`, '不能早于 startDate')
    }
  }
  if (object.weekDays !== undefined) {
    asArray(object.weekDays, `${path}.weekDays`).forEach((day, index) => {
      const weekday = asNonNegativeInteger(day, `${path}.weekDays[${index}]`)
      if (weekday > 6) fail(`${path}.weekDays[${index}]`, '应介于 0 到 6')
    })
  }
  if (
    frequency === 'once'
    && object.weekDays !== undefined
    && asArray(object.weekDays, `${path}.weekDays`).length > 0
  ) {
    fail(`${path}.weekDays`, '单次计划不应包含重复星期')
  }
  if (object.targetTime !== undefined) {
    const targetTime = asString(object.targetTime, `${path}.targetTime`)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(targetTime)) {
      fail(`${path}.targetTime`, '应为有效时间 HH:mm')
    }
  }
  optionalNonNegativeNumber(object, 'targetDuration', path)
  optionalNonNegativeNumber(object, 'targetCount', path)
  asBoolean(object.isActive, `${path}.isActive`)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  asIsoDateTime(object.updatedAt, `${path}.updatedAt`)
  return object as unknown as StudyPlan
}

function validatePlanExecution(value: unknown, path: string): PlanExecution {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asString(object.planId, `${path}.planId`, false)
  asLocalDate(object.date, `${path}.date`)
  asBoolean(object.isCompleted, `${path}.isCompleted`)
  optionalNonNegativeNumber(object, 'actualDuration', path)
  optionalNonNegativeNumber(object, 'actualCount', path)
  optionalString(object, 'note', path)
  return object as unknown as PlanExecution
}

function validatePlanExecutions(value: unknown, path: string): PlanExecution[] {
  // Keep legacy semantic duplicates importable. The startup migration removes
  // non-canonical `(planId,date)` records through the activity transaction so
  // any historic heatmap contribution is corrected at the same time.
  return validateUniqueIdArray(value, path, validatePlanExecution)
}

function validateDiaryEntry(value: unknown, path: string): DiaryEntry {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asLocalDate(object.date, `${path}.date`)
  asEnum(object.mood, MOODS, `${path}.mood`)
  asString(object.content, `${path}.content`)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  asIsoDateTime(object.updatedAt, `${path}.updatedAt`)
  return object as unknown as DiaryEntry
}

function validateDailyCheckinAward(value: unknown, path: string): DailyCheckinAward {
  const object = asObject(value, path)
  const id = asLocalDate(object.id, `${path}.id`)
  const date = asLocalDate(object.date, `${path}.date`)
  if (id !== date) fail(`${path}.id`, '必须与 date 相同')
  asNonNegativeNumber(object.awardedXP, `${path}.awardedXP`)
  asIsoDateTime(object.awardedAt, `${path}.awardedAt`)
  asEnum(object.source, ['manual', 'plan', 'migration'] as const, `${path}.source`)
  optionalString(object, 'sourceEntityId', path)
  return object as unknown as DailyCheckinAward
}

function migrateMissingDailyCheckinAwards(
  executions: PlanExecution[],
  lastCheckinDate: string | undefined,
  awardedAt: string,
): DailyCheckinAward[] {
  const awardsByDate = new Map<string, DailyCheckinAward>()

  for (const execution of executions) {
    if (!execution.isCompleted || awardsByDate.has(execution.date)) continue
    awardsByDate.set(execution.date, {
      id: execution.date,
      date: execution.date,
      awardedXP: 0,
      awardedAt,
      source: 'migration',
      sourceEntityId: execution.id,
    })
  }

  if (lastCheckinDate && !awardsByDate.has(lastCheckinDate)) {
    awardsByDate.set(lastCheckinDate, {
      id: lastCheckinDate,
      date: lastCheckinDate,
      awardedXP: 0,
      awardedAt,
      source: 'migration',
    })
  }

  return [...awardsByDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function validateAnalysisReport(value: unknown, path: string): AnalysisReport {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asString(object.title, `${path}.title`)
  asString(object.content, `${path}.content`)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  if (object.type !== undefined) asEnum(object.type, REPORT_TYPES, `${path}.type`)
  if (object.metadata !== undefined) {
    const metadata = asObject(object.metadata, `${path}.metadata`)
    assertJsonValue(object.metadata, `${path}.metadata`)
    if (metadata.outputSchemaVersion !== undefined || metadata.structuredContent !== undefined) {
      if (metadata.outputSchemaVersion !== 2) {
        fail(`${path}.metadata.outputSchemaVersion`, '结构化报告版本应为 2')
      }
      try {
        parseLearningAnalysisV2(metadata.structuredContent)
      } catch {
        fail(`${path}.metadata.structuredContent`, '应为有效的 LearningAnalysisV2')
      }
    }
  }
  return object as unknown as AnalysisReport
}

function validateWritingReport(value: unknown, path: string): WritingReport {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asEnum(object.essayType, ESSAY_TYPES, `${path}.essayType`)
  asString(object.essayContent, `${path}.essayContent`)
  const scores = asObject(object.scores, `${path}.scores`)
  for (const key of ['tr_ta', 'cc', 'lr', 'gra', 'total']) {
    const score = asNonNegativeNumber(scores[key], `${path}.scores.${key}`)
    if (score > 9) fail(`${path}.scores.${key}`, '不能大于 9')
  }
  asString(object.feedback, `${path}.feedback`)
  asArray(object.suggestions, `${path}.suggestions`).forEach((suggestion, index) => {
    asString(suggestion, `${path}.suggestions[${index}]`)
  })
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  return object as unknown as WritingReport
}

function validateChatMessage(value: unknown, path: string): ChatMessageRecord {
  const object = asObject(value, path)
  asString(object.id, `${path}.id`, false)
  asEnum(object.role, CHAT_ROLES, `${path}.role`)
  asString(object.content, `${path}.content`)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  if (object.status !== undefined) asEnum(object.status, CHAT_STATUSES, `${path}.status`)
  if (object.actions !== undefined) {
    asArray(object.actions, `${path}.actions`).forEach((action, index) => {
      const actionObject = asObject(action, `${path}.actions[${index}]`)
      asString(actionObject.id, `${path}.actions[${index}].id`, false)
      asString(actionObject.type, `${path}.actions[${index}].type`, false)
      asString(actionObject.title, `${path}.actions[${index}].title`)
      asString(actionObject.description, `${path}.actions[${index}].description`)
    })
  }
  if (object.actionConfirmedIds !== undefined) {
    asArray(object.actionConfirmedIds, `${path}.actionConfirmedIds`).forEach((id, index) => {
      asString(id, `${path}.actionConfirmedIds[${index}]`, false)
    })
  }
  if (object.planDraft !== undefined) {
    try {
      parsePlanDraftV2(object.planDraft)
    } catch {
      fail(`${path}.planDraft`, '应为有效的 PlanDraftV2')
    }
  }
  if (object.commandDrafts !== undefined) {
    const drafts = asArray(object.commandDrafts, `${path}.commandDrafts`)
    if (drafts.length > 4) fail(`${path}.commandDrafts`, '最多包含 4 条计划命令')
    const seenDraftIds = new Set<string>()
    drafts.forEach((draft, index) => {
      const validated = validatePlanCommandDraft(draft, `${path}.commandDrafts[${index}]`)
      if (seenDraftIds.has(validated.draftId)) {
        fail(`${path}.commandDrafts[${index}].draftId`, '不能重复')
      }
      seenDraftIds.add(validated.draftId)
    })
  }
  return object as unknown as ChatMessageRecord
}

function validatePlanCommandDraft(value: unknown, path: string): PlanCreateCommandDraft {
  try {
    return parsePlanCreateCommandDraft(value)
  } catch {
    fail(path, '应为有效且字段完整的计划命令')
  }
}

function validateAiCommandReceipt(value: unknown, path: string): AiCommandReceipt {
  const object = asObject(value, path)
  if (object.schemaVersion !== 1) fail(`${path}.schemaVersion`, '应为 1')
  asString(object.receiptId, `${path}.receiptId`, false)
  asString(object.draftId, `${path}.draftId`, false)
  if (object.action !== 'plan.create') fail(`${path}.action`, '只支持 plan.create')
  asString(object.idempotencyKey, `${path}.idempotencyKey`, false)
  asEnum(object.status, AI_COMMAND_RECEIPT_STATUSES, `${path}.status`)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  if (object.targetId !== undefined) asString(object.targetId, `${path}.targetId`, false)
  if (object.error !== undefined) {
    const error = asObject(object.error, `${path}.error`)
    asString(error.code, `${path}.error.code`, false)
    asString(error.message, `${path}.error.message`, false)
  }
  return object as unknown as AiCommandReceipt
}

function validateAiSuggestion(value: unknown, path: string): AiSuggestion | null {
  if (value === null) return null
  const object = asObject(value, path)
  asString(object.content, `${path}.content`)
  asIsoDateTime(object.createdAt, `${path}.createdAt`)
  if (object.schemaVersion !== undefined) {
    if (object.schemaVersion !== 2) fail(`${path}.schemaVersion`, '仅支持结构化建议版本 2')
  }
  if (object.structuredContent !== undefined) {
    try {
      parseDailySuggestionV2(object.structuredContent)
    } catch {
      fail(`${path}.structuredContent`, '应为有效的 DailySuggestionV2')
    }
  }
  if (object.metadata !== undefined) {
    const metadata = asObject(object.metadata, `${path}.metadata`)
    asEnum(metadata.source, AI_SUGGESTION_SOURCES, `${path}.metadata.source`)
    asIsoDateTime(metadata.dataAsOf, `${path}.metadata.dataAsOf`)
    asPositiveInteger(metadata.rangeDays, `${path}.metadata.rangeDays`)
    if (metadata.runId !== undefined) asString(metadata.runId, `${path}.metadata.runId`, false)
    asArray(metadata.warnings, `${path}.metadata.warnings`).forEach((warning, index) => {
      asString(warning, `${path}.metadata.warnings[${index}]`)
    })
  }
  return object as unknown as AiSuggestion
}

function validateAchievements(value: unknown, path: string): AchievementState {
  const object = asObject(value, path)
  asArray(object.unlockedBadges, `${path}.unlockedBadges`).forEach((id, index) => {
    asString(id, `${path}.unlockedBadges[${index}]`, false)
  })
  asFiniteNumber(object.totalXP, `${path}.totalXP`)
  asPositiveInteger(object.level, `${path}.level`)
  asNonNegativeInteger(object.statsViewCount, `${path}.statsViewCount`)
  return object as unknown as AchievementState
}

function validateStreak(value: unknown, path: string): StreakData {
  const object = asObject(value, path)
  asNonNegativeInteger(object.currentStreak, `${path}.currentStreak`)
  asNonNegativeInteger(object.longestStreak, `${path}.longestStreak`)
  asLocalDate(object.lastActiveDate, `${path}.lastActiveDate`, true)
  const heatmap = asObject(object.heatmapData, `${path}.heatmapData`)
  Object.entries(heatmap).forEach(([date, count]) => {
    asLocalDate(date, `${path}.heatmapData key`)
    asNonNegativeNumber(count, `${path}.heatmapData.${date}`)
  })
  return object as unknown as StreakData
}

function validateSettings(value: unknown, path: string): BackupSettings {
  const object = asObject(value, path)
  if (object.examDate !== undefined) asLocalDate(object.examDate, `${path}.examDate`)
  asBoolean(object.showExamCountdown, `${path}.showExamCountdown`)
  asBoolean(object.showAiSuggestions, `${path}.showAiSuggestions`)
  asEnum(object.theme, THEMES, `${path}.theme`)
  if (object.lastCheckinDate !== undefined) {
    asLocalDate(object.lastCheckinDate, `${path}.lastCheckinDate`)
  }
  return object as unknown as BackupSettings
}

function validateArray<T>(
  value: unknown,
  path: string,
  validator: (item: unknown, itemPath: string) => T
): T[] {
  return asArray(value, path).map((item, index) => validator(item, `${path}[${index}]`))
}

function validateUniqueIdArray<T extends { id: string }>(
  value: unknown,
  path: string,
  validator: (item: unknown, itemPath: string) => T,
): T[] {
  const records = validateArray(value, path, validator)
  const seenIds = new Set<string>()
  records.forEach((record, index) => {
    if (seenIds.has(record.id)) fail(`${path}[${index}].id`, '不能与同一集合中的其他记录重复')
    seenIds.add(record.id)
  })
  return records
}

function validateAiArtifact(value: unknown, path: string): AiArtifactRecordV2 {
  try {
    return parseAiArtifactRecordV2(value)
  } catch {
    fail(path, '应为有效的 AI 内容记录 V2')
  }
}

function validateAiArtifacts(value: unknown, path: string): AiArtifactRecordV2[] {
  const artifacts = validateArray(value, path, validateAiArtifact)
  const seenIds = new Set<string>()
  artifacts.forEach((artifact, index) => {
    if (seenIds.has(artifact.recordId)) {
      fail(`${path}[${index}].recordId`, '不能与同一集合中的其他记录重复')
    }
    seenIds.add(artifact.recordId)
  })

  // Account ownership is installation state, not portable user data. Accept a
  // valid runtime record, then discard its account id at the backup boundary.
  return makePortableAiArtifacts(artifacts)
}

function validateCommonBackupData(
  object: UnknownRecord,
  path: string,
  migrationAwardedAt: string,
): Omit<BackupDataV3, 'aiArtifacts'> {
  const conversationsObject = asObject(object.chatConversations, `${path}.chatConversations`)
  const chatConversations: Record<string, ChatMessageRecord[]> = {}
  Object.entries(conversationsObject).forEach(([context, messages]) => {
    chatConversations[context] = validateArray(
      messages,
      `${path}.chatConversations.${context}`,
      validateChatMessage
    )
  })

  const executions = validatePlanExecutions(object.executions, `${path}.executions`)
  const settings = validateSettings(object.settings, `${path}.settings`)
  const dailyCheckins = object.dailyCheckins === undefined
    ? migrateMissingDailyCheckinAwards(executions, settings.lastCheckinDate, migrationAwardedAt)
    : validateUniqueIdArray(
        object.dailyCheckins,
        `${path}.dailyCheckins`,
        validateDailyCheckinAward,
      )

  return {
    words: validateUniqueIdArray(object.words, `${path}.words`, validateWordRecord),
    practice: validateUniqueIdArray(object.practice, `${path}.practice`, validatePracticeRecord),
    timer: validateUniqueIdArray(object.timer, `${path}.timer`, validateTimerRecord),
    plans: validateUniqueIdArray(object.plans, `${path}.plans`, validateStudyPlan),
    executions,
    planCommandReceipts: validateUniqueIdArray(
      object.planCommandReceipts ?? [],
      `${path}.planCommandReceipts`,
      (item, itemPath) => {
        const receipt = validateAiCommandReceipt(item, itemPath)
        return { ...receipt, id: receipt.receiptId }
      },
    ).map(({ id: _id, ...receipt }) => receipt),
    diary: validateUniqueIdArray(object.diary, `${path}.diary`, validateDiaryEntry),
    dailyCheckins,
    writingReports: validateArray(
      object.writingReports,
      `${path}.writingReports`,
      validateWritingReport
    ),
    chatConversations,
    achievements: validateAchievements(object.achievements, `${path}.achievements`),
    streak: validateStreak(object.streak, `${path}.streak`),
    settings,
  }
}

export function validateBackupDataV3(
  value: unknown,
  path = '$.data',
  migrationAwardedAt = new Date().toISOString(),
): BackupDataV3 {
  const object = asObject(value, path)
  return {
    ...validateCommonBackupData(object, path, migrationAwardedAt),
    aiArtifacts: validateAiArtifacts(object.aiArtifacts, `${path}.aiArtifacts`),
  }
}

export function validateBackupV3(value: unknown): BackupV3 {
  const object = asObject(value, '$')
  if (object.format !== BACKUP_FORMAT) fail('$.format', `应为 ${BACKUP_FORMAT}`)
  if (object.version !== BACKUP_VERSION) fail('$.version', `应为 ${BACKUP_VERSION}`)
  const exportedAt = asIsoDateTime(object.exportedAt, '$.exportedAt')
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: validateBackupDataV3(object.data, '$.data', exportedAt),
  }
}

function cloneBackupData(data: BackupDataV3): BackupDataV3 {
  return JSON.parse(JSON.stringify(data)) as BackupDataV3
}

function convertValidatedLegacyAiArtifacts(
  suggestion: AiSuggestion | null,
  reports: AnalysisReport[],
  path: string,
): AiArtifactRecordV2[] {
  try {
    return makePortableAiArtifacts(convertLegacyAiArtifacts(suggestion, reports))
  } catch {
    fail(path, '旧版 AI 内容无法转换为统一内容记录')
  }
}

/** Converts a complete V2 archive into the single-source V3 artifact model. */
export function migrateLegacyBackupV2(value: unknown): BackupV3 {
  const object = asObject(value, '$')
  if (object.format !== BACKUP_FORMAT) fail('$.format', `应为 ${BACKUP_FORMAT}`)
  if (object.version !== 2) fail('$.version', '应为 2')
  const exportedAt = asIsoDateTime(object.exportedAt, '$.exportedAt')
  const dataObject = asObject(object.data, '$.data')
  const reports = validateArray(dataObject.reports, '$.data.reports', validateAnalysisReport)
  const suggestion = validateAiSuggestion(dataObject.aiSuggestion, '$.data.aiSuggestion')

  // V2 may contain `aiPreferences`; it is deliberately omitted so an import
  // cannot change provider presets, credentials, endpoints or model routing.
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: {
      ...validateCommonBackupData(dataObject, '$.data', exportedAt),
      aiArtifacts: convertValidatedLegacyAiArtifacts(
        suggestion,
        reports,
        '$.data.reports|aiSuggestion',
      ),
    },
  }
}

function validateLegacySettings(value: unknown, current: BackupSettings): BackupSettings {
  const object = asObject(value, '$.settings')
  const next = { ...current }
  if (object.examDate !== undefined) next.examDate = asLocalDate(object.examDate, '$.settings.examDate')
  if (object.showExamCountdown !== undefined) {
    next.showExamCountdown = asBoolean(object.showExamCountdown, '$.settings.showExamCountdown')
  }
  if (object.showAiSuggestions !== undefined) {
    next.showAiSuggestions = asBoolean(object.showAiSuggestions, '$.settings.showAiSuggestions')
  }
  if (object.theme !== undefined) next.theme = asEnum(object.theme, THEMES, '$.settings.theme')
  if (object.lastCheckinDate !== undefined) {
    next.lastCheckinDate = asLocalDate(object.lastCheckinDate, '$.settings.lastCheckinDate')
  }
  return next
}

function validateLegacyAchievements(value: unknown, current: AchievementState): AchievementState {
  const object = asObject(value, '$.achievements')
  const next = { ...current }
  if (object.unlockedBadges !== undefined) {
    next.unlockedBadges = asArray(object.unlockedBadges, '$.achievements.unlockedBadges').map(
      (id, index) => asString(id, `$.achievements.unlockedBadges[${index}]`, false)
    )
  }
  if (object.totalXP !== undefined) next.totalXP = asFiniteNumber(object.totalXP, '$.achievements.totalXP')
  if (object.level !== undefined) next.level = asPositiveInteger(object.level, '$.achievements.level')
  if (object.statsViewCount !== undefined) {
    next.statsViewCount = asNonNegativeInteger(object.statsViewCount, '$.achievements.statsViewCount')
  }
  return next
}

function validateLegacyStreak(value: unknown, current: StreakData): StreakData {
  const object = asObject(value, '$.streak')
  const next = { ...current }
  if (object.currentStreak !== undefined) {
    next.currentStreak = asNonNegativeInteger(object.currentStreak, '$.streak.currentStreak')
  }
  if (object.longestStreak !== undefined) {
    next.longestStreak = asNonNegativeInteger(object.longestStreak, '$.streak.longestStreak')
  }
  if (object.lastActiveDate !== undefined) {
    next.lastActiveDate = asLocalDate(object.lastActiveDate, '$.streak.lastActiveDate', true)
  }
  if (object.heatmapData !== undefined) {
    const heatmapObject = asObject(object.heatmapData, '$.streak.heatmapData')
    const heatmap: Record<string, number> = {}
    Object.entries(heatmapObject).forEach(([date, count]) => {
      asLocalDate(date, '$.streak.heatmapData key')
      heatmap[date] = asNonNegativeNumber(count, `$.streak.heatmapData.${date}`)
    })
    next.heatmapData = heatmap
  }
  return next
}

/**
 * Converts the JSON format exported by the pre-v2 Settings page into a complete
 * V3 snapshot. Fields that did not exist in V1 are preserved from the current
 * installation instead of being silently erased.
 */
export function migrateLegacyBackupV1(value: unknown, current: BackupDataV3): BackupV3 {
  const object = asObject(value, '$')
  if (object.version !== 1) fail('$.version', '应为 1')

  const recognizedKeys = [
    'words',
    'practice',
    'timer',
    'plans',
    'executions',
    'diary',
    'dailyCheckins',
    'reports',
    'writingReports',
    'chatConversations',
    'aiSuggestion',
    'achievements',
    'streak',
    'settings',
    'aiConfig',
  ]
  if (!recognizedKeys.some((key) => object[key] !== undefined)) {
    fail('$', '未找到可导入的旧版数据')
  }

  const next = cloneBackupData(current)
  const migratedAt = new Date().toISOString()
  if (object.words !== undefined) {
    next.words = validateUniqueIdArray(object.words, '$.words', validateWordRecord)
  }
  if (object.practice !== undefined) {
    next.practice = validateUniqueIdArray(object.practice, '$.practice', validatePracticeRecord)
  }
  if (object.timer !== undefined) {
    next.timer = validateUniqueIdArray(object.timer, '$.timer', validateTimerRecord)
  }
  if (object.plans !== undefined) {
    next.plans = validateUniqueIdArray(object.plans, '$.plans', validateStudyPlan)
  }
  if (object.executions !== undefined) {
    next.executions = validatePlanExecutions(object.executions, '$.executions')
  }
  if (object.diary !== undefined) {
    next.diary = validateUniqueIdArray(object.diary, '$.diary', validateDiaryEntry)
  }
  if (object.dailyCheckins !== undefined) {
    next.dailyCheckins = validateUniqueIdArray(
      object.dailyCheckins,
      '$.dailyCheckins',
      validateDailyCheckinAward,
    )
  }
  const hasLegacyReports = object.reports !== undefined
  const hasLegacySuggestion = object.aiSuggestion !== undefined
  const legacyReports = hasLegacyReports
    ? validateArray(object.reports, '$.reports', validateAnalysisReport)
    : []
  const legacySuggestion = hasLegacySuggestion
    ? validateAiSuggestion(object.aiSuggestion, '$.aiSuggestion')
    : null
  if (object.writingReports !== undefined) {
    next.writingReports = validateArray(
      object.writingReports,
      '$.writingReports',
      validateWritingReport
    )
  }
  if (object.chatConversations !== undefined) {
    const conversations = asObject(object.chatConversations, '$.chatConversations')
    const validated: Record<string, ChatMessageRecord[]> = {}
    Object.entries(conversations).forEach(([context, messages]) => {
      validated[context] = validateArray(
        messages,
        `$.chatConversations.${context}`,
        validateChatMessage
      )
    })
    next.chatConversations = validated
  }
  if (hasLegacyReports || hasLegacySuggestion) {
    const retained = next.aiArtifacts.filter((artifact) => {
      if (hasLegacyReports && artifact.kind === 'learning_analysis') return false
      if (hasLegacySuggestion && artifact.kind === 'daily_suggestion') return false
      return true
    })
    next.aiArtifacts = makePortableAiArtifacts([
      ...convertValidatedLegacyAiArtifacts(legacySuggestion, legacyReports, '$.reports|aiSuggestion'),
      ...retained,
    ])
  }
  if (object.achievements !== undefined) {
    next.achievements = validateLegacyAchievements(object.achievements, next.achievements)
  }
  if (object.streak !== undefined) next.streak = validateLegacyStreak(object.streak, next.streak)
  if (object.settings !== undefined) next.settings = validateLegacySettings(object.settings, next.settings)
  if (object.dailyCheckins === undefined) {
    next.dailyCheckins = migrateMissingDailyCheckinAwards(
      next.executions,
      next.settings.lastCheckinDate,
      migratedAt,
    )
  }
  next.aiArtifacts = makePortableAiArtifacts(next.aiArtifacts)

  // Legacy v1 exports could contain providerPreset/apiKey/baseURL/model under aiConfig.
  // They remain recognized for document compatibility, but runtime AI
  // credentials and routing are intentionally never restored from a backup.

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: migratedAt,
    data: next,
  }
}

export function parseBackupJson(json: string, current: BackupDataV3): BackupImportResult {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    fail('$', '不是有效的 JSON 文件')
  }

  const object = asObject(value, '$')
  if (object.version === BACKUP_VERSION) {
    return { sourceVersion: 3, backup: validateBackupV3(object) }
  }
  if (object.version === 2) {
    return { sourceVersion: 2, backup: migrateLegacyBackupV2(object) }
  }
  if (object.version === 1) {
    return { sourceVersion: 1, backup: migrateLegacyBackupV1(object, current) }
  }
  fail('$.version', '仅支持备份版本 1、2 或 3')
}
