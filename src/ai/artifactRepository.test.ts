import { describe, expect, it } from 'vitest'
import type { ManagedAiDataBindingState } from '@/auth/managedAiDataBinding'
import {
  aiArtifactToMarkdown,
  convertLegacyAiArtifacts,
  createDailySuggestionArtifactV2,
  createLearningAnalysisArtifactV2,
  createWritingFeedbackArtifactV2,
  latestAiArtifactForAccess,
  listAiArtifactsForAccess,
  makePortableAiArtifacts,
  parseAiArtifactRecordV2,
  resolveAiArtifactAccess,
  serializePortableAiArtifacts,
  upsertAiArtifact,
  type WritingFeedbackArtifactV2,
} from './artifactRepository'
import type { DailySuggestionV2, LearningAnalysisV2 } from './structuredOutputs'
import {
  WRITING_RUBRIC_VERSION,
  createWritingSubmissionV2,
  createWritingSubmissionV3,
  createWritingSubmissionV4,
  type WritingFeedbackV2,
} from './writingFeedback'

const ACCOUNT_A = '123e4567-e89b-42d3-a456-426614174001'
const ACCOUNT_B = '123e4567-e89b-42d3-a456-426614174002'
const CREATED_AT = '2026-08-02T00:00:00.000Z'

const daily: DailySuggestionV2 = {
  schemaVersion: 2,
  kind: 'daily_suggestion',
  headline: '完成一次短练习',
  summary: '先建立一条可比较的学习记录。',
  focus: { title: '听力基线', reason: '当前数据较少。', estimatedMinutes: 20 },
  actions: [{ title: '完成听力', detail: '记录本次结果。', category: 'listening', estimatedMinutes: 20 }],
  evidence: ['当前尚无足够记录。'],
  limitations: ['不能判断稳定趋势。'],
}

const analysis: LearningAnalysisV2 = {
  schemaVersion: 2,
  kind: 'learning_analysis',
  title: '阶段学习分析',
  conclusion: '当前样本有限，应先稳定记录。',
  insights: [{ type: 'pattern', title: '记录较少', finding: '样本不足。', evidence: '近 30 天记录数较少。' }],
  actions: [{ title: '补充练习记录', reason: '建立可比较基线。', priority: 'high', estimatedMinutes: 20 }],
  limitations: ['结论只适用于当前数据。'],
}

const writingSubmission = createWritingSubmissionV2({
  module: 'academic',
  task: 'task2',
  promptText: 'Public transport should be affordable. To what extent do you agree?',
  sourceMaterial: { kind: 'none' },
  essayText: 'I support affordable public transport because it reduces traffic and helps working families.',
})

function writingFeedback(summary = '立场清晰，但论证需要展开。'): WritingFeedbackV2 {
  return {
    schemaVersion: 2,
    kind: 'writing_feedback',
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus: 'scored',
    estimatedOverallBand: 6.5,
    taskCriterion: 'task_response',
    summary,
    criteria: {
      task: { band: 6.5, summary: '回应题目。', evidence: ['I support affordable public transport'], improvement: '展开理由。' },
      coherenceCohesion: { band: 6, summary: '因果清楚。', evidence: ['because it reduces traffic'], improvement: '增加衔接。' },
      lexicalResource: { band: 6.5, summary: '主题词汇恰当。', evidence: ['affordable public transport'], improvement: '提高精确度。' },
      grammaticalRangeAccuracy: { band: 6, summary: '句子基本准确。', evidence: ['helps working families'], improvement: '增加句式变化。' },
    },
    strengths: [{ title: '立场明确', evidence: 'I support affordable public transport' }],
    priorities: [{ title: '展开理由', reason: '解释较短。', example: '说明交通成本如何影响出行选择。' }],
    paragraphFeedback: [],
    corrections: [],
    limitations: [],
  }
}

function bound(): ManagedAiDataBindingState {
  return { status: 'bound', confirmedAt: CREATED_AT }
}

