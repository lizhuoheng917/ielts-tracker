import { resolveAiScopes } from './capabilities'
import { isLocalDate } from '@/lib/localDate'
import type { AiArtifact, AiContextSnapshotV1, AiResultEnvelope, AiRun } from './contracts'
import {
  AI_GATEWAY_PRODUCT_ID,
  AI_GATEWAY_REQUEST_SCHEMA_VERSION,
  AI_GATEWAY_RESPONSE_SCHEMA_VERSION,
  AiGatewayError,
  MANAGED_AI_PURPOSES,
  MAX_AI_GATEWAY_REQUEST_BYTES,
  MAX_AI_GATEWAY_RESPONSE_CONTENT_LENGTH,
  MAX_AI_GATEWAY_USER_INPUT_LENGTH,
  type AiGatewayRequest,
  type AiGatewayWireRequestV1,
  type ManagedAiPurpose,
} from './gateway'
import {
  parseStructuredAiOutput,
  type AiStructuredContentV2,
} from './structuredOutputs'
import { parseWritingSubmission } from './writingFeedback'
import {
  assertWordsPlanRecommendationMatchesContext,
  type WordsPlanRecommendationContextDataV1,
} from './wordsPlanRecommendation'

type UnknownRecord = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

function fail(message: string): never {
  throw new AiGatewayError('INVALID_REQUEST', message)
}

function responseFail(message: string): never {
  throw new AiGatewayError('INVALID_RESPONSE', message)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) fail(`${label} must be an object`)
  return value
}

function responseRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) responseFail(`${label} must be an object`)
  return value
}

function exactKeys(value: UnknownRecord, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed)
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    fail(`${label} contains unsupported fields`)
  }
  if (allowed.some((key) => !(key in value))) fail(`${label} is missing required fields`)
}

function responseExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set([...required, ...optional])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    responseFail(`${label} contains unsupported fields`)
  }
  if (required.some((key) => !(key in value))) responseFail(`${label} is missing required fields`)
}

function stringValue(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || value.length > maxLength) {
    fail(`${label} must be a bounded string`)
  }
  return value
}

function responseString(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || value.length > maxLength) {
    responseFail(`${label} must be a bounded string`)
  }
  return value
}

function finiteNumber(
  value: unknown,
  label: string,
  options: { integer?: boolean; min?: number; max?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number`)
  if (options.integer && !Number.isInteger(value)) fail(`${label} must be an integer`)
  if (options.min !== undefined && value < options.min) fail(`${label} is below its minimum`)
  if (options.max !== undefined && value > options.max) fail(`${label} exceeds its maximum`)
  return value
}

function isoTimestamp(value: unknown, label: string): string {
  const parsed = stringValue(value, label, 64)
  if (!Number.isFinite(Date.parse(parsed))) fail(`${label} must be an ISO timestamp`)
  return parsed
}

function localDate(value: unknown, label: string): string {
  const parsed = stringValue(value, label, 10)
  if (!isLocalDate(parsed)) {
    fail(`${label} must be a local date`)
  }
  return parsed
}

function stringArray(value: unknown, label: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${label} must be a bounded array`)
  return value.map((item, index) => stringValue(item, `${label}[${index}]`, maxLength, true))
}

function numberDictionary(value: unknown, label: string): void {
  const object = record(value, label)
  const entries = Object.entries(object)
  if (entries.length > 32) fail(`${label} has too many keys`)
  for (const [key, count] of entries) {
    stringValue(key, `${label} key`, 48)
    finiteNumber(count, `${label}.${key}`, { integer: true, min: 0, max: 1_000_000 })
  }
}

function assertPracticeSummary(value: unknown, label: string): void {
  const object = record(value, label)
  exactKeys(object, ['count', 'scoredCount', 'averageScore', 'totalDurationMinutes'], label)
  finiteNumber(object.count, `${label}.count`, { integer: true, min: 0, max: 100_000 })
  finiteNumber(object.scoredCount, `${label}.scoredCount`, { integer: true, min: 0, max: 100_000 })
  if (object.averageScore !== null) finiteNumber(object.averageScore, `${label}.averageScore`, { min: 0, max: 9 })
  finiteNumber(object.totalDurationMinutes, `${label}.totalDurationMinutes`, { min: 0, max: 10_000_000 })
}

