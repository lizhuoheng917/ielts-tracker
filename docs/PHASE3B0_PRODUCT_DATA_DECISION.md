# Phase 3.3B-0: product, identity and data boundary decision

Date: 2026-08-01
Status: product direction accepted; no remote change

## Decision to confirm

Use **Lexi IELTS** as the umbrella brand, share one learner identity and one
Supabase project, but keep vocabulary and tracker business data in separate
product-owned boundaries. The AI Gateway is a shared platform service; it may
read only the purpose-scoped snapshot supplied for the current request.

This is the recommended direction, not an applied migration. No tracker table,
Auth setting, Edge Function, secret or administrator control has been created.

## Brand relationship

| Layer | Recommended name | Role |
| --- | --- | --- |
| Parent brand | Lexi IELTS | Shared account, trust, AI and learning-data platform |
| Vocabulary product | Lexi Words | Wordbooks, staged memorization and review |
| Tracking product | Lexi Tracker | Planning, practice logging, review and AI coaching |
| Shared account label | Lexi account | One learner identity across both products |

The products should share the Lexi mark geometry, account language and core
typography. They should retain distinct accents so learners always know where
they are: vocabulary keeps its calm olive system, while Tracker keeps its
indigo/violet progress system. This avoids making Tracker look like a second
unrelated company without turning both products into the same interface.

The naming direction is accepted. Phase 3.3B-1 applies `Lexi Tracker` to the
visible product shell while keeping its indigo/violet visual system.

## Database recommendation

### Share

- One Supabase project and one `auth.users` identity source.
- A minimal shared learner/account layer: account status, product membership,
  consent version and non-product-specific profile fields.
- One server-side AI Gateway, provider-secret store, quota policy and abuse
  protection layer.
- One administrator identity and audit standard.

### Keep separate

- Existing Lexi vocabulary tables, sync operations and retention rules remain
  vocabulary-owned.
- Tracker records, plans, diary, reports and future sync operations live in a
  dedicated `tracker` schema or equally explicit `tracker_*` namespace, with
  an independent sync epoch, cursor and operation receipt lifecycle.
- Existing `public.profiles` fields must not be reused for Tracker settings;
  it already contains vocabulary-specific fields such as active wordbook and
  study mode, while shared account data and Tracker preferences have different
  lifecycles.
- AI artifacts always carry `product_id`, `purpose`, `user_id`, retention state
  and source snapshot provenance.
- Neither frontend receives blanket read access to the other product's raw
  tables. Cross-product insights require a separately reviewed derived API.

### Why not two independent projects now

Two projects give a smaller operational blast radius, but also create two Auth
identities, duplicate account recovery and consent, and require a later account
linking or data-broker service before AI can understand the learner across both
products. That cost is not justified while both products are one IELTS learning
suite under one owner.

Choose separate projects only if billing ownership, legal isolation, regional
data residency or independent production teams become hard requirements.
Development, staging and production remain separate Supabase projects even
when the two production products share one project within the same environment.

## Supabase security boundary

The future migration must use explicit grants and RLS together. Supabase treats
grants as object reachability and RLS as row reachability; new table exposure is
also moving toward explicit opt-in. Therefore:

1. Browser clients use only the publishable key and the learner JWT.
2. Every exposed Tracker table has an ownership policy using `auth.uid()` and
   explicit `TO authenticated` grants. UPDATE policies include both `USING` and
   `WITH CHECK`.
3. Internal quota, provider routing and audit tables stay in a non-exposed
   schema. Provider secrets live in server-side function secrets, never in a
   table readable by the browser.
4. The shared AI Edge Function verifies the user JWT, validates purpose/scope,
   rejects stale or oversized snapshots, applies per-user quotas and sends only
   the approved payload to the model provider.
5. `/admin` receives product-aware, least-privilege RPC output rather than raw
   access to learner content.
6. Current production capacity and plan limits are re-checked before any
   Tracker or AI artifact table is created; prior quota observations are not a
   permanent capacity guarantee.

Current references:

- [Supabase API security and explicit grants](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Auth and RLS](https://supabase.com/docs/guides/auth)
- [Data API table exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## AI Gateway ownership

The recommended default path is a shared authenticated Supabase Edge Function,
for example `lexi-ai-gateway`, owned and migrated by the formal Lexi backend
repository. The Tracker repository owns only its client contract and adapter;
it must not create a second production migration history. The Gateway owns the
provider API key and accepts the existing `AiGatewayRequest` contract.

The browser-side custom connection remains an optional advanced fallback during
the transition. It is hidden behind the Settings action and never becomes the
new-user onboarding path.

The first server release supports only:

1. Home suggestion.
2. Read-only learning analysis.

Plan creation remains a draft until a server-validated command and an explicit
learner confirmation produce an idempotent receipt. Writing feedback follows
after essay retention and deletion rules are accepted.

Gateway logs keep purpose, scopes, context hash, model alias, timing, token
usage, status and error code. They do not retain raw prompts, diary excerpts,
essay text or complete context snapshots by default.

## Settings progressive disclosure implemented locally

- The Settings card now keeps only the default range, two optional data grants
  and a compact connection state.
- A small question-mark action opens the full data and privacy explanation.
- API key, endpoint, model, connection test and reset live inside the
  `自定义 AI 调取` dialog.
- The custom connection remains optional product UI, is masked by default and
  stays outside portable backups.
- No built-in backend service is implied before it exists: the current card
  states that AI use still requires a one-time custom configuration.

## Local-first migration order

1. **Identity bridge** — reuse the Lexi Supabase project and account, while
   preserving Tracker guest/local mode. Empty cloud state must never overwrite
   existing browser data.
2. **Read-only AI Gateway** — move suggestion and analysis behind the server,
   with provider secrets, quotas, timeouts and structured errors.
3. **AI run storage** — save minimal run metadata by default; save generated
   artifacts only under the scenario-specific rule already shown to the user.
4. **Tracker sync** — introduce product-owned tables and an outbox/idempotency
   contract. Migrate one entity group at a time.
5. **Shared admin** — extend the existing Lexi `/admin` with product filters,
   gateway health, quotas, retention and deletion controls before production.
6. **Cross-product insight experiment** — use derived summaries only, behind a
   separate consent and capability review.

Sharing one Supabase project does not automatically share a browser session
between different domains. Phase 1 may share credentials while requiring a
login in each product; seamless cross-domain sign-in needs a separately tested
auth handoff or a common application domain.

## Confirmation gate before backend work

- [x] Accept `Lexi Words` and `Lexi Tracker` under `Lexi IELTS`.
- [x] Confirm one Supabase project and shared Auth identity.
- [x] Confirm that cross-product AI is off until a separate opt-in exists.
- [ ] Choose AI artifact retention and deletion windows.
- [x] Confirm that the existing Lexi `/admin` becomes the shared control center.

Local UI acceptance:

- [x] 390px Settings layout has no horizontal overflow.
- [x] Connection fields are absent from the default Settings surface.
- [x] Help and custom-connection dialogs are keyboard-accessible and return
  focus to their triggers.
- [x] API key is masked whenever the custom-connection dialog opens.
- [x] Full release verification passes with no new browser warning/error.

Local evidence: `npm run verify:release` passed with 19 test files / 119 tests,
TypeScript, oxlint and production build. Browser acceptance used a 390px
viewport, did not reveal or modify a key, did not invoke an external provider
and created no learning or remote data.

The retention window remains a required decision before persistent AI artifacts
ship. Phase 3.3B-1 may reuse the existing identity contract locally, but it must
not create remote tables, deploy a function or move production secrets.
