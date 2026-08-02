# Tracker production connection and release

Date: 2026-08-02

## Release boundary

This release connects Tracker to the shared Lexi production platform for:

1. Supabase Auth, so the same Lexi account can sign in on both products.
2. `lexi-ai-gateway`, so Managed AI requests use the server-side provider configuration.

It does **not** add Tracker cloud sync. Words, practice records, timers, plans,
diaries, achievements, and saved AI artifacts remain local-first in the current
browser. Tracker does not read or write Lexi Words business tables.

Signing in never uploads, downloads, merges, clears, or replaces ordinary
Tracker records. A user must explicitly confirm that the current device records
belong to the signed-in account before Managed AI may send a purpose-limited
snapshot.

## Where data is stored

| Data | Storage | Account boundary |
| --- | --- | --- |
| Words, practice, timers, plans, diary, achievements | Tracker browser `localStorage` | One device/browser dataset; not yet separated by account |
| Supabase Auth session | Tracker browser, key isolated by environment and project ref | Shared Lexi identity, but Tracker requires its own sign-in because browser origins differ |
| Managed AI data-binding confirmation | Tracker browser | Blocks sending the device dataset from the wrong account |
| Saved AI suggestion/report/plan/writing artifact | Tracker browser | Managed artifacts are hidden or locked after an account mismatch |
| AI request snapshot | Sent transiently to `lexi-ai-gateway` | Purpose-limited; not stored as Tracker business data |
| Quota, request receipt, outcome metadata | Private production Supabase tables | Bound to verified `auth.uid`; no prompt or report body |
| Agnes/provider key and routing | Supabase Edge Function secrets and Lexi Control | Never included in the Tracker browser bundle |

Cross-device sync or per-account ordinary learning datasets require a separate
full-stack phase with Tracker tables, RLS, an outbox/receipt sync contract, and
conflict handling. Empty tables are not a sync implementation.

## Production build contract

`.env.production` contains exactly four browser-public values:

- `VITE_LEXI_ENVIRONMENT=production`
- the reviewed production Supabase URL
- an active `sb_publishable_` key
- the reviewed production project ref

`npm run build` fails closed when those values are missing, point to staging,
or contain a non-publishable key. It also scans the output and fails if the
production project is absent, the staging URL is present, or a secret-shaped
Supabase token appears.

## Direct Upload release

Cloudflare Pages project `ielts-tracker` is a Direct Upload project. Pushing
Git alone does not deploy it.

1. Update `release-impact.json`.
2. Run `npm run verify:release`.
3. Commit all learner, backend-review, admin-review, docs, and release evidence
   together.
4. Push the verified commit to `main`.
5. Build that exact clean commit and deploy:

```bash
npx wrangler pages deploy dist \
  --project-name ielts-tracker \
  --branch main \
  --commit-hash <verified-sha> \
  --commit-dirty=false
```

6. Wait for the deployment to be Active, then verify the real production bundle
   initializes the production URL and no staging URL.

## Production smoke

Keep all four Managed AI policies closed during the initial upload.

1. Export a JSON Backup V3 before testing on a browser with valuable local data.
2. Record counts for words, practice, timers, plans, diaries, and AI artifacts.
3. Sign in to Tracker with an existing Lexi account; confirm counts are unchanged.
4. Confirm the device-data ownership prompt and select Managed AI.
5. Temporarily enable only `daily_suggestion` in Lexi Control.
6. Generate one real suggestion and verify a strict structured result is saved
   locally, while Supabase gains only one successful receipt/usage record.
7. Confirm no Tracker business tables or rows appeared.
8. Close the temporary policy again unless product owners explicitly choose to
   keep it open.
9. Verify closed purposes explain “此 AI 功能当前未开放” instead of reporting a
   provider outage.

Do not call this release “Tracker cloud sync.” The acceptance claim is
“production Auth and Managed AI connected while existing local data remained
available.”
