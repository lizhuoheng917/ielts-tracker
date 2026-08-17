import { describe, expect, it } from 'vitest'

import {
  WRITING_RUBRIC_VERSION,
  countWritingWords,
  createWritingSubmissionV3,
  type WritingFeedbackV2,
  type WritingTask,
} from './writingFeedback'
import {
  buildWritingRevisionSnapshot,
  createWritingRevisionFocuses,
  createWritingRevisionFocusOptions,
  parseWritingRevisionCoachV2,
  parseWritingRevisionInputV1,
  WRITING_REVISION_INPUT_SCHEMA_VERSION,
} from './writingRevision'

function feedback(task: WritingTask): WritingFeedbackV2 {
  const taskCriterion = task === 'task1' ? 'task_achievement' : 'task_response'
  return {
    schemaVersion: 2,
    kind: 'writing_feedback',
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus: 'scored',
    estimatedOverallBand: 6.5,
    taskCriterion,
    summary: '内容方向正确，但关键论证和连接仍可更具体。',
    criteria: {
      task: { band: 6.5, summary: '基本完成任务。', evidence: ['overall'], improvement: '补充关键解释。' },
      coherenceCohesion: { band: 6, summary: '结构清楚。', evidence: ['However'], improvement: '明确句间关系。' },
      lexicalResource: { band: 6.5, summary: '词汇基本准确。', evidence: ['significant'], improvement: '使用更具体的表达。' },
      grammaticalRangeAccuracy: { band: 6, summary: '多数句子准确。', evidence: ['which means'], improvement: '增加准确的复杂句。' },
    },
    strengths: [{ title: '方向清楚', evidence: 'overall' }],
    priorities: [
      { title: '补足核心解释', reason: '当前结论跳跃。', example: '说明原因如何导向结果。' },
      { title: '改善段落衔接', reason: '句间推进不够明确。', example: '加入准确的因果连接。' },
    ],
    paragraphFeedback: [{ paragraphIndex: 1, summary: '主题明确。', evidence: 'overall' }],
    corrections: [{ original: 'very big change', revision: 'a significant change', reason: '表达更准确。' }],
    limitations: [],
  }
}

function revisionFixture(task: WritingTask) {
  const originalEssay = task === 'task1'
    ? 'Overall, the number increased. It was a very big change. However, the final year was higher.'
    : 'Public transport should be free. This is good for cities. However, the idea needs funding.'
  const revisedEssay = task === 'task1'
    ? 'Overall, the number increased because demand recovered. It was a significant change. As a result, the final year was higher.'
    : 'Public transport should be free because lower fares can reduce private-car use. However, cities should fund the policy through congestion charges.'
  const submission = createWritingSubmissionV3({
    module: 'academic',
    task,
    sourceReference: { collection: 'cambridge_ielts', bookNumber: 19, testNumber: 2 },
    essayText: originalEssay,
  })
  const options = createWritingRevisionFocusOptions(feedback(task))
  const focuses = createWritingRevisionFocuses(options, options.slice(0, 2).map(option => option.key))
  const input = parseWritingRevisionInputV1({
    schemaVersion: WRITING_REVISION_INPUT_SCHEMA_VERSION,
    submission,
    revisedEssay,
    revisedWordCount: countWritingWords(revisedEssay),
    focuses,
  })
  return { input, focuses, revisedEssay }
}

describe.each(['task1', 'task2'] as const)('Writing revision coach %s contract', (task) => {
  it('builds a private, purpose-limited snapshot and accepts compact exact-evidence output', () => {
    const { input, revisedEssay } = revisionFixture(task)
    const snapshot = buildWritingRevisionSnapshot(input, {
      now: new Date('2026-08-18T08:00:00.000Z'),
      createId: () => `revision-${task}`,
    })
    expect(snapshot.purpose).toBe('writing_revision_coach')
    expect(snapshot.scopes).toEqual(['writing.submission'])
    expect(snapshot.privateScopes).toEqual(['writing.submission'])
    expect(snapshot.quality.recordCount).toBe(1)
    expect(snapshot.data).toEqual({ revision: input })

    const output = parseWritingRevisionCoachV2({
      schemaVersion: 2,
      kind: 'writing_revision_coach',
      summary: '两个选中重点都已有可见改善。',
      improved: [
        { focusIndex: 1, finding: '解释链更完整。', evidence: revisedEssay.split('. ')[0] },
        { focusIndex: 2, finding: '衔接更明确。', evidence: revisedEssay.split('. ').at(-1)!.replace(/\.$/, '') },
      ],
      remaining: [],
      newIssues: [],
      nextAction: '朗读一次并检查每个连接词是否表达准确关系。',
      limitations: ['本次只复查选中重点，不重新估分。'],
    }, input)
    expect(output.improved).toHaveLength(2)
    expect(output.remaining).toHaveLength(0)
  })

  it('rejects unchanged essays, unclassified focuses and invented evidence', () => {
    const { input, revisedEssay } = revisionFixture(task)
    expect(() => parseWritingRevisionInputV1({
      ...input,
      revisedEssay: input.submission.essayText,
      revisedWordCount: input.submission.wordCount,
    })).toThrow(/must contain a change/)

    const base = {
      schemaVersion: 2,
      kind: 'writing_revision_coach',
      summary: '复查完成。',
      improved: [{ focusIndex: 1, finding: '已有改善。', evidence: revisedEssay.split('. ')[0] }],
      remaining: [],
      newIssues: [],
      nextAction: '继续检查第二个重点。',
      limitations: [],
    }
    expect(() => parseWritingRevisionCoachV2(base, input)).toThrow(/classified exactly once/)
    expect(() => parseWritingRevisionCoachV2({
      ...base,
      improved: [
        ...base.improved,
        { focusIndex: 2, finding: '已有改善。', evidence: 'This sentence does not exist.' },
      ],
    }, input)).toThrow(/quote the revised essay exactly/)
  })
})
