# Phase 3.3A: AI safety and context foundation

Date: 2026-08-01
Status: local implementation, not deployed

## Outcome

This phase turns the existing AI entry points into consumers of a shared,
purpose-limited evidence snapshot. It does not replace the current browser-side
provider call yet. Its job is to make the data boundary and future backend
contract explicit before an AI Gateway or remote database is connected.

## Problems addressed

1. AI prompts were built when a page mounted, so later learning changes could be
   missing from a request.
2. Every AI feature received one broad 30-day payload, including diary excerpts
   and previous AI reports without a separate consent boundary.
3. Previous AI output could be fed back into plan generation as if it were
   primary learning evidence.
4. Plan actions used ad-hoc text markers without a shared draft, confirmation,
   idempotency and receipt contract.
5. A portable backup could carry provider endpoint/model preferences and replace
   the trusted connection on the importing device.

## Implemented contract

- `AiPurpose` describes why a request exists.
- `AiDataScope` describes the exact classes of data a capability may read.
- `AiContextSnapshotV1` records `dataAsOf`, range, freshness, source revision,
  context hash, quality warnings and private scopes.
- The capability registry denies direct model mutation. Private scopes are off
  until they are both requested by the feature and granted by the learner.
- `AiRun` and `AiArtifact` separate execution metadata from generated content.
- `AiCommandDraft` requires explicit confirmation. `AiCommandReceipt` and the
  idempotency guard make a repeated confirmation detectable before a domain
  store write.
- `AiGateway` is the stable frontend boundary for the later backend proxy. The
  current direct provider client remains a temporary compatibility path.

## Context and privacy rules

- A new snapshot is generated immediately before each suggestion, analysis or
  plan request.
- The default range is 30 days and can be changed to 7 or 90 days.
- Aggregate counts, durations, scores, streak and plan completion data are
  included by default.
- Free-form word/practice/timer notes are never included in this phase.
- Diary excerpts are off by default and require a per-device opt-in.
- Historical AI artifacts are off by default, labeled as secondary reference
  material when enabled, and never treated as raw learning evidence.
- Per-device privacy grants are deliberately not restored from a backup. A new
  device must opt in again.

## Where generated content lives today

| Scenario | Before explicit save | After save/confirmation | Portable backup |
| --- | --- | --- | --- |
| Home suggestion | Component memory while streaming | Latest suggestion in `ielts-tracker:aiSuggestion` | Yes |
| Learning analysis | Component memory while streaming | `ielts-tracker:reports` only after the learner clicks save | Yes |
| Plan assistant | Up to 10 messages in `ielts-tracker:aiChatHistory` | A confirmed plan becomes normal plan data; unconfirmed text remains chat history | Yes |
| Writing feedback | Component memory while generating | Essay and feedback enter `ielts-tracker:writingReports` only after save | Yes |
| AI connection | `ielts-trackerai-config` on this browser | Same per-device store | No; import preserves the current trusted value |
| AI privacy grants | `ielts-tracker:aiPrivacy` on this browser | Same per-device store | No; restored devices default to private scopes off |

The existing stores remain compatible in this phase. A unified remote artifact
repository is intentionally deferred until identity, retention, deletion and
cross-device rules are agreed.

## Backup safety

- Backup V2 no longer exports API key, endpoint or model routing.
- Legacy V1 `aiConfig` and legacy V2 `aiPreferences` are accepted only for file
  compatibility and then discarded.
- Successful import and rollback both preserve the connection already trusted
  by the current browser.

## Explicit boundaries

- No Supabase project, remote schema, RPC, RLS or server secret is introduced.
- There is no `/admin` surface in this standalone tracker.
- The browser still sends provider requests with the local key. This is clearly
  labeled as a transition configuration, not the target architecture.
- No commit, push or deployment is part of this phase.

## Acceptance gate

- [x] Full `npm run verify:release` passes.
- [x] Settings desktop and mobile layouts expose the data boundary without
  revealing a key.
- [x] Suggestion, analysis and plan prompts use a request-time snapshot.
- [x] Default requests contain no diary excerpts, historical AI text or record
  notes.
- [x] Backup import cannot replace key, endpoint or model.
- [x] Browser console has no new errors or warnings in the checked AI/settings
  flows.

Local evidence: 19 test files / 119 tests, TypeScript, oxlint and production
build passed. Browser checks covered 390px Settings, home suggestion, learning
analysis preflight and plan assistant; no horizontal overflow or console
warning/error was observed. No learning record or external AI request was
created during acceptance.

## Recommended next phase: 3.3B

Move the read-only suggestion and learning-analysis flows behind a real backend
AI Gateway first. Add authenticated server-side provider credentials, quotas,
timeouts, structured responses, run/artifact persistence and deletion rules.
After that path is stable, migrate plan drafts with server-validated commands
and receipts. Writing feedback follows after the task-question/input contract is
expanded, because its privacy and scoring requirements are stricter.
