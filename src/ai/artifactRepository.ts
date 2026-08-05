import type { AuthStatus } from '@/auth/authContext'
import type { ManagedAiDataBindingState } from '@/auth/managedAiDataBinding'
import type { AiSuggestion } from '@/stores/aiSuggestionStore'
import type { AnalysisReport } from '@/stores/reportStore'
import {
  formatDailySuggestionAsMarkdown,
  formatLearningAnalysisAsMarkdown,
  isDailySuggestionV2,
  isLearningAnalysisV2,
  parseDailySuggestionV2,
  parseLearningAnalysisV2,
  type DailySuggestionV2,
  type LearningAnalysisV2,
} from './structuredOutputs'
import {
  calculateWritingOverallBand,
  formatWritingSourceReference,
  formatWritingFeedbackAsMarkdown,
  parseWritingFeedbackV2,
  parseWritingSubmission,
  type WritingBand,
  type WritingFeedbackV2,
  type WritingSubmission,
} from './writingFeedback'

export const AI_ARTIFACT_REPOSITORY_SCHEMA_VERSION = 2 as const
export const AI_ARTIFACT_EXPORT_FORMAT = 'lexi-tracker-ai-artifacts' as const
export const AI_ARTIFACT_EXPORT_VERSION = 2 as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ARTIFACT_BYTES = 64 * 1024
const MAX_MARKDOWN_LENGTH = 24_000

export type AiArtifactKindV2 = 'daily_suggestion' | 'learning_analysis' | 'writing_feedback'
export type AiArtifactSourceV2 = 'managed' | 'custom' | 'legacy_import'
export type AiArtifactQualityV2 = 'empty' | 'limited' | 'sufficient'

export type AiArtifactOwnerV2 =
  | { scope: 'local' }
  | { scope: 'account'; accountUserId: string }

export type AiArtifactAccessV2 =
  | { status: 'ready'; mode: 'device' }
  | { status: 'ready'; mode: 'account'; accountUserId: string }
  | { status: 'locked'; reason: 'account-mismatch' | 'binding-invalid' | 'binding-unavailable' }

export interface AiArtifactProvenanceV2 {
  providerArtifactId?: string
  runId?: string
  snapshotId?: string
  contextHash?: string
  rangeDays?: 7 | 30 | 90
  quality?: AiArtifactQualityV2
  promptVersion?: string
  rubricVersion?: string
  legacyRecordId?: string
}

interface AiArtifactBaseV2 {
  repositorySchemaVersion: typeof AI_ARTIFACT_REPOSITORY_SCHEMA_VERSION
  recordId: string
  productId: 'tracker'
  kind: AiArtifactKindV2
  title: string
  markdownProjection: string
  createdAt: string
  savedAt: string
  dataAsOf: string
  source: AiArtifactSourceV2
  provenance: AiArtifactProvenanceV2
  warnings: string[]
  owner: AiArtifactOwnerV2
  retention: { policy: 'manual' }
}

export interface DailySuggestionArtifactV2 extends AiArtifactBaseV2 {
  kind: 'daily_suggestion'
  outputSchemaVersion: 2
  content: DailySuggestionV2
}

export interface LearningAnalysisArtifactV2 extends AiArtifactBaseV2 {
  kind: 'learning_analysis'
  outputSchemaVersion: 2
  content: LearningAnalysisV2
}

export interface WritingFeedbackArtifactContentV2 {
  /** V2 reports retain copied prompts; V3 reports retain only the learner's reference. */
  submission: WritingSubmission
  feedback: WritingFeedbackV2
  overallBand: WritingBand | null
}

export interface WritingFeedbackArtifactV2 extends AiArtifactBaseV2 {
  kind: 'writing_feedback'
  outputSchemaVersion: 2
  content: WritingFeedbackArtifactContentV2
}

export interface LegacyTextArtifactV2 extends AiArtifactBaseV2 {
  outputSchemaVersion: 'legacy_text'
  content: { markdown: string }
  source: 'legacy_import'
}

export type AiArtifactRecordV2 =
  | DailySuggestionArtifactV2
  | LearningAnalysisArtifactV2
  | WritingFeedbackArtifactV2
  | LegacyTextArtifactV2

