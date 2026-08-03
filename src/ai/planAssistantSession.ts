export interface PlanAssistantRequestScope {
  epoch: number
  accountScopeId: string
  snapshotId: string
  contextHash: string
}

export interface PlanAssistantCurrentScope {
  epoch: number
  accountScopeId: string
  aborted: boolean
}

/** Late results fail closed after a newer request, abort, or account switch. */
export function shouldAcceptPlanAssistantResult(
  request: PlanAssistantRequestScope,
  current: PlanAssistantCurrentScope,
): boolean {
  return !current.aborted
    && request.epoch === current.epoch
    && request.accountScopeId === current.accountScopeId
    && request.snapshotId.trim().length > 0
    && request.contextHash.trim().length > 0
}
