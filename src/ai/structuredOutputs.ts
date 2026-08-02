import type { ManagedAiPurpose } from './gateway'
import {
  parseWritingFeedbackV2,
  type WritingFeedbackV2,
  type WritingSubmissionV2,
} from './writingFeedback'

export {
  WRITING_FEEDBACK_SCHEMA_VERSION,
  WRITING_RUBRIC_VERSION,
  buildWritingContextSnapshot,
  calculateWritingOverallBand,
  countWritingWords,
  createWritingSubmissionV2,
  formatWritingFeedbackAsMarkdown,
  hasSufficientWritingTaskEvidence,
  parseWritingFeedbackV2,
  parseWritingSubmissionV2,
  WritingFeedbackValidationError,
  type BuildWritingContextSnapshotOptions,
  type CreateWritingSubmissionV2Input,
  type WritingBand,
  type WritingContextDataV2,
  type WritingCriterionFeedbackV2,
  type WritingFeedbackV2,
  type WritingModule,
  type WritingSourceMaterialV2,
  type WritingSubmissionV2,
  type WritingTask,
} from './writingFeedback'

export const AI_OUTPUT_SCHEMA_VERSION = 2 as const

export const AI_ACTION_CATEGORIES = [
  'vocabulary',
  'reading',
  'listening',
  'writing',
  'speaking',
  'planning',
  'review',
] as const

export type AiActionCategory = (typeof AI_ACTION_CATEGORIES)[number]

export const AI_ACTION_PRIORITIES = ['high', 'medium', 'low'] as const
export type AiActionPriority = (typeof AI_ACTION_PRIORITIES)[number]

export const AI_INSIGHT_TYPES = ['strength', 'risk', 'pattern'] as const
export type AiInsightType = (typeof AI_INSIGHT_TYPES)[number]

export const AI_PLAN_CATEGORIES = [
  'reading',
  'listening',
  'writing',
  'speaking',
  'vocabulary',
  'general',
] as const
export type AiPlanCategory = (typeof AI_PLAN_CATEGORIES)[number]

export const AI_PLAN_FREQUENCIES = ['daily', 'weekly'] as const
export type AiPlanFrequency = (typeof AI_PLAN_FREQUENCIES)[number]

export interface DailySuggestionV2 {
  schemaVersion: typeof AI_OUTPUT_SCHEMA_VERSION
  kind: 'daily_suggestion'
  headline: string
  summary: string
  focus: {
    title: string
    reason: string
    estimatedMinutes: number
  }
  actions: Array<{
    title: string
    detail: string
    category: AiActionCategory
    estimatedMinutes: number
  }>
  evidence: string[]
  limitations: string[]
}

export interface LearningAnalysisV2 {
  schemaVersion: typeof AI_OUTPUT_SCHEMA_VERSION
  kind: 'learning_analysis'
  title: string
  conclusion: string
  insights: Array<{
    type: AiInsightType
    title: string
    finding: string
    evidence: string
  }>
  actions: Array<{
    priority: AiActionPriority
    title: string
    reason: string
    estimatedMinutes: number
  }>
  limitations: string[]
}

export interface PlanDraftV2 {
  schemaVersion: typeof AI_OUTPUT_SCHEMA_VERSION
  kind: 'plan_draft'
  title: string
  summary: string
  plans: Array<{
    title: string
    description: string
    category: AiPlanCategory
    frequency: AiPlanFrequency
    /** 0=Sunday ... 6=Saturday. Daily plans must use an empty list. */
    weekDays: number[]
    targetTime: string | null
    targetDuration: number | null
    targetCount: number | null
  }>
  evidence: string[]
  limitations: string[]
}

export type AiStructuredContentV2 =
  | DailySuggestionV2
  | LearningAnalysisV2
  | PlanDraftV2
  | WritingFeedbackV2

export type AiStructuredContentForPurpose<TPurpose extends ManagedAiPurpose> =
  TPurpose extends 'daily_suggestion'
    ? DailySuggestionV2
    : TPurpose extends 'learning_analysis'
      ? LearningAnalysisV2
      : TPurpose extends 'plan_draft'
        ? PlanDraftV2
        : WritingFeedbackV2

export class StructuredAiOutputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StructuredAiOutputValidationError'
  }
}

type UnknownRecord = Record<string, unknown>

const MAX_SERIALIZED_OUTPUT_LENGTH = 12_000