interface SaveArtifactInputBase {
  recordId?: string
  providerArtifactId?: string
  runId?: string
  snapshotId?: string
  contextHash?: string
  rangeDays?: 7 | 30 | 90
  quality?: AiArtifactQualityV2
  promptVersion?: string
  rubricVersion?: string
  createdAt?: string
  savedAt?: string
  dataAsOf: string
  source: 'managed' | 'custom'
  warnings?: string[]
}

export interface SaveDailySuggestionArtifactInputV2 extends SaveArtifactInputBase {
  content: DailySuggestionV2
}

export interface SaveLearningAnalysisArtifactInputV2 extends SaveArtifactInputBase {
  content: LearningAnalysisV2
}

export interface SaveWritingFeedbackArtifactInputV2 extends SaveArtifactInputBase {
  submission: WritingSubmission
  feedback: WritingFeedbackV2
}

export interface PortableAiArtifactArchiveV2 {
  format: typeof AI_ARTIFACT_EXPORT_FORMAT
  version: typeof AI_ARTIFACT_EXPORT_VERSION
  exportedAt: string
  artifacts: AiArtifactRecordV2[]
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function nonEmpty(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function exactKeys(object: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(object, key))
    && Object.keys(object).every((key) => allowed.has(key))
}

function safeNow(value?: string): string {
  if (value && isIsoDateTime(value)) return value
  return new Date().toISOString()
}

function normalizeWarnings(warnings: readonly string[] | undefined): string[] {
  return (warnings ?? [])
    .filter((warning) => typeof warning === 'string' && warning.trim().length > 0)
    .slice(0, 10)
    .map((warning) => warning.slice(0, 500))
}

export function resolveAiArtifactAccess(
  authStatus: AuthStatus,
  accountUserId: string | null | undefined,
  binding: ManagedAiDataBindingState,
): AiArtifactAccessV2 {
  if (authStatus === 'signed-out' || authStatus === 'unconfigured' || authStatus === 'misconfigured') {
    return { status: 'ready', mode: 'device' }
  }
  if (authStatus !== 'signed-in' || !accountUserId) {
    return { status: 'locked', reason: 'binding-unavailable' }
  }
  if (binding.status === 'bound') {
    return UUID_PATTERN.test(accountUserId)
      ? { status: 'ready', mode: 'account', accountUserId }
      : { status: 'locked', reason: 'binding-unavailable' }
  }
  if (binding.status === 'unbound') return { status: 'ready', mode: 'device' }
  if (binding.status === 'mismatch') return { status: 'locked', reason: 'account-mismatch' }
  if (binding.status === 'invalid') return { status: 'locked', reason: 'binding-invalid' }
  return { status: 'locked', reason: 'binding-unavailable' }
}

export function ownerForAiArtifactAccess(access: AiArtifactAccessV2): AiArtifactOwnerV2 {
  if (access.status === 'locked') throw new Error('AI 内容仓库当前已锁定')
  return access.mode === 'account'
    ? { scope: 'account', accountUserId: access.accountUserId }
    : { scope: 'local' }
}

export function canAccessAiArtifact(artifact: AiArtifactRecordV2, access: AiArtifactAccessV2): boolean {
  if (access.status === 'locked') return false
  if (access.mode === 'device') return artifact.owner.scope === 'local'
  return artifact.owner.scope === 'local'
    || artifact.owner.accountUserId === access.accountUserId
}

export function listAiArtifactsForAccess(
  artifacts: readonly AiArtifactRecordV2[],
  access: AiArtifactAccessV2,
  kind?: AiArtifactKindV2,
): AiArtifactRecordV2[] {
  return artifacts
    .filter((artifact) => canAccessAiArtifact(artifact, access) && (!kind || artifact.kind === kind))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.savedAt.localeCompare(left.savedAt))
}

export function latestAiArtifactForAccess(
  artifacts: readonly AiArtifactRecordV2[],
  access: AiArtifactAccessV2,
  kind: AiArtifactKindV2,
): AiArtifactRecordV2 | null {
  return listAiArtifactsForAccess(artifacts, access, kind)[0] ?? null
}

