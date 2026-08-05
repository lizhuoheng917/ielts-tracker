import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDailySuggestionArtifactV2,
  createWritingFeedbackArtifactV2,
  listAiArtifactsForAccess,
} from '@/ai/artifactRepository'
import type { DailySuggestionV2 } from '@/ai/structuredOutputs'
import {
  WRITING_RUBRIC_VERSION,
  createWritingSubmissionV2,
  type WritingFeedbackV2,
} from '@/ai/writingFeedback'

let storeModule: typeof import('./aiArtifactStore')

const ACCOUNT_A = '123e4567-e89b-42d3-a456-426614174001'
const ACCOUNT_B = '123e4567-e89b-42d3-a456-426614174002'
const CREATED_AT = '2026-08-02T00:00:00.000Z'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  failWrites = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.values.set(key, value)
  }
}

let storage: MemoryStorage

const content: DailySuggestionV2 = {
  schemaVersion: 2,
  kind: 'daily_suggestion',
  headline: '完成一次短练习',
  summary: '先建立一条学习记录。',
  focus: { title: '听力基线', reason: '样本较少。', estimatedMinutes: 20 },
  actions: [{ title: '完成听力', detail: '记录结果。', category: 'listening', estimatedMinutes: 20 }],
  evidence: ['记录不足。'],
  limitations: ['无法判断长期趋势。'],
}

const writingSubmission = createWritingSubmissionV2({
  module: 'academic',
  task: 'task2',
  promptText: 'Public transport should be affordable. Do you agree?',
  sourceMaterial: { kind: 'none' },
  essayText: 'I support affordable transport because it reduces traffic and helps working families.',
})

function writingFeedback(summary = '立场明确，但论证需要展开。'): WritingFeedbackV2 {
  return {
    schemaVersion: 2,
    kind: 'writing_feedback',
    rubricVersion: WRITING_RUBRIC_VERSION,
    assessmentStatus: 'scored',
    estimatedOverallBand: 6.5,
    taskCriterion: 'task_response',
    summary,
    criteria: {
      task: { band: 6.5, summary: '回应题目。', evidence: ['I support affordable transport'], improvement: '展开理由。' },
      coherenceCohesion: { band: 6, summary: '因果清楚。', evidence: ['because it reduces traffic'], improvement: '增加衔接。' },
      lexicalResource: { band: 6.5, summary: '主题词汇恰当。', evidence: ['affordable transport'], improvement: '提高精确度。' },
      grammaticalRangeAccuracy: { band: 6, summary: '句子基本准确。', evidence: ['helps working families'], improvement: '增加句式变化。' },
    },
    strengths: [{ title: '立场明确', evidence: 'I support affordable transport' }],
    priorities: [{ title: '展开理由', reason: '解释较短。', example: '说明公共交通如何减少拥堵。' }],
    paragraphFeedback: [],
    corrections: [],
    limitations: [],
  }
}

const writingInput = {
  submission: writingSubmission,
  feedback: writingFeedback(),
  recordId: 'writing-store-1',
  source: 'custom' as const,
  dataAsOf: CREATED_AT,
  createdAt: CREATED_AT,
  savedAt: CREATED_AT,
}

