import { describe, expect, it } from 'vitest'

import {
  WRITING_RUBRIC_VERSION,
  buildWritingContextSnapshot,
  calculateWritingOverallBand,
  countWritingWords,
  createWritingSubmissionV2,
  formatWritingFeedbackAsMarkdown,
  parseWritingFeedbackV2,
  parseWritingSubmissionV2,
  type WritingFeedbackV2,
  type WritingSubmissionV2,
} from './writingFeedback'

const ESSAY = 'Some people believe public transport should be free. I agree because it reduces traffic and supports low-income workers.'

function submission(overrides: Partial<WritingSubmissionV2> = {}): WritingSubmissionV2 {
  return createWritingSubmissionV2({
    module: 'academic',
    task: 'task2',
    promptText: 'Public transport should be free. To what extent do you agree or disagree?',
    sourceMaterial: { kind: 'none' },
    essayText: ESSAY,
    ...overrides,
  })
}

function scoredFeedback(): WritingFeedbackV2 {
  return {
    schemaVersion: 2,
    kind: 'writing_feedback',
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus: 'scored',
    taskCriterion: 'task_response',
    summary: '立场清晰，但论证仍需展开。',
    criteria: {
      task: {
        band: 6.5,
        summary: '回应了题目并给出明确立场。',
        evidence: ['I agree because it reduces traffic'],
        improvement: '进一步解释两项理由。',
      },
      coherenceCohesion: {
        band: 6,
        summary: '因果关系清楚。',
        evidence: ['because it reduces traffic'],
        improvement: '增加段落间的推进关系。',
      },
      lexicalResource: {
        band: 6.5,
        summary: '使用了与主题相关的词汇。',
        evidence: ['public transport'],
        improvement: '增加更精确的政策类表达。',
      },
      grammaticalRangeAccuracy: {
        band: 6,
        summary: '句子基本准确。',
        evidence: ['Some people believe public transport should be free'],
        improvement: '增加复合句并保持准确。',
      },
    },
    strengths: [{ title: '立场明确', evidence: 'I agree because it reduces traffic' }],
    priorities: [{ title: '展开论证', reason: '当前理由只有简短列举。', example: '解释免费交通如何减少私家车使用。' }],
    paragraphFeedback: [{
      paragraphIndex: 1,
      summary: '开头直接表明立场，但需要更多展开。',
      evidence: 'Some people believe public transport should be free',
    }],
    corrections: [{
      original: 'supports low-income workers',
      revision: 'improves mobility for low-income workers',
      reason: '表达更具体。',
    }],
    limitations: [],
  }
}

function insufficientFeedback(): WritingFeedbackV2 {
  const criterion = {
    band: null,
    summary: '可以观察语言，但不能可靠评分。',
    evidence: [] as string[],
    improvement: '补充完整题目后重新评估。',
  }
  return {
    schemaVersion: 2,
    kind: 'writing_feedback',
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus: 'insufficient_evidence',
    taskCriterion: 'task_response',
    summary: '缺少题目，无法判断任务回应。',
    criteria: {
      task: { ...criterion },
      coherenceCohesion: { ...criterion },
      lexicalResource: { ...criterion },
      grammaticalRangeAccuracy: { ...criterion },
    },
    strengths: [],
    priorities: [{ title: '补充题目', reason: '评分需要任务要求。', example: '粘贴完整 Task 2 题目。' }],
    paragraphFeedback: [],
    corrections: [],
    limitations: ['没有提供写作题目。'],
  }
}

function submissionAtSerializedLength(targetLength: number): WritingSubmissionV2 {
  const value: WritingSubmissionV2 = {
    schemaVersion: 2,
    module: 'academic',
    task: 'task2',
    promptText: '',
    sourceMaterial: { kind: 'none' },
    essayText: '',
    wordCount: 0,
  }
  const baseLength = JSON.stringify(value).length
  const payloadLength = targetLength - baseLength
  if (payloadLength < 1) throw new Error('target submission length is too small')
  const plainCharacterCount = payloadLength % 2
  value.essayText = `${'a'.repeat(plainCharacterCount)}${'\\'.repeat(Math.floor(payloadLength / 2))}`
  value.wordCount = countWritingWords(value.essayText)
  if (JSON.stringify(value).length !== targetLength) {
    throw new Error('failed to create an exact-length submission fixture')
  }
  return value
}