function fail(message: string): never {
  throw new StructuredAiOutputValidationError(message)
}

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`)
  }
  return value as UnknownRecord
}

function exactKeys(
  value: UnknownRecord,
  required: readonly string[],
  label: string,
): void {
  const requiredKeys = new Set(required)
  if (Object.keys(value).some((key) => !requiredKeys.has(key))) {
    fail(`${label} contains unsupported fields`)
  }
  if (required.some((key) => !(key in value))) {
    fail(`${label} is missing required fields`)
  }
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') fail(`${label} must be a string`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    fail(`${label} must be a non-empty string no longer than ${maxLength} characters`)
  }
  return normalized
}

function boundedMinutes(value: unknown, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 5 ||
    value > 180
  ) {
    fail(`${label} must be an integer between 5 and 180`)
  }
  return value
}

function nullableBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  if (value === null) return null
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    fail(`${label} must be null or an integer between ${min} and ${max}`)
  }
  return Number(value)
}

function nullableTime(value: unknown, label: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    fail(`${label} must be null or a 24-hour HH:mm time`)
  }
  return value
}

function enumValue<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  label: string,
): TValue {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail(`${label} has an unsupported value`)
  }
  return value as TValue
}

function boundedStringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    fail(`${label} must be an array with at most ${maxItems} items`)
  }
  return value.map((item, index) => boundedString(item, `${label}[${index}]`, maxLength))
}

function assertSerializedSize(value: unknown): void {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    fail('output must be JSON serializable')
  }
  if (typeof serialized !== 'string') fail('output must be JSON serializable')
  if (serialized.length > MAX_SERIALIZED_OUTPUT_LENGTH) {
    fail('output exceeds the maximum serialized length')
  }
}

export function parseDailySuggestionV2(value: unknown): DailySuggestionV2 {
  assertSerializedSize(value)
  const output = record(value, 'daily suggestion')
  exactKeys(output, [
    'schemaVersion',
    'kind',
    'headline',
    'summary',
    'focus',
    'actions',
    'evidence',
    'limitations',
  ], 'daily suggestion')
  if (output.schemaVersion !== AI_OUTPUT_SCHEMA_VERSION) fail('daily suggestion schemaVersion must be 2')
  if (output.kind !== 'daily_suggestion') fail('daily suggestion kind is invalid')

  const focus = record(output.focus, 'daily suggestion.focus')
  exactKeys(focus, ['title', 'reason', 'estimatedMinutes'], 'daily suggestion.focus')

  if (!Array.isArray(output.actions) || output.actions.length < 1 || output.actions.length > 4) {
    fail('daily suggestion.actions must contain between 1 and 4 items')
  }
  const actions = output.actions.map((item, index) => {
    const action = record(item, `daily suggestion.actions[${index}]`)
    exactKeys(action, ['title', 'detail', 'category', 'estimatedMinutes'], `daily suggestion.actions[${index}]`)
    return {
      title: boundedString(action.title, `daily suggestion.actions[${index}].title`, 80),
      detail: boundedString(action.detail, `daily suggestion.actions[${index}].detail`, 240),
      category: enumValue(action.category, AI_ACTION_CATEGORIES, `daily suggestion.actions[${index}].category`),
      estimatedMinutes: boundedMinutes(action.estimatedMinutes, `daily suggestion.actions[${index}].estimatedMinutes`),
    }
  })

  return {
    schemaVersion: AI_OUTPUT_SCHEMA_VERSION,
    kind: 'daily_suggestion',
    headline: boundedString(output.headline, 'daily suggestion.headline', 80),
    summary: boundedString(output.summary, 'daily suggestion.summary', 320),
    focus: {
      title: boundedString(focus.title, 'daily suggestion.focus.title', 80),
      reason: boundedString(focus.reason, 'daily suggestion.focus.reason', 240),
      estimatedMinutes: boundedMinutes(focus.estimatedMinutes, 'daily suggestion.focus.estimatedMinutes'),
    },
    actions,
    evidence: boundedStringArray(output.evidence, 'daily suggestion.evidence', 4, 200),
    limitations: boundedStringArray(output.limitations, 'daily suggestion.limitations', 3, 200),
  }
}

export function parseLearningAnalysisV2(value: unknown): LearningAnalysisV2 {
  assertSerializedSize(value)
  const output = record(value, 'learning analysis')
  exactKeys(output, [
    'schemaVersion',
    'kind',
    'title',
    'conclusion',
    'insights',
    'actions',
    'limitations',
  ], 'learning analysis')
  if (output.schemaVersion !== AI_OUTPUT_SCHEMA_VERSION) fail('learning analysis schemaVersion must be 2')
  if (output.kind !== 'learning_analysis') fail('learning analysis kind is invalid')

  if (!Array.isArray(output.insights) || output.insights.length < 1 || output.insights.length > 6) {
    fail('learning analysis.insights must contain between 1 and 6 items')
  }
  const insights = output.insights.map((item, index) => {
    const insight = record(item, `learning analysis.insights[${index}]`)
    exactKeys(insight, ['type', 'title', 'finding', 'evidence'], `learning analysis.insights[${index}]`)
    return {
      type: enumValue(insight.type, AI_INSIGHT_TYPES, `learning analysis.insights[${index}].type`),
      title: boundedString(insight.title, `learning analysis.insights[${index}].title`, 80),
      finding: boundedString(insight.finding, `learning analysis.insights[${index}].finding`, 320),
      evidence: boundedString(insight.evidence, `learning analysis.insights[${index}].evidence`, 200),
    }
  })

  if (!Array.isArray(output.actions) || output.actions.length < 1 || output.actions.length > 5) {
    fail('learning analysis.actions must contain between 1 and 5 items')
  }
  const actions = output.actions.map((item, index) => {
    const action = record(item, `learning analysis.actions[${index}]`)
    exactKeys(action, ['priority', 'title', 'reason', 'estimatedMinutes'], `learning analysis.actions[${index}]`)
    return {
      priority: enumValue(action.priority, AI_ACTION_PRIORITIES, `learning analysis.actions[${index}].priority`),
      title: boundedString(action.title, `learning analysis.actions[${index}].title`, 80),
      reason: boundedString(action.reason, `learning analysis.actions[${index}].reason`, 240),
      estimatedMinutes: boundedMinutes(action.estimatedMinutes, `learning analysis.actions[${index}].estimatedMinutes`),
    }
  })

  return {
    schemaVersion: AI_OUTPUT_SCHEMA_VERSION,
    kind: 'learning_analysis',
    title: boundedString(output.title, 'learning analysis.title', 80),
    conclusion: boundedString(output.conclusion, 'learning analysis.conclusion', 600),
    insights,
    actions,
    limitations: boundedStringArray(output.limitations, 'learning analysis.limitations', 4, 200),
  }
}

export function parsePlanDraftV2(value: unknown): PlanDraftV2 {
  assertSerializedSize(value)
  const output = record(value, 'plan draft')
  exactKeys(output, [
    'schemaVersion',
    'kind',
    'title',
    'summary',
    'plans',
    'evidence',
    'limitations',
  ], 'plan draft')
  if (output.schemaVersion !== AI_OUTPUT_SCHEMA_VERSION) fail('plan draft schemaVersion must be 2')
  if (output.kind !== 'plan_draft') fail('plan draft kind is invalid')
  if (!Array.isArray(output.plans) || output.plans.length < 1 || output.plans.length > 4) {
    fail('plan draft.plans must contain between 1 and 4 items')
  }

  const plans = output.plans.map((item, index) => {
    const plan = record(item, `plan draft.plans[${index}]`)
    exactKeys(plan, [
      'title',
      'description',
      'category',
      'frequency',
      'weekDays',
      'targetTime',
      'targetDuration',
      'targetCount',
    ], `plan draft.plans[${index}]`)
    const frequency = enumValue(
      plan.frequency,
      AI_PLAN_FREQUENCIES,
      `plan draft.plans[${index}].frequency`,
    )
    if (!Array.isArray(plan.weekDays) || plan.weekDays.length > 7) {
      fail(`plan draft.plans[${index}].weekDays must be a bounded array`)
    }
    const weekDays = plan.weekDays.map((day, dayIndex) => {
      if (!Number.isInteger(day) || Number(day) < 0 || Number(day) > 6) {
        fail(`plan draft.plans[${index}].weekDays[${dayIndex}] is invalid`)
      }
      return Number(day)
    })
    if (new Set(weekDays).size !== weekDays.length) {
      fail(`plan draft.plans[${index}].weekDays must be unique`)
    }
    if (frequency === 'daily' && weekDays.length !== 0) {
      fail(`plan draft.plans[${index}].weekDays must be empty for daily plans`)
    }
    if (frequency === 'weekly' && weekDays.length === 0) {
      fail(`plan draft.plans[${index}].weekDays is required for weekly plans`)
    }
    return {
      title: boundedString(plan.title, `plan draft.plans[${index}].title`, 60),
      description: boundedString(plan.description, `plan draft.plans[${index}].description`, 320),
      category: enumValue(
        plan.category,
        AI_PLAN_CATEGORIES,
        `plan draft.plans[${index}].category`,
      ),
      frequency,
      weekDays: [...weekDays].sort((a, b) => a - b),
      targetTime: nullableTime(plan.targetTime, `plan draft.plans[${index}].targetTime`),
      targetDuration: nullableBoundedInteger(
        plan.targetDuration,
        `plan draft.plans[${index}].targetDuration`,
        5,
        180,
      ),
      targetCount: nullableBoundedInteger(
        plan.targetCount,
        `plan draft.plans[${index}].targetCount`,
        1,
        10_000,
      ),
    }
  })

  return {
    schemaVersion: AI_OUTPUT_SCHEMA_VERSION,
    kind: 'plan_draft',
    title: boundedString(output.title, 'plan draft.title', 80),
    summary: boundedString(output.summary, 'plan draft.summary', 320),
    plans,
    evidence: boundedStringArray(output.evidence, 'plan draft.evidence', 4, 200),
    limitations: boundedStringArray(output.limitations, 'plan draft.limitations', 3, 200),
  }
}

export function parseStructuredAiOutput<TPurpose extends ManagedAiPurpose>(
  value: unknown,
  purpose: TPurpose,
  writingSubmission?: WritingSubmissionV2,
): AiStructuredContentForPurpose<TPurpose> {
  return (purpose === 'daily_suggestion'
    ? parseDailySuggestionV2(value)
    : purpose === 'learning_analysis'
      ? parseLearningAnalysisV2(value)
      : purpose === 'plan_draft'
        ? parsePlanDraftV2(value)
        : parseWritingFeedbackV2(value, writingSubmission)) as AiStructuredContentForPurpose<TPurpose>
}

export function parseStructuredAiOutputJson<TPurpose extends ManagedAiPurpose>(
  rawContent: string,
  purpose: TPurpose,
  writingSubmission?: WritingSubmissionV2,
): AiStructuredContentForPurpose<TPurpose> {
  if (typeof rawContent !== 'string' || !rawContent.trim() || rawContent.length > MAX_SERIALIZED_OUTPUT_LENGTH) {
    fail('AI output must be a bounded JSON string')
  }
  const trimmed = rawContent.trim()
  const fencedMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed)
  const jsonText = fencedMatch?.[1]?.trim() ?? trimmed
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    fail('AI output is not valid JSON')
  }
  return parseStructuredAiOutput(parsed, purpose, writingSubmission)
}

export function isDailySuggestionV2(value: unknown): value is DailySuggestionV2 {
  try {
    parseDailySuggestionV2(value)
    return true
  } catch {
    return false
  }
}

export function isLearningAnalysisV2(value: unknown): value is LearningAnalysisV2 {
  try {
    parseLearningAnalysisV2(value)
    return true
  } catch {
    return false
  }
}

export function isPlanDraftV2(value: unknown): value is PlanDraftV2 {
  try {
    parsePlanDraftV2(value)
    return true
  } catch {
    return false
  }
}

export function isWritingFeedbackV2(
  value: unknown,
  submission?: WritingSubmissionV2,
): value is WritingFeedbackV2 {
  try {
    parseWritingFeedbackV2(value, submission)
    return true
  } catch {
    return false
  }
}

function minutesLabel(minutes: number): string {
  return `${minutes} 分钟`
}

export function formatDailySuggestionAsMarkdown(value: DailySuggestionV2): string {
  const output = parseDailySuggestionV2(value)
  const sections = [
    `## ${output.headline}`,
    output.summary,
    `### 今日重点\n- **${output.focus.title}**（${minutesLabel(output.focus.estimatedMinutes)}）：${output.focus.reason}`,
    `### 行动清单\n${output.actions.map((action) => `- **${action.title}**（${minutesLabel(action.estimatedMinutes)}）：${action.detail}`).join('\n')}`,
  ]
  if (output.evidence.length > 0) {
    sections.push(`### 依据\n${output.evidence.map((item) => `- ${item}`).join('\n')}`)
  }
  if (output.limitations.length > 0) {
    sections.push(`### 局限\n${output.limitations.map((item) => `- ${item}`).join('\n')}`)
  }
  return sections.join('\n\n')
}

export function formatLearningAnalysisAsMarkdown(value: LearningAnalysisV2): string {
  const output = parseLearningAnalysisV2(value)
  const sections = [
    `## ${output.title}`,
    output.conclusion,
    `### 关键发现\n${output.insights.map((insight) => `- **${insight.title}**：${insight.finding}\n  - 依据：${insight.evidence}`).join('\n')}`,
    `### 下一步行动\n${output.actions.map((action) => `- **${action.title}**（${minutesLabel(action.estimatedMinutes)}）：${action.reason}`).join('\n')}`,
  ]
  if (output.limitations.length > 0) {
    sections.push(`### 局限\n${output.limitations.map((item) => `- ${item}`).join('\n')}`)
  }
  return sections.join('\n\n')
}