function buildBase(
  kind: AiArtifactKindV2,
  title: string,
  markdownProjection: string,
  input: SaveArtifactInputBase,
  owner: AiArtifactOwnerV2,
): AiArtifactBaseV2 {
  const createdAt = safeNow(input.createdAt)
  const recordId = input.recordId?.trim() || input.providerArtifactId?.trim() || crypto.randomUUID()
  return {
    repositorySchemaVersion: AI_ARTIFACT_REPOSITORY_SCHEMA_VERSION,
    recordId,
    productId: 'tracker',
    kind,
    title,
    markdownProjection,
    createdAt,
    savedAt: safeNow(input.savedAt),
    dataAsOf: isIsoDateTime(input.dataAsOf) ? input.dataAsOf : createdAt,
    source: input.source,
    provenance: {
      ...(input.providerArtifactId ? { providerArtifactId: input.providerArtifactId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
      ...(input.contextHash ? { contextHash: input.contextHash } : {}),
      ...(input.rangeDays ? { rangeDays: input.rangeDays } : {}),
      ...(input.quality ? { quality: input.quality } : {}),
      ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
      ...(input.rubricVersion ? { rubricVersion: input.rubricVersion } : {}),
    },
    warnings: normalizeWarnings(input.warnings),
    owner,
    retention: { policy: 'manual' },
  }
}

export function createDailySuggestionArtifactV2(
  input: SaveDailySuggestionArtifactInputV2,
  access: AiArtifactAccessV2,
): DailySuggestionArtifactV2 {
  const content = parseDailySuggestionV2(input.content)
  return parseAiArtifactRecordV2({
    ...buildBase('daily_suggestion', content.headline, formatDailySuggestionAsMarkdown(content), input, ownerForAiArtifactAccess(access)),
    outputSchemaVersion: 2,
    content,
  }) as DailySuggestionArtifactV2
}

export function createLearningAnalysisArtifactV2(
  input: SaveLearningAnalysisArtifactInputV2,
  access: AiArtifactAccessV2,
): LearningAnalysisArtifactV2 {
  const content = parseLearningAnalysisV2(input.content)
  return parseAiArtifactRecordV2({
    ...buildBase('learning_analysis', content.title, formatLearningAnalysisAsMarkdown(content), input, ownerForAiArtifactAccess(access)),
    outputSchemaVersion: 2,
    content,
  }) as LearningAnalysisArtifactV2
}

export function createWritingFeedbackArtifactV2(
  input: SaveWritingFeedbackArtifactInputV2,
  access: AiArtifactAccessV2,
): WritingFeedbackArtifactV2 {
  const submission = parseWritingSubmission(input.submission)
  const feedback = parseWritingFeedbackV2(input.feedback, submission)
  const overallBand = calculateWritingOverallBand(feedback)
  const taskLabel = submission.task === 'task1' ? 'Task 1' : 'Task 2'
  const moduleLabel = submission.module === 'academic' ? 'Academic' : 'General Training'
  const scoreLabel = feedback.estimatedOverallBand !== null
    ? `AI 预估 ${feedback.estimatedOverallBand}`
    : overallBand === null
      ? '语言反馈'
      : `Band ${overallBand}`
  const content: WritingFeedbackArtifactContentV2 = { submission, feedback, overallBand }
  return parseAiArtifactRecordV2({
    ...buildBase(
      'writing_feedback',
      `${moduleLabel} ${taskLabel} · ${scoreLabel}`,
      formatWritingFeedbackAsMarkdown(submission, feedback, overallBand),
      {
        ...input,
        promptVersion: input.promptVersion ?? 'writing-feedback-v2',
        // The rubric is part of the validated output contract, not caller-owned
        // metadata. Never let a save call relabel the rubric used for a report.
        rubricVersion: feedback.rubricVersion,
      },
      ownerForAiArtifactAccess(access),
    ),
    outputSchemaVersion: 2,
    content,
  }) as WritingFeedbackArtifactV2
}

export function upsertAiArtifact(
  artifacts: readonly AiArtifactRecordV2[],
  artifact: AiArtifactRecordV2,
): AiArtifactRecordV2[] {
  const duplicateIndex = artifacts.findIndex((current) =>
    current.recordId === artifact.recordId
    || (
      artifact.provenance.providerArtifactId !== undefined
      && current.provenance.providerArtifactId === artifact.provenance.providerArtifactId
    ),
  )
  if (duplicateIndex < 0) return [artifact, ...artifacts]
  const current = artifacts[duplicateIndex]
  const { savedAt: _currentSavedAt, ...currentIdentity } = current
  const { savedAt: _artifactSavedAt, ...artifactIdentity } = artifact
  if (JSON.stringify(currentIdentity) !== JSON.stringify(artifactIdentity)) {
    throw new Error('AI artifact identifier collision')
  }
  return [...artifacts]
}

function legacyArtifact(
  kind: AiArtifactKindV2,
  markdown: string,
  createdAt: string,
  legacyRecordId?: string,
): LegacyTextArtifactV2 {
  const safeCreatedAt = safeNow(createdAt)
  const recordId = `legacy-${kind}-${stableHash(`${legacyRecordId ?? ''}|${safeCreatedAt}|${markdown}`)}`
  return parseAiArtifactRecordV2({
    repositorySchemaVersion: 2,
    recordId,
    productId: 'tracker',
    kind,
    outputSchemaVersion: 'legacy_text',
    title: kind === 'daily_suggestion' ? '历史学习建议' : '历史学习分析',
    content: { markdown },
    markdownProjection: markdown,
    createdAt: safeCreatedAt,
    savedAt: safeCreatedAt,
    dataAsOf: safeCreatedAt,
    source: 'legacy_import',
    provenance: legacyRecordId ? { legacyRecordId } : {},
    warnings: [],
    owner: { scope: 'local' },
    retention: { policy: 'manual' },
  }) as LegacyTextArtifactV2
}

export function convertLegacyAiArtifacts(
  suggestion: AiSuggestion | null | undefined,
  reports: readonly AnalysisReport[] | null | undefined,
): AiArtifactRecordV2[] {
  let artifacts: AiArtifactRecordV2[] = []
  if (suggestion) {
    const metadata = suggestion.metadata
    const artifact = suggestion.structuredContent && isDailySuggestionV2(suggestion.structuredContent)
      ? createDailySuggestionArtifactV2({
          content: suggestion.structuredContent,
          recordId: `legacy-daily-${stableHash(`${suggestion.createdAt}|${suggestion.content}`)}`,
          createdAt: suggestion.createdAt,
          savedAt: suggestion.createdAt,
          dataAsOf: metadata?.dataAsOf ?? suggestion.createdAt,
          source: metadata?.source ?? 'custom',
          runId: metadata?.runId,
          rangeDays: metadata?.rangeDays === 7 || metadata?.rangeDays === 30 || metadata?.rangeDays === 90
            ? metadata.rangeDays
            : undefined,
          warnings: metadata?.warnings,
        }, { status: 'ready', mode: 'device' })
      : legacyArtifact('daily_suggestion', suggestion.content, suggestion.createdAt)
    artifacts = upsertAiArtifact(artifacts, artifact)
  }

  for (const report of reports ?? []) {
    if (report.type !== undefined && report.type !== 'learning_analysis') continue
    const structured = report.metadata?.structuredContent
    const context = report.metadata?.aiContext as Record<string, unknown> | undefined
    const artifact = isLearningAnalysisV2(structured)
      ? createLearningAnalysisArtifactV2({
          content: structured,
          recordId: `legacy-report-${report.id}`,
          createdAt: report.createdAt,
          savedAt: report.createdAt,
          dataAsOf: typeof context?.dataAsOf === 'string' ? context.dataAsOf : report.createdAt,
          source: context?.source === 'managed' ? 'managed' : 'custom',
          runId: typeof context?.runId === 'string' ? context.runId : undefined,
          snapshotId: typeof context?.snapshotId === 'string' ? context.snapshotId : undefined,
          contextHash: typeof context?.contextHash === 'string' ? context.contextHash : undefined,
          rangeDays: context?.rangeDays === 7 || context?.rangeDays === 30 || context?.rangeDays === 90
            ? context.rangeDays
            : undefined,
          quality: context?.quality === 'empty' || context?.quality === 'limited' || context?.quality === 'sufficient'
            ? context.quality
            : undefined,
          warnings: Array.isArray(context?.warnings)
            ? context.warnings.filter((warning): warning is string => typeof warning === 'string')
            : [],
        }, { status: 'ready', mode: 'device' })
      : legacyArtifact('learning_analysis', report.content, report.createdAt, report.id)
    artifacts = upsertAiArtifact(artifacts, artifact)
  }
  return artifacts
}

export function parseAiArtifactRecordV2(value: unknown): AiArtifactRecordV2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('AI artifact must be an object')
  const object = value as Record<string, unknown>
  if (!exactKeys(object, [
    'repositorySchemaVersion', 'recordId', 'productId', 'kind', 'outputSchemaVersion',
    'title', 'content', 'markdownProjection', 'createdAt', 'savedAt', 'dataAsOf',
    'source', 'provenance', 'warnings', 'owner', 'retention',
  ])) throw new Error('AI artifact contains unexpected fields')
  if (object.repositorySchemaVersion !== 2 || object.productId !== 'tracker') throw new Error('Unsupported AI artifact version')
  if (
    object.kind !== 'daily_suggestion'
    && object.kind !== 'learning_analysis'
    && object.kind !== 'writing_feedback'
  ) throw new Error('Unsupported AI artifact kind')
  if (!nonEmpty(object.recordId, 240) || !nonEmpty(object.title, 240)) throw new Error('Invalid AI artifact identity')
  if (typeof object.markdownProjection !== 'string' || object.markdownProjection.length > MAX_MARKDOWN_LENGTH) throw new Error('Invalid AI artifact markdown')
  if (!isIsoDateTime(object.createdAt) || !isIsoDateTime(object.savedAt) || !isIsoDateTime(object.dataAsOf)) throw new Error('Invalid AI artifact timestamp')
  if (object.source !== 'managed' && object.source !== 'custom' && object.source !== 'legacy_import') throw new Error('Invalid AI artifact source')

  const provenance = object.provenance
  if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) throw new Error('Invalid AI artifact provenance')
  const provenanceObject = provenance as Record<string, unknown>
  if (!exactKeys(provenanceObject, [], ['providerArtifactId', 'runId', 'snapshotId', 'contextHash', 'rangeDays', 'quality', 'promptVersion', 'rubricVersion', 'legacyRecordId'])) throw new Error('Invalid AI artifact provenance fields')
  for (const key of ['providerArtifactId', 'runId', 'snapshotId', 'contextHash', 'promptVersion', 'rubricVersion', 'legacyRecordId']) {
    if (provenanceObject[key] !== undefined && !nonEmpty(provenanceObject[key], 240)) throw new Error('Invalid AI artifact provenance value')
  }
  if (provenanceObject.rangeDays !== undefined && provenanceObject.rangeDays !== 7 && provenanceObject.rangeDays !== 30 && provenanceObject.rangeDays !== 90) throw new Error('Invalid AI artifact range')
  if (provenanceObject.quality !== undefined && provenanceObject.quality !== 'empty' && provenanceObject.quality !== 'limited' && provenanceObject.quality !== 'sufficient') throw new Error('Invalid AI artifact quality')

  if (!Array.isArray(object.warnings) || object.warnings.length > 10 || object.warnings.some((warning) => typeof warning !== 'string' || warning.length > 500)) throw new Error('Invalid AI artifact warnings')
  const owner = object.owner
  if (typeof owner !== 'object' || owner === null || Array.isArray(owner)) throw new Error('Invalid AI artifact owner')
  const ownerObject = owner as Record<string, unknown>
  if (ownerObject.scope === 'local') {
    if (!exactKeys(ownerObject, ['scope'])) throw new Error('Invalid local artifact owner')
  } else if (ownerObject.scope === 'account') {
    if (!exactKeys(ownerObject, ['scope', 'accountUserId']) || !UUID_PATTERN.test(String(ownerObject.accountUserId))) throw new Error('Invalid account artifact owner')
  } else throw new Error('Invalid AI artifact owner scope')
  const retention = object.retention
  if (typeof retention !== 'object' || retention === null || Array.isArray(retention) || !exactKeys(retention as Record<string, unknown>, ['policy']) || (retention as Record<string, unknown>).policy !== 'manual') throw new Error('Invalid AI artifact retention')

  let normalizedWritingContent: WritingFeedbackArtifactContentV2 | undefined
  if (object.outputSchemaVersion === 2) {
    if (object.source === 'legacy_import') throw new Error('Structured artifact cannot use legacy source')
    if (object.kind === 'daily_suggestion') parseDailySuggestionV2(object.content)
    else if (object.kind === 'learning_analysis') parseLearningAnalysisV2(object.content)
    else {
      if (typeof object.content !== 'object' || object.content === null || Array.isArray(object.content)) {
        throw new Error('Invalid writing feedback artifact content')
      }
      const content = object.content as Record<string, unknown>
      if (!exactKeys(content, ['submission', 'feedback', 'overallBand'])) {
        throw new Error('Invalid writing feedback artifact fields')
      }
      const submission = parseWritingSubmission(content.submission)
      const feedback = parseWritingFeedbackV2(content.feedback, submission)
      const overallBand = calculateWritingOverallBand(feedback)
      if (content.overallBand !== overallBand) throw new Error('Invalid writing feedback overall band')
      if (
        provenanceObject.rubricVersion !== feedback.rubricVersion
        || !nonEmpty(provenanceObject.promptVersion, 240)
      ) {
        throw new Error('Invalid writing feedback provenance')
      }
      const markdownProjection = formatWritingFeedbackAsMarkdown(submission, feedback, overallBand)
      if (object.markdownProjection !== markdownProjection) {
        throw new Error('Invalid writing feedback markdown projection')
      }
      normalizedWritingContent = { submission, feedback, overallBand }
    }
  } else if (object.outputSchemaVersion === 'legacy_text') {
    if (object.source !== 'legacy_import') throw new Error('Legacy artifact must use legacy source')
    if (typeof object.content !== 'object' || object.content === null || Array.isArray(object.content)) throw new Error('Invalid legacy artifact content')
    const content = object.content as Record<string, unknown>
    if (!exactKeys(content, ['markdown']) || typeof content.markdown !== 'string' || content.markdown !== object.markdownProjection) throw new Error('Invalid legacy artifact markdown')
  } else throw new Error('Unsupported AI artifact output version')
  if (new TextEncoder().encode(JSON.stringify(object)).byteLength > MAX_ARTIFACT_BYTES) throw new Error('AI artifact is too large')
  if (normalizedWritingContent) {
    return {
      ...object,
      content: normalizedWritingContent,
    } as unknown as WritingFeedbackArtifactV2
  }
  return object as unknown as AiArtifactRecordV2
}