function feedbackAtSerializedLength(targetLength: number): WritingFeedbackV2 {
  const feedback = scoredFeedback()
  feedback.priorities = Array.from({ length: 5 }, () => ({
    title: 'x',
    reason: 'x',
    example: 'x',
  }))
  feedback.paragraphFeedback = Array.from({ length: 20 }, (_, index) => ({
    paragraphIndex: index + 1,
    summary: 'x',
    evidence: 'x',
  }))
  feedback.corrections = Array.from({ length: 8 }, () => ({
    original: 'x',
    revision: 'x',
    reason: 'x',
  }))
  feedback.limitations = Array.from({ length: 5 }, () => 'x')

  const slots: Array<{
    current: () => string
    update: (value: string) => void
    maxLength: number
  }> = []
  const addSlot = (
    current: () => string,
    update: (value: string) => void,
    maxLength: number,
  ) => slots.push({ current, update, maxLength })

  addSlot(() => feedback.summary, value => { feedback.summary = value }, 800)
  for (const criterion of Object.values(feedback.criteria)) {
    addSlot(() => criterion.summary, value => { criterion.summary = value }, 500)
    addSlot(() => criterion.improvement, value => { criterion.improvement = value }, 400)
  }
  for (const priority of feedback.priorities) {
    addSlot(() => priority.title, value => { priority.title = value }, 100)
    addSlot(() => priority.reason, value => { priority.reason = value }, 300)
    addSlot(() => priority.example, value => { priority.example = value }, 400)
  }
  for (const paragraph of feedback.paragraphFeedback) {
    addSlot(() => paragraph.summary, value => { paragraph.summary = value }, 400)
    addSlot(() => paragraph.evidence, value => { paragraph.evidence = value }, 200)
  }
  for (const correction of feedback.corrections) {
    addSlot(() => correction.original, value => { correction.original = value }, 240)
    addSlot(() => correction.revision, value => { correction.revision = value }, 320)
    addSlot(() => correction.reason, value => { correction.reason = value }, 240)
  }
  feedback.limitations.forEach((_, index) => {
    addSlot(
      () => feedback.limitations[index],
      value => { feedback.limitations[index] = value },
      240,
    )
  })

  let remaining = targetLength - JSON.stringify(feedback).length
  if (remaining < 0) throw new Error('target feedback length is too small')
  for (const slot of slots) {
    const growth = Math.min(remaining, slot.maxLength - slot.current().length)
    slot.update(`${slot.current()}${'x'.repeat(growth)}`)
    remaining -= growth
    if (remaining === 0) break
  }
  if (remaining !== 0 || JSON.stringify(feedback).length !== targetLength) {
    throw new Error('failed to create an exact-length feedback fixture')
  }
  return feedback
}

