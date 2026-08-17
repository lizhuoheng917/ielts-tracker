import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DailySuggestionContent,
  LearningAnalysisContent,
  WritingFeedbackContent,
} from './StructuredAIContent'
import type { DailySuggestionV2, LearningAnalysisV2 } from '@/ai/structuredOutputs'
import type { WritingFeedbackV2, WritingSubmissionV2, WritingSubmissionV3, WritingSubmissionV4 } from '@/ai/writingFeedback'

const dailySuggestion: DailySuggestionV2 = {
  schemaVersion: 2,
  kind: 'daily_suggestion',
  headline: '今天先稳住听力节奏',
  summary: '用一个小练习建立连续反馈。',
  focus: {
    title: '完成一次精听',
    reason: '最近听力记录偏少。',
    estimatedMinutes: 20,
  },
  actions: [{
    title: '精听一段材料',
    detail: '听完后记录两个失分原因。',
    category: 'listening',
    estimatedMinutes: 20,
  }],
  evidence: ['近 7 天只有 1 次听力练习'],
  limitations: ['没有可用的题型明细'],
}

const learningAnalysis: LearningAnalysisV2 = {
  schemaVersion: 2,
  kind: 'learning_analysis',
  title: '本周节奏正在形成',
  conclusion: '练习频率稳定，但科目分布仍不均衡。',
  insights: [{
    type: 'risk',
    title: '口语投入不足',
    finding: '口语练习次数低于其他科目。',
    evidence: '近 30 天口语 1 次，阅读 6 次',
  }],
  actions: [{
    priority: 'high',
    title: '安排一次口语录音',
    reason: '先补足可分析的口语样本。',
    estimatedMinutes: 15,
  }],
  limitations: ['未包含外部模考记录'],
}

const writingSubmission: WritingSubmissionV2 = {
  schemaVersion: 2,
  module: 'academic',
  task: 'task2',
  promptText: 'Some people think cities should create more public parks. Discuss both views and give your opinion.',
  sourceMaterial: { kind: 'none' },
  essayText: 'Public parks improve daily life. They give residents a quiet place to exercise and meet neighbours.',
  wordCount: 17,
}

const writingFeedback: WritingFeedbackV2 = {
  schemaVersion: 2,
  kind: 'writing_feedback',
  rubricVersion: 'ielts-writing-public-descriptors-v1',
  assessmentStatus: 'scored',
  estimatedOverallBand: 7,
  taskCriterion: 'task_response',
  summary: '观点清晰，但论证还需要更具体的因果链。',
  criteria: {
    task: {
      band: 6.5,
      summary: '回应了题目并表达了立场。',
      evidence: ['Public parks improve daily life.'],
      improvement: '为反方观点补充一个具体场景。',
    },
    coherenceCohesion: {
      band: 6,
      summary: '句子顺序清楚，但衔接方式较单一。',
      evidence: ['They give residents a quiet place'],
      improvement: '用指代和因果连接替代重复主语。',
    },
    lexicalResource: {
      band: 7,
      summary: '词汇准确，搭配自然。',
      evidence: ['a quiet place to exercise'],
      improvement: '增加描述城市规划的主题词汇。',
    },
    grammaticalRangeAccuracy: {
      band: 6.5,
      summary: '简单句准确，复合句样本较少。',
      evidence: ['They give residents a quiet place to exercise and meet neighbours.'],
      improvement: '加入一个让步从句展示语法范围。',
    },
  },
  strengths: [{ title: '中心观点明确', evidence: 'Public parks improve daily life.' }],
  priorities: [{
    title: '展开核心论据',
    reason: '当前只列出了益处，还没有解释它如何改善城市生活。',
    example: 'Because parks provide free exercise space, they can improve public health.',
  }],
  paragraphFeedback: [{
    paragraphIndex: 1,
    summary: '主题句清楚，下一步需要补充解释和例子。',
    evidence: 'Public parks improve daily life.',
  }],
  corrections: [{
    original: 'They give residents a quiet place to exercise and meet neighbours.',
    revision: 'They give residents a quiet place where they can exercise and meet their neighbours.',
    reason: '从句更清楚地表达场所与行为的关系。',
  }],
  limitations: ['作文篇幅较短，分数仅供阶段性参考。'],
}

