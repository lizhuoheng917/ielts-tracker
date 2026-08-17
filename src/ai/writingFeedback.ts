import type { AiContextSnapshotV1 } from './contracts'

export const WRITING_FEEDBACK_SCHEMA_VERSION = 2 as const
export const WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION = 3 as const
export const WRITING_DEEP_SUBMISSION_SCHEMA_VERSION = 4 as const
export const WRITING_RUBRIC_VERSION = 'ielts-writing-public-descriptors-v1' as const

export type WritingModule = 'academic' | 'general_training'
export type WritingTask = 'task1' | 'task2'
export type WritingBand =
  | 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5
  | 5 | 5.5 | 6 | 6.5 | 7 | 7.5 | 8 | 8.5 | 9

export type WritingSourceMaterialV2 =
  | { kind: 'none' }
  | { kind: 'text_description'; description: string }

export interface WritingSubmissionV2 {
  schemaVersion: typeof WRITING_FEEDBACK_SCHEMA_VERSION
  module: WritingModule
  task: WritingTask
  promptText: string
  sourceMaterial: WritingSourceMaterialV2
  essayText: string
  /** Host-computed English word count. Provider output can never override it. */
  wordCount: number
}

export interface CreateWritingSubmissionV2Input {
  module: WritingModule
  task: WritingTask
  promptText: string
  sourceMaterial: WritingSourceMaterialV2
  essayText: string
}

/**
 * A lightweight reference supplied by the learner instead of a copied question.
 * It is deliberately an inference hint, not a verified question-bank identifier.
 */
export interface WritingSourceReferenceV3 {
  collection: 'cambridge_ielts'
  bookNumber: number
  testNumber: number
}

export interface WritingSubmissionV3 {
  schemaVersion: typeof WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION
  module: WritingModule
  task: WritingTask
  sourceReference: WritingSourceReferenceV3
  essayText: string
  /** Host-computed English word count. Provider output can never override it. */
  wordCount: number
}

export interface CreateWritingSubmissionV3Input {
  module: WritingModule
  task: WritingTask
  sourceReference: WritingSourceReferenceV3
  essayText: string
}

export type WritingPromptImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

export type WritingDeepPromptSourceV4 =
  | { kind: 'text'; text: string; origin: 'typed' | 'recognized_image' }
  | {
      kind: 'image'
      mediaType: WritingPromptImageMediaType
      dataUrl: string
      byteLength: number
    }

export interface WritingSubmissionV4 {
  schemaVersion: typeof WRITING_DEEP_SUBMISSION_SCHEMA_VERSION
  analysisMode: 'deep'
  module: WritingModule
  task: WritingTask
  promptSource: WritingDeepPromptSourceV4
  essayText: string
  /** Host-computed English word count. Provider output can never override it. */
  wordCount: number
}

export interface CreateWritingSubmissionV4Input {
  module: WritingModule
  task: WritingTask
  promptSource: WritingDeepPromptSourceV4
  essayText: string
}

/** V2 remains readable for historical drafts and saved reports. */
export type WritingSubmission = WritingSubmissionV2 | WritingSubmissionV3 | WritingSubmissionV4

export interface WritingCriterionFeedbackV2 {
  band: WritingBand | null
  summary: string
  /** Exact, bounded excerpts from the submitted essay. */
  evidence: string[]
  improvement: string
}

export interface WritingFeedbackV2 {
  schemaVersion: typeof WRITING_FEEDBACK_SCHEMA_VERSION
  kind: 'writing_feedback'
  rubricVersion: typeof WRITING_RUBRIC_VERSION
  assessmentStatus: 'scored' | 'insufficient_evidence'
  /**
   * A single learning-oriented total estimate from the AI. Historical reports
   * did not include it, so parsing materializes those records as null.
   */
  estimatedOverallBand: WritingBand | null
  taskCriterion: 'task_achievement' | 'task_response'
  summary: string
  criteria: {
    task: WritingCriterionFeedbackV2
    coherenceCohesion: WritingCriterionFeedbackV2
    lexicalResource: WritingCriterionFeedbackV2
    grammaticalRangeAccuracy: WritingCriterionFeedbackV2
  }
  strengths: Array<{ title: string; evidence: string }>
  priorities: Array<{ title: string; reason: string; example: string }>
  paragraphFeedback: Array<{ paragraphIndex: number; summary: string; evidence: string }>
  corrections: Array<{ original: string; revision: string; reason: string }>
  limitations: string[]
  /** Present only for a schemaVersion=4 deep-writing submission. */
  deepAnalysis?: WritingDeepAnalysisV1
}

export interface WritingDeepAnalysisV1 {
  promptRecognition: {
    status: 'provided_text' | 'recognized' | 'failed'
    recognizedPrompt: string | null
    confidence: 'high' | 'medium' | 'low'
    note: string
  }
  promptCoverage: Array<{
    requirement: string
    status: 'met' | 'partial' | 'missing'
    finding: string
    evidence: string | null
    nextStep: string
  }>
  argumentMap: Array<{
    paragraphIndex: number
    role: string
    contribution: string
    gap: string
  }>
  recurringPatterns: Array<{
    type: 'logic' | 'cohesion' | 'vocabulary' | 'grammar'
    finding: string
    evidence: string
    fix: string
  }>
  rewritePlan: Array<{
    priority: 1 | 2 | 3
    action: string
    successCheck: string
  }>
}

export interface WritingContextData extends Record<string, unknown> {
  submission: WritingSubmission
}

/** @deprecated Use WritingContextData. Kept for downstream V2-only callers. */
export type WritingContextDataV2 = WritingContextData

export interface BuildWritingContextSnapshotOptions {
  now?: Date
  createId?: () => string
}

export class WritingFeedbackValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WritingFeedbackValidationError'
  }
}

type UnknownRecord = Record<string, unknown>

const MAX_PROMPT_LENGTH = 4_000
const MAX_SOURCE_DESCRIPTION_LENGTH = 6_000
const MAX_ESSAY_LENGTH = 20_000
const MAX_FEEDBACK_SERIALIZED_LENGTH = 24_000
export const MAX_WRITING_PROMPT_IMAGE_BYTES = 600 * 1024
const MAX_DEEP_SUBMISSION_SERIALIZED_LENGTH = 920_000
const MAX_SNAPSHOT_AGE_SECONDS = 300