describe('WritingSubmissionV2', () => {
  it('computes a deterministic word count and normalizes host-created submissions', () => {
    expect(countWritingWords("Well designed systems don't fail silently. Test them.")).toBe(8)
    const created = createWritingSubmissionV2({
      module: 'academic',
      task: 'task2',
      promptText: '  Discuss both views.  ',
      sourceMaterial: { kind: 'none' },
      essayText: `  ${ESSAY}\r\n  `,
    })
    expect(created.promptText).toBe('Discuss both views.')
    expect(created.essayText).toBe(ESSAY)
    expect(created.wordCount).toBe(countWritingWords(ESSAY))
    expect(parseWritingSubmissionV2(created)).toEqual(created)
  })

  it('rejects forged counts, unsupported fields and source material on the wrong task', () => {
    const valid = submission()
    expect(() => parseWritingSubmissionV2({ ...valid, wordCount: valid.wordCount + 1 })).toThrow(/host-computed/)
    expect(() => parseWritingSubmissionV2({ ...valid, wordCount: valid.wordCount + 0.5 })).toThrow(/host-computed/)
    expect(() => parseWritingSubmissionV2({ ...valid, debug: true })).toThrow(/unsupported fields/)
    expect(() => createWritingSubmissionV2({
      module: 'general_training',
      task: 'task1',
      promptText: 'Write a letter.',
      sourceMaterial: { kind: 'text_description', description: 'A chart' },
      essayText: ESSAY,
    })).toThrow(/only valid for Academic Task 1/)
  })

  it('accepts the exact prompt, source and essay limits and rejects one character over', () => {
    expect(createWritingSubmissionV2({
      module: 'academic',
      task: 'task2',
      promptText: 'p'.repeat(4_000),
      sourceMaterial: { kind: 'none' },
      essayText: ESSAY,
    }).promptText).toHaveLength(4_000)
    expect(() => createWritingSubmissionV2({
      module: 'academic',
      task: 'task2',
      promptText: 'p'.repeat(4_001),
      sourceMaterial: { kind: 'none' },
      essayText: ESSAY,
    })).toThrow(/4000/)

    expect(createWritingSubmissionV2({
      module: 'academic',
      task: 'task1',
      promptText: 'Summarise the chart.',
      sourceMaterial: { kind: 'text_description', description: 's'.repeat(6_000) },
      essayText: ESSAY,
    }).sourceMaterial).toEqual({ kind: 'text_description', description: 's'.repeat(6_000) })
    expect(() => createWritingSubmissionV2({
      module: 'academic',
      task: 'task1',
      promptText: 'Summarise the chart.',
      sourceMaterial: { kind: 'text_description', description: 's'.repeat(6_001) },
      essayText: ESSAY,
    })).toThrow(/6000/)

    expect(createWritingSubmissionV2({
      module: 'academic',
      task: 'task2',
      promptText: 'Discuss both views.',
      sourceMaterial: { kind: 'none' },
      essayText: 'e'.repeat(20_000),
    }).essayText).toHaveLength(20_000)
    expect(() => createWritingSubmissionV2({
      module: 'academic',
      task: 'task2',
      promptText: 'Discuss both views.',
      sourceMaterial: { kind: 'none' },
      essayText: 'e'.repeat(20_001),
    })).toThrow(/20000/)
  })

  it('enforces the 40000-character serialized submission boundary exactly', () => {
    const atLimit = submissionAtSerializedLength(40_000)
    expect(JSON.stringify(atLimit)).toHaveLength(40_000)
    expect(parseWritingSubmissionV2(atLimit)).toEqual(atLimit)

    const overLimit = submissionAtSerializedLength(40_001)
    expect(() => parseWritingSubmissionV2(overLimit)).toThrow(/serialized length/)
  })

  it('builds a writing-only private snapshot and marks missing evidence as limited', () => {
    const noChart = createWritingSubmissionV2({
      module: 'academic',
      task: 'task1',
      promptText: 'Summarise the information.',
      sourceMaterial: { kind: 'none' },
      essayText: ESSAY,
    })
    const snapshot = buildWritingContextSnapshot(noChart, {
      now: new Date('2026-08-02T08:00:00.000Z'),
      createId: () => 'writing-snapshot-1',
    })
    expect(snapshot).toMatchObject({
      purpose: 'writing_feedback',
      snapshotId: 'writing-snapshot-1',
      scopes: ['writing.submission'],
      privateScopes: ['writing.submission'],
      quality: { status: 'limited', recordCount: 1 },
      data: { submission: noChart },
    })
    expect(snapshot.quality.warnings.join(' ')).toContain('图表')
  })
})

