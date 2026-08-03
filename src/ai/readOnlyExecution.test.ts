import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_AI_PRIVACY_PREFERENCES } from '@/stores/aiPrivacyStore'
import type { AiGateway } from './gateway'
import { AiGatewayError } from './gateway'
import { buildLearningContextSnapshot, type LearningContextSource } from './learningContext'
import { executeReadOnlyAi } from './readOnlyExecution'
import type { AiStructuredContentV2 } from './structuredOutputs'

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

describe('read-only AI execution', () => {
  it('sends learner analysis only through the managed gateway', async () => {
    const managedGateway = successGateway()

    const result = await executeReadOnlyAi(request(), {
      managedGateway,
      createId: () => '123e4567-e89b-42d3-a456-426614174001',
    })

    expect(result).toMatchObject({
      source: 'managed',
      content: { kind: 'daily_suggestion', focus: { title: expect.stringContaining('听力') } },
      artifact: { artifactId: 'artifact-1', runId: 'run-1' },
    })
    expect(managedGateway.execute).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'daily_suggestion',
      idempotencyKey: 'tracker-ai-123e4567-e89b-42d3-a456-426614174001',
    }))
  })

  it('rejects an invalid managed result instead of inventing a report', async () => {
    const managedGateway: AiGateway = {
      execute: vi.fn(async (gatewayRequest) => ({
        ok: true as const,
        run: {
          runId: 'run-invalid', requestId: gatewayRequest.requestId, productId: 'tracker' as const,
          purpose: gatewayRequest.purpose, status: 'succeeded' as const,
          idempotencyKey: gatewayRequest.idempotencyKey, snapshotId: gatewayRequest.snapshot.snapshotId,
          contextHash: gatewayRequest.snapshot.contextHash, createdAt: NOW.toISOString(), completedAt: NOW.toISOString(),
        },
        artifact: {
          schemaVersion: 1 as const, outputSchemaVersion: 2 as const, artifactId: 'artifact-invalid',
          runId: 'run-invalid', kind: gatewayRequest.purpose, status: 'final' as const,
          content: { schemaVersion: 2, kind: 'learning_analysis' } as unknown as AiStructuredContentV2,
          createdAt: NOW.toISOString(),
          dataAsOf: gatewayRequest.snapshot.dataAsOf, contextHash: gatewayRequest.snapshot.contextHash,
        },
        warnings: [],
      })),
    }

    await expect(executeReadOnlyAi(request(), { managedGateway })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    } satisfies Partial<AiGatewayError>)
  })
})
