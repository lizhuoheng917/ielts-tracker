import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import type {
  LexiCrossProductHandoffStatus,
  LexiCrossProductHandoffV1,
} from '@/contracts/lexiCrossProduct'
import {
  createPreviewWordsPlanReceipt,
  listWordsPlanReceipts,
} from './wordsPlanReceipt'

const CACHE_TTL_MS = 30_000
const RETURN_REFRESH_THROTTLE_MS = 5_000
const MAX_CACHE_ENTRIES = 8

type CacheEntry = {
  fetchedAt: number
  receipts: Map<string, LexiCrossProductHandoffV1>
}

const receiptCache = new Map<string, CacheEntry>()
const receiptRequests = new Map<string, Promise<Map<string, LexiCrossProductHandoffV1>>>()

function trimCache() {
  while (receiptCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = receiptCache.keys().next().value
    if (typeof oldestKey !== 'string') return
    receiptCache.delete(oldestKey)
  }
}

async function loadReceipts(
  userId: string,
  sourceRefs: readonly string[],
  cacheKey: string,
  force: boolean,
): Promise<Map<string, LexiCrossProductHandoffV1>> {
  const cached = receiptCache.get(cacheKey)
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return new Map(cached.receipts)
  }
  const existing = receiptRequests.get(cacheKey)
  if (existing && !force) return existing
  if (existing) {
    try {
      await existing
    } catch {
      // A forced refresh after send or focus must still make one fresh attempt.
    }
    const followUp = receiptRequests.get(cacheKey)
    if (followUp) return followUp
  }

  const request = listWordsPlanReceipts({ userId, sourceRefs })
    .then((receipts) => {
      receiptCache.delete(cacheKey)
      receiptCache.set(cacheKey, { fetchedAt: Date.now(), receipts: new Map(receipts) })
      trimCache()
      return receipts
    })
    .finally(() => receiptRequests.delete(cacheKey))
  receiptRequests.set(cacheKey, request)
  return request
}

type UseWordsPlanReceiptsInput = {
  userId: string | null
  sourceRefs: readonly string[]
  preview?: boolean
  previewStatus?: LexiCrossProductHandoffStatus
}

export function useWordsPlanReceipts({
  userId,
  sourceRefs,
  preview = false,
  previewStatus = 'pending',
}: UseWordsPlanReceiptsInput) {
  const artifactAccess = useAiArtifactAccess()
  const normalizedKey = JSON.stringify(
    [...new Set(sourceRefs.map(sourceRef => sourceRef.trim()).filter(Boolean))]
      .sort()
      .slice(0, 50),
  )
  const normalizedSourceRefs = useMemo<string[]>(() => JSON.parse(normalizedKey), [normalizedKey])
  const accountReady = Boolean(
    userId
    && artifactAccess.status === 'ready'
    && artifactAccess.mode === 'account'
    && artifactAccess.accountUserId === userId,
  )
  const cacheKey = `${userId ?? 'none'}:${normalizedKey}`
  const [receipts, setReceipts] = useState<Map<string, LexiCrossProductHandoffV1>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const activeRequestKey = useRef('')
  const lastAutomaticRefreshAt = useRef(0)

  const refresh = useCallback(async (force = true) => {
    const requestKey = `${cacheKey}:${crypto.randomUUID()}`
    activeRequestKey.current = requestKey
    if (normalizedSourceRefs.length === 0) {
      setReceipts(new Map())
      setLoading(false)
      setError('')
      return
    }
    if (preview) {
      setReceipts(new Map(normalizedSourceRefs.map(sourceRef => [
        sourceRef,
        createPreviewWordsPlanReceipt(sourceRef, previewStatus),
      ])))
      setLoading(false)
      setError('')
      lastAutomaticRefreshAt.current = Date.now()
      return
    }
    if (!userId || !accountReady) {
      setReceipts(new Map())
      setLoading(false)
      setError(userId
        ? '确认本机 Tracker 数据归属后可查看 Words 回执。'
        : '登录同一个 Lexi 账号后可查看 Words 回执。')
      return
    }

    setLoading(true)
    setError('')
    try {
      const next = await loadReceipts(userId, normalizedSourceRefs, cacheKey, force)
      if (activeRequestKey.current !== requestKey) return
      setReceipts(new Map(next))
      lastAutomaticRefreshAt.current = Date.now()
    } catch {
      if (activeRequestKey.current !== requestKey) return
      setError('暂时无法更新 Words 确认状态。')
    } finally {
      if (activeRequestKey.current === requestKey) setLoading(false)
    }
  }, [accountReady, cacheKey, normalizedSourceRefs, preview, previewStatus, userId])

  useEffect(() => {
    lastAutomaticRefreshAt.current = Date.now()
    void refresh(false)
    return () => {
      activeRequestKey.current = ''
    }
  }, [refresh])

  useEffect(() => {
    if (preview || !accountReady || normalizedSourceRefs.length === 0) return
    const refreshAfterReturn = () => {
      if (document.visibilityState === 'hidden') return
      if (Date.now() - lastAutomaticRefreshAt.current < RETURN_REFRESH_THROTTLE_MS) return
      lastAutomaticRefreshAt.current = Date.now()
      void refresh(true)
    }
    window.addEventListener('focus', refreshAfterReturn)
    document.addEventListener('visibilitychange', refreshAfterReturn)
    return () => {
      window.removeEventListener('focus', refreshAfterReturn)
      document.removeEventListener('visibilitychange', refreshAfterReturn)
    }
  }, [accountReady, normalizedSourceRefs.length, preview, refresh])

  return {
    receipts,
    loading,
    error,
    refresh: () => refresh(true),
  }
}
