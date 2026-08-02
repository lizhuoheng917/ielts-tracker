import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_AI_PRIVACY_PREFERENCES } from '@/stores/aiPrivacyStore'
import { migrateAIStoreState } from '@/stores/aiStore'
import type { AiGateway } from './gateway'
import { AiGatewayError } from './gateway'
import { buildLearningContextSnapshot, type LearningContextSource } from './learningContext'
import { executeReadOnlyAi } from './readOnlyExecution'
import {
  WRITING_RUBRIC_VERSION,
  buildWritingContextSnapshot,
  createWritingSubmissionV2,
} from './writingFeedback'

const NOW = new Date('2026-08-01T04:00:00.000Z')

function source(): LearningContextSource {
  return {
    wordRecords: [],
    practiceRecords: [],
    timerRecords: [],
    plans: [],
    planExecutions: [],
    diaryEntries: [],
    aiArtifacts: [],
    streak: { currentStreak: 0, longestStreak: 0, heatmapData: {} },
    achievement: { totalXP: 0, level: 1, levelName: '雅思新手' },
  }
}

function request() {
  return {
    purpose: 'daily_suggestion' as const,
    snapshot: buildLearningContextSnapshot(source(), {
      purpose: 'daily_suggestion',
      rangeDays: 30,
      privacy: DEFAULT_AI_PRIVACY_PREFERENCES,
      now: NOW,
      createId: () => 'snapshot-suggestion',
    }),
    userInput: '生成建议',
  }
}

function dailySuggestionContent() {
  return {
    schemaVersion: 2 as const,
    kind: 'daily_suggestion' as const,
    headline: '从一次短练习开始',
    summary: '当前记录不足，今天先建立一条可比较的学习基线。',
    focus: {
      title: '完成一次听力练习',
      reason: '用真实记录建立后续分析基线。',
      estimatedMinutes: 20,
    },
    actions: [{
      title: '听力基线练习',
      detail: '完成 20 分钟听力并记录结果。',
      category: 'listening' as const,
      estimatedMinutes: 20,
    }],
    evidence: ['快照中尚无学习记录。'],
    limitations: ['数据不足以判断薄弱项。'],
  }
}

function planDraftContent() {
  return {
    schemaVersion: 2 as const,
    kind: 'plan_draft' as const,
    title: '听力计划草稿',
    summary: '先完成三次短练习。',
    plans: [{
      title: '早晨听力训练',
      description: '精听并记录错因。',
      category: 'listening' as const,
      frequency: 'weekly' as const,
      weekDays: [1, 3, 5],
      targetTime: '08:00',
      targetDuration: 25,
      targetCount: null,
    }],
    evidence: [],
    limitations: [],
  }
}

const WRITING_ESSAY = 'I support public transport because it reduces traffic and helps working families.'

function writingFeedbackContent() {
  return {
    schemaVersion: 2 as const,
    kind: 'writing_feedback' as const,
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus: 'scored' as const,
    taskCriterion: 'task_response' as const,
    summary: '立场明确，但论证需要展开。',
    criteria: {
      task: { band: 6.5 as const, summary: '回应题目。', evidence: ['I support public transport'], improvement: '展开理由。' },
      coherenceCohesion: { band: 6 as const, summary: '因果关系清楚。', evidence: ['because it reduces traffic'], improvement: '增加衔接。' },
      lexicalResource: { band: 6.5 as const, summary: '主题词汇恰当。', evidence: ['public transport'], improvement: '提高精确度。' },
      grammaticalRangeAccuracy: { band: 6 as const, summary: '句子基本准确。', evidence: ['helps working families'], improvement: '增加句式变化。' },
    },
    strengths: [{ title: '立场明确', evidence: 'I support public transport' }],
    priorities: [{ title: '展开理由', reason: '解释过短。', example: '说明公共交通如何减少私家车使用。' }],
    paragraphFeedback: [],
    corrections: [],
    limitations: [],
  }
}

