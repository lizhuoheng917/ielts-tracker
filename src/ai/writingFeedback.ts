import type { AiContextSnapshotV1 } from './contracts'

export const WRITING_FEEDBACK_SCHEMA_VERSION = 2 as const
export const WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION = 3 as const
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

/** V2 remains readable for historical drafts and saved reports. */
export type WritingSubmission = WritingSubmissionV2 | WritingSubmissionV3

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
const MAX_FEEDBACK_SERIALIZED_LENGTH = 12_000
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
): void {
  const requiredKeys = new Set(required)
  if (Object.keys(value).some((key) => !requiredKeys.has(key))) {
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

export function parseWritingSubmission(value: unknown): WritingSubmission {
  const submission = record(value, 'writing submission')
  if (submission.schemaVersion === WRITING_FEEDBACK_SCHEMA_VERSION) {
    return parseWritingSubmissionV2(value)
  }
  if (submission.schemaVersion === WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION) {
    return parseWritingSubmissionV3(value)
  }
  fail('writing submission.schemaVersion is unsupported')
}

export function isAutomaticWritingReference(
  submission: WritingSubmission,
): submission is WritingSubmissionV3 {
  return submission.schemaVersion === WRITING_REFERENCE_SUBMISSION_SCHEMA_VERSION
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
  ], 'writing feedback')
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

  const parsed: WritingFeedbackV2 = {
    schemaVersion: WRITING_FEEDBACK_SCHEMA_VERSION,
    kind: 'writing_feedback',
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus,
    taskCriterion: feedback.taskCriterion,
    summary: boundedString(feedback.summary, 'writing feedback.summary', 800),
    criteria,
    strengths,
    priorities,
    paragraphFeedback,
    corrections,
    limitations,
  }

  if (submissionValue !== undefined) {
    const submission = parseWritingSubmission(submissionValue)
    if (isAutomaticWritingReference(submission) && parsed.limitations.length < 1) {
      fail('automatic-reference feedback must include at least one limitation')
    }
  }

  if (assessmentStatus === 'insufficient_evidence') {
    const bands = Object.values(criteria).map((criterion) => criterion.band)
    if (bands.some((band) => band !== null)) {
      fail('insufficient-evidence feedback cannot contain precise band scores')
    }
  }

  if (submissionValue !== undefined) {
    const submission = parseWritingSubmission(submissionValue)
    if (parsed.taskCriterion !== expectedTaskCriterion(submission.task)) {
      fail('writing feedback.taskCriterion does not match the submitted task')
    }
    const hasSufficientEvidence = hasSufficientWritingTaskEvidence(submission)
    if (assessmentStatus === 'scored' && !hasSufficientEvidence) {
      fail('a submission without complete task evidence cannot receive precise band scores')
    }
    if (
      assessmentStatus === 'insufficient_evidence'
      && hasSufficientEvidence
      && !isAutomaticWritingReference(submission)
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
      : []),
    `- 英文词数：${submission.wordCount}`,
    `- 总分：${overallBand === null ? '证据不足，未评分' : overallBand}`,
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
  if (feedback.limitations.length > 0) {
    lines.push('', '## 局限', '', ...feedback.limitations.map((item) => `- ${item}`))
  }
  return lines.join('\n').trim()
}
