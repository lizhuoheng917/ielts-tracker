import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Target } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { LexiWordsPlanningContextV1 } from '@/contracts/lexiCrossProduct'
import {
  createWordsPlanningContextPreview,
  describeWordsExecutionProgress,
  loadWordsPlanningContext,
} from '@/features/words-planning/wordsPlanningContext'
import { toLocalDate } from '@/lib/localDate'
import { resolveWordsPlanningTimeZone } from './wordsPlanRecommendationView'

type ProgressStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

interface Props {
  userId: string | null
  preview?: boolean
}

export function WordsExecutionProgress({ userId, preview = false }: Props) {
  const targetDate = toLocalDate()
  const [status, setStatus] = useState<ProgressStatus>('idle')
  const [context, setContext] = useState<LexiWordsPlanningContextV1 | null>(null)
  const requestVersion = useRef(0)

  const refresh = useCallback(async () => {
    const version = requestVersion.current + 1
    requestVersion.current = version
    if (preview) {
      setContext(createWordsPlanningContextPreview(targetDate))
      setStatus('ready')
      return
    }
    if (!userId) {
      setContext(null)
      setStatus('idle')
      return
    }
    setStatus('loading')
    try {
      const next = await loadWordsPlanningContext(
        userId,
        targetDate,
        resolveWordsPlanningTimeZone(),
      )
      if (requestVersion.current !== version) return
      setContext(next)
      setStatus('ready')
    } catch {
      if (requestVersion.current !== version) return
      setContext(null)
      setStatus('unavailable')
    }
  }, [preview, targetDate, userId])

  useEffect(() => {
    void refresh()
    return () => {
      requestVersion.current += 1
    }
  }, [refresh])

  useEffect(() => {
    if (preview || !userId || typeof window === 'undefined') return
    const refreshOnFocus = () => { void refresh() }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [preview, refresh, userId])

  const progress = context ? describeWordsExecutionProgress(context) : null
  const percent = progress?.completionRate ?? 0

  return (
    <div className="mt-3 rounded-xl border border-border/75 bg-background/70 px-3 py-3" aria-label="Words 今日执行进度">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Target className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Words 今日执行</p>
            <p className="truncate text-[11px] text-muted-foreground">按需读取已同步的云端进度</p>
          </div>
        </div>
        {(status === 'ready' || status === 'unavailable') && !preview && userId && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => { void refresh() }}
            aria-label="刷新 Words 今日执行进度"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      {status === 'loading' && !context && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          正在读取 Words 今日进度…
        </p>
      )}

      {status === 'idle' && !userId && !preview && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">登录同一个 Lexi 账号后即可查看。</p>
      )}

      {status === 'unavailable' && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground" role="status">暂时未读取到 Words 进度，可稍后刷新。</p>
      )}

      {status === 'ready' && progress && progress.plannedWords === 0 && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Words 今日暂无已确认的词汇目标。</p>
      )}

      {status === 'ready' && progress && progress.plannedWords > 0 && (
        <div className="mt-3 space-y-2.5">
          <dl className="grid grid-cols-3 gap-2">
            <div>
              <dt className="text-[11px] text-muted-foreground">已完成</dt>
              <dd className="mt-0.5 text-base font-semibold tabular-nums">{progress.completedWords}<span className="ml-0.5 text-[11px] font-normal text-muted-foreground">词</span></dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">今日目标</dt>
              <dd className="mt-0.5 text-base font-semibold tabular-nums">{progress.plannedWords}<span className="ml-0.5 text-[11px] font-normal text-muted-foreground">词</span></dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">剩余</dt>
              <dd className="mt-0.5 text-base font-semibold tabular-nums">{progress.remainingWords}<span className="ml-0.5 text-[11px] font-normal text-muted-foreground">词</span></dd>
            </div>
          </dl>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            新词 {progress.completedNewWords}/{progress.plannedNewWords} · 复习 {progress.completedReviewWords}/{progress.plannedReviewWords}
          </p>
        </div>
      )}
    </div>
  )
}