describe('AI artifact Zustand repository', () => {
  beforeEach(async () => {
    vi.resetModules()
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    storeModule = await import('./aiArtifactStore')
    storeModule.useAiArtifactStore.setState({
      artifacts: [],
      migration: { version: 1, status: 'pending', importedCount: 0 },
    })
  })

  it('adopts local records after binding and blocks another account from deleting them', () => {
    const { useAiArtifactStore } = storeModule
    const store = useAiArtifactStore.getState()
    const artifact = store.saveDailySuggestion({
      content,
      source: 'custom',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
    }, { status: 'ready', mode: 'device' })

    expect(store.adoptLocalArtifacts(ACCOUNT_A)).toBe(1)
    expect(useAiArtifactStore.getState().artifacts[0].owner).toEqual({ scope: 'account', accountUserId: ACCOUNT_A })
    expect(useAiArtifactStore.getState().deleteArtifact(artifact.recordId, {
      status: 'ready',
      mode: 'account',
      accountUserId: ACCOUNT_B,
    })).toBe(false)
    expect(useAiArtifactStore.getState().deleteArtifact(artifact.recordId, {
      status: 'ready',
      mode: 'device',
    })).toBe(false)
    expect(listAiArtifactsForAccess(useAiArtifactStore.getState().artifacts, {
      status: 'locked',
      reason: 'account-mismatch',
    })).toHaveLength(0)
  })

  it('imports legacy Zustand envelopes once without deleting the old key', () => {
    const { ensureAiArtifactRepositoryInitialized, useAiArtifactStore } = storeModule
    const storage = localStorage
    storage.setItem('ielts-tracker:aiSuggestion', JSON.stringify({
      state: { suggestion: { content: '旧建议', createdAt: CREATED_AT } },
      version: 0,
    }))
    expect(ensureAiArtifactRepositoryInitialized(storage)).toBe(1)
    expect(ensureAiArtifactRepositoryInitialized(storage)).toBe(0)
    expect(storage.getItem('ielts-tracker:aiSuggestion')).toContain('旧建议')
    expect(useAiArtifactStore.getState().artifacts).toHaveLength(1)
  })

  it('rolls memory back when persistence fails', () => {
    const { useAiArtifactStore } = storeModule
    storage.failWrites = true

    expect(() => useAiArtifactStore.getState().saveDailySuggestion({
      content,
      source: 'custom',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
    }, { status: 'ready', mode: 'device' })).toThrow('Quota exceeded')
    expect(useAiArtifactStore.getState().artifacts).toHaveLength(0)
  })

  it('persists writing feedback, returns the canonical artifact on retry and rejects collisions', () => {
    const { useAiArtifactStore } = storeModule
    const first = useAiArtifactStore.getState().saveWritingFeedback(
      writingInput,
      { status: 'ready', mode: 'device' },
    )
    expect(first).toMatchObject({
      kind: 'writing_feedback',
      content: {
        overallBand: 6.5,
        feedback: { estimatedOverallBand: 6.5 },
        submission: { essayText: writingSubmission.essayText },
      },
    })
    expect(storage.getItem('ielts-tracker:aiArtifactsV2')).toContain(writingSubmission.essayText)

    storage.failWrites = true
    const retry = useAiArtifactStore.getState().saveWritingFeedback({
      ...writingInput,
      savedAt: '2026-08-02T00:01:00.000Z',
    }, { status: 'ready', mode: 'device' })
    expect(retry).toBe(first)
    expect(useAiArtifactStore.getState().artifacts).toEqual([first])

    expect(() => useAiArtifactStore.getState().saveWritingFeedback({
      ...writingInput,
      feedback: writingFeedback('相同标识不能保存另一份反馈。'),
    }, { status: 'ready', mode: 'device' })).toThrow(/identifier collision/)
    expect(useAiArtifactStore.getState().artifacts).toEqual([first])
  })

  it('rolls a new writing report out of memory when persistence fails', () => {
    const { useAiArtifactStore } = storeModule
    storage.failWrites = true
    expect(() => useAiArtifactStore.getState().saveWritingFeedback(
      { ...writingInput, recordId: 'writing-store-failed' },
      { status: 'ready', mode: 'device' },
    )).toThrow('Quota exceeded')
    expect(useAiArtifactStore.getState().artifacts).toHaveLength(0)
  })

  it('preserves malformed repository bytes and blocks initialization writes', async () => {
    const corruptedStorage = new MemoryStorage()
    const corruptedRaw = '{"state":'
    corruptedStorage.setItem('ielts-tracker:aiArtifactsV2', corruptedRaw)
    vi.resetModules()
    vi.stubGlobal('localStorage', corruptedStorage)
    const corruptedModule = await import('./aiArtifactStore')

    expect(corruptedModule.useAiArtifactStore.getState().integrity.status).toBe('corrupt')
    expect(() => corruptedModule.ensureAiArtifactRepositoryInitialized(corruptedStorage)).toThrow('无法完整校验')
    expect(corruptedStorage.getItem('ielts-tracker:aiArtifactsV2')).toBe(corruptedRaw)
  })

  it('does not silently discard one malformed record from an otherwise valid envelope', async () => {
    const validArtifact = createDailySuggestionArtifactV2({
      content,
      source: 'custom',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
    }, { status: 'ready', mode: 'device' })
    const mixedStorage = new MemoryStorage()
    const mixedRaw = JSON.stringify({
      state: {
        artifacts: [validArtifact, { repositorySchemaVersion: 2, recordId: 'broken' }],
        migration: { version: 1, status: 'complete', importedCount: 1 },
      },
      version: 2,
    })
    mixedStorage.setItem('ielts-tracker:aiArtifactsV2', mixedRaw)
    vi.resetModules()
    vi.stubGlobal('localStorage', mixedStorage)
    const mixedModule = await import('./aiArtifactStore')

    expect(mixedModule.useAiArtifactStore.getState().integrity.status).toBe('corrupt')
    expect(() => mixedModule.useAiArtifactStore.getState().saveDailySuggestion({
      content,
      source: 'custom',
      dataAsOf: CREATED_AT,
      createdAt: CREATED_AT,
    }, { status: 'ready', mode: 'device' })).toThrow('需要恢复')
    expect(mixedStorage.getItem('ielts-tracker:aiArtifactsV2')).toBe(mixedRaw)
  })

  it('fails closed on a persisted writing report whose Markdown was changed independently', async () => {
    const valid = createWritingFeedbackArtifactV2(
      writingInput,
      { status: 'ready', mode: 'device' },
    )
    const tampered = { ...valid, markdownProjection: `${valid.markdownProjection}\n伪造内容` }
    const tamperedStorage = new MemoryStorage()
    const raw = JSON.stringify({
      state: {
        artifacts: [tampered],
        migration: { version: 1, status: 'complete', importedCount: 1 },
      },
      version: 2,
    })
    tamperedStorage.setItem('ielts-tracker:aiArtifactsV2', raw)
    vi.resetModules()
    vi.stubGlobal('localStorage', tamperedStorage)
    const tamperedModule = await import('./aiArtifactStore')

    expect(tamperedModule.useAiArtifactStore.getState().integrity.status).toBe('corrupt')
    expect(tamperedStorage.getItem('ielts-tracker:aiArtifactsV2')).toBe(raw)
  })
})