function assertTimerSummary(value: unknown, label: string): void {
  const object = record(value, label)
  exactKeys(object, ['count', 'totalDurationSeconds', 'displayMinutes'], label)
  finiteNumber(object.count, `${label}.count`, { integer: true, min: 0, max: 100_000 })
  finiteNumber(object.totalDurationSeconds, `${label}.totalDurationSeconds`, { min: 0, max: 100_000_000 })
  finiteNumber(object.displayMinutes, `${label}.displayMinutes`, { integer: true, min: 0, max: 10_000_000 })
}

function assertLearningContextData(snapshot: AiContextSnapshotV1): void {
  const data = record(snapshot.data, 'snapshot.data')
  const hasDiaryScope = snapshot.privateScopes.includes('diary.excerpts')
  const hasArtifactScope = snapshot.privateScopes.includes('ai_artifacts.history')
  exactKeys(data, [
    'range',
    'recordCounts',
    'learner',
    'overview',
    'practiceByType',
    'timerBySubject',
    'planProfile',
    'timeline',
    'recentPractice',
    'recentTimer',
    ...(hasDiaryScope ? ['diaryExcerpts'] : []),
    ...(hasArtifactScope ? ['priorAiArtifacts'] : []),
  ], 'snapshot.data')

  const range = record(data.range, 'snapshot.data.range')
  exactKeys(range, ['days', 'startDate', 'endDate'], 'snapshot.data.range')
  if (range.days !== 7 && range.days !== 30 && range.days !== 90) fail('snapshot.data.range.days is unsupported')
  localDate(range.startDate, 'snapshot.data.range.startDate')
  localDate(range.endDate, 'snapshot.data.range.endDate')

  const counts = record(data.recordCounts, 'snapshot.data.recordCounts')
  exactKeys(counts, [
    'wordRecords',
    'practiceRecords',
    'timerRecords',
    'planExecutions',
    'diaryEntries',
    'priorAiArtifacts',
  ], 'snapshot.data.recordCounts')
  for (const [key, value] of Object.entries(counts)) {
    finiteNumber(value, `snapshot.data.recordCounts.${key}`, { integer: true, min: 0, max: 1_000_000 })
  }

  const learner = record(data.learner, 'snapshot.data.learner')
  exactKeys(learner, ['currentStreak', 'longestStreak', 'totalActiveDays', 'totalXP', 'level', 'levelName'], 'snapshot.data.learner')
  for (const key of ['currentStreak', 'longestStreak', 'totalActiveDays', 'totalXP', 'level'] as const) {
    finiteNumber(learner[key], `snapshot.data.learner.${key}`, { integer: true, min: 0, max: 10_000_000 })
  }
  stringValue(learner.levelName, 'snapshot.data.learner.levelName', 80)

  const overview = record(data.overview, 'snapshot.data.overview')
  exactKeys(overview, [
    'learnedWordCount',
    'practiceCount',
    'timerSessionCount',
    'totalStudySeconds',
    'recordedPlanExecutionCount',
    'completedPlanExecutionCount',
    'recordedPlanCompletionRate',
  ], 'snapshot.data.overview')
  for (const key of [
    'learnedWordCount',
    'practiceCount',
    'timerSessionCount',
    'totalStudySeconds',
    'recordedPlanExecutionCount',
    'completedPlanExecutionCount',
  ] as const) {
    finiteNumber(overview[key], `snapshot.data.overview.${key}`, { min: 0, max: 100_000_000 })
  }
  if (overview.recordedPlanCompletionRate !== null) {
    finiteNumber(overview.recordedPlanCompletionRate, 'snapshot.data.overview.recordedPlanCompletionRate', { min: 0, max: 100 })
  }

  const practiceByType = record(data.practiceByType, 'snapshot.data.practiceByType')
  exactKeys(practiceByType, ['reading', 'listening', 'writing', 'speaking'], 'snapshot.data.practiceByType')
  for (const type of ['reading', 'listening', 'writing', 'speaking'] as const) {
    assertPracticeSummary(practiceByType[type], `snapshot.data.practiceByType.${type}`)
  }

  const timerBySubject = record(data.timerBySubject, 'snapshot.data.timerBySubject')
  exactKeys(timerBySubject, ['reading', 'listening', 'writing', 'speaking', 'general'], 'snapshot.data.timerBySubject')
  for (const subject of ['reading', 'listening', 'writing', 'speaking', 'general'] as const) {
    assertTimerSummary(timerBySubject[subject], `snapshot.data.timerBySubject.${subject}`)
  }

  const planProfile = record(data.planProfile, 'snapshot.data.planProfile')
  exactKeys(planProfile, ['totalPlans', 'activePlans', 'byCategory', 'byFrequency'], 'snapshot.data.planProfile')
  finiteNumber(planProfile.totalPlans, 'snapshot.data.planProfile.totalPlans', { integer: true, min: 0, max: 100_000 })
  finiteNumber(planProfile.activePlans, 'snapshot.data.planProfile.activePlans', { integer: true, min: 0, max: 100_000 })
  numberDictionary(planProfile.byCategory, 'snapshot.data.planProfile.byCategory')
  numberDictionary(planProfile.byFrequency, 'snapshot.data.planProfile.byFrequency')

  if (!Array.isArray(data.timeline) || data.timeline.length > 90) fail('snapshot.data.timeline must be a bounded array')
  data.timeline.forEach((item, index) => {
    const object = record(item, `snapshot.data.timeline[${index}]`)
    exactKeys(object, ['date', 'active', 'wordCount', 'practiceCount', 'timerSessionCount', 'studySeconds', 'completedPlanCount'], `snapshot.data.timeline[${index}]`)
    localDate(object.date, `snapshot.data.timeline[${index}].date`)
    if (typeof object.active !== 'boolean') fail(`snapshot.data.timeline[${index}].active must be boolean`)
    for (const key of ['wordCount', 'practiceCount', 'timerSessionCount', 'studySeconds', 'completedPlanCount'] as const) {
      finiteNumber(object[key], `snapshot.data.timeline[${index}].${key}`, { min: 0, max: 100_000_000 })
    }
  })

  if (!Array.isArray(data.recentPractice) || data.recentPractice.length > 5) fail('snapshot.data.recentPractice must be bounded')
  data.recentPractice.forEach((item, index) => {
    const object = record(item, `snapshot.data.recentPractice[${index}]`)
    exactKeys(object, ['date', 'type', 'score', 'durationMinutes'], `snapshot.data.recentPractice[${index}]`)
    localDate(object.date, `snapshot.data.recentPractice[${index}].date`)
    if (!['reading', 'listening', 'writing', 'speaking'].includes(String(object.type))) fail('recent practice type is unsupported')
    if (object.score !== null) finiteNumber(object.score, `snapshot.data.recentPractice[${index}].score`, { min: 0, max: 9 })
    finiteNumber(object.durationMinutes, `snapshot.data.recentPractice[${index}].durationMinutes`, { min: 0, max: 100_000 })
  })

  if (!Array.isArray(data.recentTimer) || data.recentTimer.length > 5) fail('snapshot.data.recentTimer must be bounded')
  data.recentTimer.forEach((item, index) => {
    const object = record(item, `snapshot.data.recentTimer[${index}]`)
    exactKeys(object, ['date', 'subject', 'durationSeconds'], `snapshot.data.recentTimer[${index}]`)
    localDate(object.date, `snapshot.data.recentTimer[${index}].date`)
    if (!['reading', 'listening', 'writing', 'speaking', 'general'].includes(String(object.subject))) fail('recent timer subject is unsupported')
    finiteNumber(object.durationSeconds, `snapshot.data.recentTimer[${index}].durationSeconds`, { min: 0, max: 100_000_000 })
  })

  if (hasDiaryScope) {
    if (!Array.isArray(data.diaryExcerpts) || data.diaryExcerpts.length > 5) fail('snapshot.data.diaryExcerpts must be bounded')
    data.diaryExcerpts.forEach((item, index) => {
      const object = record(item, `snapshot.data.diaryExcerpts[${index}]`)
      exactKeys(object, ['date', 'mood', 'excerpt'], `snapshot.data.diaryExcerpts[${index}]`)
      localDate(object.date, `snapshot.data.diaryExcerpts[${index}].date`)
      stringValue(object.mood, `snapshot.data.diaryExcerpts[${index}].mood`, 32)
      stringValue(object.excerpt, `snapshot.data.diaryExcerpts[${index}].excerpt`, 240, true)
    })
  }

  if (hasArtifactScope) {
    if (!Array.isArray(data.priorAiArtifacts) || data.priorAiArtifacts.length > 3) fail('snapshot.data.priorAiArtifacts must be bounded')
    data.priorAiArtifacts.forEach((item, index) => {
      const object = record(item, `snapshot.data.priorAiArtifacts[${index}]`)
      exactKeys(object, ['createdAt', 'type', 'content', 'evidenceClass'], `snapshot.data.priorAiArtifacts[${index}]`)
      isoTimestamp(object.createdAt, `snapshot.data.priorAiArtifacts[${index}].createdAt`)
      stringValue(object.type, `snapshot.data.priorAiArtifacts[${index}].type`, 40)
      stringValue(object.content, `snapshot.data.priorAiArtifacts[${index}].content`, 1_200, true)
      if (object.evidenceClass !== 'secondary_ai_output') fail('prior AI artifact evidence class is unsupported')
    })
  }
}

