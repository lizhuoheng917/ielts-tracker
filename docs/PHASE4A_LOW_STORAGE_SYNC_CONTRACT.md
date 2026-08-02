# Phase 4A: low-storage Tracker sync contract

Date: 2026-08-02  
Status: coordinated local implementation complete; remote rollout remains disabled until staging acceptance

## Outcome

Tracker cloud sync will be **local-first and entity-based**. A learner action is
saved locally without waiting for the network. A durable outbox will later send
only compact canonical operations to Tracker-owned backend tables in the shared
Lexi Supabase project.

This phase deliberately does not upload every `localStorage` key. It separates
irreplaceable learner input from projections that the app can recompute. The
domain contract is implemented in `src/sync/trackerSyncContract.ts`. The first
runtime slice is also implemented: it shadow-uploads only `examDate`, validates
remote pull/snapshot data, and never installs that remote value into visible
settings. The companion Lexi checkout contains the disabled-by-default backend
and AAL2 Admin controls.

## Data boundary

### Canonical data to sync

| Entity | Why it is canonical |
| --- | --- |
| word, practice and timer records | Learner-created source records |
| study plans and plan executions | Learner intent and completion state |
| diary entries | Learner-authored content |
| daily check-in awards | Historical award amount and idempotent source |
| exam date | A cross-device learning goal |
| account checkpoint | One compact correction row preserving irreversible legacy progress |

`PlanExecution` keeps its entity id in the transport envelope, while the
backend must additionally enforce the business uniqueness of `(planId, date)`.

The account checkpoint contains only:

- `xpAdjustment`: the difference between the existing visible XP and XP
  derived from canonical records during first binding;
- `longestStreakFloor`: the historical peak that later edits must not erase;
- `unlockedBadges`: an irreversible set, including badges such as the local
  statistics-view badge that cannot be rebuilt from learning records;
- optional compact legacy activity deltas grouped by month.

After binding, visible XP is derived from current canonical records plus the
fixed adjustment. The checkpoint avoids uploading the entire activity ledger,
heatmap and achievement store.

### Derived locally, never duplicated as cloud truth

- total XP and level;
- current streak and heatmap;
- last active and last check-in dates;
- charts, trend lines, completion percentages and dashboard metrics;
- the activity ledger and local mutation journal.

The activity ledger is a rebuildable shadow cache with full `before` and
`after` snapshots. It is useful for local reconciliation but is several times
larger than a compact operation and does not provide a stable cloud revision.
The local mutation journal protects one local transaction and is removed after
commit; it is not a durable sync outbox.

### Device-local in V1

- theme and display switches;
- active timer state;
- AI privacy grants and account binding confirmations;
- custom provider endpoint, model and API key;
- chat history, AI suggestions, analyses, writing reports and AI artifacts;
- AI plan-command receipts and other compatibility stores;
- statistics page view count.

AI content will use a later opt-in retention contract. V1 never uploads an AI
prompt, report body, diary excerpt sent to AI, API key or provider response as
part of ordinary learning sync.

## Compact operation contract

Every pending operation has a stable id, a monotonically increasing local
sequence, entity kind/id, optimistic `baseVersion`, action, occurrence time and
an allowlisted payload. Account epoch and device id are stored once on the
sealed batch instead of repeated on every operation.

Important properties:

1. Unknown fields are not copied into payloads. This prevents derived state or
   credentials from leaking into a future upload.
2. Repeated unsent edits to one entity collapse to the latest payload while
   retaining the earliest cloud base version.
3. A locally created entity deleted before its first upload produces no remote
   operation.
4. Restoring a cloud tombstone requires an explicit learner choice.
5. A sealed batch keeps the same batch and operation ids for every retry.
6. The client never silently truncates oversized content. It leaves the record
   local and surfaces a sync error until the learner shortens or exports it.

Initial transport limits are deliberately mobile-sized:

- at most 50 operations per batch;
- at most 64 KiB per complete batch;
- at most 60 KiB per operation, leaving envelope room;
- diary content should be limited to 32 KiB, and note/description fields to
  4 KiB before the runtime uploader is enabled.

The runtime policy should persist the outbox immediately, wait up to five
seconds to combine ordinary edits, and flush sooner on delete, app background,
network recovery or an explicit sync action. Pull runs on login, network
recovery and app focus; V1 does not use a 60-second heartbeat or always-on
Realtime subscription.

## Implemented backend slice

The shared production Supabase project remains the platform, but Tracker owns
its schema, cursor and cleanup lifecycle. Do not add Tracker fields to Lexi
Words profiles and do not extend the Words sync RPC with Tracker entity kinds.

The first backend surface is:

- `tracker_sync_entities`: `(user_id, entity_kind, entity_id)` primary key, JSONB
  payload, entity version, monotonic change sequence, last operation id,
  timestamps and tombstone state;
- `tracker_sync_receipts`: request id, canonical request hash, result and
  cursor for idempotency/diagnostics, never a second copy of user content;
- `tracker_devices`: Tracker-specific epoch, cursor and last-seen state;
- one account-level compaction floor and sync-enabled control;
- batch apply, incremental pull and full snapshot RPCs;
- an admin aggregate RPC with no learner-authored body fields.