function writingRequest() {
  const submission = createWritingSubmissionV2({
    module: 'academic',
    task: 'task2',
    promptText: 'Public transport should receive more support. Do you agree?',
    sourceMaterial: { kind: 'none' },
    essayText: WRITING_ESSAY,
  })
  return {
    purpose: 'writing_feedback' as const,
    snapshot: buildWritingContextSnapshot(submission, {
      now: NOW,
      createId: () => 'snapshot-writing',
    }),
    userInput: '',
  }
}

function successGateway(): AiGateway {
  return {
    execute: vi.fn(async (gatewayRequest) => ({
      ok: true as const,
      run: {
        runId: 'run-1',
        requestId: gatewayRequest.requestId,
        productId: 'tracker' as const,
        purpose: gatewayRequest.purpose,
        status: 'succeeded' as const,
        idempotencyKey: gatewayRequest.idempotencyKey,
        snapshotId: gatewayRequest.snapshot.snapshotId,
        contextHash: gatewayRequest.snapshot.contextHash,
        createdAt: NOW.toISOString(),
        completedAt: NOW.toISOString(),
      },
      artifact: {
        schemaVersion: 1 as const,
        outputSchemaVersion: 2 as const,
        artifactId: 'artifact-1',
        runId: 'run-1',
        kind: gatewayRequest.purpose,
        status: 'final' as const,
        content: dailySuggestionContent(),
        createdAt: NOW.toISOString(),
        dataAsOf: gatewayRequest.snapshot.dataAsOf,
        contextHash: gatewayRequest.snapshot.contextHash,
      },
      warnings: [],
    })),
  }
}

