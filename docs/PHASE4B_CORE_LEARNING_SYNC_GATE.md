# Phase 4B: core learning data sync gate

Date: 2026-08-03
Status: production accepted

## Outcome

Phase 4B adds compact multi-device sync for the four Tracker record types that
directly preserve learner intent and practice history:

| Cloud entity | Local source | Meaning |
| --- | --- | --- |
| `study_plan` | study plans | learning plan definition and active state |
| `plan_execution` | plan executions | one plan's completion state on one date |
| `timer_record` | timer records | ordinary timed practice |
| `practice_record` | practice records | IELTS mock/practice result |

The existing `tracker_preferences` entity continues to carry only the exam
date. AI prompts, chats, reports, writing feedback, diary content, API keys,
activity-ledger snapshots and derived charts are outside this release.

## User-experience contract

1. A learner save, edit or delete completes in the local crash-recoverable
   transaction before any network request begins.
2. Ordinary mutations wait up to five seconds so repeated edits collapse into
   a smaller batch. Focus, visibility and network recovery trigger a prompt
   retry; an unavailable network never blocks the learning form.
3. A remote snapshot is validated completely before installation. Installation
   uses the canonical cross-tab lock and compare-and-set fingerprint so a cloud
   read cannot overwrite a local edit made while the request was in flight.
4. The first device baseline preserves non-empty local data. Later conflicts
   use optimistic versions and deterministic last-write reconciliation; a
   cloud tombstone is never silently resurrected.
5. An oversized or legacy-invalid record remains usable locally and is
   reported as not synced; the client never truncates learner-authored text.
   In this rare safety state, valid additions and edits continue uploading,
   destructive deletes and inbound installation wait until the bad row is
   repaired, then an authoritative snapshot resumes normal two-way sync.

## Compact storage contract

- the durable reconciliation baseline and sealed outbox use one atomic
  IndexedDB value per account, rather than duplicating the full record set in
  the browser's small synchronous `localStorage` quota;
- one current JSONB row per learner-owned entity, not an append-only copy of
  every edit;
- ids stay in the envelope and are not repeated inside payloads;
- `updatedAt` stays in transport/server metadata and is omitted from all four
  JSON payloads;
- each learning payload is capped at 8 KiB, with tighter field limits such as
  4 KiB notes/descriptions, 512 bytes topics and 256 bytes titles/identifiers;
- one request contains at most 50 operations and 64 KiB; the client targets
  about 48 KiB to leave envelope headroom;
- successful and diagnostic receipts expire after 7 and 30 days;
- deletes immediately discard the body and retain only a compact tombstone;
- visible live learning records have no automatic time-to-live;
- at most 2,000 old tombstones are purged per cleanup run, and only after every
  non-retired device has advanced beyond their cursor.

`plan_execution` is additionally unique for `(user, planId, date)`. A plan must
exist before its execution is uploaded, and all live executions must be deleted
before the plan can be deleted. The client orders those dependent operations;
the backend repeats the checks as a data-integrity backstop.

## Full-stack release order

1. Pass both repositories' release gates and the front/back contract review.
2. Commit the Tracker client and the shared Lexi migration/Admin changes.
3. Apply and verify the backward-compatible Supabase migration while the four
   new entity kinds remain disabled.
4. Deploy the verified Lexi `/admin` and Tracker client commits.
5. Enable all four new kinds for eligible accounts.
6. With a real signed-in account, verify create/update/delete, a simulated
   second-device pull, restart/offline retry, no upload echo, cross-account
   isolation and Admin byte metrics.

Production must remain on Phase 4A if either the backend or compatible client
cannot be verified in the same release window.

## Production acceptance

The coordinated production release was accepted on 2026-08-03:

- Supabase migration `20260803041218` and Lexi backend/Admin commit `05cf67d`
  are live; the Admin deployment is
  `c133bd36-6c48-4795-90e7-a87f8ee9f990`;
- Tracker commit `5e9aef0` is live in production deployment
  `72087ccb-e84a-4ae8-a995-578c2943ebf4`;
- all five allowed kinds are enabled for every signed-in Tracker account;
- one real account created all four learning kinds, updated a plan and deleted
  every test record. Initial compact payloads were 210 bytes for the plan,
  93 bytes for its execution, 161 bytes for the timer record and 196 bytes for
  the mock/practice record; the updated plan was 220 bytes;
- the final dependent execution/plan delete used one ordered two-operation
  request, returned `applied`, and had `replay_count = 0`;
- all four learning rows now retain `payload = null` tombstones and zero body
  bytes. The learner UI contains no validation records and reports all learning
  data synced;
- a second-device preference change advanced the first device from cursor 14
  to the shared cursor before its pending deletes were applied. The temporary
  validation device and its receipt were then removed;
- a second authenticated account saw zero snapshot entities in a rolled-back
  isolation test, and the transaction left no account or device rows behind;
- `/admin` reports one active preference row, four zero-body tombstones, five
  enabled kinds, zero conflicts/rejections and aggregate bytes only.

The release gate passed with 54 test files and 371 tests, plus TypeScript,
lint, production build and public-bundle secret checks.

## Deferred follow-ups

- Explicitly split “clear this device” from “delete this account's cloud data”.
- Page very large full-account snapshots; the current snapshot RPC remains
  acceptable for this small initial record set but is not the long-term answer
  for years of history.
- Add independent sync contracts for daily check-in awards and other compact
  irreversible progress only after their replay semantics are accepted.
- Add record-level controls for the rare case where a cloud tombstone and a
  newer local edit need an explicit “keep local or keep deleted” decision; the
  current release keeps that one record local and marks sync as partial while
  unrelated records continue.
- Keep AI artifact/report synchronization as a separate opt-in retention
  decision.
- Replace the rare device-forced snapshot sentinel with a structured,
  non-retryable response before enabling large-account compaction. The current
  incremental path is accepted; a manually injected `requires_snapshot` flag
  exposed a long-running `tracker_pull_sync` error path and was reverted after
  the focused test.
