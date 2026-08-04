# Phase 4B word-record sync extension

Date: 2026-08-04
Status: Tracker client ready; shared backend change required before enablement

## Scope

`word_record` joins the existing Phase 4B learning-record stream as one raw
learner-owned record per entry. It intentionally does **not** upload any
derived projections such as XP, levels, badges, activity-ledger events,
heatmaps, dashboard totals or charts.

| Cloud entity | Local source | Compact payload |
| --- | --- | --- |
| `word_record` | `wordStore.records` | `date`, `category`, optional `subCategory`, `count`, optional `note`, `createdAt` |

The entity id and `updatedAt` remain in the sync envelope, so they are not
duplicated in the JSON payload. Category and sub-category are each capped at
256 UTF-8 bytes, notes at 4 KiB and a full word payload at 8 KiB. Counts are
bounded to a non-negative safe value at or below 1,000,000,000.

## Client behavior

1. Add, edit and delete use the same crash-recoverable canonical transaction
   and cross-tab lock as practice, timers and plans.
2. A committed mutation increments `wordStore.mutationRevision`; the existing
   five-second Phase 4B trigger coalesces it with other learning mutations.
3. A cloud installation changes word records and their derived XP/activity
   projections in one local transaction, then recalculates badges locally.
4. The durable baseline/outbox stays in the existing per-account IndexedDB
   entry. It is removed explicitly when a shared account is permanently
   deleted on this device.
5. A malformed or oversize word row stays on the device, is quarantined from
   upload, and never causes derived state to be uploaded or silently erased.

## Required shared-platform follow-up

Before any account is allowed to sync this entity, the Formal/shared release
must make all of these compatible changes together:

1. Add `word_record` to Tracker capabilities for the intended accounts.
2. Extend the private sync-payload validator to accept exactly the six fields
   above, with the same byte/count/date/timestamp limits.
3. Preserve user ownership, optimistic-version conflict handling, tombstone
   cleanup and current aggregate byte accounting for the new kind.
4. Update Lexi Control aggregate/sync views and contract tests so the new
   entity is visible as a Tracker record class without exposing learner notes
   or content to administrators.
5. Verify create/update/delete, second-device pull, offline retry,
   cross-account isolation, byte limits and a signed-in user’s no-derived-data
   payload on production.

Until capabilities include `word_record`, the Tracker runtime deliberately
reports the Phase 4B stream as paused and keeps every learning record local.
No partially compatible upload is attempted.

## Safe release sequence

The rollout order prevents a new strict client from pausing an existing
four-kind learning sync stream:

1. Apply and verify the backward-compatible Formal migration/RPC validator
   while the new kind remains disabled.
2. From Lexi Control with the existing protected administrator authority,
   enable `word_record` for the intended Tracker accounts. The old four-kind
   client safely ignores this additional allowed kind and continues its current
   sync path.
3. Deploy the verified Tracker client that requires all five kinds and sends
   the compact word payload.
4. Run signed-in cross-device and administrator aggregate smoke checks before
   calling the release complete.