describe('AI artifact repository V2', () => {
  it('isolates account A from account B and hides account-owned content after sign-out', () => {
    const accessA = resolveAiArtifactAccess('signed-in', ACCOUNT_A, bound())
    const artifactA = createDailySuggestionArtifactV2({
      content: daily,
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      source: 'managed',
    }, accessA)

    expect(listAiArtifactsForAccess([artifactA], accessA)).toHaveLength(1)
    expect(listAiArtifactsForAccess([artifactA], resolveAiArtifactAccess('signed-in', ACCOUNT_B, { status: 'mismatch', confirmedAt: CREATED_AT }))).toHaveLength(0)
    const signedOut = resolveAiArtifactAccess('signed-out', null, { status: 'unavailable' })
    expect(listAiArtifactsForAccess([artifactA], signedOut)).toHaveLength(0)

    const localArtifact = createDailySuggestionArtifactV2({
      content: daily,
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      source: 'custom',
    }, signedOut)
    expect(listAiArtifactsForAccess([localArtifact], signedOut)).toHaveLength(1)
  })

  it('fails closed while authentication is still resolving', () => {
    const accessA = resolveAiArtifactAccess('signed-in', ACCOUNT_A, bound())
    const artifactA = createDailySuggestionArtifactV2({
      content: daily,
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      source: 'managed',
    }, accessA)

    const initializing = resolveAiArtifactAccess('initializing', null, { status: 'unavailable' })
    const unavailable = resolveAiArtifactAccess('unavailable', null, { status: 'unavailable' })
    expect(initializing).toEqual({ status: 'locked', reason: 'binding-unavailable' })
    expect(listAiArtifactsForAccess([artifactA], initializing)).toHaveLength(0)
    expect(listAiArtifactsForAccess([artifactA], unavailable)).toHaveLength(0)
  })

  it('keeps complete managed provenance and deduplicates provider artifacts', () => {
    const access = resolveAiArtifactAccess('signed-in', ACCOUNT_A, bound())
    const artifact = createLearningAnalysisArtifactV2({
      content: analysis,
      recordId: 'provider-artifact-1',
      providerArtifactId: 'provider-artifact-1',
      runId: 'run-1',
      snapshotId: 'snapshot-1',
      contextHash: 'context-1',
      rangeDays: 30,
      quality: 'limited',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      source: 'managed',
    }, access)
    expect(artifact.provenance).toMatchObject({
      providerArtifactId: 'provider-artifact-1',
      runId: 'run-1',
      snapshotId: 'snapshot-1',
      contextHash: 'context-1',
    })
    expect(upsertAiArtifact([artifact], artifact)).toHaveLength(1)
    expect(latestAiArtifactForAccess([artifact], access, 'learning_analysis')?.recordId).toBe('provider-artifact-1')
  })

  it('converts legacy text without rewriting it and uses deterministic ids', () => {
    const convertedA = convertLegacyAiArtifacts({ content: '原始 **Markdown**', createdAt: CREATED_AT }, [])
    const convertedB = convertLegacyAiArtifacts({ content: '原始 **Markdown**', createdAt: CREATED_AT }, [])
    expect(convertedA[0]).toMatchObject({
      outputSchemaVersion: 'legacy_text',
      content: { markdown: '原始 **Markdown**' },
      markdownProjection: '原始 **Markdown**',
    })
    expect(convertedB[0].recordId).toBe(convertedA[0].recordId)
  })

  it('removes account ids from portable exports', () => {
    const access = resolveAiArtifactAccess('signed-in', ACCOUNT_A, bound())
    const artifact = createDailySuggestionArtifactV2({ content: daily, dataAsOf: CREATED_AT, createdAt: CREATED_AT, source: 'custom' }, access)
    expect(makePortableAiArtifacts([artifact])[0].owner).toEqual({ scope: 'local' })
    expect(serializePortableAiArtifacts([artifact], CREATED_AT)).not.toContain(ACCOUNT_A)
  })

  it('persists a canonical writing report with derived band, provenance and Markdown', () => {
    const access = resolveAiArtifactAccess('signed-in', ACCOUNT_A, bound())
    const artifact = createWritingFeedbackArtifactV2({
      submission: writingSubmission,
      feedback: writingFeedback(),
      recordId: 'writing-artifact-1',
      providerArtifactId: 'writing-artifact-1',
      runId: 'writing-run-1',
      snapshotId: 'writing-snapshot-1',
      contextHash: 'writing-context-1',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      savedAt: CREATED_AT,
      source: 'managed',
      promptVersion: 'writing-feedback-v2',
      rubricVersion: 'caller-must-not-relabel-rubric',
    }, access)

    expect(artifact).toMatchObject({
      kind: 'writing_feedback',
      outputSchemaVersion: 2,
      content: { overallBand: 6.5, submission: { wordCount: writingSubmission.wordCount } },
      provenance: {
        promptVersion: 'writing-feedback-v2',
        rubricVersion: WRITING_RUBRIC_VERSION,
      },
      owner: { scope: 'account', accountUserId: ACCOUNT_A },
    })
    expect(artifact.title).toContain('AI 预估 6.5')
    expect(artifact.content.feedback.estimatedOverallBand).toBe(6.5)
    expect(artifact.markdownProjection).toContain('AI 预估总分：6.5')
    expect(aiArtifactToMarkdown(artifact)).toContain('类型：写作批改')
    expect(parseAiArtifactRecordV2(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact)
  })

  it('replaces a deep-analysis prompt image with recognized text before any artifact is stored', () => {
    const imageSubmission = createWritingSubmissionV4({
      module: 'academic',
      task: 'task2',
      promptSource: {
        kind: 'image',
        mediaType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,/9j/',
        byteLength: 3,
      },
      essayText: writingSubmission.essayText,
    })
    const feedback: WritingFeedbackV2 = {
      ...writingFeedback(),
      deepAnalysis: {
        promptRecognition: {
          status: 'recognized',
          recognizedPrompt: 'Public transport should be affordable. To what extent do you agree?',
          confidence: 'high',
          note: '题目图片清晰。',
        },
        promptCoverage: [{
          requirement: '说明在多大程度上赞成公共交通应当更可负担',
          status: 'partial',
          finding: '作文表达了赞成立场，但没有说明赞同程度。',
          evidence: 'I support affordable public transport',
          nextStep: '在引言和结论明确说明完全赞同或部分赞同。',
        }],
        argumentMap: [{
          paragraphIndex: 1,
          role: '立场与理由',
          contribution: '给出赞成立场和两项理由。',
          gap: '论证尚未展开。',
        }],
        recurringPatterns: [{
          type: 'logic',
          finding: '理由只有列举。',
          evidence: 'because it reduces traffic',
          fix: '补充原因如何导向具体结果。',
        }],
        rewritePlan: [
          { priority: 1, action: '明确赞同程度。', successCheck: '引言与结论的立场一致。' },
          { priority: 2, action: '展开减少拥堵的因果链。', successCheck: '理由包含解释与结果。' },
        ],
      },
    }
    const artifact = createWritingFeedbackArtifactV2({
      submission: imageSubmission,
      feedback,
      recordId: 'writing-deep-image-1',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      savedAt: CREATED_AT,
      source: 'managed',
      promptVersion: 'writing-feedback-v4-deep',
    }, { status: 'ready', mode: 'device' })

    expect(artifact.content.submission).toMatchObject({
      schemaVersion: 4,
      promptSource: { kind: 'text', origin: 'recognized_image' },
    })
    expect(JSON.stringify(artifact)).not.toContain('data:image')
    expect(parseAiArtifactRecordV2(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact)
  })

  it('rejects tampered writing content, rubric metadata and Markdown projection', () => {
    const artifact = createWritingFeedbackArtifactV2({
      submission: writingSubmission,
      feedback: writingFeedback(),
      recordId: 'writing-artifact-integrity',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      savedAt: CREATED_AT,
      source: 'custom',
    }, { status: 'ready', mode: 'device' })

    expect(() => parseAiArtifactRecordV2({
      ...artifact,
      markdownProjection: `${artifact.markdownProjection}\n伪造内容`,
    })).toThrow(/markdown projection/)
    expect(() => parseAiArtifactRecordV2({
      ...artifact,
      provenance: { ...artifact.provenance, rubricVersion: 'unknown-rubric' },
    })).toThrow(/provenance/)
    expect(() => parseAiArtifactRecordV2({
      ...artifact,
      content: { ...artifact.content, overallBand: 9 },
    })).toThrow(/overall band/)
  })

  it('materializes a legacy writing report without an AI estimate to null without changing its projection', () => {
    const legacyFeedback = writingFeedback()
    legacyFeedback.estimatedOverallBand = null
    const artifact = createWritingFeedbackArtifactV2({
      submission: writingSubmission,
      feedback: legacyFeedback,
      recordId: 'writing-legacy-estimate',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      savedAt: CREATED_AT,
      source: 'custom',
    }, { status: 'ready', mode: 'device' })
    const legacyContent = { ...artifact.content.feedback } as Partial<WritingFeedbackV2>
    delete legacyContent.estimatedOverallBand

    const parsed = parseAiArtifactRecordV2({
      ...artifact,
      content: { ...artifact.content, feedback: legacyContent },
    }) as WritingFeedbackArtifactV2

    expect(parsed.content.feedback.estimatedOverallBand).toBeNull()
    expect(parsed.markdownProjection).toBe(artifact.markdownProjection)
    expect(parsed.title).toBe(artifact.title)
  })

  it('deduplicates an exact writing retry but rejects changed content or ownership', () => {
    const baseInput = {
      submission: writingSubmission,
      feedback: writingFeedback(),
      recordId: 'writing-idempotency-1',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      source: 'custom' as const,
    }
    const first = createWritingFeedbackArtifactV2({
      ...baseInput,
      savedAt: CREATED_AT,
    }, { status: 'ready', mode: 'device' })
    const retry = createWritingFeedbackArtifactV2({
      ...baseInput,
      savedAt: '2026-08-02T00:01:00.000Z',
    }, { status: 'ready', mode: 'device' })
    expect(upsertAiArtifact([first], retry)).toEqual([first])

    const changed = createWritingFeedbackArtifactV2({
      ...baseInput,
      feedback: writingFeedback('另一份反馈不应复用相同标识。'),
      savedAt: CREATED_AT,
    }, { status: 'ready', mode: 'device' })
    expect(() => upsertAiArtifact([first], changed)).toThrow(/identifier collision/)

    const otherOwner = createWritingFeedbackArtifactV2({
      ...baseInput,
      savedAt: CREATED_AT,
    }, { status: 'ready', mode: 'account', accountUserId: ACCOUNT_B })
    expect(() => upsertAiArtifact([first], otherOwner)).toThrow(/identifier collision/)
  })

  it('keeps writing content portable while removing account ownership', () => {
    const artifact = createWritingFeedbackArtifactV2({
      submission: writingSubmission,
      feedback: writingFeedback(),
      recordId: 'writing-portable-1',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      savedAt: CREATED_AT,
      source: 'managed',
    }, { status: 'ready', mode: 'account', accountUserId: ACCOUNT_A })
    const portable = makePortableAiArtifacts([artifact])[0]
    expect(portable.owner).toEqual({ scope: 'local' })
    const serialized = serializePortableAiArtifacts([artifact], CREATED_AT)
    expect(serialized).toContain(writingSubmission.essayText)
    expect(serialized).not.toContain(ACCOUNT_A)
  })

  it('includes the original prompt, Task 1 material and complete essay only in the single Markdown export', () => {
    const task1Submission = createWritingSubmissionV2({
      module: 'academic',
      task: 'task1',
      promptText: 'Summarise the main features and make comparisons where relevant.',
      sourceMaterial: {
        kind: 'text_description',
        description: 'The line chart shows rail passenger numbers from 2000 to 2020.',
      },
      essayText: 'Rail passenger numbers increased steadily between 2000 and 2020.',
    })
    const task1Feedback: WritingFeedbackV2 = {
      ...writingFeedback(),
      taskCriterion: 'task_achievement',
      criteria: {
        task: { band: 6.5, summary: '概括了主要趋势。', evidence: ['increased steadily'], improvement: '补充关键数据。' },
        coherenceCohesion: { band: 6, summary: '表达顺序清楚。', evidence: ['between 2000 and 2020'], improvement: '增加比较关系。' },
        lexicalResource: { band: 6.5, summary: '趋势词准确。', evidence: ['increased steadily'], improvement: '增加变化幅度词汇。' },
        grammaticalRangeAccuracy: { band: 6, summary: '句子基本准确。', evidence: ['Rail passenger numbers increased steadily'], improvement: '增加复杂句。' },
      },
      strengths: [{ title: '趋势明确', evidence: 'increased steadily' }],
    }
    const artifact = createWritingFeedbackArtifactV2({
      submission: task1Submission,
      feedback: task1Feedback,
      recordId: 'writing-task1-export',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      savedAt: CREATED_AT,
      source: 'custom',
    }, { status: 'ready', mode: 'device' })

    expect(artifact.markdownProjection).not.toContain(task1Submission.essayText)
    const exported = aiArtifactToMarkdown(artifact)
    expect(exported).toContain(task1Submission.promptText)
    expect(exported).toContain(task1Submission.sourceMaterial.kind === 'text_description'
      ? task1Submission.sourceMaterial.description
      : '')
    expect(exported).toContain(task1Submission.essayText)
    expect(exported).toContain('## AI 反馈')
  })

  it('keeps a V3 automatic-reference report portable without reintroducing a copied question', () => {
    const referenceSubmission = createWritingSubmissionV3({
      module: 'academic',
      task: 'task1',
      sourceReference: { collection: 'cambridge_ielts', bookNumber: 19, testNumber: 2 },
      essayText: writingSubmission.essayText,
    })
    const artifact = createWritingFeedbackArtifactV2({
      submission: referenceSubmission,
      feedback: {
        ...writingFeedback(),
        taskCriterion: 'task_achievement',
        limitations: ['题目自动识别仅作参考评估；未提供原图。'],
      },
      recordId: 'writing-reference-export',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
      savedAt: CREATED_AT,
      source: 'managed',
      promptVersion: 'writing-feedback-v3-reference',
    }, { status: 'ready', mode: 'device' })

    const exported = aiArtifactToMarkdown(artifact)
    expect(artifact.content.submission).toMatchObject({
      schemaVersion: 3,
      sourceReference: { collection: 'cambridge_ielts', bookNumber: 19, testNumber: 2 },
    })
    expect(artifact.markdownProjection).toContain('题目自动识别 · 参考评估')
    expect(exported).toContain('剑雅 19 · Test 2 · Academic · Task 1')
    expect(exported).toContain('未提供原图')
    expect(exported).not.toContain('## 原始题目')
    expect(exported).toContain(referenceSubmission.essayText)
  })
})