function assertWritingContextData(snapshot: AiContextSnapshotV1): void {
  const data = record(snapshot.data, 'snapshot.data')
  exactKeys(data, ['submission'], 'snapshot.data')
  try {
    parseWritingSubmission(data.submission)
  } catch {
    fail('snapshot.data.submission does not match a supported WritingSubmission')
  }
}

function assertWordsPlanRecommendationContextData(snapshot: AiContextSnapshotV1): void {
  const data = record(snapshot.data, 'snapshot.data')
  exactKeys(data, ['targetDate', 'timeZone', 'sourcePlan', 'tracker', 'words'], 'snapshot.data')
  localDate(data.targetDate, 'snapshot.data.targetDate')
  stringValue(data.timeZone, 'snapshot.data.timeZone', 64)

  const sourcePlan = record(data.sourcePlan, 'snapshot.data.sourcePlan')
  exactKeys(sourcePlan, ['currentTargetCount', 'targetDurationMinutes'], 'snapshot.data.sourcePlan')
  for (const key of ['currentTargetCount', 'targetDurationMinutes'] as const) {
    if (sourcePlan[key] !== null) finiteNumber(sourcePlan[key], `snapshot.data.sourcePlan.${key}`, { integer: true, min: 1, max: key === 'currentTargetCount' ? 1_000 : 180 })
  }

  const tracker = record(data.tracker, 'snapshot.data.tracker')
  exactKeys(tracker, ['recent7Days', 'vocabularyHistory30Days', 'targetDay'], 'snapshot.data.tracker')
  const recent = record(tracker.recent7Days, 'snapshot.data.tracker.recent7Days')
  exactKeys(recent, ['startDate', 'endDate', 'activeDays', 'wordRecordCount', 'wordsLogged', 'practiceSessions', 'timerSessions', 'studySeconds', 'recordedPlanExecutions', 'completedPlanExecutions', 'recordedPlanCompletionRate'], 'snapshot.data.tracker.recent7Days')
  localDate(recent.startDate, 'snapshot.data.tracker.recent7Days.startDate')
  localDate(recent.endDate, 'snapshot.data.tracker.recent7Days.endDate')
  for (const key of ['activeDays', 'wordRecordCount', 'wordsLogged', 'practiceSessions', 'timerSessions', 'studySeconds', 'recordedPlanExecutions', 'completedPlanExecutions'] as const) {
    finiteNumber(recent[key], `snapshot.data.tracker.recent7Days.${key}`, { integer: true, min: 0, max: 100_000_000 })
  }
  if (recent.recordedPlanCompletionRate !== null) finiteNumber(recent.recordedPlanCompletionRate, 'snapshot.data.tracker.recent7Days.recordedPlanCompletionRate', { min: 0, max: 100 })
  if (Number(recent.activeDays) > 7 || Number(recent.completedPlanExecutions) > Number(recent.recordedPlanExecutions)) fail('snapshot.data.tracker.recent7Days counts are inconsistent')

  const vocabularyHistory = record(tracker.vocabularyHistory30Days, 'snapshot.data.tracker.vocabularyHistory30Days')
  exactKeys(vocabularyHistory, ['startDate', 'endDate', 'planCount', 'activePlanCount', 'plansWithTargetCount', 'medianTargetCount', 'recordedExecutions', 'completedExecutions', 'recordedCompletionRate', 'actualWordsLogged'], 'snapshot.data.tracker.vocabularyHistory30Days')
  localDate(vocabularyHistory.startDate, 'snapshot.data.tracker.vocabularyHistory30Days.startDate')
  localDate(vocabularyHistory.endDate, 'snapshot.data.tracker.vocabularyHistory30Days.endDate')
  for (const key of ['planCount', 'activePlanCount', 'plansWithTargetCount', 'recordedExecutions', 'completedExecutions', 'actualWordsLogged'] as const) {
    finiteNumber(vocabularyHistory[key], `snapshot.data.tracker.vocabularyHistory30Days.${key}`, { integer: true, min: 0, max: 100_000_000 })
  }
  if (vocabularyHistory.medianTargetCount !== null) finiteNumber(vocabularyHistory.medianTargetCount, 'snapshot.data.tracker.vocabularyHistory30Days.medianTargetCount', { integer: true, min: 1, max: 1_000 })
  if (vocabularyHistory.recordedCompletionRate !== null) finiteNumber(vocabularyHistory.recordedCompletionRate, 'snapshot.data.tracker.vocabularyHistory30Days.recordedCompletionRate', { min: 0, max: 100 })
  if (
    Number(vocabularyHistory.activePlanCount) > Number(vocabularyHistory.planCount)
    || Number(vocabularyHistory.plansWithTargetCount) > Number(vocabularyHistory.planCount)
    || Number(vocabularyHistory.completedExecutions) > Number(vocabularyHistory.recordedExecutions)
    || (Number(vocabularyHistory.plansWithTargetCount) === 0) !== (vocabularyHistory.medianTargetCount === null)
  ) fail('snapshot.data.tracker.vocabularyHistory30Days counts are inconsistent')

  const targetDay = record(tracker.targetDay, 'snapshot.data.tracker.targetDay')
  exactKeys(targetDay, ['scheduledPlanCount', 'completedPlanCount', 'remainingPlanCount', 'vocabularyPlanCount', 'nonVocabularyPlanCount', 'plannedMinutesKnown', 'plansWithoutDuration', 'actualMinutesLogged'], 'snapshot.data.tracker.targetDay')
  for (const [key, value] of Object.entries(targetDay)) finiteNumber(value, `snapshot.data.tracker.targetDay.${key}`, { integer: true, min: 0, max: 100_000_000 })
  if (
    Number(targetDay.completedPlanCount) + Number(targetDay.remainingPlanCount) !== Number(targetDay.scheduledPlanCount)
    || Number(targetDay.vocabularyPlanCount) + Number(targetDay.nonVocabularyPlanCount) !== Number(targetDay.scheduledPlanCount)
    || Number(targetDay.plansWithoutDuration) > Number(targetDay.scheduledPlanCount)
  ) fail('snapshot.data.tracker.targetDay counts are inconsistent')

  const words = record(data.words, 'snapshot.data.words')
  exactKeys(words, ['coverage', 'inventory', 'recent7Days', 'targetDay', 'recommendationBounds'], 'snapshot.data.words')
  if (words.coverage !== 'cloud_data_only') fail('snapshot.data.words.coverage is invalid')
  const countObject = (value: unknown, label: string, keys: readonly string[]) => {
    const object = record(value, label)
    exactKeys(object, keys, label)
    for (const key of keys) finiteNumber(object[key], `${label}.${key}`, { integer: true, min: 0, max: 100_000_000 })
    return object
  }
  const inventory = countObject(words.inventory, 'snapshot.data.words.inventory', ['activeWordbooks', 'activeWords', 'newWords', 'learningWords', 'availableNewWords', 'masteredWords', 'dueNowWords', 'dueByTargetWords'])
  const wordsRecent = countObject(words.recent7Days, 'snapshot.data.words.recent7Days', ['activeDays', 'attempts', 'passed', 'durationMs', 'uniqueWordsStudied', 'wordStudyTouches'])
  const wordsTarget = countObject(words.targetDay, 'snapshot.data.words.targetDay', ['attempts', 'passed', 'durationMs', 'plannedNewWords', 'plannedReviewWords', 'completedNewWords', 'completedReviewWords'])
  const bounds = countObject(words.recommendationBounds, 'snapshot.data.words.recommendationBounds', ['minimumReviewWords', 'maximumReviewWords', 'minimumNewWords', 'maximumNewWords'])
  if (
    Number(inventory.newWords) + Number(inventory.learningWords) + Number(inventory.masteredWords) !== Number(inventory.activeWords)
    || Number(inventory.availableNewWords) !== Number(inventory.newWords) + Number(inventory.learningWords)
    || Number(inventory.dueNowWords) > Number(inventory.dueByTargetWords)
    || Number(inventory.dueByTargetWords) > Number(inventory.masteredWords)
    || Number(wordsRecent.activeDays) > 7
    || Number(wordsRecent.passed) > Number(wordsRecent.attempts)
    || Number(wordsRecent.uniqueWordsStudied) > Number(wordsRecent.wordStudyTouches)
    || Number(wordsTarget.passed) > Number(wordsTarget.attempts)
    || Number(wordsTarget.completedNewWords) > Number(wordsTarget.plannedNewWords)
    || Number(wordsTarget.completedReviewWords) > Number(wordsTarget.plannedReviewWords)
    || Number(bounds.minimumReviewWords) !== Number(wordsTarget.completedReviewWords)
    || Number(bounds.minimumNewWords) !== Number(wordsTarget.completedNewWords)
    || Number(bounds.maximumReviewWords) !== Math.min(1_000, Number(bounds.minimumReviewWords) + Number(inventory.dueByTargetWords))
    || Number(bounds.maximumNewWords) !== Math.min(1_000, Number(bounds.minimumNewWords) + Number(inventory.availableNewWords))
    || Number(bounds.minimumReviewWords) + Number(bounds.minimumNewWords) > 1_000
    || Number(bounds.maximumReviewWords) + Number(bounds.maximumNewWords) < 1
  ) fail('snapshot.data.words counts are inconsistent')
}

