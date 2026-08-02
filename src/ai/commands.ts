import type { AiCommandDraft, AiCommandReceipt } from './contracts'
import { parseAiCommandAction } from './validation'

export interface ExecuteAiCommandOptions {
  existingReceipts: readonly AiCommandReceipt[]
  /**
   * Domain-level idempotency fallback. A deterministic target may already
   * exist even when the receipt write was interrupted.
   */
  findExistingTarget?: (draft: AiCommandDraft) => string | undefined
  apply: (draft: AiCommandDraft) => string | undefined
  now?: Date
  createId?: () => string
}

export interface ExecuteAiCommandResult {
  receipt: AiCommandReceipt
  applied: boolean
}

/**
 * Shared confirmation and idempotency guard for future AI mutations. Domain
 * stores remain the only place that can perform the actual write.
 */
export function executeConfirmedAiCommand(
  draft: AiCommandDraft,
  options: ExecuteAiCommandOptions,
): ExecuteAiCommandResult {
  parseAiCommandAction(draft.action)
  const createdAt = (options.now ?? new Date()).toISOString()
  const createId = options.createId ?? (() => crypto.randomUUID())
  const previous = options.existingReceipts.find(
    (receipt) =>
      receipt.idempotencyKey === draft.idempotencyKey &&
      (receipt.status === 'applied' || receipt.status === 'duplicate'),
  )

  const existingTargetId = previous?.targetId ?? options.findExistingTarget?.(draft)
  if (previous || existingTargetId) {
    return {
      applied: false,
      receipt: {
        schemaVersion: 1,
        receiptId: createId(),
        draftId: draft.draftId,
        action: draft.action,
        idempotencyKey: draft.idempotencyKey,
        status: 'duplicate',
        createdAt,
        targetId: existingTargetId,
      },
    }
  }

  if (draft.confirmation.status !== 'confirmed') {
    return {
      applied: false,
      receipt: {
        schemaVersion: 1,
        receiptId: createId(),
        draftId: draft.draftId,
        action: draft.action,
        idempotencyKey: draft.idempotencyKey,
        status: 'rejected',
        createdAt,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'User confirmation is required before applying an AI command',
        },
      },
    }
  }

  try {
    const targetId = options.apply(draft)
    return {
      applied: true,
      receipt: {
        schemaVersion: 1,
        receiptId: createId(),
        draftId: draft.draftId,
        action: draft.action,
        idempotencyKey: draft.idempotencyKey,
        status: 'applied',
        createdAt,
        targetId,
      },
    }
  } catch (error) {
    return {
      applied: false,
      receipt: {
        schemaVersion: 1,
        receiptId: createId(),
        draftId: draft.draftId,
        action: draft.action,
        idempotencyKey: draft.idempotencyKey,
        status: 'failed',
        createdAt,
        error: {
          code: 'APPLY_FAILED',
          message: error instanceof Error ? error.message : 'AI command apply failed',
        },
      },
    }
  }
}
