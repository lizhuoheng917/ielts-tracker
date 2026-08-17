import type { AiContextSnapshotV1 } from './contracts'
import {
  countWritingWords,
  isDeepWritingSubmission,
  parseWritingSubmission,
  type WritingFeedbackV2,
  type WritingSubmission,
} from './writingFeedback'

export const WRITING_REVISION_INPUT_SCHEMA_VERSION = 1 as const
export const WRITING_REVISION_OUTPUT_SCHEMA_VERSION = 2 as const

export type WritingRevisionFocusSource = 'priority' | 'correction' | 'rewrite_plan'

export interface WritingRevisionFocusOption {
  key: string
  title: string
  guidance: string
  source: WritingRevisionFocusSource
}

export interface WritingRevisionFocus {
  index: 1 | 2 | 3
  title: string
  guidance: string
  source: WritingRevisionFocusSource
}

export interface WritingRevisionInputV1 {
  schemaVersion: typeof WRITING_REVISION_INPUT_SCHEMA_VERSION
  submission: WritingSubmission
  revisedEssay: string
  revisedWordCount: number
  focuses: WritingRevisionFocus[]
}

export interface WritingRevisionContextDataV1 extends Record<string, unknown> {
  revision: WritingRevisionInputV1
}

export interface WritingRevisionCoachV2 {
  schemaVersion: typeof WRITING_REVISION_OUTPUT_SCHEMA_VERSION
  kind: 'writing_revision_coach'
  summary: string
  improved: Array<{
    focusIndex: 1 | 2 | 3
    finding: string
    evidence: string
  }>
  remaining: Array<{
    focusIndex: 1 | 2 | 3
    finding: string
    evidence: string
    nextStep: string
  }>
  newIssues: Array<{
    finding: string
    evidence: string
    nextStep: string
  }>
  nextAction: string
  limitations: string[]
}

export interface BuildWritingRevisionSnapshotOptions {
  now?: Date
  createId?: () => string
}

export class WritingRevisionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WritingRevisionValidationError'
  }
}

function fail(message: string): never {
  throw new WritingRevisionValidationError(message)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys)
  if (Object.keys(value).some(key => !expected.has(key)) || keys.some(key => !(key in value))) {
    fail(`${label} fields are invalid`)
  }
}

function boundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') fail(`${label} must be text`)
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized || normalized.length > maxLength) fail(`${label} is outside its text limit`)
  return normalized
}

function boundedStrings(value: unknown, label: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(`${label} must be a bounded array`)
  return value.map((item, index) => boundedString(item, `${label}[${index}]`, maxLength))
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

function focusSource(value: unknown, label: string): WritingRevisionFocusSource {
  if (value !== 'priority' && value !== 'correction' && value !== 'rewrite_plan') {
    fail(`${label} is invalid`)
  }
  return value
}

function focusIndex(value: unknown, maximum: number, label: string): 1 | 2 | 3 {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum || Number(value) > 3) {
    fail(`${label} is invalid`)
  }
  return Number(value) as 1 | 2 | 3
}

export function createWritingRevisionFocusOptions(feedback: WritingFeedbackV2): WritingRevisionFocusOption[] {
  const options: WritingRevisionFocusOption[] = []
  const add = (option: WritingRevisionFocusOption) => {
    if (options.length >= 5) return
    const normalizedTitle = option.title.trim()
    if (!normalizedTitle || options.some(existing => existing.title === normalizedTitle)) return
    options.push({ ...option, title: normalizedTitle, guidance: option.guidance.trim() })
  }

  for (const item of [...(feedback.deepAnalysis?.rewritePlan ?? [])].sort((left, right) => left.priority - right.priority)) {
    add({
      key: `rewrite-${item.priority}`,
      title: item.action.slice(0, 120),
      guidance: `完成标准：${item.successCheck}`.slice(0, 360),
      source: 'rewrite_plan',
    })
  }
  for (const [index, item] of feedback.priorities.entries()) {
    add({
      key: `priority-${index + 1}`,
      title: item.title.slice(0, 120),
      guidance: `${item.reason}${item.example ? ` 示例：${item.example}` : ''}`.slice(0, 360),
      source: 'priority',
    })
  }
  for (const [index, item] of feedback.corrections.entries()) {
    add({
      key: `correction-${index + 1}`,
      title: `修正表达：${item.original}`.slice(0, 120),
      guidance: `建议改为：${item.revision}。${item.reason}`.slice(0, 360),
      source: 'correction',
    })
  }
  return options
}