function fail(message: string): never {
  throw new WritingFeedbackValidationError(message)
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
  optional: readonly string[] = [],
): void {
  const allowedKeys = new Set([...required, ...optional])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    fail(`${label} contains unsupported fields`)
  }
  if (required.some((key) => !(key in value))) {
    fail(`${label} is missing required fields`)
  }
}

function boundedString(
  value: unknown,
  label: string,
  maxLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== 'string') fail(`${label} must be a string`)
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if ((!allowEmpty && !normalized) || normalized.length > maxLength) {
    fail(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string no longer than ${maxLength} characters`)
  }
  return normalized
}

function boundedArray<T>(
  value: unknown,
  label: string,
  minItems: number,
  maxItems: number,
  parse: (item: unknown, itemLabel: string) => T,
): T[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    fail(`${label} must contain between ${minItems} and ${maxItems} items`)
  }
  return value.map((item, index) => parse(item, `${label}[${index}]`))
}

function assertSerializedSize(value: unknown, maxLength: number, label: string): void {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    fail(`${label} must be JSON serializable`)
  }
  if (typeof serialized !== 'string' || serialized.length > maxLength) {
    fail(`${label} exceeds the maximum serialized length`)
  }
}

function writingModule(value: unknown): WritingModule {
  if (value !== 'academic' && value !== 'general_training') {
    fail('writing submission.module has an unsupported value')
  }
  return value
}

function writingTask(value: unknown): WritingTask {
  if (value !== 'task1' && value !== 'task2') {
    fail('writing submission.task has an unsupported value')
  }
  return value
}

function parseSourceMaterial(
  value: unknown,
  module: WritingModule,
  task: WritingTask,
): WritingSourceMaterialV2 {
  const material = record(value, 'writing submission.sourceMaterial')
  if (material.kind === 'none') {
    exactKeys(material, ['kind'], 'writing submission.sourceMaterial')
    return { kind: 'none' }
  }
  if (material.kind !== 'text_description') {
    fail('writing submission.sourceMaterial.kind has an unsupported value')
  }
  exactKeys(material, ['kind', 'description'], 'writing submission.sourceMaterial')
  if (module !== 'academic' || task !== 'task1') {
    fail('text source material is only valid for Academic Task 1')
  }
  return {
    kind: 'text_description',
    description: boundedString(
      material.description,
      'writing submission.sourceMaterial.description',
      MAX_SOURCE_DESCRIPTION_LENGTH,
    ),
  }
}

/**
 * Count the English-token equivalent used for IELTS writing guidance.
 *
 * A Latin-script word counts once even when it contains a contraction,
 * possessive apostrophe or a hyphenated compound. A contiguous number, date,
 * time, percentage or currency amount also counts once. Punctuation and every
 * Unicode whitespace character are separators. CJK and other non-Latin text
 * is deliberately not silently treated as an English word.
 *
 * This grammar is kept byte-for-byte in the Edge contract so the live editor,
 * the AI request and server-side validation always agree.
 */
const WRITING_WORD_TOKEN = /(?:\p{Sc}?[-+]?\d+(?:[,.]\d+)*(?:[/-]\d+(?:[,.]\d+)*)*(?::\d+(?:\.\d+)?)?(?:[sS][tT]|[nN][dD]|[rR][dD]|[tT][hH])?(?:[%‰])?)|(?:\p{Script=Latin}(?:\.\p{Script=Latin})+\.?)|(?:\p{Script=Latin}(?:\p{Script=Latin}|\p{M}|\d)*(?:['\u2018\u2019\u02BC\-\u2010\u2011](?:\p{Script=Latin}(?:\p{Script=Latin}|\p{M}|\d)*|\d+))*(?:['\u2018\u2019\u02BC])?)/gu

/** V2/V3 reports predate the English-token policy and have no policy field. */
const LEGACY_WRITING_WORD_TOKEN = /[\p{L}\p{N}]+(?:[\u2019'][\p{L}\p{N}]+)*/gu

export function countWritingWords(text: string): number {
  if (typeof text !== 'string') return 0
  return text.match(WRITING_WORD_TOKEN)?.length ?? 0
}

function countLegacyWritingWords(text: string): number {
  return text.match(LEGACY_WRITING_WORD_TOKEN)?.length ?? 0
}

/**
 * New creation paths always write the current count. Exact legacy counts are
 * accepted for V2/V3 compatibility, then normalized in the returned submission
 * so the current editor and newly generated AI context stay correct.
 */
function normalizeWritingWordCount(
  supplied: unknown,
  essayText: string,
  label: string,
): number {
  const currentCount = countWritingWords(essayText)
  const legacyCount = countLegacyWritingWords(essayText)
  if (
    !Number.isInteger(supplied)
    || (supplied !== currentCount && supplied !== legacyCount)
  ) {
    fail(`${label} must match the host-computed essay word count`)
  }
  return currentCount
}

export function parseWritingSubmissionV2(value: unknown): WritingSubmissionV2 {
  assertSerializedSize(value, 40_000, 'writing submission')
  const submission = record(value, 'writing submission')
  exactKeys(submission, [
    'schemaVersion',
    'module',
    'task',
    'promptText',
    'sourceMaterial',
    'essayText',
    'wordCount',
  ], 'writing submission')
  if (submission.schemaVersion !== WRITING_FEEDBACK_SCHEMA_VERSION) {
    fail('writing submission.schemaVersion must be 2')
  }

  const module = writingModule(submission.module)
  const task = writingTask(submission.task)
  const promptText = boundedString(
    submission.promptText,
    'writing submission.promptText',
    MAX_PROMPT_LENGTH,
    true,
  )
  const sourceMaterial = parseSourceMaterial(submission.sourceMaterial, module, task)
  const essayText = boundedString(
    submission.essayText,
    'writing submission.essayText',
    MAX_ESSAY_LENGTH,
  )
  const wordCount = normalizeWritingWordCount(
    submission.wordCount,
    essayText,
    'writing submission.wordCount',
  )

  return {
    schemaVersion: WRITING_FEEDBACK_SCHEMA_VERSION,
    module,
    task,
    promptText,
    sourceMaterial,
    essayText,
    wordCount,
  }
}

export function createWritingSubmissionV2(
  input: CreateWritingSubmissionV2Input,
): WritingSubmissionV2 {
  const essayText = typeof input.essayText === 'string'
    ? input.essayText.replace(/\r\n?/g, '\n').trim()
    : input.essayText
  return parseWritingSubmissionV2({
    schemaVersion: WRITING_FEEDBACK_SCHEMA_VERSION,
    module: input.module,
    task: input.task,
    promptText: input.promptText,
    sourceMaterial: input.sourceMaterial,
    essayText,
    wordCount: countWritingWords(essayText),
  })
}

function boundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < min || value > max) {
    fail(`${label} must be an integer between ${min} and ${max}`)
  }
  return value
}

function parseSourceReferenceV3(value: unknown): WritingSourceReferenceV3 {
  const reference = record(value, 'writing submission.sourceReference')
  exactKeys(reference, ['collection', 'bookNumber', 'testNumber'], 'writing submission.sourceReference')
  if (reference.collection !== 'cambridge_ielts') {
    fail('writing submission.sourceReference.collection has an unsupported value')
  }
  const bookNumber = boundedInteger(
    reference.bookNumber,
    'writing submission.sourceReference.bookNumber',
    1,
    99,
  )
  const testNumber = boundedInteger(
    reference.testNumber,
    'writing submission.sourceReference.testNumber',
    1,
    4,
  )
  return {
    collection: 'cambridge_ielts',
    bookNumber,
    testNumber,
  }
}

export function parseWritingSubmissionV3(value: unknown): WritingSubmissionV3 {
  assertSerializedSize(value, 40_000, 'writing submission')
  const submission = record(value, 'writing submission')
  exactKeys(submission, [
    'schemaVersion',
    'module',
    'task',
    'sourceReference',
    'essayText',
    'wordCount',
  ], 'writing submission')
  if (submission.schemaVersion !== WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION) {
    fail('writing submission.schemaVersion must be 3')
  }

  const module = writingModule(submission.module)
  const task = writingTask(submission.task)
  const sourceReference = parseSourceReferenceV3(submission.sourceReference)
  const essayText = boundedString(
    submission.essayText,
    'writing submission.essayText',
    MAX_ESSAY_LENGTH,
  )
  const wordCount = normalizeWritingWordCount(
    submission.wordCount,
    essayText,
    'writing submission.wordCount',
  )

  return {
    schemaVersion: WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION,
    module,
    task,
    sourceReference,
    essayText,
    wordCount,
  }
}

export function createWritingSubmissionV3(
  input: CreateWritingSubmissionV3Input,
): WritingSubmissionV3 {
  const essayText = typeof input.essayText === 'string'
    ? input.essayText.replace(/\r\n?/g, '\n').trim()
    : input.essayText
  return parseWritingSubmissionV3({
    schemaVersion: WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION,
    module: input.module,
    task: input.task,
    sourceReference: input.sourceReference,
    essayText,
    wordCount: countWritingWords(essayText),
  })
}

function decodedBase64ByteLength(value: string): number | null {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

function parseDeepPromptSourceV4(value: unknown): WritingDeepPromptSourceV4 {
  const source = record(value, 'writing submission.promptSource')
  if (source.kind === 'text') {
    exactKeys(source, ['kind', 'text', 'origin'], 'writing submission.promptSource')
    if (source.origin !== 'typed' && source.origin !== 'recognized_image') {
      fail('writing submission.promptSource.origin has an unsupported value')
    }
    return {
      kind: 'text',
      text: boundedString(source.text, 'writing submission.promptSource.text', MAX_PROMPT_LENGTH),
      origin: source.origin,
    }
  }
  if (source.kind !== 'image') {
    fail('writing submission.promptSource.kind has an unsupported value')
  }
  exactKeys(
    source,
    ['kind', 'mediaType', 'dataUrl', 'byteLength'],
    'writing submission.promptSource',
  )
  if (
    source.mediaType !== 'image/jpeg'
    && source.mediaType !== 'image/png'
    && source.mediaType !== 'image/webp'
  ) {
    fail('writing submission.promptSource.mediaType has an unsupported value')
  }
  const byteLength = boundedInteger(
    source.byteLength,
    'writing submission.promptSource.byteLength',
    1,
    MAX_WRITING_PROMPT_IMAGE_BYTES,
  )
  if (typeof source.dataUrl !== 'string') {
    fail('writing submission.promptSource.dataUrl must be a string')
  }
  const prefix = `data:${source.mediaType};base64,`
  if (!source.dataUrl.startsWith(prefix)) {
    fail('writing submission.promptSource.dataUrl does not match mediaType')
  }
  const encoded = source.dataUrl.slice(prefix.length)
  if (decodedBase64ByteLength(encoded) !== byteLength) {
    fail('writing submission.promptSource.byteLength does not match dataUrl')
  }
  return {
    kind: 'image',
    mediaType: source.mediaType,
    dataUrl: source.dataUrl,
    byteLength,
  }
}

export function parseWritingSubmissionV4(value: unknown): WritingSubmissionV4 {
  assertSerializedSize(value, MAX_DEEP_SUBMISSION_SERIALIZED_LENGTH, 'writing submission')
  const submission = record(value, 'writing submission')
  exactKeys(submission, [
    'schemaVersion',
    'analysisMode',
    'module',
    'task',
    'promptSource',
    'essayText',
    'wordCount',
  ], 'writing submission')
  if (submission.schemaVersion !== WRITING_DEEP_SUBMISSION_SCHEMA_VERSION || submission.analysisMode !== 'deep') {
    fail('deep writing submission version or analysisMode is unsupported')
  }
  const module = writingModule(submission.module)
  const task = writingTask(submission.task)
  const promptSource = parseDeepPromptSourceV4(submission.promptSource)
  const essayText = boundedString(
    submission.essayText,
    'writing submission.essayText',
    MAX_ESSAY_LENGTH,
  )
  const wordCount = normalizeWritingWordCount(
    submission.wordCount,
    essayText,
    'writing submission.wordCount',
  )
  return {
    schemaVersion: WRITING_DEEP_SUBMISSION_SCHEMA_VERSION,
    analysisMode: 'deep',
    module,
    task,
    promptSource,
    essayText,
    wordCount,
  }
}

export function createWritingSubmissionV4(
  input: CreateWritingSubmissionV4Input,
): WritingSubmissionV4 {
  const essayText = typeof input.essayText === 'string'
    ? input.essayText.replace(/\r\n?/g, '\n').trim()
    : input.essayText
  return parseWritingSubmissionV4({
    schemaVersion: WRITING_DEEP_SUBMISSION_SCHEMA_VERSION,
    analysisMode: 'deep',
    module: input.module,
    task: input.task,
    promptSource: input.promptSource,
    essayText,
    wordCount: countWritingWords(essayText),
  })
}

export function parseWritingSubmission(value: unknown): WritingSubmission {
  const submission = record(value, 'writing submission')
  if (submission.schemaVersion === WRITING_FEEDBACK_SCHEMA_VERSION) {
    return parseWritingSubmissionV2(value)
  }
  if (submission.schemaVersion === WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION) {
    return parseWritingSubmissionV3(value)
  }
  if (submission.schemaVersion === WRITING_DEEP_SUBMISSION_SCHEMA_VERSION) {
    return parseWritingSubmissionV4(value)
  }
  fail('writing submission.schemaVersion is unsupported')
}

export function isAutomaticWritingReference(
  submission: WritingSubmission,
): submission is WritingSubmissionV3 {
  return submission.schemaVersion === WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION
}

export function isDeepWritingSubmission(
  submission: WritingSubmission,
): submission is WritingSubmissionV4 {
  return submission.schemaVersion === WRITING_DEEP_SUBMISSION_SCHEMA_VERSION
}

export function writingSubmissionUsesImage(submissionValue: unknown): boolean {
  const submission = parseWritingSubmission(submissionValue)
  return isDeepWritingSubmission(submission) && submission.promptSource.kind === 'image'
}

export function writingQuotaUnits(submissionValue: unknown): 1 | 2 {
  return isDeepWritingSubmission(parseWritingSubmission(submissionValue)) ? 2 : 1
}

export function formatWritingSourceReference(submissionValue: WritingSubmission): string | null {
  const submission = submissionValue
  if (!isAutomaticWritingReference(submission)) return null
  const moduleLabel = submission.module === 'academic' ? 'Academic' : 'General Training'
  const taskLabel = submission.task === 'task1' ? 'Task 1' : 'Task 2'
  return [
    `剑雅 ${submission.sourceReference.bookNumber}`,
    `Test ${submission.sourceReference.testNumber}`,
    moduleLabel,
    taskLabel,
  ].join(' · ')
}

export function hasSufficientWritingTaskEvidence(submissionValue: unknown): boolean {
  const submission = parseWritingSubmission(submissionValue)
  if (isDeepWritingSubmission(submission)) return true
  // Reference-mode reports are intentionally labelled as a reference assessment,
  // but they remain eligible for a scored response. The provider is instructed to
  // state uncertainty rather than pretend the question was exact-matched.
  if (isAutomaticWritingReference(submission)) return true
  if (!submission.promptText) return false
  if (submission.module === 'academic' && submission.task === 'task1') {
    return submission.sourceMaterial.kind === 'text_description'
      && submission.sourceMaterial.description.length > 0
  }
  return true
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

export function buildWritingContextSnapshot(
  submissionValue: unknown,
  options: BuildWritingContextSnapshotOptions = {},
): AiContextSnapshotV1<WritingContextData> {
  const submission = parseWritingSubmission(submissionValue)
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) fail('writing snapshot timestamp is invalid')
  const createdAt = now.toISOString()
  const warnings: string[] = []
  const hasTaskEvidence = hasSufficientWritingTaskEvidence(submission)

  if (isAutomaticWritingReference(submission)) {
    warnings.push('题目自动识别仅作参考评估；AI 会根据剑雅书号、Test 和 Task 尝试识别，可能与原题不完全一致。')
    if (submission.module === 'academic' && submission.task === 'task1') {
      warnings.push('未提供原图，Task Achievement 仅作参考；报告将以语言、结构和表达反馈为主。')
    }
  } else if (isDeepWritingSubmission(submission)) {
    warnings.push('深度分析会占用 2 次写作 AI 额度；题目图片只随本次请求发送，不会保存在报告中。')
    if (
      submission.promptSource.kind === 'text'
      && submission.module === 'academic'
      && submission.task === 'task1'
    ) {
      warnings.push('Academic Task 1 使用文字题目时，未包含在文字中的视觉细节仍可能限制任务完成度判断。')
    }
  } else {
    if (!submission.promptText) warnings.push('缺少写作题目，只能提供语言反馈，不能给出可靠分数。')
    if (
      submission.module === 'academic'
      && submission.task === 'task1'
      && submission.sourceMaterial.kind === 'none'
    ) {
      warnings.push('缺少图表、地图、流程或示意图的文字描述，不能可靠评估任务完成度。')
    }
  }
  const recommendedMinimum = submission.task === 'task1' ? 150 : 250
  if (submission.wordCount < recommendedMinimum) {
    warnings.push(`作文英文词数少于 ${recommendedMinimum} 词，评分证据有限。`)
  }

  const data: WritingContextData = { submission }
  const sourceRevision = `writing-src-${stableHash(data)}`
  const contextHash = `writing-ctx-${stableHash({ purpose: 'writing_feedback', data })}`
  const qualityLimited = isAutomaticWritingReference(submission)
    || !hasTaskEvidence
    || submission.wordCount < recommendedMinimum

  return {
    schemaVersion: 1,
    snapshotId: options.createId?.() ?? crypto.randomUUID(),
    purpose: 'writing_feedback',
    createdAt,
    dataAsOf: createdAt,
    freshness: { status: 'fresh', ageSeconds: 0, maxAgeSeconds: MAX_SNAPSHOT_AGE_SECONDS },
    sourceRevision,
    contextHash,
    scopes: ['writing.submission'],
    privateScopes: ['writing.submission'],
    quality: {
      status: qualityLimited ? 'limited' : 'sufficient',
      recordCount: 1,
      warnings,
    },
    data,
  }
}

function parseBand(value: unknown, label: string, allowNull: boolean): WritingBand | null {
  if (value === null && allowNull) return null
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
    || value > 9
    || !Number.isInteger(value * 2)
  ) {
    fail(`${label} must be ${allowNull ? 'null or ' : ''}a 0-9 half-band score`)
  }
  return value as WritingBand
}

function parseCriterion(
  value: unknown,
  label: string,
  assessmentStatus: WritingFeedbackV2['assessmentStatus'],
): WritingCriterionFeedbackV2 {
  const criterion = record(value, label)
  exactKeys(criterion, ['band', 'summary', 'evidence', 'improvement'], label)
  const scored = assessmentStatus === 'scored'
  const evidence = boundedArray(
    criterion.evidence,
    `${label}.evidence`,
    scored ? 1 : 0,
    scored ? 3 : 0,
    (item, itemLabel) => boundedString(item, itemLabel, 200),
  )
  return {
    band: parseBand(criterion.band, `${label}.band`, !scored),
    summary: boundedString(criterion.summary, `${label}.summary`, 500),
    evidence,
    improvement: boundedString(criterion.improvement, `${label}.improvement`, 400),
  }
}

function expectedTaskCriterion(task: WritingTask): WritingFeedbackV2['taskCriterion'] {
  return task === 'task1' ? 'task_achievement' : 'task_response'
}

function normalizedEvidence(value: string): string {
  return value
    .trim()
    .replace(/^["'\u2018\u2019\u201c\u201d]+|["'\u2018\u2019\u201c\u201d]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en')
}

function assertEvidenceComesFromEssay(
  evidence: string,
  essayText: string,
  label: string,
): void {
  const normalized = normalizedEvidence(evidence)
  const essay = essayText.replace(/\s+/g, ' ').toLocaleLowerCase('en')
  if (normalized.length < 2 || !essay.includes(normalized)) {
    fail(`${label} must be an exact excerpt from the submitted essay`)
  }
}

function parseWritingDeepAnalysis(
  value: unknown,
  submission: WritingSubmissionV4 | undefined,
  assessmentStatus: WritingFeedbackV2['assessmentStatus'],
): WritingDeepAnalysisV1 {
  const deep = record(value, 'writing feedback.deepAnalysis')
  exactKeys(
    deep,
    ['promptRecognition', 'promptCoverage', 'argumentMap', 'recurringPatterns', 'rewritePlan'],
    'writing feedback.deepAnalysis',
  )
  const recognition = record(
    deep.promptRecognition,
    'writing feedback.deepAnalysis.promptRecognition',
  )
  exactKeys(
    recognition,
    ['status', 'recognizedPrompt', 'confidence', 'note'],
    'writing feedback.deepAnalysis.promptRecognition',
  )
  if (
    recognition.status !== 'provided_text'
    && recognition.status !== 'recognized'
    && recognition.status !== 'failed'
  ) {
    fail('writing feedback.deepAnalysis.promptRecognition.status is invalid')
  }
  if (
    recognition.confidence !== 'high'
    && recognition.confidence !== 'medium'
    && recognition.confidence !== 'low'
  ) {
    fail('writing feedback.deepAnalysis.promptRecognition.confidence is invalid')
  }
  const recognizedPrompt = recognition.recognizedPrompt === null
    ? null
    : boundedString(
        recognition.recognizedPrompt,
        'writing feedback.deepAnalysis.promptRecognition.recognizedPrompt',
        MAX_PROMPT_LENGTH,
      )
  const recognitionFailed = recognition.status === 'failed'
  if ((recognition.status === 'recognized') !== (recognizedPrompt !== null)) {
    fail('writing feedback.deepAnalysis prompt recognition content is inconsistent')
  }
  if (recognition.status !== 'recognized' && recognizedPrompt !== null) {
    fail('writing feedback.deepAnalysis recognizedPrompt is only valid after image recognition')
  }
  if (recognitionFailed && assessmentStatus !== 'insufficient_evidence') {
    fail('failed prompt recognition cannot produce scored feedback')
  }
  if (submission) {
    const expectedStatus = submission.promptSource.kind === 'image'
      ? recognitionFailed ? 'failed' : 'recognized'
      : submission.promptSource.origin === 'recognized_image'
        ? 'recognized'
        : 'provided_text'
    if (recognition.status !== expectedStatus) {
      fail('writing feedback.deepAnalysis prompt recognition does not match the submitted source')
    }
  }

  const promptCoverage = boundedArray(
    deep.promptCoverage,
    'writing feedback.deepAnalysis.promptCoverage',
    recognitionFailed ? 0 : 1,
    recognitionFailed ? 0 : 4,
    (item, label) => {
      const coverage = record(item, label)
      exactKeys(coverage, ['requirement', 'status', 'finding', 'evidence', 'nextStep'], label)
      if (!['met', 'partial', 'missing'].includes(String(coverage.status))) {
        fail(`${label}.status is invalid`)
      }
      const evidence = coverage.evidence === null
        ? null
        : boundedString(coverage.evidence, `${label}.evidence`, 200)
      if ((coverage.status === 'missing') !== (evidence === null)) {
        fail(`${label}.evidence must be null only when the prompt requirement is missing`)
      }
      return {
        requirement: boundedString(coverage.requirement, `${label}.requirement`, 180),
        status: coverage.status as WritingDeepAnalysisV1['promptCoverage'][number]['status'],
        finding: boundedString(coverage.finding, `${label}.finding`, 280),
        evidence,
        nextStep: boundedString(coverage.nextStep, `${label}.nextStep`, 300),
      }
    },
  )
  if (new Set(promptCoverage.map((item) => item.requirement.trim().toLocaleLowerCase())).size !== promptCoverage.length) {
    fail('writing feedback.deepAnalysis.promptCoverage requirements must be unique')
  }

  const argumentMap = boundedArray(
    deep.argumentMap,
    'writing feedback.deepAnalysis.argumentMap',
    recognitionFailed ? 0 : 1,
    recognitionFailed ? 0 : 10,
    (item, label) => {
      const paragraph = record(item, label)
      exactKeys(paragraph, ['paragraphIndex', 'role', 'contribution', 'gap'], label)
      return {
        paragraphIndex: boundedInteger(paragraph.paragraphIndex, `${label}.paragraphIndex`, 1, 30),
        role: boundedString(paragraph.role, `${label}.role`, 100),
        contribution: boundedString(paragraph.contribution, `${label}.contribution`, 260),
        gap: boundedString(paragraph.gap, `${label}.gap`, 260),
      }
    },
  )
  if (new Set(argumentMap.map((item) => item.paragraphIndex)).size !== argumentMap.length) {
    fail('writing feedback.deepAnalysis.argumentMap paragraphIndex values must be unique')
  }
  const recurringPatterns = boundedArray(
    deep.recurringPatterns,
    'writing feedback.deepAnalysis.recurringPatterns',
    0,
    recognitionFailed ? 0 : 6,
    (item, label) => {
      const pattern = record(item, label)
      exactKeys(pattern, ['type', 'finding', 'evidence', 'fix'], label)
      if (!['logic', 'cohesion', 'vocabulary', 'grammar'].includes(String(pattern.type))) {
        fail(`${label}.type is invalid`)
      }
      return {
        type: pattern.type as WritingDeepAnalysisV1['recurringPatterns'][number]['type'],
        finding: boundedString(pattern.finding, `${label}.finding`, 280),
        evidence: boundedString(pattern.evidence, `${label}.evidence`, 200),
        fix: boundedString(pattern.fix, `${label}.fix`, 300),
      }
    },
  )
  const rewritePlan = boundedArray(
    deep.rewritePlan,
    'writing feedback.deepAnalysis.rewritePlan',
    recognitionFailed ? 0 : 2,
    recognitionFailed ? 0 : 3,
    (item, label) => {
      const action = record(item, label)
      exactKeys(action, ['priority', 'action', 'successCheck'], label)
      return {
        priority: boundedInteger(action.priority, `${label}.priority`, 1, 3) as 1 | 2 | 3,
        action: boundedString(action.action, `${label}.action`, 300),
        successCheck: boundedString(action.successCheck, `${label}.successCheck`, 240),
      }
    },
  )
  if (new Set(rewritePlan.map((item) => item.priority)).size !== rewritePlan.length) {
    fail('writing feedback.deepAnalysis.rewritePlan priorities must be unique')
  }

  return {
    promptRecognition: {
      status: recognition.status,
      recognizedPrompt,
      confidence: recognition.confidence,
      note: boundedString(recognition.note, 'writing feedback.deepAnalysis.promptRecognition.note', 240),
    },
    promptCoverage,
    argumentMap,
    recurringPatterns,
    rewritePlan,
  }
}

export function parseWritingFeedbackV2(
  value: unknown,
  submissionValue?: unknown,
): WritingFeedbackV2 {
  assertSerializedSize(value, MAX_FEEDBACK_SERIALIZED_LENGTH, 'writing feedback')
  const feedback = record(value, 'writing feedback')
  exactKeys(feedback, [
    'schemaVersion',
    'kind',
    'rubricVersion',
    'assessmentStatus',
    'taskCriterion',
    'summary',
    'criteria',
    'strengths',
    'priorities',
    'paragraphFeedback',
    'corrections',
    'limitations',
  ], 'writing feedback', ['estimatedOverallBand', 'deepAnalysis'])
  if (feedback.schemaVersion !== WRITING_FEEDBACK_SCHEMA_VERSION) {
    fail('writing feedback.schemaVersion must be 2')
  }
  if (feedback.kind !== 'writing_feedback') fail('writing feedback.kind is invalid')
  if (feedback.rubricVersion !== WRITING_RUBRIC_VERSION) {
    fail('writing feedback.rubricVersion is invalid')
  }
  if (feedback.assessmentStatus !== 'scored' && feedback.assessmentStatus !== 'insufficient_evidence') {
    fail('writing feedback.assessmentStatus is invalid')
  }
  const assessmentStatus = feedback.assessmentStatus
  const estimatedOverallBand = Object.hasOwn(feedback, 'estimatedOverallBand')
    ? parseBand(feedback.estimatedOverallBand, 'writing feedback.estimatedOverallBand', true)
    : null
  if (feedback.taskCriterion !== 'task_achievement' && feedback.taskCriterion !== 'task_response') {
    fail('writing feedback.taskCriterion is invalid')
  }

  const criteriaValue = record(feedback.criteria, 'writing feedback.criteria')
  exactKeys(criteriaValue, [
    'task',
    'coherenceCohesion',
    'lexicalResource',
    'grammaticalRangeAccuracy',
  ], 'writing feedback.criteria')
  const criteria = {
    task: parseCriterion(criteriaValue.task, 'writing feedback.criteria.task', assessmentStatus),
    coherenceCohesion: parseCriterion(
      criteriaValue.coherenceCohesion,
      'writing feedback.criteria.coherenceCohesion',
      assessmentStatus,
    ),
    lexicalResource: parseCriterion(
      criteriaValue.lexicalResource,
      'writing feedback.criteria.lexicalResource',
      assessmentStatus,
    ),
    grammaticalRangeAccuracy: parseCriterion(
      criteriaValue.grammaticalRangeAccuracy,
      'writing feedback.criteria.grammaticalRangeAccuracy',
      assessmentStatus,
    ),
  }

  const strengths = boundedArray(
    feedback.strengths,
    'writing feedback.strengths',
    assessmentStatus === 'scored' ? 1 : 0,
    assessmentStatus === 'scored' ? 4 : 0,
    (item, label) => {
      const strength = record(item, label)
      exactKeys(strength, ['title', 'evidence'], label)
      return {
        title: boundedString(strength.title, `${label}.title`, 100),
        evidence: boundedString(strength.evidence, `${label}.evidence`, 200),
      }
    },
  )
  const priorities = boundedArray(
    feedback.priorities,
    'writing feedback.priorities',
    1,
    5,
    (item, label) => {
      const priority = record(item, label)
      exactKeys(priority, ['title', 'reason', 'example'], label)
      return {
        title: boundedString(priority.title, `${label}.title`, 100),
        reason: boundedString(priority.reason, `${label}.reason`, 300),
        example: boundedString(priority.example, `${label}.example`, 400),
      }
    },
  )
  const paragraphFeedback = boundedArray(
    feedback.paragraphFeedback,
    'writing feedback.paragraphFeedback',
    0,
    assessmentStatus === 'scored' ? 20 : 0,
    (item, label) => {
      const paragraph = record(item, label)
      exactKeys(paragraph, ['paragraphIndex', 'summary', 'evidence'], label)
      if (!Number.isInteger(paragraph.paragraphIndex) || Number(paragraph.paragraphIndex) < 1 || Number(paragraph.paragraphIndex) > 30) {
        fail(`${label}.paragraphIndex must be an integer between 1 and 30`)
      }
      return {
        paragraphIndex: Number(paragraph.paragraphIndex),
        summary: boundedString(paragraph.summary, `${label}.summary`, 400),
        evidence: boundedString(paragraph.evidence, `${label}.evidence`, 200),
      }
    },
  )
  if (new Set(paragraphFeedback.map((item) => item.paragraphIndex)).size !== paragraphFeedback.length) {
    fail('writing feedback.paragraphFeedback paragraphIndex values must be unique')
  }
  const corrections = boundedArray(
    feedback.corrections,
    'writing feedback.corrections',
    0,
    assessmentStatus === 'scored' ? 8 : 0,
    (item, label) => {
      const correction = record(item, label)
      exactKeys(correction, ['original', 'revision', 'reason'], label)
      return {
        original: boundedString(correction.original, `${label}.original`, 240),
        revision: boundedString(correction.revision, `${label}.revision`, 320),
        reason: boundedString(correction.reason, `${label}.reason`, 240),
      }
    },
  )
  const limitations = boundedArray(
    feedback.limitations,
    'writing feedback.limitations',
    assessmentStatus === 'insufficient_evidence' ? 1 : 0,
    5,
    (item, label) => boundedString(item, label, 240),
  )

  const parsedSubmission = submissionValue === undefined
    ? undefined
    : parseWritingSubmission(submissionValue)
  const deepSubmission = parsedSubmission && isDeepWritingSubmission(parsedSubmission)
    ? parsedSubmission
    : undefined
  const deepAnalysis = Object.hasOwn(feedback, 'deepAnalysis')
    ? parseWritingDeepAnalysis(feedback.deepAnalysis, deepSubmission, assessmentStatus)
    : undefined
  if (parsedSubmission !== undefined && Boolean(deepSubmission) !== Boolean(deepAnalysis)) {
    fail('deep writing submissions and feedback must use the deepAnalysis contract together')
  }

  const parsed: WritingFeedbackV2 = {
    schemaVersion: WRITING_FEEDBACK_SCHEMA_VERSION,
    kind: 'writing_feedback',
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus,
    estimatedOverallBand,
    taskCriterion: feedback.taskCriterion,
    summary: boundedString(feedback.summary, 'writing feedback.summary', 800),
    criteria,
    strengths,
    priorities,
    paragraphFeedback,
    corrections,
    limitations,
    ...(deepAnalysis ? { deepAnalysis } : {}),
  }

  if (parsedSubmission !== undefined) {
    const submission = parsedSubmission
    if (isAutomaticWritingReference(submission) && parsed.limitations.length < 1) {
      fail('automatic-reference feedback must include at least one limitation')
    }
  }

  if (assessmentStatus === 'insufficient_evidence') {
    // A text-only overall estimate is intentionally independent from the
    // four rubric bands. The automatic-reference flow uses it while keeping
    // every criterion band null because the original task cannot be verified.
    const bands = Object.values(criteria).map((criterion) => criterion.band)
    if (bands.some((band) => band !== null)) {
      fail('insufficient-evidence feedback cannot contain precise band scores')
    }
  }

  if (parsedSubmission !== undefined) {
    const submission = parsedSubmission
    if (parsed.taskCriterion !== expectedTaskCriterion(submission.task)) {
      fail('writing feedback.taskCriterion does not match the submitted task')
    }
    const hasSufficientEvidence = hasSufficientWritingTaskEvidence(submission)
    const recognitionFailed = parsed.deepAnalysis?.promptRecognition.status === 'failed'
    if (assessmentStatus === 'scored' && !hasSufficientEvidence) {
      fail('a submission without complete task evidence cannot receive precise band scores')
    }
    if (
      assessmentStatus === 'insufficient_evidence'
      && hasSufficientEvidence
      && !isAutomaticWritingReference(submission)
      && !recognitionFailed
    ) {
      fail('a submission with complete task evidence cannot receive insufficient-evidence feedback')
    }
    Object.entries(parsed.criteria).forEach(([key, criterion]) => {
      criterion.evidence.forEach((evidence, index) => {
        assertEvidenceComesFromEssay(evidence, submission.essayText, `writing feedback.criteria.${key}.evidence[${index}]`)
      })
    })
    parsed.strengths.forEach((strength, index) => {
      assertEvidenceComesFromEssay(strength.evidence, submission.essayText, `writing feedback.strengths[${index}].evidence`)
    })
    parsed.paragraphFeedback.forEach((paragraph, index) => {
      assertEvidenceComesFromEssay(
        paragraph.evidence,
        submission.essayText,
        `writing feedback.paragraphFeedback[${index}].evidence`,
      )
    })
    parsed.corrections.forEach((correction, index) => {
      assertEvidenceComesFromEssay(
        correction.original,
        submission.essayText,
        `writing feedback.corrections[${index}].original`,
      )
    })
    parsed.deepAnalysis?.recurringPatterns.forEach((pattern, index) => {
      assertEvidenceComesFromEssay(
        pattern.evidence,
        submission.essayText,
        `writing feedback.deepAnalysis.recurringPatterns[${index}].evidence`,
      )
    })
    parsed.deepAnalysis?.promptCoverage.forEach((coverage, index) => {
      if (coverage.evidence === null) return
      assertEvidenceComesFromEssay(
        coverage.evidence,
        submission.essayText,
        `writing feedback.deepAnalysis.promptCoverage[${index}].evidence`,
      )
    })
  }

  return parsed
}

export function calculateWritingOverallBand(feedbackValue: unknown): WritingBand | null {
  const feedback = parseWritingFeedbackV2(feedbackValue)
  if (feedback.assessmentStatus !== 'scored') return null
  const bands = Object.values(feedback.criteria).map((criterion) => criterion.band)
  if (bands.some((band) => band === null)) {
    fail('scored writing feedback must contain all four criterion bands')
  }
  const average = (bands as WritingBand[]).reduce<number>((total, band) => total + band, 0) / bands.length
  return (Math.round(average * 2) / 2) as WritingBand
}

/**
 * Removes an inline prompt image before a generated report can be persisted.
 * Only the bounded text recognized by the validated deep report survives.
 */
export function materializeStoredWritingSubmission(
  submissionValue: unknown,
  feedbackValue: unknown,
): WritingSubmission {
  const submission = parseWritingSubmission(submissionValue)
  const feedback = parseWritingFeedbackV2(feedbackValue, submission)
  if (!isDeepWritingSubmission(submission) || submission.promptSource.kind !== 'image') {
    return submission
  }
  const recognizedPrompt = feedback.deepAnalysis?.promptRecognition.status === 'recognized'
    ? feedback.deepAnalysis.promptRecognition.recognizedPrompt
    : null
  if (!recognizedPrompt) {
    fail('a deep image submission cannot be stored without recognized prompt text')
  }
  return parseWritingSubmissionV4({
    ...submission,
    promptSource: {
      kind: 'text',
      text: recognizedPrompt,
      origin: 'recognized_image',
    },
  })
}

function criterionMarkdown(label: string, criterion: WritingCriterionFeedbackV2): string[] {
  return [
    `#### ${label} · ${criterion.band === null ? '未评分' : criterion.band}`,
    criterion.summary,
    ...(criterion.evidence.length > 0
      ? ['', ...criterion.evidence.map((evidence) => `- 证据：${evidence}`)]
      : []),
    '',
    `改进方向：${criterion.improvement}`,
  ]
}

