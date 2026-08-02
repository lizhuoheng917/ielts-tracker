# Phase 3.3B-1: shared Lexi account shell

Date: 2026-08-01
Status: implemented locally; remote identity configuration not applied

## Outcome

Lexi Tracker now has an optional identity shell for an existing Lexi account.
The local learning application always starts first and remains fully usable
without Supabase configuration or a signed-in account.

This phase establishes identity only. It does not attach, upload, download,
merge, clear, replace or account-scope any Tracker learning record.

## Startup and failure boundary

The startup order remains:

1. Recover any pending local mutation.
2. Initialize daily-checkin, activity-ledger and achievement compatibility.
3. Mount the optional Auth provider.
4. Render the local Tracker application.

Missing, partial, unsafe or temporarily unavailable Auth configuration cannot
block the local application. A service-role JWT or `sb_secret_` value is rejected
before a browser client can be created.

## Account experience

- Desktop: one compact account entry in the sidebar footer.
- Mobile: one account entry below the existing routes in the More sheet; the
  five-item bottom navigation remains unchanged.
- Settings: one compact account row directly below the page header.
- All three entries open one shared dialog and one focus scope.
- The dialog supports existing-account email/password login and local-scope
  sign-out.
- Registration, invitations, email confirmation and account recovery remain
  owned by Lexi Words until that secured flow is extracted as a shared surface.
- The data boundary is always visible: signing in or out does not change this
  browser's Tracker records.

## Configuration contract

Only these browser-safe variables are accepted:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_LEXI_ENVIRONMENT`
- `VITE_SUPABASE_PROJECT_REF`

The client stores its session under the `lexi-tracker-auth-v2:<environment>:<project-ref>`
namespace, outside the `ielts-tracker` learning-data prefix and isolated per
environment/project. No provider secret, service-role key or AI key was added
to the repository; remote connections now require an explicit environment and
matching canonical project ref.

## Full-stack review

- **Frontend:** optional Supabase client, Auth provider, shared dialog, account
  entries and Lexi Tracker naming are part of this local phase.
- **Backend:** reviewed, not changed. Existing Lexi Auth is reused as a future
  configured identity source; no Auth setting, Hook, schema, RPC, RLS, grant,
  migration or remote row is changed.
- **Admin:** reviewed, not changed. Identity-only Tracker state is not a new
  administrator-visible business state. Registration continues through the
  existing secured Lexi flow.
- **Deployment:** no commit, push, remote configuration or deployment.

## Acceptance gate

- [x] No Auth environment: app opens normally in local mode.
- [x] Partial or unsafe environment: no Supabase client is created.
- [x] Session storage is outside the learning-data prefix.
- [x] Clearing Tracker learning data does not clear the Lexi account session.
- [x] Portable Tracker backup does not contain the account session.
- [x] Unknown Auth failures are mapped to safe user-facing copy.
- [ ] Configured real-account login and local-scope sign-out smoke-tested in a
  non-production environment.
- [x] 320 px, 390 px and desktop browser acceptance completed.
- [x] Full `npm run verify:release` completed after visual acceptance.

The unchecked configured-login item is deliberately a separate environment
gate. This repository currently contains no Supabase values and this phase did
not copy production configuration into a local file.

## Recommended next phase

Phase 3.3B-2 should implement the read-only AI Gateway contract in the formal
Lexi backend repository, starting with home suggestions and learning analysis.
It must authenticate the JWT server-side, hold the provider key outside the
browser, enforce purpose/data scopes and quotas, and add product-aware health
and quota output to the shared `/admin` before production.

Tracker cloud sync remains after that gateway increment. Before the first local
record can upload, the product must add account-scoped repositories, an outbox,
idempotent receipts and an explicit user choice between upload, cloud use and
safe merge.
