import type { LexiWordsStudyMode } from '@/contracts/lexiCrossProduct'
import type { StudyPlan } from '@/lib/types'
import type {
  PlanMutationResult,
  UpsertVocabularyPlanInput,
} from '@/stores/planStore'
import type { TrackerContentCloudMode } from '@/sync/trackerContentCloudPolicy'
import type { CreateWordsPlanIntentInput } from './wordsPlanIntent'
import {
  canonicalVocabularyPlanMatches,
  type CanonicalVocabularyPlanFields,
} from './vocabularyPlanTemplate'

export type SaveAndSendVocabularyPlanInput = {
  existingPlanId?: string
  fields: CanonicalVocabularyPlanFields
  cloudMode: TrackerContentCloudMode
  userId: string
  operationId: string
  targetDate: string
  targetCount: number
  studyMode: LexiWordsStudyMode
}

export type VocabularyPlanWorkflowDependencies = {
  readPlans: () => readonly StudyPlan[]
  upsertPlan: (input: UpsertVocabularyPlanInput) => Promise<PlanMutationResult>
  setCloudLocation: (input: {
    entityKind: 'study_plan'
    entityId: string
    mode: TrackerContentCloudMode
  }) => void
  sendIntent: (input: CreateWordsPlanIntentInput) => Promise<unknown>
}

export class VocabularyPlanWorkflowError extends Error {
  readonly stage: 'plan' | 'handoff'
  readonly savedPlanId?: string

  constructor(
    stage: 'plan' | 'handoff',
    message: string,
    options: { savedPlanId?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'VocabularyPlanWorkflowError'
    this.stage = stage
    this.savedPlanId = options.savedPlanId
  }
}

/**
 * Persists one canonical Tracker plan before creating the short-lived Words
 * handoff. The returned plan id is therefore always the real sourceRef used by
 * Words, including duplicate-safe retries.
 */
export async function saveAndSendVocabularyPlan(
  input: SaveAndSendVocabularyPlanInput,
  dependencies: VocabularyPlanWorkflowDependencies,
): Promise<{ planId: string }> {
  let planId = input.existingPlanId
  const current = planId
    ? dependencies.readPlans().find((plan) => plan.id === planId)
    : undefined

  if (!current || !canonicalVocabularyPlanMatches(current, input.fields)) {
    const result = await dependencies.upsertPlan({
      ...(planId ? { id: planId } : {}),
      ...input.fields,
    })
    if (
      (result.status !== 'applied' && result.status !== 'duplicate')
      || !result.targetId
    ) {
      throw new VocabularyPlanWorkflowError(
        'plan',
        result.error?.message || 'Tracker vocabulary plan was not saved',
      )
    }
    planId = result.targetId
  }

  if (!planId) {
    throw new VocabularyPlanWorkflowError('plan', 'Tracker vocabulary plan id is missing')
  }

  try {
    dependencies.setCloudLocation({
      entityKind: 'study_plan',
      entityId: planId,
      mode: input.cloudMode,
    })
    await dependencies.sendIntent({
      userId: input.userId,
      operationId: input.operationId,
      targetDate: input.targetDate,
      targetCount: input.targetCount,
      studyMode: input.studyMode,
      sourceRef: planId,
    })
  } catch (error) {
    throw new VocabularyPlanWorkflowError(
      'handoff',
      'Tracker plan was saved but the Words handoff is uncertain',
      { savedPlanId: planId, cause: error },
    )
  }

  return { planId }
}
