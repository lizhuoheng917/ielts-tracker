import type { AiContextSnapshotV1 } from './contracts'
import { executeReadOnlyAi, type ReadOnlyAiExecutionDependencies } from './readOnlyExecution'
import type { WordsPlanRecommendationV2 } from './structuredOutputs'
import {
  assertWordsPlanRecommendationMatchesContext,
  type WordsPlanRecommendationContextDataV1,
} from './wordsPlanRecommendation'

export async function generateWordsPlanRecommendation(
  snapshot: AiContextSnapshotV1<WordsPlanRecommendationContextDataV1>,
  dependencies: ReadOnlyAiExecutionDependencies = {},
): Promise<WordsPlanRecommendationV2> {
  if (snapshot.purpose !== 'words_plan_recommendation') {
    throw new Error('Words plan recommendation snapshot has the wrong purpose')
  }
  const result = await executeReadOnlyAi({
    purpose: 'words_plan_recommendation',
    snapshot,
    userInput: '',
  }, dependencies)
  assertWordsPlanRecommendationMatchesContext(result.content, snapshot.data)
  return result.content
}
