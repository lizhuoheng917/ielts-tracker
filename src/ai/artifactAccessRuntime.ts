import type { AiArtifactAccessV2 } from './artifactRepository'

// Auth hydration has not completed when modules first load. Start locked so a
// synchronous snapshot can never read account-owned content during that gap.
let runtimeAccess: AiArtifactAccessV2 = { status: 'locked', reason: 'binding-unavailable' }

export function getRuntimeAiArtifactAccess(): AiArtifactAccessV2 {
  return runtimeAccess
}

export function setRuntimeAiArtifactAccess(access: AiArtifactAccessV2): void {
  runtimeAccess = access
}
