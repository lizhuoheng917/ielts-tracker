import { describe, expect, it } from 'vitest'

import {
  convertLegacyAiArtifacts,
  parseAiArtifactRecordV2,
  type AiArtifactRecordV2,
} from '@/ai/artifactRepository'
import type { AiSuggestion } from '@/stores/aiSuggestionStore'
import type { AnalysisReport } from '@/stores/reportStore'

import {
  BackupApplyError,
  createBackupV3,
  importBackupJson,
  serializeBackupV3,
} from './backupService'
import {
  BACKUP_FORMAT,
  type BackupDataV3,
  type BackupStateAdapter,
  type BackupV3,
} from './backupTypes'
import { BackupValidationError, parseBackupJson } from './backupValidation'

const EXPORTED_AT = '2026-08-02T00:00:00.000Z'
const ACCOUNT_USER_ID = '11111111-1111-4111-8111-111111111111'

const dailySuggestion = {
  schemaVersion: 2 as const,
  kind: 'daily_suggestion' as const,
  headline: '今天先完成一个小目标',
  summary: '用短练习恢复节奏。',
  focus: { title: '完成一次精听', reason: '近期听力样本较少。', estimatedMinutes: 20 },
  actions: [{
    title: '精听一段材料',
    detail: '记录两个失分原因。',
    category: 'listening' as const,
    estimatedMinutes: 20,
  }],
  evidence: ['近 7 天听力练习 1 次'],
  limitations: ['没有题型明细'],
}

const learningAnalysis = {
  schemaVersion: 2 as const,
  kind: 'learning_analysis' as const,
  title: '练习节奏正在形成',
  conclusion: '总体频率稳定，但科目分布仍不均衡。',
  insights: [{
    type: 'risk' as const,
    title: '口语样本不足',
    finding: '口语练习少于其他科目。',
    evidence: '近 30 天口语 1 次',
  }],
  actions: [{
    priority: 'high' as const,
    title: '完成一次口语录音',
    reason: '先补足可分析的样本。',
    estimatedMinutes: 15,
  }],
  limitations: ['未包含外部模考记录'],
}

