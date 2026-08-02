# Phase 3.3B-2: managed read-only AI Gateway client

Date: 2026-08-01
Status: implemented locally; coordinated backend/admin release and remote smoke test still required

## Outcome

Lexi Tracker now has a client adapter for the shared authenticated
`lexi-ai-gateway`. The first managed capabilities are deliberately limited to:

1. `daily_suggestion` on the home page.
2. `learning_analysis` on the statistics page.

Plan generation, assistant chat and writing feedback continue to use the
learner's explicitly configured custom connection during this transition.

No production function, secret, database row or environment value was created
from this repository.

## Browser-to-server contract

The version 1 JSON request contains only:

- `schemaVersion: 1` and `productId: tracker`;
- a browser request ID and idempotency key;
- one approved purpose;
- the request-time, purpose-scoped learning snapshot;
- the learner's current request text.

It does not serialize an `AbortSignal`, run status, provider key, endpoint,
provider/model name, system prompt, raw OpenAI-compatible message array or
browser account session.

Before invocation the client rejects:

- unsupported purposes or a purpose/snapshot mismatch;
- stale snapshots or a freshness window above five minutes;
- duplicated, missing or capability-incompatible scopes;
- diary or historical AI content without the corresponding private scope;
- unknown learning-context fields and malformed nested records;
- input over 2,000 characters or a complete request over 64 KiB.

The response must echo the request, snapshot and context provenance. A success
must contain a succeeded run and a final string artifact whose kind, run ID,
data timestamp and context hash match the request. Unknown or malformed response
fields are rejected rather than rendered or saved.

## Managed transport and safe failures

The managed adapter dynamically loads the existing optional Supabase client,
requires a current Lexi session, and invokes `lexi-ai-gateway` with a 30-second
timeout. The client maps HTTP and transport failures to stable user-facing
states, including unauthenticated, forbidden, oversized, rate-limited, upstream
provider failure, timeout, network failure and service unavailable.

Provider response bodies are not shown to ordinary users. A bounded
`retryAfterSeconds` value may be used for rate-limit guidance.

## Explicit routing and legacy compatibility

`routeMode` is a per-device setting:

- Existing browsers that already hold a custom API key migrate to `custom`, so
  their prior behavior is preserved.
- Browsers without a legacy key default to `managed`.
- The ordinary Settings card shows both route choices and the Lexi account
  state. Endpoint, model and key fields remain inside the advanced dialog.
- A managed request never silently falls back to the custom provider after an
  authentication, quota, network or provider failure. The learner must
  explicitly select custom AI before any data is sent there.

The AI privacy preferences remain per-device and outside portable backups.
They apply to both routes.

## Generated-content persistence

This phase preserves the existing scenario rules:

| Scenario | Before success/save | After success/save |
| --- | --- | --- |
| Home suggestion | Component memory while waiting | Latest text in `ielts-tracker:aiSuggestion` after a successful response |
| Learning analysis | Component memory while waiting and previewing | `ielts-tracker:reports` only after explicit “保存报告” |

Failed, cancelled or invalid responses do not create a suggestion or report.
Saved analysis metadata may contain route, run ID, snapshot ID, context hash,
data timestamp, range, quality and bounded warnings. It does not contain the
full snapshot, system prompt, raw messages, provider key or model route.

## Full-stack release boundary

- **Frontend:** changed in Tracker. The safe wire adapter, route selection,
  first two consumers and Settings state are implemented locally.
- **Backend:** owned by the formal Lexi repository. The authenticated Edge
  Function, server-side provider secret, runtime validation, timeout, quota and
  minimal run audit must ship in the same coordinated release.
- **Admin:** owned by the existing Lexi `/admin`. Product-aware gateway health,
  quota and error summaries are required before production use; raw prompts,
  snapshots, diary excerpts and generated content must not appear in routine
  operational views.
- **Deployment:** no Tracker commit, push, function deployment or remote secret
  change is included in this local handoff.

## Acceptance gate

- [x] Wire serialization excludes provider credentials, model routing, system
  prompts, raw messages, signal and client-provided run state.
- [x] Request and response provenance, freshness, scopes, private data and size
  are runtime validated.
- [x] Supabase Function failures map to stable errors without exposing the
  provider response body.
- [x] Legacy custom-key users remain on custom routing.
- [x] Managed errors never automatically invoke the custom transport.
- [x] Home suggestion and learning analysis use the new read-only executor.
- [x] Plans, writing and chat remain on the custom path.
- [x] Generated content keeps the prior local save rules.
- [ ] Configured non-production account and deployed Function end-to-end smoke
  test.
- [ ] Coordinated formal backend and `/admin` release verification.

## Next recommended step

Complete the formal Lexi backend/admin half, then test the same contract in a
non-production Supabase environment with a real learner JWT. Verify success,
401, 403, 413, 429, timeout and provider failure without creating a local report
on failure. Only after that gate should plan drafts move to server-validated
commands and idempotent confirmation receipts. Writing feedback remains later,
after essay retention and deletion rules are accepted.