describe('WritingFeedbackV2', () => {
  it('accepts half-band scored feedback, binds evidence to the essay and derives overall band', () => {
    const parsed = parseWritingFeedbackV2(scoredFeedback(), submission())
    expect(parsed).toEqual(scoredFeedback())
    expect(calculateWritingOverallBand(parsed)).toBe(6.5)
  })

  it('rejects non-half bands, task mismatches, unsupported fields and invented evidence', () => {
    const invalidBand = scoredFeedback()
    invalidBand.criteria.task.band = 6.3 as never
    expect(() => parseWritingFeedbackV2(invalidBand, submission())).toThrow(/half-band/)

    expect(() => parseWritingFeedbackV2({
      ...scoredFeedback(),
      taskCriterion: 'task_achievement',
    }, submission())).toThrow(/does not match/)

    expect(() => parseWritingFeedbackV2({ ...scoredFeedback(), debug: true }, submission())).toThrow(/unsupported fields/)

    const inventedEvidence = scoredFeedback()
    inventedEvidence.strengths[0].evidence = 'This sentence was never submitted.'
    expect(() => parseWritingFeedbackV2(inventedEvidence, submission())).toThrow(/exact excerpt/)
  })

  it('never permits a precise score when task evidence is incomplete', () => {
    const noPrompt = submission({ promptText: '' })
    expect(() => parseWritingFeedbackV2(scoredFeedback(), noPrompt)).toThrow(/cannot receive precise/)
    expect(parseWritingFeedbackV2(insufficientFeedback(), noPrompt).assessmentStatus).toBe('insufficient_evidence')
    expect(calculateWritingOverallBand(insufficientFeedback())).toBeNull()

    const invalid = insufficientFeedback()
    invalid.criteria.lexicalResource.band = 6
    expect(() => parseWritingFeedbackV2(invalid, noPrompt)).toThrow(/cannot contain precise/)
  })

  it('never permits insufficient-evidence feedback when task evidence is complete', () => {
    expect(() => parseWritingFeedbackV2(insufficientFeedback(), submission())).toThrow(
      /cannot receive insufficient-evidence/,
    )
  })

  it('requires insufficient-evidence feedback to keep all evidence-derived collections empty', () => {
    const noPrompt = submission({ promptText: '' })

    const criterionEvidence = insufficientFeedback()
    criterionEvidence.criteria.task.evidence = ['public transport']
    expect(() => parseWritingFeedbackV2(criterionEvidence, noPrompt)).toThrow(/between 0 and 0/)

    const strengths = insufficientFeedback()
    strengths.strengths = scoredFeedback().strengths
    expect(() => parseWritingFeedbackV2(strengths, noPrompt)).toThrow(/between 0 and 0/)

    const paragraphFeedback = insufficientFeedback()
    paragraphFeedback.paragraphFeedback = scoredFeedback().paragraphFeedback
    expect(() => parseWritingFeedbackV2(paragraphFeedback, noPrompt)).toThrow(/between 0 and 0/)

    const corrections = insufficientFeedback()
    corrections.corrections = scoredFeedback().corrections
    expect(() => parseWritingFeedbackV2(corrections, noPrompt)).toThrow(/between 0 and 0/)

    const accepted = parseWritingFeedbackV2(insufficientFeedback(), noPrompt)
    expect(accepted.priorities).toHaveLength(1)
    expect(accepted.limitations).toHaveLength(1)
  })

  it('creates deterministic readable Markdown and verifies the supplied overall band', () => {
    const markdown = formatWritingFeedbackAsMarkdown(submission(), scoredFeedback(), 6.5)
    expect(markdown).toContain('# IELTS 写作反馈')
    expect(markdown).toContain('Task Response')
    expect(markdown).toContain('总分：6.5')
    expect(() => formatWritingFeedbackAsMarkdown(submission(), scoredFeedback(), 7)).toThrow(/does not match/)
  })

  it('enforces the 12000-character serialized feedback boundary exactly', () => {
    const atLimit = feedbackAtSerializedLength(12_000)
    expect(JSON.stringify(atLimit)).toHaveLength(12_000)
    expect(parseWritingFeedbackV2(atLimit)).toEqual(atLimit)

    const overLimit = feedbackAtSerializedLength(12_001)
    expect(() => parseWritingFeedbackV2(overLimit)).toThrow(/serialized length/)
  })
})