The entity table itself can act as the compact incremental feed by advancing a
monotonic change sequence on each row mutation. A separate permanent copy of
every change is not required. When tombstones are safely purged, the
compaction floor advances; a device with an older cursor must install a fresh
snapshot before it may upload anything.

Browser code uses only the publishable key and the learner JWT. Direct tables
remain inaccessible unless explicitly required; RPCs validate `auth.uid()`,
account epoch, schema version, field lengths, batch size, allowed entity kinds
and optimistic base version. RLS/grants, cross-account tests and the Admin view
ship in the same release before the feature flag is enabled.

## Retention and capacity policy

Visible learning records have **no silent TTL**. They remain until the learner
deletes them or a later explicit archive feature is accepted. Space savings
come from compact transport and deleting operational metadata:

| Data | Initial policy |
| --- | --- |
| successful operation receipts | 7 days |
| conflict/failed diagnostics | 30 days |
| full payload of a soft-deleted entity | 30 days, then reduce to a compact tombstone |
| inactive Tracker device state | 90 days |
| compact tombstone | eligible after 180 days, never time-only auto-purged |
| account checkpoint | one row per account, retained |
| AI artifact body | excluded from V1 |

A tombstone may be physically removed only after every non-retired device has
acknowledged a cursor beyond it, or after advancing the account epoch and
forcing stale devices through a full snapshot. This is what prevents an old
phone from resurrecting deleted records.

A conservative planning model estimates roughly 0.26 MiB for a light user,
1.16 MiB for a baseline active user and 5.26 MiB for a heavy user in year one,
including 30% index/page/dead-tuple margin and more operational history than
the minimal entity-table design. Until remote measurements exist, calculate
Tracker runway as:

`available Tracker database MiB / 1.16 = approximate baseline active-user capacity`

The shared Lexi database's existing usage must be measured immediately before
migration; the theoretical plan quota is not the available Tracker budget.
At 70/80/90% total capacity, Admin reports warning/danger/critical. Automated
cleanup may remove only acknowledged operational metadata, never user-visible
learning records.

Live pre-migration evidence on 2026-08-02: the production capacity guard
reported 18,353,299 bytes used (3.5%) of its configured 500 MiB quota and a
healthy state. Roughly 332 MiB remained before the 70% warning line, which is a
conservative planning runway of about 286 baseline Tracker users **if Lexi
Words stopped growing**. Admin must subtract ongoing Words growth; this is a
pilot ceiling, not a sales or registration limit.

## Minimum Admin view

Before enabling sync, `/admin` must show a Tracker product filter and:

- table/index/dead-tuple bytes, 7/30-day growth and estimated runway;
- live entities and average/p95 bytes by entity kind;
- operations per batch and p95 batch bytes;
- apply/duplicate/conflict/rejected counts and oldest pending failure;
- snapshot size/latency and full-bootstrap count;
- live, retired and stale devices;
- tombstones, safely eligible tombstones and cleanup-blocked tombstones;
- last cleanup result and lag.

It must not show diary, note, plan, report or AI artifact bodies.

## Rollout gates

### 4A.1 — hidden exam-date pilot

1. Add the Tracker-owned schema/RPC/RLS and Admin health panel in the formal
   Lexi backend release.
2. Add an account-scoped crash-safe localStorage journal/mirror, device id,
   account epoch, sequence, cursor and feature flag in Tracker.
3. Put background apply/pull under the existing global canonical mutation lock.
4. Shadow-upload only `examDate`; cloud reads do not yet alter the visible UI.
5. Verify offline restart, lost response, duplicate retry, account switch,
   cross-account isolation, cursor floor and cleanup preview.

### 4A.2 — source learning records

After the pilot is stable, enable word/practice/timer records and daily check-in
awards one domain at a time. First login must offer safe local/cloud choices;
an empty cloud state can never replace non-empty local data.

### 4B — plans, diary and user-facing multi-device reads

Plans/executions follow after uniqueness and conflict UX are accepted. Diary is
separately enabled after content-size and deletion UX are complete. AI artifact
sync remains a separate opt-in phase with its own retention choice.

## Acceptance blockers recorded for later

- `PlanExecution` has no `createdAt/updatedAt`; cloud version metadata must be
  stored separately or the type must be migrated before user-facing sync.
- current diary, note and description inputs have no byte-bound guarantee;
  runtime sync must reject without truncation and show a recoverable local-only
  state for oversized records;
- import and “clear all data” currently replace/remove local storage. Once sync
  is enabled they must become explicit “clear this device” versus “delete cloud
  account data” actions;
- word/practice/timer/diary mutations must join the same cross-tab canonical
  lock used by plan mutations before remote snapshots can be installed;
- account checkpoint generation needs a byte-for-byte replay test proving that
  existing XP, streak history and unlocked badges remain unchanged.

## Current verification

- payload allowlists exclude ids, derived fields, UI preferences and secret-like
  unknown fields;
- create/edit/delete compaction and explicit tombstone restore are tested;
- batch count/size partitioning and retry-stable sealing are tested;
- oversized content fails instead of being silently cut;
- TypeScript and the focused contract test pass locally.

The coordinated backend migration and Admin mutation are now implemented in the
formal Lexi checkout but remain unapplied while this document is at the local
gate. IndexedDB promotion is intentionally deferred until more than one
canonical entity type enters the runtime queue. Production data writes and sync
deployment require staging plus cross-account acceptance first.
