import type { AiDataScope, AiPurpose } from './contracts'
import { parseAiDataScope, parseAiPurpose } from './validation'

export interface AiCapability {
  purpose: AiPurpose
  readScopes: readonly AiDataScope[]
  optionalPrivateReadScopes: readonly AiDataScope[]
  output: 'suggestion' | 'analysis' | 'plan_draft' | 'writing_feedback' | 'chat_response'
  directMutationAllowed: false
}

const PRIVATE_SCOPES = new Set<AiDataScope>([
  'diary.excerpts',
  'ai_artifacts.history',
  'writing.submission',
])

export const AI_CAPABILITIES: Readonly<Record<AiPurpose, AiCapability>> = {
  daily_suggestion: {
    purpose: 'daily_suggestion',
    readScopes: ['learning.summary', 'learning.timeline', 'practice.summary', 'plans.summary'],
    optionalPrivateReadScopes: ['diary.excerpts'],
    output: 'suggestion',
    directMutationAllowed: false,
  },
  learning_analysis: {
    purpose: 'learning_analysis',
    readScopes: ['learning.summary', 'learning.timeline', 'practice.summary', 'plans.summary'],
    optionalPrivateReadScopes: ['diary.excerpts', 'ai_artifacts.history'],
    output: 'analysis',
    directMutationAllowed: false,
  },
  plan_draft: {
    purpose: 'plan_draft',
    readScopes: ['learning.summary', 'learning.timeline', 'practice.summary', 'plans.summary'],
    optionalPrivateReadScopes: ['diary.excerpts', 'ai_artifacts.history'],
    output: 'plan_draft',
    directMutationAllowed: false,
  },
  writing_feedback: {
    purpose: 'writing_feedback',
    readScopes: [],
    optionalPrivateReadScopes: ['writing.submission'],
    output: 'writing_feedback',
    directMutationAllowed: false,
  },
  assistant_chat: {
    purpose: 'assistant_chat',
    readScopes: ['learning.summary', 'learning.timeline', 'practice.summary', 'plans.summary'],
    optionalPrivateReadScopes: ['diary.excerpts', 'ai_artifacts.history'],
    output: 'chat_response',
    directMutationAllowed: false,
  },
}

export function isPrivateAiDataScope(scope: AiDataScope): boolean {
  return PRIVATE_SCOPES.has(scope)
}

export function getAiCapability(purpose: unknown): AiCapability {
  return AI_CAPABILITIES[parseAiPurpose(purpose)]
}

export interface ResolvedAiScopes {
  scopes: AiDataScope[]
  privateScopes: AiDataScope[]
}

/**
 * Resolves the exact payload boundary. Optional private data is excluded unless
 * the caller both requests it and supplies an explicit grant for that scope.
 */
export function resolveAiScopes(
  purpose: unknown,
  requestedPrivateScopes: readonly unknown[] = [],
  grantedPrivateScopes: readonly unknown[] = [],
): ResolvedAiScopes {
  const capability = getAiCapability(purpose)
  const requested = requestedPrivateScopes.map(parseAiDataScope)
  const granted = new Set(grantedPrivateScopes.map(parseAiDataScope))
  const allowedPrivate = new Set(capability.optionalPrivateReadScopes)

  const privateScopes = requested.filter(
    (scope) => allowedPrivate.has(scope) && granted.has(scope),
  )

  return {
    scopes: [...capability.readScopes, ...privateScopes],
    privateScopes,
  }
}
