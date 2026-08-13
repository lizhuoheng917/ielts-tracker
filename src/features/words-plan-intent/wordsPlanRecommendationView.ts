import { isLocalDate } from '@/lib/localDate'
import {
  AI_OUTPUT_SCHEMA_VERSION,
  type WordsPlanRecommendationV2,
} from '@/ai/structuredOutputs'

export interface WordsPlanRecommendationTaskContext {
  sourcePlanId: string | null
  targetDate: string
  snapshotContextHash: string
  wordsGeneratedAt: string
}

export const WORDS_PLAN_CONFIDENCE_LABELS: Record<WordsPlanRecommendationV2['confidence'], string> = {
  low: '谨慎参考',
  medium: '中等把握',
  high: '较高把握',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseWordsPlanRecommendationTaskContext(
  value: unknown,
): WordsPlanRecommendationTaskContext | null {
  if (!isRecord(value)) return null
  const expected = ['sourcePlanId', 'targetDate', 'snapshotContextHash', 'wordsGeneratedAt']
  const keys = Object.keys(value).sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== [...expected].sort()[index])) {
    return null
  }
  if (
    !(
      value.sourcePlanId === null
      || (
        typeof value.sourcePlanId === 'string'
        && Boolean(value.sourcePlanId.trim())
        && value.sourcePlanId.length <= 160
      )
    )
    || !isLocalDate(value.targetDate)
    || typeof value.snapshotContextHash !== 'string'
    || !/^words-plan-ctx-[0-9a-f]{8}$/.test(value.snapshotContextHash)
    || typeof value.wordsGeneratedAt !== 'string'
    || !Number.isFinite(Date.parse(value.wordsGeneratedAt))
  ) return null
  return {
    sourcePlanId: value.sourcePlanId as string | null,
    targetDate: value.targetDate,
    snapshotContextHash: value.snapshotContextHash,
    wordsGeneratedAt: value.wordsGeneratedAt,
  }
}

export function wordsPlanRecommendationTaskNamespace(planId: string): string {
  return `plans-to-words:${planId.slice(0, 160)}`
}

export function resolveWordsPlanningTimeZone(
  resolve: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  try {
    const value = resolve().trim()
    if (value && new TextEncoder().encode(value).length <= 64) return value
  } catch {
    // UTC is accepted by the server and keeps the request deterministic when
    // a privacy-focused browser withholds the local IANA time zone.
  }
  return 'UTC'
}

export function wordsPlanFormFingerprint(
  targetDate: string,
  targetCount: number,
  studyMode: WordsPlanRecommendationV2['studyMode'],
): string {
  return JSON.stringify({ targetDate, targetCount, studyMode })
}

export function createWordsPlanRecommendationPreview(
  targetDate: string,
): WordsPlanRecommendationV2 {
  if (!isLocalDate(targetDate)) throw new Error('Preview target date is invalid')
  return {
    schemaVersion: AI_OUTPUT_SCHEMA_VERSION,
    kind: 'words_plan_recommendation',
    targetDate,
    studyMode: 'mixed',
    targetCount: 26,
    reviewWords: 18,
    newWords: 8,
    estimatedMinutes: 25,
    confidence: 'medium',
    summary: '先完成到期复习，再加入适量新词；历史目标兑现稳定，因此只做小幅上调。',
    evidence: [
      'Tracker 近 30 天可比较记录的目标兑现率为 86.1%，校准目标为 26 词。',
      'Words 显示目标日前有 35 个到期词，近 7 天活跃 5 天。',
    ],
    risks: ['如果当天其他计划耗时增加，可优先保留复习词并减少新词。'],
    limitations: ['Words 只统计已同步到云端的数据，最终词单仍需在 Words 中确认。'],
  }
}

export function wordsPlanAnalysisFallbackMessage(): string {
  return '暂时无法读取 Words 的云端学习摘要，或当前没有足够数据可供分析。你仍可以手动填写并发送。'
}