export function createWritingRevisionFocuses(
  options: readonly WritingRevisionFocusOption[],
  selectedKeys: readonly string[],
): WritingRevisionFocus[] {
  const selected = options.filter(option => selectedKeys.includes(option.key)).slice(0, 3)
  if (selected.length < 1) fail('at least one revision focus is required')
  return selected.map((option, index) => ({
    index: (index + 1) as 1 | 2 | 3,
    title: boundedString(option.title, `focus[${index}].title`, 120),
    guidance: boundedString(option.guidance, `focus[${index}].guidance`, 360),
    source: focusSource(option.source, `focus[${index}].source`),
  }))
}

export function parseWritingRevisionInputV1(value: unknown): WritingRevisionInputV1 {
  const input = record(value, 'writing revision')
  exactKeys(input, ['schemaVersion', 'submission', 'revisedEssay', 'revisedWordCount', 'focuses'], 'writing revision')
  if (input.schemaVersion !== WRITING_REVISION_INPUT_SCHEMA_VERSION) fail('writing revision schemaVersion is invalid')
  const submission = parseWritingSubmission(input.submission)
  if (isDeepWritingSubmission(submission) && submission.promptSource.kind === 'image') {
    fail('writing revision cannot retain a prompt image')
  }
  const revisedEssay = boundedString(input.revisedEssay, 'writing revision.revisedEssay', 12_000)
  if (revisedEssay === submission.essayText.trim()) fail('revised essay must contain a change')
  const revisedWordCount = countWritingWords(revisedEssay)
  if (input.revisedWordCount !== revisedWordCount) fail('writing revision word count is invalid')
  if (!Array.isArray(input.focuses) || input.focuses.length < 1 || input.focuses.length > 3) {
    fail('writing revision must contain between one and three focuses')
  }
  const rawFocuses = input.focuses
  const focuses = rawFocuses.map((candidate, index) => {
    const focus = record(candidate, `writing revision.focuses[${index}]`)
    exactKeys(focus, ['index', 'title', 'guidance', 'source'], `writing revision.focuses[${index}]`)
    const expectedIndex = index + 1
    if (focus.index !== expectedIndex) fail('writing revision focus order is invalid')
    return {
      index: focusIndex(focus.index, rawFocuses.length, `writing revision.focuses[${index}].index`),
      title: boundedString(focus.title, `writing revision.focuses[${index}].title`, 120),
      guidance: boundedString(focus.guidance, `writing revision.focuses[${index}].guidance`, 360),
      source: focusSource(focus.source, `writing revision.focuses[${index}].source`),
    }
  })
  return {
    schemaVersion: WRITING_REVISION_INPUT_SCHEMA_VERSION,
    submission,
    revisedEssay,
    revisedWordCount,
    focuses,
  }
}

export function buildWritingRevisionSnapshot(
  inputValue: unknown,
  options: BuildWritingRevisionSnapshotOptions = {},
): AiContextSnapshotV1<WritingRevisionContextDataV1> {
  const revision = parseWritingRevisionInputV1(inputValue)
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) fail('writing revision timestamp is invalid')
  const createdAt = now.toISOString()
  const data: WritingRevisionContextDataV1 = { revision }
  const minimumWords = revision.submission.task === 'task1' ? 150 : 250
  return {
    schemaVersion: 1,
    snapshotId: options.createId?.() ?? crypto.randomUUID(),
    purpose: 'writing_revision_coach',
    createdAt,
    dataAsOf: createdAt,
    freshness: { status: 'fresh', ageSeconds: 0, maxAgeSeconds: 300 },
    sourceRevision: `writing-revision-src-${stableHash(data)}`,
    contextHash: `writing-revision-ctx-${stableHash({ purpose: 'writing_revision_coach', data })}`,
    scopes: ['writing.submission'],
    privateScopes: ['writing.submission'],
    quality: {
      status: revision.revisedWordCount < minimumWords ? 'limited' : 'sufficient',
      recordCount: 1,
      warnings: revision.revisedWordCount < minimumWords
        ? [`改写稿少于 ${minimumWords} 词，复查只判断选中目标，不重新估分。`]
        : ['改写复查只核对选中目标，不重新生成整份评分报告。'],
    },
    data,
  }
}

