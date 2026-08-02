import { useEffect, useLayoutEffect } from 'react'
import { setRuntimeAiArtifactAccess } from '@/ai/artifactAccessRuntime'
import { useAiArtifactAccess } from '@/ai/useAiArtifactAccess'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'

/** Keeps non-React snapshot builders fail-closed and adopts local artifacts only after explicit binding. */
export function AiArtifactAccessBridge() {
  const access = useAiArtifactAccess()
  const adoptLocalArtifacts = useAiArtifactStore((state) => state.adoptLocalArtifacts)

  useLayoutEffect(() => {
    setRuntimeAiArtifactAccess(access)
    return () => {
      setRuntimeAiArtifactAccess({ status: 'locked', reason: 'binding-unavailable' })
    }
  }, [access])

  useEffect(() => {
    if (access.status === 'ready' && access.mode === 'account') {
      try {
        adoptLocalArtifacts(access.accountUserId)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown storage error'
        console.warn(`[ai-artifact] account adoption deferred: ${detail}`)
      }
    }
  }, [access, adoptLocalArtifacts])

  return null
}