describe('read-only AI routing', () => {
  it('uses managed AI only when managed mode is selected', async () => {
    const managedGateway = successGateway()
    const customExecutor = vi.fn(async () => JSON.stringify(dailySuggestionContent()))
    const result = await executeReadOnlyAi(request(), {
      routeMode: 'managed',
      managedGateway,
      customExecutor,
      customApiKey: 'custom-key-that-must-not-be-used',
      createId: () => '123e4567-e89b-42d3-a456-426614174001',
    })

    expect(result).toMatchObject({
      source: 'managed',
      content: { kind: 'daily_suggestion', focus: { title: expect.stringContaining('听力') } },
      artifact: {
        artifactId: 'artifact-1',
        runId: 'run-1',
        contextHash: request().snapshot.contextHash,
      },
    })
    expect(managedGateway.execute).toHaveBeenCalledOnce()
    expect(customExecutor).not.toHaveBeenCalled()
  })

  it('never silently falls back to custom AI after a managed failure', async () => {
    const managedGateway: AiGateway = {
      execute: vi.fn(async () => {
        throw new AiGatewayError('RATE_LIMITED', '稍后再试', true, 429)
      }),
    }
    const customExecutor = vi.fn(async () => JSON.stringify(dailySuggestionContent()))

    await expect(executeReadOnlyAi(request(), {
      routeMode: 'managed',
      managedGateway,
      customExecutor,
      customApiKey: 'custom-key-that-must-not-be-used',
      createId: () => '123e4567-e89b-42d3-a456-426614174002',
    })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    expect(customExecutor).not.toHaveBeenCalled()
  })

  it('uses custom AI only after custom mode is explicitly selected', async () => {
    const managedGateway = successGateway()
    const customExecutor = vi.fn(async (messages) => {
      expect(messages[0]).toMatchObject({ role: 'system', content: expect.stringContaining('context_snapshot') })
      return `\`\`\`json\n${JSON.stringify(dailySuggestionContent())}\n\`\`\``
    })
    const result = await executeReadOnlyAi(request(), {
      routeMode: 'custom',
      managedGateway,
      customExecutor,
      customApiKey: 'configured-key',
    })

    expect(result).toEqual({ source: 'custom', content: dailySuggestionContent(), warnings: [] })
    expect(customExecutor).toHaveBeenCalledOnce()
    expect(managedGateway.execute).not.toHaveBeenCalled()
  })

  it('never switches to Managed AI after a Custom provider failure', async () => {
    const managedGateway = successGateway()
    const customExecutor = vi.fn(async () => {
      throw new AiGatewayError('PROVIDER_ERROR', '自定义服务商暂时不可用', true)
    })

    await expect(executeReadOnlyAi(request(), {
      routeMode: 'custom',
      managedGateway,
      customExecutor,
      customApiKey: 'configured-key',
    })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(customExecutor).toHaveBeenCalledOnce()
    expect(managedGateway.execute).not.toHaveBeenCalled()
  })

  it('rejects non-JSON and purpose-mismatched custom output instead of guessing fields', async () => {
    await expect(executeReadOnlyAi(request(), {
      routeMode: 'custom',
      customExecutor: vi.fn(async () => '- 建立一条学习基线'),
      customApiKey: 'configured-key',
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })

    await expect(executeReadOnlyAi(request(), {
      routeMode: 'custom',
      customExecutor: vi.fn(async () => JSON.stringify({
        schemaVersion: 2,
        kind: 'learning_analysis',
      })),
      customApiKey: 'configured-key',
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('uses the strict PlanDraftV2 prompt and parser for custom plan generation', async () => {
    const snapshot = buildLearningContextSnapshot(source(), {
      purpose: 'plan_draft',
      rangeDays: 30,
      privacy: DEFAULT_AI_PRIVACY_PREFERENCES,
      now: NOW,
      createId: () => 'snapshot-plan',
    })
    const customExecutor = vi.fn(async (messages) => {
      expect(messages[0].content).toContain('PlanDraftV2')
      expect(messages[0].content).not.toContain('[ACTION:')
      return JSON.stringify(planDraftContent())
    })
    await expect(executeReadOnlyAi({
      purpose: 'plan_draft',
      snapshot,
      userInput: '生成听力计划',
    }, {
      routeMode: 'custom',
      customExecutor,
      customApiKey: 'configured-key',
    })).resolves.toEqual({
      source: 'custom',
      content: planDraftContent(),
      warnings: [],
    })
  })

  it('uses the strict WritingFeedbackV2 prompt and submission-bound parser for custom writing', async () => {
    const customExecutor = vi.fn(async (messages) => {
      expect(messages[0].content).toContain('WritingFeedbackV2')
      expect(messages[0].content).toContain(WRITING_ESSAY)
      expect(messages[0].content).toContain('insufficient_evidence')
      expect(messages[1].content).toBe('请根据已提交的写作快照生成 WritingFeedbackV2。')
      return JSON.stringify(writingFeedbackContent())
    })

    await expect(executeReadOnlyAi(writingRequest(), {
      routeMode: 'custom',
      customExecutor,
      customApiKey: 'configured-key',
    })).resolves.toEqual({
      source: 'custom',
      content: writingFeedbackContent(),
      warnings: [],
    })

    const invented = writingFeedbackContent()
    invented.strengths[0].evidence = 'invented sentence'
    await expect(executeReadOnlyAi(writingRequest(), {
      routeMode: 'custom',
      customExecutor: vi.fn(async () => JSON.stringify(invented)),
      customApiKey: 'configured-key',
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})

describe('AI route preference migration', () => {
  it('keeps legacy users with a key on custom AI', () => {
    expect(migrateAIStoreState({ apiKey: 'legacy-key' }, 0)).toMatchObject({
      apiKey: 'legacy-key',
      routeMode: 'custom',
    })
  })

  it('defaults users without a legacy key to managed AI and preserves v1 choice', () => {
    expect(migrateAIStoreState({ apiKey: '' }, 0)).toMatchObject({ routeMode: 'managed' })
    expect(migrateAIStoreState({ apiKey: 'kept', routeMode: 'managed' }, 1)).toMatchObject({
      routeMode: 'managed',
    })
  })
})