export function makePortableAiArtifacts(artifacts: readonly AiArtifactRecordV2[]): AiArtifactRecordV2[] {
  return artifacts.map((artifact) => parseAiArtifactRecordV2({
    ...artifact,
    owner: { scope: 'local' },
  }))
}

export function serializePortableAiArtifacts(
  artifacts: readonly AiArtifactRecordV2[],
  exportedAt = new Date().toISOString(),
): string {
  const archive: PortableAiArtifactArchiveV2 = {
    format: AI_ARTIFACT_EXPORT_FORMAT,
    version: AI_ARTIFACT_EXPORT_VERSION,
    exportedAt: safeNow(exportedAt),
    artifacts: makePortableAiArtifacts(artifacts),
  }
  return JSON.stringify(archive, null, 2)
}

export function aiArtifactToMarkdown(artifact: AiArtifactRecordV2): string {
  const parsed = parseAiArtifactRecordV2(artifact)
  const sourceLabel = parsed.source === 'managed' ? 'Lexi AI' : parsed.source === 'custom' ? '历史外部来源' : '旧版导入'
  const lines = [
    `# ${parsed.title}`,
    '',
    `- 类型：${parsed.kind === 'daily_suggestion' ? '每日建议' : parsed.kind === 'learning_analysis' ? '学习分析' : '写作批改'}`,
    `- 生成时间：${parsed.createdAt}`,
    `- 数据截至：${parsed.dataAsOf}`,
    `- 来源：${sourceLabel}`,
  ]
  if (parsed.kind === 'writing_feedback' && parsed.outputSchemaVersion === 2) {
    const { submission } = parsed.content
    const fenced = (text: string) => {
      const longestRun = Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length))
      const fence = '`'.repeat(Math.max(3, longestRun + 1))
      return `${fence}text\n${text || '未提供'}\n${fence}`
    }
    if (submission.schemaVersion === 3) {
      lines.push(
        '',
        '## 题目引用',
        '',
        fenced(formatWritingSourceReference(submission) ?? '剑雅题目引用'),
        '',
        '题目自动识别 · 参考评估（可能与原题不完全一致）',
      )
      if (submission.module === 'academic' && submission.task === 'task1') {
        lines.push('', '未提供原图，Task Achievement 仅作参考。')
      }
    } else {
      lines.push('', '## 原始题目', '', fenced(submission.promptText))
      if (submission.sourceMaterial.kind === 'text_description') {
        lines.push('', '## Task 1 材料描述', '', fenced(submission.sourceMaterial.description))
      }
    }
    lines.push('', '## 作文原文', '', fenced(submission.essayText), '', '## AI 反馈')
  }
  lines.push('', parsed.markdownProjection)
  return lines.join('\n')
}
