import { describe, expect, it } from 'vitest'

import {
  formatDailySuggestionAsMarkdown,
  formatLearningAnalysisAsMarkdown,
  isDailySuggestionV2,
  isLearningAnalysisV2,
  isPlanDraftV2,
  parseDailySuggestionV2,
  parseLearningAnalysisV2,
  parsePlanDraftV2,
  parseStructuredAiOutput,
  parseStructuredAiOutputJson,
  type DailySuggestionV2,
  type LearningAnalysisV2,
  type PlanDraftV2,
} from './structuredOutputs'

function dailySuggestion(): DailySuggestionV2 {
  return {
    schemaVersion: 2,
    kind: 'daily_suggestion',
    headline: '从一次短练习开始',
    summary: '先留下可比较的真实记录。',
    focus: {
      title: '完成一次听力',
      reason: '当前记录还不足以判断薄弱项。',
      estimatedMinutes: 20,
    },
    actions: [{
      title: '听力基线',
      detail: '完成一次计时练习并记录结果。',
      category: 'listening',
      estimatedMinutes: 20,
    }],
    evidence: ['近30天有效学习记录为 0。'],
    limitations: ['暂时无法评估长期趋势。'],
  }
}

function learningAnalysis(): LearningAnalysisV2 {
  return {
    schemaVersion: 2,
    kind: 'learning_analysis',
    title: '近30天学习分析',
    conclusion: '数据不足，先建立一周基线。',
    insights: [{
      type: 'pattern',
      title: '样本不足',
      finding: '目前无法判断学习趋势。',
      evidence: '近30天学习记录数为 0。',
    }],
    actions: [{
      priority: 'high',
      title: '连续记录一周',
      reason: '用真实记录建立可比较的基线。',
      estimatedMinutes: 20,
    }],
    limitations: ['无足够样本评估强弱项。'],
  }
}

function planDraft(): PlanDraftV2 {
  return {
    schemaVersion: 2,
    kind: 'plan_draft',
    title: '一周听力计划',
    summary: '根据当前记录先安排三次短练习。',
    plans: [{
      title: '早晨听力训练',
      description: '完成精听并记录错因。',
      category: 'listening',
      frequency: 'weekly',
      weekDays: [1, 3, 5],
      targetTime: '08:00',
      targetDuration: 25,
      targetCount: null,
    }],
    evidence: ['近期听力练习样本较少。'],
    limitations: ['完成一周后再调整强度。'],
  }
}

describe('structured AI output contracts', () => {
  it('parses and normalizes valid purpose-specific V2 content', () => {
    expect(parseDailySuggestionV2({
      ...dailySuggestion(),
      headline: '  从一次短练习开始  ',
    }).headline).toBe('从一次短练习开始')
    expect(parseLearningAnalysisV2(learningAnalysis())).toEqual(learningAnalysis())
    expect(isDailySuggestionV2(dailySuggestion())).toBe(true)
    expect(isLearningAnalysisV2(learningAnalysis())).toBe(true)
    expect(parsePlanDraftV2(planDraft())).toEqual(planDraft())
    expect(isPlanDraftV2(planDraft())).toBe(true)
  })

  it('rejects extra or missing keys, invalid enums, array counts and field limits', () => {
    expect(() => parseDailySuggestionV2({ ...dailySuggestion(), debug: true })).toThrow(/unsupported fields/)
    const { summary: _summary, ...missingSummary } = dailySuggestion()
    expect(() => parseDailySuggestionV2(missingSummary)).toThrow(/missing required fields/)
    expect(() => parseDailySuggestionV2({
      ...dailySuggestion(),
      actions: [{ ...dailySuggestion().actions[0], category: 'grammar' }],
    })).toThrow(/unsupported value/)
    expect(() => parseDailySuggestionV2({ ...dailySuggestion(), actions: [] })).toThrow(/between 1 and 4/)
    expect(() => parseDailySuggestionV2({
      ...dailySuggestion(),
      focus: { ...dailySuggestion().focus, estimatedMinutes: 181 },
    })).toThrow(/between 5 and 180/)
    expect(() => parseLearningAnalysisV2({
      ...learningAnalysis(),
      conclusion: '学'.repeat(601),
    })).toThrow(/no longer than 600/)
    expect(isDailySuggestionV2(learningAnalysis())).toBe(false)
    expect(() => parsePlanDraftV2({
      ...planDraft(),
      plans: [{ ...planDraft().plans[0], frequency: 'weekly', weekDays: [] }],
    })).toThrow(/required for weekly/)
    expect(() => parsePlanDraftV2({
      ...planDraft(),
      plans: [{ ...planDraft().plans[0], weekDays: [1, 1] }],
    })).toThrow(/unique/)
    expect(() => parsePlanDraftV2({
      ...planDraft(),
      plans: [{ ...planDraft().plans[0], targetTime: '25:00' }],
    })).toThrow(/HH:mm/)
    expect(() => parsePlanDraftV2({
      ...planDraft(),
      plans: Array.from({ length: 5 }, () => planDraft().plans[0]),
    })).toThrow(/between 1 and 4/)
  })

  it('enforces purpose matching and accepts only plain JSON or one JSON fence', () => {
    expect(parseStructuredAiOutput(dailySuggestion(), 'daily_suggestion')).toEqual(dailySuggestion())
    expect(() => parseStructuredAiOutput(learningAnalysis(), 'daily_suggestion')).toThrow()
    expect(parseStructuredAiOutput(planDraft(), 'plan_draft')).toEqual(planDraft())

    const fenced = `\`\`\`json\n${JSON.stringify(dailySuggestion())}\n\`\`\``
    expect(parseStructuredAiOutputJson(fenced, 'daily_suggestion')).toEqual(dailySuggestion())
    expect(() => parseStructuredAiOutputJson(`说明\n${JSON.stringify(dailySuggestion())}`, 'daily_suggestion')).toThrow(
      /not valid JSON/,
    )
  })

  it('projects structured results into deterministic legacy-readable Markdown', () => {
    expect(formatDailySuggestionAsMarkdown(dailySuggestion())).toContain('### 行动清单')
    expect(formatDailySuggestionAsMarkdown(dailySuggestion())).toContain('听力基线')
    expect(formatLearningAnalysisAsMarkdown(learningAnalysis())).toContain('### 关键发现')
    expect(formatLearningAnalysisAsMarkdown(learningAnalysis())).toContain('依据：近30天学习记录数为 0')
  })
})
