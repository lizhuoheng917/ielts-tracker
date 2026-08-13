export const LEXI_CROSS_PRODUCT_CONTRACT_VERSION = 1 as const

export const LEXI_CROSS_PRODUCT_LIMITS = {
  requestBytes: 4 * 1024,
  contentTextBytes: 1024,
  meaningTextBytes: 2 * 1024,
  referenceBytes: 256,
  pendingPerAccount: 50,
  totalPerAccount: 100,
  pendingRetentionDays: 30,
  resolvedRetentionDays: 7,
} as const

export type LexiProductId = 'words' | 'tracker'
export type LexiCrossProductHandoffStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export type LexiCandidateContentKind = 'word' | 'phrase' | 'sentence'
export type LexiWordsStudyMode = 'mixed' | 'review' | 'new'

/**
 * A read-only projection of existing Lexi Words cloud rows. The server does
 * not persist this projection, and local-only Words data is deliberately not
 * uploaded just to populate it.
 */
export type LexiWordsDailySummaryV1 = {
  contractVersion: typeof LEXI_CROSS_PRODUCT_CONTRACT_VERSION
  product: 'words'
  coverage: 'cloud_data_only'
  studyDate: string
  attempts: number
  passed: number
  durationMs: number
  activeWordbooks: number
  activeWords: number
  newWords: number
  learningWords: number
  masteredWords: number
  dueWords: number
}

/**
 * An on-demand numeric projection for planning. It contains no word text,
 * meaning, wordbook name or event row and is never persisted as a snapshot.
 */
export type LexiWordsPlanningContextV1 = {
  contractVersion: typeof LEXI_CROSS_PRODUCT_CONTRACT_VERSION
  product: 'words'
  coverage: 'cloud_data_only'
  targetDate: string
  timeZone: string
  generatedAt: string
  inventory: {
    activeWordbooks: number
    activeWords: number
    newWords: number
    learningWords: number
    availableNewWords: number
    masteredWords: number
    dueNowWords: number
    dueByTargetWords: number
  }
  recent7Days: {
    activeDays: number
    attempts: number
    passed: number
    durationMs: number
    uniqueWordsStudied: number
    wordStudyTouches: number
  }
  targetDay: {
    attempts: number
    passed: number
    durationMs: number
    plannedNewWords: number
    plannedReviewWords: number
    completedNewWords: number
    completedReviewWords: number
  }
}

export type LexiPlanIntentRequestV1 = {
  sourceProduct: LexiProductId
  targetProduct: LexiProductId
  kind: 'plan_intent'
  targetDate: string
  targetCount: number
  studyMode: LexiWordsStudyMode
  targetContainerId?: string
  sourceRef?: string
}

export type LexiContentCandidateRequestV1 = {
  sourceProduct: LexiProductId
  targetProduct: LexiProductId
  kind: 'content_candidate'
  contentKind: LexiCandidateContentKind
  contentText: string
  meaningText?: string
  targetContainerId?: string
  sourceRef?: string
}

export type LexiCrossProductHandoffRequestV1 =
  | LexiPlanIntentRequestV1
  | LexiContentCandidateRequestV1

export type LexiCrossProductHandoffV1 = {
  contractVersion: typeof LEXI_CROSS_PRODUCT_CONTRACT_VERSION
  operationId: string
  sourceProduct: LexiProductId
  targetProduct: LexiProductId
  kind: LexiCrossProductHandoffRequestV1['kind']
  status: LexiCrossProductHandoffStatus
  contentKind?: LexiCandidateContentKind
  contentText?: string
  meaningText?: string
  targetDate?: string
  targetCount?: number
  studyMode?: LexiWordsStudyMode
  targetContainerId?: string
  sourceRef?: string
  createdAt: string
  expiresAt: string
  resolvedAt?: string
}