function exactEssayEvidence(value: unknown, essay: string, label: string): string {
  const evidence = boundedString(value, label, 240)
  if (!essay.includes(evidence)) fail(`${label} must quote the revised essay exactly`)
  return evidence
}

export function parseWritingRevisionCoachV2(
  value: unknown,
  revisionValue?: unknown,
): WritingRevisionCoachV2 {
  const revision = parseWritingRevisionInputV1(revisionValue)
  const output = record(value, 'writing revision coach')
  exactKeys(output, [
    'schemaVersion',
    'kind',
    'summary',
    'improved',
    'remaining',
    'newIssues',
    'nextAction',
    'limitations',
  ], 'writing revision coach')
  if (output.schemaVersion !== WRITING_REVISION_OUTPUT_SCHEMA_VERSION || output.kind !== 'writing_revision_coach') {
    fail('writing revision coach version or kind is invalid')
  }
  if (!Array.isArray(output.improved) || output.improved.length > revision.focuses.length) {
    fail('writing revision coach.improved is invalid')
  }
  if (!Array.isArray(output.remaining) || output.remaining.length > revision.focuses.length) {
    fail('writing revision coach.remaining is invalid')
  }
  const improved = output.improved.map((candidate, index) => {
    const item = record(candidate, `writing revision coach.improved[${index}]`)
    exactKeys(item, ['focusIndex', 'finding', 'evidence'], `writing revision coach.improved[${index}]`)
    return {
      focusIndex: focusIndex(item.focusIndex, revision.focuses.length, `writing revision coach.improved[${index}].focusIndex`),
      finding: boundedString(item.finding, `writing revision coach.improved[${index}].finding`, 280),
      evidence: exactEssayEvidence(item.evidence, revision.revisedEssay, `writing revision coach.improved[${index}].evidence`),
    }
  })
  const remaining = output.remaining.map((candidate, index) => {
    const item = record(candidate, `writing revision coach.remaining[${index}]`)
    exactKeys(item, ['focusIndex', 'finding', 'evidence', 'nextStep'], `writing revision coach.remaining[${index}]`)
    return {
      focusIndex: focusIndex(item.focusIndex, revision.focuses.length, `writing revision coach.remaining[${index}].focusIndex`),
      finding: boundedString(item.finding, `writing revision coach.remaining[${index}].finding`, 280),
      evidence: exactEssayEvidence(item.evidence, revision.revisedEssay, `writing revision coach.remaining[${index}].evidence`),
      nextStep: boundedString(item.nextStep, `writing revision coach.remaining[${index}].nextStep`, 280),
    }
  })
  const classified = [...improved, ...remaining].map(item => item.focusIndex)
  if (
    classified.length !== revision.focuses.length
    || new Set(classified).size !== classified.length
    || revision.focuses.some(focus => !classified.includes(focus.index))
  ) fail('each selected revision focus must be classified exactly once')

  if (!Array.isArray(output.newIssues) || output.newIssues.length > 1) {
    fail('writing revision coach.newIssues is invalid')
  }
  const newIssues = output.newIssues.map((candidate, index) => {
    const item = record(candidate, `writing revision coach.newIssues[${index}]`)
    exactKeys(item, ['finding', 'evidence', 'nextStep'], `writing revision coach.newIssues[${index}]`)
    return {
      finding: boundedString(item.finding, `writing revision coach.newIssues[${index}].finding`, 280),
      evidence: exactEssayEvidence(item.evidence, revision.revisedEssay, `writing revision coach.newIssues[${index}].evidence`),
      nextStep: boundedString(item.nextStep, `writing revision coach.newIssues[${index}].nextStep`, 280),
    }
  })
  return {
    schemaVersion: WRITING_REVISION_OUTPUT_SCHEMA_VERSION,
    kind: 'writing_revision_coach',
    summary: boundedString(output.summary, 'writing revision coach.summary', 360),
    improved,
    remaining,
    newIssues,
    nextAction: boundedString(output.nextAction, 'writing revision coach.nextAction', 280),
    limitations: boundedStrings(output.limitations, 'writing revision coach.limitations', 2, 240),
  }
}