function assertSnapshot(snapshot: AiContextSnapshotV1, purpose: ManagedAiPurpose, now: Date): void {
  const object = record(snapshot, 'snapshot')
  exactKeys(object, [
    'schemaVersion',
    'snapshotId',
    'purpose',
    'createdAt',
    'dataAsOf',
    'freshness',
    'sourceRevision',
    'contextHash',
    'scopes',
    'privateScopes',
    'quality',
    'data',
  ], 'snapshot')
  if (snapshot.schemaVersion !== 1 || snapshot.purpose !== purpose) fail('snapshot purpose or version does not match request')
  stringValue(snapshot.snapshotId, 'snapshot.snapshotId', 128)
  const createdAt = isoTimestamp(snapshot.createdAt, 'snapshot.createdAt')
  const dataAsOf = isoTimestamp(snapshot.dataAsOf, 'snapshot.dataAsOf')
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) fail('gateway validation time is invalid')
  stringValue(snapshot.sourceRevision, 'snapshot.sourceRevision', 128)
  stringValue(snapshot.contextHash, 'snapshot.contextHash', 128)

  const freshness = record(snapshot.freshness, 'snapshot.freshness')
  exactKeys(freshness, ['status', 'ageSeconds', 'maxAgeSeconds'], 'snapshot.freshness')
  if (freshness.status !== 'fresh') fail('snapshot is stale')
  finiteNumber(freshness.ageSeconds, 'snapshot.freshness.ageSeconds', { integer: true, min: 0, max: 300 })
  const declaredMaxAge = finiteNumber(
    freshness.maxAgeSeconds,
    'snapshot.freshness.maxAgeSeconds',
    { integer: true, min: 1, max: 300 },
  )
  const actualAgeSeconds = Math.floor((nowMs - Date.parse(createdAt)) / 1_000)
  if (actualAgeSeconds < -30 || actualAgeSeconds > Math.min(300, declaredMaxAge)) {
    fail('snapshot is stale or invalid')
  }
  if (Date.parse(dataAsOf) > nowMs + 30_000) fail('snapshot.dataAsOf must not be in the future')

  if (!Array.isArray(snapshot.scopes) || !Array.isArray(snapshot.privateScopes)) fail('snapshot scopes are invalid')
  if (new Set(snapshot.scopes).size !== snapshot.scopes.length || new Set(snapshot.privateScopes).size !== snapshot.privateScopes.length) {
    fail('snapshot scopes must be unique')
  }
  if (
    purpose === 'writing_feedback'
    && (
      snapshot.privateScopes.length !== 1
      || snapshot.privateScopes[0] !== 'writing.submission'
    )
  ) fail('writing_feedback requires the writing.submission private scope')
  if (purpose === 'words_plan_recommendation' && snapshot.privateScopes.length !== 0) {
    fail('words_plan_recommendation does not accept private scopes')
  }
  const resolved = resolveAiScopes(purpose, snapshot.privateScopes, snapshot.privateScopes)
  const expectedScopes = resolved.scopes
  if (snapshot.scopes.length !== expectedScopes.length || snapshot.scopes.some((scope, index) => scope !== expectedScopes[index])) {
    fail('snapshot scopes do not match the purpose capability')
  }
  if (snapshot.privateScopes.length !== resolved.privateScopes.length || snapshot.privateScopes.some((scope, index) => scope !== resolved.privateScopes[index])) {
    fail('snapshot private scopes are not allowed for this purpose')
  }

  const quality = record(snapshot.quality, 'snapshot.quality')
  exactKeys(quality, ['status', 'recordCount', 'warnings'], 'snapshot.quality')
  if (!['empty', 'limited', 'sufficient'].includes(String(quality.status))) fail('snapshot quality status is unsupported')
  const recordCount = finiteNumber(
    quality.recordCount,
    'snapshot.quality.recordCount',
    { integer: true, min: 0, max: 1_000_000 },
  )
  stringArray(quality.warnings, 'snapshot.quality.warnings', 10, 500)
  if (purpose === 'writing_feedback') {
    if (recordCount !== 1) fail('writing_feedback snapshot must contain exactly one submission')
    assertWritingContextData(snapshot)
  } else if (purpose === 'words_plan_recommendation') {
    assertWordsPlanRecommendationContextData(snapshot)
  } else {
    assertLearningContextData(snapshot)
  }
}

