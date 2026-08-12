import { useCallback, useEffect, useRef, useState } from 'react'

import {
  LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
  type LexiWordsDailySummaryV1,
} from '@/contracts/lexiCrossProduct'
import { isLocalDate } from '@/lib/localDate'

export type WordsDailySummaryState = {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  summary: LexiWordsDailySummaryV1 | null
  refreshedAt: string | null
}

export type WordsDailySummaryInvoker = (input: {
  expectedUserId: string
  studyDate: string
}) => Promise<unknown>

type UseWordsDailySummaryOptions = {
  userId: string | null
  studyDate: string
  previewSummary?: LexiWordsDailySummaryV1 | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
}

function summaryCount(value: Record<string, unknown>, key: string): number {
  const count = value[key]
  if (!isNonNegativeSafeInteger(count)) {
    throw new Error(`Lexi Words daily summary ${key} is invalid`)
  }
  return count
}

/**
 * Treats the RPC as an external boundary: malformed, cross-product or stale-day
 * payloads never reach the dashboard even when the request itself succeeded.
 */
export function parseWordsDailySummary(
  value: unknown,
  expectedStudyDate: string,
): LexiWordsDailySummaryV1 {
  if (!isLocalDate(expectedStudyDate) || !isRecord(value)) {
    throw new Error('Lexi Words daily summary is invalid')
  }
  if (
    value.contractVersion !== LEXI_CROSS_PRODUCT_CONTRACT_VERSION
    || value.product !== 'words'
    || value.coverage !== 'cloud_data_only'
    || value.studyDate !== expectedStudyDate
  ) {
    throw new Error('Lexi Words daily summary does not match the requested contract')
  }

  const attempts = summaryCount(value, 'attempts')
  const passed = summaryCount(value, 'passed')
  const durationMs = summaryCount(value, 'durationMs')
  const activeWordbooks = summaryCount(value, 'activeWordbooks')
  const activeWords = summaryCount(value, 'activeWords')
  const newWords = summaryCount(value, 'newWords')
  const learningWords = summaryCount(value, 'learningWords')
  const masteredWords = summaryCount(value, 'masteredWords')
  const dueWords = summaryCount(value, 'dueWords')

  if (passed > attempts) {
    throw new Error('Lexi Words daily summary pass count is invalid')
  }
  if (dueWords > masteredWords) {
    throw new Error('Lexi Words daily summary due count is invalid')
  }
  if (newWords + learningWords + masteredWords > activeWords) {
    throw new Error('Lexi Words daily summary word counts are invalid')
  }

  return {
    contractVersion: LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
    product: 'words',
    coverage: 'cloud_data_only',
    studyDate: expectedStudyDate,
    attempts,
    passed,
    durationMs,
    activeWordbooks,
    activeWords,
    newWords,
    learningWords,
    masteredWords,
    dueWords,
  }
}

async function invokeWordsDailySummaryRpc(input: {
  expectedUserId: string
  studyDate: string
}): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) throw new Error('Lexi Words summary is not configured')

  const { data, error } = await supabase.rpc('lexi_get_words_daily_summary', {
    p_expected_user_id: input.expectedUserId,
    p_study_date: input.studyDate,
  })

  if (error) throw new Error('Lexi Words summary is unavailable')
  return data
}

export async function loadWordsDailySummary(
  userId: string,
  studyDate: string,
  invoke: WordsDailySummaryInvoker = invokeWordsDailySummaryRpc,
): Promise<LexiWordsDailySummaryV1> {
  if (!userId.trim() || !isLocalDate(studyDate)) {
    throw new Error('Lexi Words summary request is invalid')
  }
  return parseWordsDailySummary(await invoke({
    expectedUserId: userId,
    studyDate,
  }), studyDate)
}

/**
 * Loads once per mounted dashboard and otherwise refreshes only on an explicit
 * user action. It never polls, persists, or copies Words data into Tracker.
 */
export function useWordsDailySummary({
  userId,
  studyDate,
  previewSummary = null,
}: UseWordsDailySummaryOptions): {
  state: WordsDailySummaryState
  refresh: () => Promise<void>
} {
  const [state, setState] = useState<WordsDailySummaryState>({
    status: 'idle',
    summary: null,
    refreshedAt: null,
  })
  const requestVersion = useRef(0)

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current

    if (previewSummary) {
      setState({
        status: 'ready',
        summary: previewSummary,
        refreshedAt: new Date().toISOString(),
      })
      return
    }
    if (!userId) {
      setState({ status: 'idle', summary: null, refreshedAt: null })
      return
    }

    setState({ status: 'loading', summary: null, refreshedAt: null })
    try {
      const summary = await loadWordsDailySummary(userId, studyDate)
      if (version !== requestVersion.current) return
      setState({
        status: 'ready',
        summary,
        refreshedAt: new Date().toISOString(),
      })
    } catch {
      if (version !== requestVersion.current) return
      setState({ status: 'unavailable', summary: null, refreshedAt: null })
    }
  }, [previewSummary, studyDate, userId])

  useEffect(() => {
    void refresh()
    return () => {
      requestVersion.current += 1
    }
  }, [refresh])

  return { state, refresh }
}

export function createWordsDailySummaryPreview(studyDate: string): LexiWordsDailySummaryV1 {
  return {
    contractVersion: LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
    product: 'words',
    coverage: 'cloud_data_only',
    studyDate,
    attempts: 42,
    passed: 36,
    durationMs: 24 * 60 * 1000,
    activeWordbooks: 3,
    activeWords: 1_286,
    newWords: 184,
    learningWords: 316,
    masteredWords: 786,
    dueWords: 28,
  }
}
