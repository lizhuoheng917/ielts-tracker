export interface PlanAssistantRequestScope {
  epoch: number
  routeMode: 'managed' | 'custom'
  accountScopeId: string
  snapshotId: string
  contextHash: string
}

export interface PlanAssistantCurrentScope {
  epoch: number
  routeMode: 'managed' | 'custom'
  accountScopeId: string
  aborted: boolean
}

/** Late results fail closed after a newer request, abort, route switch or account switch. */
export function shouldAcceptPlanAssistantResult(
  request: PlanAssistantRequestScope,
  current: PlanAssistantCurrentScope,
): boolean {
  return !current.aborted
    && request.epoch === current.epoch
    && request.routeMode === current.routeMode
    && request.accountScopeId === current.accountScopeId
    && request.snapshotId.trim().length > 0
    && request.contextHash.trim().length > 0
}