export function createAiGatewayWireRequest(
  request: AiGatewayRequest,
  now: Date = new Date(),
): AiGatewayWireRequestV1 {
  if (!(MANAGED_AI_PURPOSES as readonly string[]).includes(request.purpose)) fail('purpose is not available through managed AI')
  if (!UUID_PATTERN.test(request.requestId)) fail('requestId must be a UUID')
  if (!IDEMPOTENCY_KEY_PATTERN.test(request.idempotencyKey)) fail('idempotencyKey is invalid')
  stringValue(
    request.userInput,
    'userInput',
    MAX_AI_GATEWAY_USER_INPUT_LENGTH,
    request.purpose === 'writing_feedback' || request.purpose === 'words_plan_recommendation',
  )
  if (
    (request.purpose === 'writing_feedback' || request.purpose === 'words_plan_recommendation')
    && request.userInput.trim().length !== 0
  ) {
    fail(`${request.purpose} userInput must be empty`)
  }
  assertSnapshot(request.snapshot, request.purpose, now)

  const wire: AiGatewayWireRequestV1 = {
    schemaVersion: AI_GATEWAY_REQUEST_SCHEMA_VERSION,
    responseSchemaVersion: AI_GATEWAY_RESPONSE_SCHEMA_VERSION,
    productId: AI_GATEWAY_PRODUCT_ID,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
    purpose: request.purpose,
    snapshot: request.snapshot,
    userInput: request.userInput.trim(),
  }
  if (new TextEncoder().encode(JSON.stringify(wire)).byteLength > MAX_AI_GATEWAY_REQUEST_BYTES) {
    throw new AiGatewayError('PAYLOAD_TOO_LARGE', '本次分析数据过大，请缩短分析范围后重试。', false, 413)
  }
  return wire
}

