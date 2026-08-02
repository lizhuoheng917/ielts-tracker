import { useMemo } from 'react'
import { useAuth } from '@/auth/authContext'
import { resolveAiArtifactAccess, type AiArtifactAccessV2 } from './artifactRepository'

export function useAiArtifactAccess(): AiArtifactAccessV2 {
  const { status, user, managedAiDataBinding } = useAuth()
  return useMemo(
    () => resolveAiArtifactAccess(status, user?.id, managedAiDataBinding),
    [managedAiDataBinding, status, user?.id],
  )
}