const planDraft = {
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

function planCommandDraft() {
  const draftId = '123e4567-e89b-42d3-a456-426614174311'
  return {
    schemaVersion: 1 as const,
    draftId,
    runId: 'run-plan-1',
    action: 'plan.create' as const,
    targetScope: 'plans' as const,
    payload: planDraft.plans[0],
    idempotencyKey: `tracker-plan-create:${draftId}`,
    context: {
      snapshotId: 'snapshot-plan-1',
      contextHash: 'context-plan-1',
      sourceRevision: 'source-plan-1',
      routeMode: 'managed' as const,
      accountScopeId: `managed:${ACCOUNT_USER_ID}`,
      generatedAt: '2026-08-02T00:00:00.000Z',
      expiresAt: '2026-08-03T00:00:00.000Z',
    },
    confirmation: { required: true as const, status: 'pending' as const },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  }
}

function structuredLegacySuggestion(): AiSuggestion {
  return {
    content: 'legacy daily projection',
    createdAt: '2026-08-01T00:00:00.000Z',
    schemaVersion: 2,
    structuredContent: dailySuggestion,
    metadata: {
      source: 'managed',
      dataAsOf: '2026-08-01T00:00:00.000Z',
      rangeDays: 7,
      runId: 'run-1',
      warnings: [],
    },
  }
}

function structuredLegacyReport(): AnalysisReport {
  return {
    id: 'report-1',
    title: learningAnalysis.title,
    content: 'legacy analysis projection',
    createdAt: '2026-08-01T00:00:00.000Z',
    type: 'learning_analysis',
    metadata: {
      outputSchemaVersion: 2,
      structuredContent: learningAnalysis,
    },
  }
}

function emptyData(): BackupDataV3 {
  return {
    words: [],
    practice: [],
    timer: [],
    plans: [],
    executions: [],
    diary: [],
    dailyCheckins: [],
    writingReports: [],
    chatConversations: {},
    aiArtifacts: [],
    achievements: {
      unlockedBadges: [],
      totalXP: 0,
      level: 1,
      statsViewCount: 0,
    },
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: '',
      heatmapData: {},
    },
    settings: {
      showExamCountdown: true,
      showAiSuggestions: true,
      theme: 'light',
    },
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function adapterFor(data: BackupDataV3): BackupStateAdapter {
  return {
    read: () => clone(data),
    write: () => undefined,
  }
}

function legacyV2From(
  data: BackupDataV3,
  options: {
    exportedAt?: string
    reports?: AnalysisReport[]
    suggestion?: AiSuggestion | null
  } = {},
): Record<string, unknown> {
  const { aiArtifacts: _aiArtifacts, ...commonData } = clone(data)
  return {
    format: BACKUP_FORMAT,
    version: 2,
    exportedAt: options.exportedAt ?? EXPORTED_AT,
    data: {
      ...commonData,
      reports: options.reports ?? [],
      aiSuggestion: options.suggestion ?? null,
    },
  }
}

function accountOwned(artifact: AiArtifactRecordV2): AiArtifactRecordV2 {
  return parseAiArtifactRecordV2({
    ...artifact,
    owner: { scope: 'account', accountUserId: ACCOUNT_USER_ID },
  })
}

describe('backup v3', () => {
  it('exports one portable AI artifact collection without legacy AI stores or secrets', () => {
    const data = emptyData()
    data.writingReports.push({
      id: 'writing-1',
      essayType: 'task2',
      essayContent: 'Essay',
      scores: { tr_ta: 6, cc: 6, lr: 6, gra: 6, total: 6 },
      feedback: 'Feedback',
      suggestions: ['Revise'],
      createdAt: '2026-08-01T00:00:00.000Z',
    })
    data.chatConversations.plans = [{
      id: 'message-1',
      role: 'assistant',
      content: 'Plan',
      createdAt: '2026-08-01T00:00:00.000Z',
      status: 'done',
    }]
    data.aiArtifacts = [
      accountOwned(convertLegacyAiArtifacts(structuredLegacySuggestion(), [])[0]),
    ]
    data.dailyCheckins.push({
      id: '2026-08-01',
      date: '2026-08-01',
      awardedXP: 10,
      awardedAt: '2026-08-01T08:00:00.000Z',
      source: 'manual',
    })
    const dataWithPrivateRuntimeFields = data as BackupDataV3 & {
      activityLedger: { secret: string }
      mutationJournal: { secret: string }
      aiPreferences: { providerPreset: string; apiKey: string; baseURL: string; model: string }
    }
    dataWithPrivateRuntimeFields.activityLedger = { secret: 'private-ledger-marker' }
    dataWithPrivateRuntimeFields.mutationJournal = { secret: 'private-journal-marker' }
    dataWithPrivateRuntimeFields.aiPreferences = {
      providerPreset: 'private-provider-preset-marker',
      apiKey: 'private-api-key-marker',
      baseURL: 'https://private-endpoint-marker.test/v1',
      model: 'private-model-marker',
    }

    const serialized = serializeBackupV3(adapterFor(data))
    const parsed = JSON.parse(serialized) as BackupV3 & { apiKey?: string }

    expect(parsed.version).toBe(3)
    expect(parsed.data.writingReports).toHaveLength(1)
    expect(parsed.data.chatConversations.plans).toHaveLength(1)
    expect(parsed.data.aiArtifacts).toHaveLength(1)
    expect(parsed.data.aiArtifacts[0].owner).toEqual({ scope: 'local' })
    expect(parsed.data).not.toHaveProperty('reports')
    expect(parsed.data).not.toHaveProperty('aiSuggestion')
    expect(parsed.data.dailyCheckins).toEqual(data.dailyCheckins)
    expect(parsed.apiKey).toBeUndefined()
    expect(serialized).not.toContain(ACCOUNT_USER_ID)
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('aiPreferences')
    expect(serialized).not.toContain('private-api-key-marker')
    expect(serialized).not.toContain('private-provider-preset-marker')
    expect(serialized).not.toContain('private-endpoint-marker')
    expect(serialized).not.toContain('private-model-marker')
    expect(serialized).not.toContain('private-ledger-marker')
    expect(serialized).not.toContain('private-journal-marker')
  })

  it('round-trips validated V3 artifacts and normalizes imported ownership to local', () => {
    const data = emptyData()
    data.aiArtifacts = convertLegacyAiArtifacts(structuredLegacySuggestion(), [structuredLegacyReport()])
    const archive = createBackupV3(adapterFor(data), EXPORTED_AT)
    archive.data.aiArtifacts[0] = accountOwned(archive.data.aiArtifacts[0])

    const result = parseBackupJson(JSON.stringify(archive), emptyData())

    expect(result.sourceVersion).toBe(3)
    expect(result.backup.version).toBe(3)
    expect(result.backup.data.aiArtifacts).toHaveLength(2)
    expect(result.backup.data.aiArtifacts.every(
      (artifact) => artifact.owner.scope === 'local',
    )).toBe(true)
  })

  it('round-trips strict plan drafts and durable idempotency receipts', () => {
    const data = emptyData()
    const command = planCommandDraft()
    const sourceContext = `plans:managed:${ACCOUNT_USER_ID}`
    data.chatConversations[sourceContext] = [{
      id: 'message-plan-1',
      role: 'assistant',
      content: '计划草稿',
      createdAt: EXPORTED_AT,
      status: 'done',
      planDraft,
      commandDrafts: [command],
    }]
    data.planCommandReceipts = [{
      schemaVersion: 1,
      receiptId: 'receipt-plan-1',
      draftId: command.draftId,
      action: 'plan.create',
      idempotencyKey: command.idempotencyKey,
      status: 'applied',
      createdAt: EXPORTED_AT,
      targetId: command.draftId,
    }]

    const result = parseBackupJson(serializeBackupV3(adapterFor(data)), emptyData())
    const portableContext = Object.keys(result.backup.data.chatConversations).find((context) => (
      context.startsWith('plans:managed:unbound:')
    ))
    expect(portableContext).toBeDefined()
    expect(result.backup.data.chatConversations[portableContext!][0]).toMatchObject({
      planDraft: { kind: 'plan_draft' },
      commandDrafts: [{
        action: 'plan.create',
        context: { accountScopeId: 'managed:unbound' },
      }],
    })
    expect(result.backup.data.planCommandReceipts).toEqual(data.planCommandReceipts)
    expect(JSON.stringify(result.backup)).not.toContain(ACCOUNT_USER_ID)

    const invalid = createBackupV3(adapterFor(data))
    const invalidContext = Object.keys(invalid.data.chatConversations).find((context) => (
      context.startsWith('plans:managed:unbound:')
    ))!
    const invalidMessage = invalid.data.chatConversations[invalidContext][0]
    invalidMessage.commandDrafts![0].payload.weekDays = []
    expect(() => parseBackupJson(JSON.stringify(invalid), emptyData()))
      .toThrow(BackupValidationError)
  })

  it('accepts V2, converts its two legacy AI stores, and strips AI routing', () => {
    const incoming = emptyData()
    incoming.settings.theme = 'dark'
    const legacyV2 = legacyV2From(incoming, {
      reports: [structuredLegacyReport()],
      suggestion: structuredLegacySuggestion(),
    })
    ;(legacyV2.data as Record<string, unknown>).aiPreferences = {
      providerPreset: 'attacker-provider-preset',
      apiKey: 'legacy-v2-secret-must-be-ignored',
      baseURL: 'https://attacker.invalid/v1',
      model: 'attacker-controlled-model',
    }

    let written: BackupDataV3 | null = null
    const result = importBackupJson(JSON.stringify(legacyV2), {
      read: () => emptyData(),
      write: (data) => {
        written = clone(data)
      },
    })

    expect(result.sourceVersion).toBe(2)
    expect(result.backup.version).toBe(3)
    expect(result.backup.data.settings.theme).toBe('dark')
    expect(result.backup.data.aiArtifacts.map((artifact) => artifact.kind).sort()).toEqual([
      'daily_suggestion',
      'learning_analysis',
    ])
    expect(result.backup.data).not.toHaveProperty('reports')
    expect(result.backup.data).not.toHaveProperty('aiSuggestion')
    expect(result.backup.data).not.toHaveProperty('aiPreferences')
    expect(written).toEqual(result.backup.data)
    expect(JSON.stringify(result.backup)).not.toContain('legacy-v2-secret-must-be-ignored')
    expect(JSON.stringify(result.backup)).not.toContain('attacker-provider-preset')
    expect(JSON.stringify(result.backup)).not.toContain('attacker.invalid')
    expect(JSON.stringify(result.backup)).not.toContain('attacker-controlled-model')
  })

  it('migrates a pre-daily-checkin V2 backup before producing V3', () => {
    const data = emptyData()
    data.executions = [
      { id: 'completed-first', planId: 'plan-1', date: '2026-07-30', isCompleted: true },
      { id: 'completed-same-day', planId: 'plan-2', date: '2026-07-30', isCompleted: true },
      { id: 'pending', planId: 'plan-3', date: '2026-07-29', isCompleted: false },
    ]
    data.settings.lastCheckinDate = '2026-07-31'
    const backup = legacyV2From(data, { exportedAt: EXPORTED_AT })
    delete (backup.data as Record<string, unknown>).dailyCheckins

    const result = parseBackupJson(JSON.stringify(backup), emptyData())

    expect(result.backup.data.dailyCheckins).toEqual([
      {
        id: '2026-07-30',
        date: '2026-07-30',
        awardedXP: 0,
        awardedAt: EXPORTED_AT,
        source: 'migration',
        sourceEntityId: 'completed-first',
      },
      {
        id: '2026-07-31',
        date: '2026-07-31',
        awardedXP: 0,
        awardedAt: EXPORTED_AT,
        source: 'migration',
      },
    ])
  })

  it('preserves an explicitly supplied canonical daily-checkin collection', () => {
    const data = emptyData()
    data.executions = [
      { id: 'completed', planId: 'plan-1', date: '2026-07-30', isCompleted: true },
    ]
    data.settings.lastCheckinDate = '2026-07-31'
    data.dailyCheckins = []

    const result = parseBackupJson(
      JSON.stringify(createBackupV3(adapterFor(data), EXPORTED_AT)),
      emptyData(),
    )

    expect(result.backup.data.dailyCheckins).toEqual([])
  })

  it('fully validates before making the first write', () => {
    const data = emptyData()
    const invalid = createBackupV3(adapterFor(data))
    ;(invalid.data as unknown as { words: unknown[] }).words = [{ id: 'incomplete' }]
    let writes = 0
    const adapter: BackupStateAdapter = {
      read: () => clone(data),
      write: () => {
        writes += 1
      },
    }

    expect(() => importBackupJson(JSON.stringify(invalid), adapter)).toThrow(BackupValidationError)
    expect(writes).toBe(0)
  })

  it('rejects duplicate canonical and artifact record ids before writes', () => {
    const data = emptyData()
    const record = {
      id: 'duplicate-word',
      date: '2026-08-01',
      category: 'academic',
      count: 10,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }
    data.words = [record, { ...record }]
    const duplicateArtifact = convertLegacyAiArtifacts(structuredLegacySuggestion(), [])[0]
    data.aiArtifacts = [duplicateArtifact, clone(duplicateArtifact)]

    expect(() => parseBackupJson(
      JSON.stringify(createBackupV3(adapterFor(data))),
      emptyData(),
    )).toThrow(BackupValidationError)
  })

  it('keeps legacy semantic execution duplicates importable for startup repair', () => {
    const data = emptyData()
    data.executions = [
      { id: 'canonical', planId: 'plan-1', date: '2026-08-01', isCompleted: true },
      { id: 'semantic-duplicate', planId: 'plan-1', date: '2026-08-01', isCompleted: false },
    ]

    const result = parseBackupJson(
      JSON.stringify(createBackupV3(adapterFor(data))),
      emptyData(),
    )

    expect(result.backup.data.executions).toEqual(data.executions)
  })

  it('rolls every collection, including artifacts, back after an apply failure', () => {
    const before = emptyData()
    before.settings.theme = 'dark'
    before.aiArtifacts = convertLegacyAiArtifacts(
      { content: 'before suggestion', createdAt: '2026-07-31T00:00:00.000Z' },
      [],
    )
    const incoming = emptyData()
    incoming.settings.theme = 'light'
    incoming.aiArtifacts = convertLegacyAiArtifacts(null, [structuredLegacyReport()])
    const serialized = serializeBackupV3(adapterFor(incoming))
    let state = clone(before)
    let writes = 0
    const adapter: BackupStateAdapter = {
      read: () => clone(state),
      write: (data) => {
        state = clone(data)
        writes += 1
        if (writes === 1) throw new Error('simulated storage failure')
      },
    }

    expect(() => importBackupJson(serialized, adapter)).toThrow(BackupApplyError)
    expect(writes).toBe(2)
    expect(state).toEqual(before)
  })

  it('rolls artifacts back when post-import binding invalidation fails', () => {
    const before = emptyData()
    before.aiArtifacts = convertLegacyAiArtifacts(
      { content: 'before suggestion', createdAt: '2026-07-31T00:00:00.000Z' },
      [],
    )
    const incoming = emptyData()
    incoming.aiArtifacts = convertLegacyAiArtifacts(null, [structuredLegacyReport()])
    let state = clone(before)
    let writes = 0
    const adapter: BackupStateAdapter = {
      read: () => clone(state),
      write: (data) => {
        state = clone(data)
        writes += 1
      },
      afterSuccessfulImport: () => {
        throw new Error('simulated binding invalidation failure')
      },
    }

    expect(() => importBackupJson(serializeBackupV3(adapterFor(incoming)), adapter))
      .toThrow(BackupApplyError)
    expect(writes).toBe(2)
    expect(state.aiArtifacts).toEqual(before.aiArtifacts)
  })

  it('migrates V1 while preserving fields and artifact kinds it never supplied', () => {
    const current = emptyData()
    current.chatConversations.plans = [{
      id: 'existing-chat',
      role: 'user',
      content: 'keep me',
      createdAt: '2026-08-01T00:00:00.000Z',
    }]
    current.achievements.statsViewCount = 9
    current.aiArtifacts = convertLegacyAiArtifacts(structuredLegacySuggestion(), [])

    const result = parseBackupJson(JSON.stringify({
      version: 1,
      words: [{
        id: 'word-1',
        date: '2026-08-01',
        category: 'academic',
        count: 20,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }],
      executions: [
        { id: 'execution-1', planId: 'plan-1', date: '2026-07-30', isCompleted: true },
      ],
      reports: [structuredLegacyReport()],
      settings: {
        examDate: '2026-09-01',
        theme: 'dark',
        lastCheckinDate: '2026-07-31',
      },
      achievements: { totalXP: 10, level: 1, unlockedBadges: [] },
      aiConfig: {
        apiKey: 'legacy-secret-must-be-ignored',
        baseURL: 'https://legacy.test/v1',
        model: 'legacy-model',
      },
    }), current)

    expect(result.sourceVersion).toBe(1)
    expect(result.backup.version).toBe(3)
    expect(result.backup.data.words).toHaveLength(1)
    expect(result.backup.data.chatConversations.plans[0].id).toBe('existing-chat')
    expect(result.backup.data.achievements.statsViewCount).toBe(9)
    expect(result.backup.data.aiArtifacts.map((artifact) => artifact.kind).sort()).toEqual([
      'daily_suggestion',
      'learning_analysis',
    ])
    expect(result.backup.data.dailyCheckins.map((award) => award.date)).toEqual([
      '2026-07-30',
      '2026-07-31',
    ])
    expect(JSON.stringify(result.backup)).not.toContain('legacy-secret-must-be-ignored')
    expect(JSON.stringify(result.backup)).not.toContain('https://legacy.test/v1')
    expect(JSON.stringify(result.backup)).not.toContain('legacy-model')
  })

  it('rejects malformed structured AI content from a V2 archive', () => {
    const malformedSuggestion = {
      ...structuredLegacySuggestion(),
      structuredContent: {
        schemaVersion: 2,
        kind: 'daily_suggestion',
        headline: '缺少必要字段',
      },
    } as unknown as AiSuggestion
    const legacyV2 = legacyV2From(emptyData(), { suggestion: malformedSuggestion })

    expect(() => parseBackupJson(JSON.stringify(legacyV2), emptyData()))
      .toThrow(BackupValidationError)
  })

  it('rejects malformed V3 artifacts and unsupported backup versions', () => {
    const data = emptyData()
    data.aiArtifacts = convertLegacyAiArtifacts(structuredLegacySuggestion(), [])
    const invalid = createBackupV3(adapterFor(data))
    ;(invalid.data.aiArtifacts[0] as unknown as Record<string, unknown>).owner = {
      scope: 'account',
      accountUserId: 'not-a-valid-account-id',
    }

    expect(() => parseBackupJson(JSON.stringify(invalid), emptyData()))
      .toThrow(BackupValidationError)
    expect(() => parseBackupJson('{"version":4}', emptyData()))
      .toThrow('仅支持备份版本 1、2 或 3')
  })
})