function parseRun(value: unknown, request: AiGatewayWireRequestV1): AiRun {
  const run = responseRecord(value, 'run')
  responseExactKeys(run, [
    'runId',
    'requestId',
    'productId',
    'purpose',
    'status',
    'idempotencyKey',
    'snapshotId',
    'contextHash',
    'createdAt',
  ], ['startedAt', 'completedAt', 'modelAlias', 'usage', 'error'], 'run')
  const parsedRunId = responseString(run.runId, 'run.runId', 128)
  if (
    run.requestId !== request.requestId ||
    run.productId !== AI_GATEWAY_PRODUCT_ID ||
    run.purpose !== request.purpose ||
    run.idempotencyKey !== request.idempotencyKey ||
    run.snapshotId !== request.snapshot.snapshotId ||
    run.contextHash !== request.snapshot.contextHash
  ) responseFail('run provenance does not match request')
  if (!['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(run.status))) responseFail('run.status is invalid')
  responseString(run.requestId, 'run.requestId', 128)
  responseString(run.idempotencyKey, 'run.idempotencyKey', 128)
  responseString(run.snapshotId, 'run.snapshotId', 128)
  responseString(run.contextHash, 'run.contextHash', 128)
  if (!Number.isFinite(Date.parse(responseString(run.createdAt, 'run.createdAt', 64)))) responseFail('run.createdAt is invalid')
  if (run.startedAt !== undefined && !Number.isFinite(Date.parse(responseString(run.startedAt, 'run.startedAt', 64)))) responseFail('run.startedAt is invalid')
  if (run.completedAt !== undefined && !Number.isFinite(Date.parse(responseString(run.completedAt, 'run.completedAt', 64)))) responseFail('run.completedAt is invalid')
  if (run.modelAlias !== undefined) responseString(run.modelAlias, 'run.modelAlias', 128)
  if (run.usage !== undefined) {
    const usage = responseRecord(run.usage, 'run.usage')
    responseExactKeys(usage, ['inputTokens', 'outputTokens', 'totalTokens'], [], 'run.usage')
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
      if (typeof usage[key] !== 'number' || !Number.isInteger(usage[key]) || usage[key] < 0) responseFail(`run.usage.${key} is invalid`)
    }
  }
  return { ...run, runId: parsedRunId } as unknown as AiRun
}

export function parseAiGatewayResponse(
  value: unknown,
  request: AiGatewayWireRequestV1,
): AiResultEnvelope<AiStructuredContentV2> {
  const envelope = responseRecord(value, 'response')
  if (envelope.ok === true) {
    responseExactKeys(envelope, ['ok', 'run', 'artifact', 'warnings'], [], 'response')
    const run = parseRun(envelope.run, request)
    if (run.status !== 'succeeded') responseFail('successful response must contain a succeeded run')
    const artifact = responseRecord(envelope.artifact, 'artifact')
    responseExactKeys(artifact, [
      'schemaVersion',
      'outputSchemaVersion',
      'artifactId',
      'runId',
      'kind',
      'status',
      'content',
      'createdAt',
      'dataAsOf',
      'contextHash',
    ], [], 'artifact')
    if (
      artifact.schemaVersion !== 1 ||
      artifact.outputSchemaVersion !== AI_GATEWAY_RESPONSE_SCHEMA_VERSION ||
      artifact.runId !== run.runId ||
      artifact.kind !== request.purpose ||
      artifact.status !== 'final' ||
      artifact.contextHash !== request.snapshot.contextHash ||
      artifact.dataAsOf !== request.snapshot.dataAsOf
    ) responseFail('artifact provenance does not match request')
    responseString(artifact.artifactId, 'artifact.artifactId', 128)
    let content: AiStructuredContentV2
    try {
      const writingSubmission = request.purpose === 'writing_feedback'
        ? parseWritingSubmission((request.snapshot.data as UnknownRecord).submission)
        : undefined
      content = parseStructuredAiOutput(artifact.content, request.purpose, writingSubmission)
      if (request.purpose === 'words_plan_recommendation' && content.kind === 'words_plan_recommendation') {
        assertWordsPlanRecommendationMatchesContext(
          content,
          request.snapshot.data as WordsPlanRecommendationContextDataV1,
        )
      }
    } catch {
      return responseFail('artifact.content does not match the requested output contract')
    }
    if (JSON.stringify(content).length > MAX_AI_GATEWAY_RESPONSE_CONTENT_LENGTH) {
      responseFail('artifact.content exceeds the maximum response length')
    }
    if (!Number.isFinite(Date.parse(responseString(artifact.createdAt, 'artifact.createdAt', 64)))) responseFail('artifact.createdAt is invalid')
    const warnings = Array.isArray(envelope.warnings)
      ? envelope.warnings.map((warning, index) => responseString(warning, `warnings[${index}]`, 500, true))
      : responseFail('warnings must be an array')
    if (warnings.length > 10) responseFail('warnings has too many entries')
    const parsedArtifact: AiArtifact<AiStructuredContentV2> = {
      schemaVersion: 1,
      outputSchemaVersion: AI_GATEWAY_RESPONSE_SCHEMA_VERSION,
      artifactId: artifact.artifactId as string,
      runId: run.runId,
      kind: request.purpose,
      status: 'final',
      content,
      createdAt: artifact.createdAt as string,
      dataAsOf: artifact.dataAsOf as string,
      contextHash: artifact.contextHash as string,
    }
    return {
      ok: true,
      run,
      artifact: parsedArtifact,
      warnings,
    }
  }

  if (envelope.ok === false) {
    responseExactKeys(envelope, ['ok', 'run', 'error'], [], 'response')
    const run = parseRun(envelope.run, request)
    if (run.status !== 'failed' && run.status !== 'cancelled') responseFail('failed response contains an invalid run status')
    const error = responseRecord(envelope.error, 'error')
    responseExactKeys(error, ['code', 'message', 'retryable'], ['retryAfterSeconds'], 'error')
    const code = responseString(error.code, 'error.code', 64)
    const message = responseString(error.message, 'error.message', 500)
    if (typeof error.retryable !== 'boolean') responseFail('error.retryable must be boolean')
    if (error.retryAfterSeconds !== undefined && (
      typeof error.retryAfterSeconds !== 'number' ||
      !Number.isInteger(error.retryAfterSeconds) ||
      error.retryAfterSeconds < 0 ||
      error.retryAfterSeconds > 86_400
    )) responseFail('error.retryAfterSeconds is invalid')
    return {
      ok: false,
      run,
      error: {
        code,
        message,
        retryable: error.retryable,
        ...(typeof error.retryAfterSeconds === 'number' ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      },
    }
  }
  return responseFail('response.ok must be boolean')
}