describe('StructuredAIContent', () => {
  it('renders a daily suggestion as compact focus, actions, evidence, and limitations', () => {
    const html = renderToStaticMarkup(<DailySuggestionContent value={dailySuggestion} />)

    expect(html).toContain('今日重点')
    expect(html).toContain('建议步骤')
    expect(html).toContain('参考依据')
    expect(html).toContain('数据局限')
    expect(html).toContain('20 分钟')
  })

  it('renders a learning analysis with conclusion, findings, and prioritized actions', () => {
    const html = renderToStaticMarkup(<LearningAnalysisContent value={learningAnalysis} />)

    expect(html).toContain('分析结论')
    expect(html).toContain('关键发现')
    expect(html).toContain('下一步行动')
    expect(html).toContain('需留意')
    expect(html).toContain('优先')
  })

  it('escapes model-provided text instead of treating it as HTML', () => {
    const html = renderToStaticMarkup(
      <DailySuggestionContent
        value={{ ...dailySuggestion, summary: '<script>window.alert(1)</script>' }}
      />,
    )

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders scored writing feedback as one compact report with every feedback section', () => {
    const html = renderToStaticMarkup(
      <WritingFeedbackContent
        feedback={writingFeedback}
        submission={writingSubmission}
        overallBand={9}
      />,
    )

    expect(html).toContain('Academic · Task 2')
    expect(html).toContain('AI 预估总分')
    expect(html).toContain('>7</strong>')
    expect(html).toContain('6.5')
    expect(html).not.toContain('>9</span>')
    expect(html).toContain('任务回应')
    expect(html).toContain('连贯与衔接')
    expect(html).toContain('词汇资源')
    expect(html).toContain('语法多样性与准确性')
    expect(html).toContain('写作优势')
    expect(html).toContain('优先行动')
    expect(html).toContain('段落点评')
    expect(html).toContain('修订示例')
    expect(html).toContain('评分局限')
  })

  it('renders prompt-specific coverage before the deeper structure and rewrite guidance', () => {
    const deepSubmission: WritingSubmissionV4 = {
      schemaVersion: 4,
      analysisMode: 'deep',
      module: 'academic',
      task: 'task2',
      promptSource: {
        kind: 'text',
        text: writingSubmission.promptText,
        origin: 'typed',
      },
      essayText: writingSubmission.essayText,
      wordCount: writingSubmission.wordCount,
    }
    const deepFeedback: WritingFeedbackV2 = {
      ...writingFeedback,
      deepAnalysis: {
        promptRecognition: {
          status: 'provided_text',
          recognizedPrompt: null,
          confidence: 'high',
          note: '使用用户填写的完整题目。',
        },
        promptCoverage: [{
          requirement: '讨论建设更多城市公园的观点并给出自己的立场',
          status: 'partial',
          finding: '作文给出了支持公园的理由，但没有讨论另一种观点。',
          evidence: 'Public parks improve daily life.',
          nextStep: '补充反方观点并说明最终立场为何更有说服力。',
        }],
        argumentMap: [{
          paragraphIndex: 1,
          role: '立场与理由',
          contribution: '说明公园能改善日常生活。',
          gap: '缺少反方观点和让步回应。',
        }],
        recurringPatterns: [{
          type: 'logic',
          finding: '理由停留在列举层面。',
          evidence: 'They give residents a quiet place',
          fix: '补充这一益处如何影响城市居民。',
        }],
        rewritePlan: [
          { priority: 1, action: '补全反方观点。', successCheck: '正文明确呈现并回应两种观点。' },
          { priority: 2, action: '展开支持公园的因果链。', successCheck: '每个理由包含解释或例子。' },
        ],
      },
    }

    const html = renderToStaticMarkup(
      <WritingFeedbackContent feedback={deepFeedback} submission={deepSubmission} overallBand={6.5} />,
    )

    expect(html).toContain('题目回应度')
    expect(html).toContain('部分回应')
    expect(html).toContain('没有讨论另一种观点')
    expect(html).toContain('论证结构')
    expect(html).toContain('建议重写顺序')

    const noStablePatternFeedback: WritingFeedbackV2 = {
      ...deepFeedback,
      deepAnalysis: {
        ...deepFeedback.deepAnalysis!,
        recurringPatterns: [],
      },
    }
    const noStablePatternHtml = renderToStaticMarkup(
      <WritingFeedbackContent feedback={noStablePatternFeedback} submission={deepSubmission} overallBand={6.5} />,
    )
    expect(noStablePatternHtml).toContain('本次未发现有足够原文证据支持的稳定重复模式')
  })

  it('renders insufficient-evidence feedback as a short action plan without scores or a long rubric', () => {
    const insufficientFeedback: WritingFeedbackV2 = {
      ...writingFeedback,
      assessmentStatus: 'insufficient_evidence',
      estimatedOverallBand: null,
      summary: '缺少完整题目信息，本次只提供语言反馈。',
      criteria: {
        task: { ...writingFeedback.criteria.task, band: null, evidence: [] },
        coherenceCohesion: { ...writingFeedback.criteria.coherenceCohesion, band: null, evidence: [] },
        lexicalResource: { ...writingFeedback.criteria.lexicalResource, band: null, evidence: [] },
        grammaticalRangeAccuracy: { ...writingFeedback.criteria.grammaticalRangeAccuracy, band: null, evidence: [] },
      },
      strengths: [],
      limitations: ['缺少题目材料，不能给出可靠分数。'],
    }

    const html = renderToStaticMarkup(
      <WritingFeedbackContent
        feedback={insufficientFeedback}
        submission={writingSubmission}
        overallBand={null}
      />,
    )

    expect(html).toContain('快速改进建议')
    expect(html).toContain('现在这样修改')
    expect(html).not.toContain('总体分')
    expect(html).not.toContain('6.5')
    expect(html).not.toContain('评分维度反馈')
    expect(html).not.toContain('连贯与衔接')
    expect(html).not.toContain('评分局限')
  })

  it('shows a single text-only AI estimate for automatic-reference quick feedback', () => {
    const referenceSubmission: WritingSubmissionV3 = {
      schemaVersion: 3,
      module: 'academic',
      task: 'task2',
      sourceReference: { collection: 'cambridge_ielts', bookNumber: 19, testNumber: 2 },
      essayText: writingSubmission.essayText,
      wordCount: writingSubmission.wordCount,
    }
    const quickFeedback: WritingFeedbackV2 = {
      ...writingFeedback,
      assessmentStatus: 'insufficient_evidence',
      estimatedOverallBand: 6.5,
      criteria: {
        task: { ...writingFeedback.criteria.task, band: null, evidence: [] },
        coherenceCohesion: { ...writingFeedback.criteria.coherenceCohesion, band: null, evidence: [] },
        lexicalResource: { ...writingFeedback.criteria.lexicalResource, band: null, evidence: [] },
        grammaticalRangeAccuracy: { ...writingFeedback.criteria.grammaticalRangeAccuracy, band: null, evidence: [] },
      },
      strengths: [],
      limitations: ['书号和 Test 仅作题目线索，整体预估仅基于作文文本。'],
    }

    const html = renderToStaticMarkup(
      <WritingFeedbackContent feedback={quickFeedback} submission={referenceSubmission} overallBand={null} />,
    )

    expect(html).toContain('AI 预估总分')
    expect(html).toContain('>6.5</strong>')
    expect(html).toContain('仅供参考')
    expect(html).not.toContain('评分维度反馈')
    expect(html).not.toContain('总体分')
  })

  it('shows the supplied Academic Task 1 material beside the original prompt', () => {
    const html = renderToStaticMarkup(
      <WritingFeedbackContent
        feedback={{ ...writingFeedback, taskCriterion: 'task_achievement' }}
        submission={{
          ...writingSubmission,
          task: 'task1',
          promptText: 'Summarise the information shown in the chart.',
          sourceMaterial: {
            kind: 'text_description',
            description: 'A line chart compares rail use in three cities from 2000 to 2020.',
          },
        }}
      />,
    )

    expect(html).toContain('作文题目')
    expect(html).toContain('图表材料描述')
    expect(html).toContain('three cities from 2000 to 2020')
  })

  it('labels a V3 automatic-reference report as a reference assessment and shows the Task 1 limitation', () => {
    const referenceSubmission: WritingSubmissionV3 = {
      schemaVersion: 3,
      module: 'academic',
      task: 'task1',
      sourceReference: { collection: 'cambridge_ielts', bookNumber: 19, testNumber: 2 },
      essayText: writingSubmission.essayText,
      wordCount: writingSubmission.wordCount,
    }
    const html = renderToStaticMarkup(
      <WritingFeedbackContent
        feedback={{ ...writingFeedback, taskCriterion: 'task_achievement' }}
        submission={referenceSubmission}
        overallBand={6.5}
      />,
    )

    expect(html).toContain('题目自动识别 · 参考评估')
    expect(html).toContain('剑雅 19 · Test 2 · Academic · Task 1')
    expect(html).toContain('未提供原图')
    expect(html).not.toContain('作文题目')
  })

  it('keeps a legacy report without an AI estimate readable with its existing overall-band label', () => {
    const legacyFeedback = { ...writingFeedback } as Partial<WritingFeedbackV2>
    delete legacyFeedback.estimatedOverallBand
    const html = renderToStaticMarkup(
      <WritingFeedbackContent
        feedback={legacyFeedback as WritingFeedbackV2}
        submission={writingSubmission}
        overallBand={6.5}
      />,
    )

    expect(html).toContain('总体分')
    expect(html).not.toContain('AI 预估总分')
  })
})