export function formatWritingFeedbackAsMarkdown(
  submissionValue: unknown,
  feedbackValue: unknown,
  overallBand: WritingBand | null,
): string {
  const submission = parseWritingSubmission(submissionValue)
  const feedback = parseWritingFeedbackV2(feedbackValue, submission)
  const calculatedBand = calculateWritingOverallBand(feedback)
  if (overallBand !== calculatedBand) fail('overallBand does not match the four criterion bands')
  const taskLabel = submission.task === 'task1' ? 'Task 1' : 'Task 2'
  const moduleLabel = submission.module === 'academic' ? 'Academic' : 'General Training'
  const taskCriterionLabel = feedback.taskCriterion === 'task_achievement'
    ? 'Task Achievement'
    : 'Task Response'

  const lines = [
    '# IELTS 写作反馈',
    '',
    `- 类型：${moduleLabel} ${taskLabel}`,
    ...(isAutomaticWritingReference(submission)
      ? [
          `- 题目引用：${formatWritingSourceReference(submission)}`,
          '- 评估方式：题目自动识别 · 参考评估（可能与原题不完全一致）',
          ...(submission.module === 'academic' && submission.task === 'task1'
            ? ['- Task 1 提示：未提供原图，任务完成度仅作参考。']
            : []),
        ]
      : isDeepWritingSubmission(submission)
        ? [
            `- 分析方式：深度分析（${submission.promptSource.kind === 'text' && submission.promptSource.origin === 'recognized_image' ? '图片题目已识别' : '用户提供题目文字或图片'}）`,
          ]
        : []),
    `- 英文词数：${submission.wordCount}`,
    ...(feedback.estimatedOverallBand === null
      ? [`- 总分：${overallBand === null ? '证据不足，未评分' : overallBand}`]
      : [
          `- AI 预估总分：${feedback.estimatedOverallBand}`,
          ...(overallBand === null ? [] : [`- 四维参考总分：${overallBand}`]),
        ]),
    `- 评分标准：${feedback.rubricVersion}`,
    '',
    '## 总结',
    '',
    feedback.summary,
    '',
    '## 分项反馈',
    '',
    ...criterionMarkdown(taskCriterionLabel, feedback.criteria.task),
    '',
    ...criterionMarkdown('Coherence and Cohesion', feedback.criteria.coherenceCohesion),
    '',
    ...criterionMarkdown('Lexical Resource', feedback.criteria.lexicalResource),
    '',
    ...criterionMarkdown('Grammatical Range and Accuracy', feedback.criteria.grammaticalRangeAccuracy),
  ]

  if (feedback.strengths.length > 0) {
    lines.push('', '## 优点', '', ...feedback.strengths.map((item) => `- **${item.title}**：${item.evidence}`))
  }
  lines.push('', '## 优先改进', '', ...feedback.priorities.map((item) => (
    `- **${item.title}**：${item.reason} 示例：${item.example}`
  )))
  if (feedback.paragraphFeedback.length > 0) {
    lines.push('', '## 分段反馈', '', ...feedback.paragraphFeedback.map((item) => (
      `- 第 ${item.paragraphIndex} 段：${item.summary} 证据：${item.evidence}`
    )))
  }
  if (feedback.corrections.length > 0) {
    lines.push('', '## 修改示例', '', ...feedback.corrections.map((item) => (
      `- 原文：${item.original}\n  修改：${item.revision}\n  原因：${item.reason}`
    )))
  }
  if (feedback.deepAnalysis) {
    lines.push(
      '',
      '## 深度诊断',
      '',
      `- 题目处理：${feedback.deepAnalysis.promptRecognition.note}`,
      ...feedback.deepAnalysis.promptCoverage.map((item) => (
        `- 题目要求（${item.status}）：${item.requirement} 判断：${item.finding}${item.evidence ? ` 证据：${item.evidence}` : ''} 下一步：${item.nextStep}`
      )),
      ...feedback.deepAnalysis.argumentMap.map((item) => (
        `- 第 ${item.paragraphIndex} 段（${item.role}）：${item.contribution} 缺口：${item.gap}`
      )),
      ...feedback.deepAnalysis.recurringPatterns.map((item) => (
        `- ${item.type}：${item.finding} 证据：${item.evidence} 修正：${item.fix}`
      )),
      '',
      '### 重写顺序',
      '',
      ...[...feedback.deepAnalysis.rewritePlan]
        .sort((left, right) => left.priority - right.priority)
        .map((item) => `- ${item.priority}. ${item.action} 完成标准：${item.successCheck}`),
    )
  }
  if (feedback.limitations.length > 0) {
    lines.push('', '## 局限', '', ...feedback.limitations.map((item) => `- ${item}`))
  }
  return lines.join('\n').trim()
}
