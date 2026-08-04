# Tracker production connection and release

Date: 2026-08-04

## Release boundary

Tracker connects to the shared Lexi production platform for:

1. Supabase Auth, so the same Lexi account can sign in on both products.
2. `lexi-ai-gateway`, so Managed AI requests use the server-side provider configuration.
3. Optional, per-item Tracker content cloud storage for plans, plan executions,
   practice records, timer records, and word records.

New Tracker learning content remains local by default. A signed-in learner who
has confirmed the current browser's data ownership can explicitly choose
“同步云端” for an eligible item. AI-generated plan drafts remain local until the
learner confirms an individual plan and chooses its storage location. A plan
and its execution records transfer as one cloud package. Diaries, achievements,
saved AI artifacts, and chat drafts remain local-only. Tracker does not read or
write Lexi Words business tables.

Signing in alone never uploads, downloads, merges, clears, or replaces ordinary
Tracker records. A user must explicitly confirm that the current device records
belong to the signed-in account before Managed AI may send a purpose-limited
snapshot or optional content-cloud storage becomes available.

## Where data is stored

| Data | Storage | Account boundary |
| --- | --- | --- |
| Tracker plans, practice, timers and word records | Browser first; only explicitly chosen records receive a compact cloud copy | Local data remains usable if the cloud is unavailable; cloud rows are scoped to the signed-in account |
| Diary, achievements, chat drafts and saved AI artifacts | Tracker browser `localStorage` | Local-only, subject to the current device/account access boundary |
| Supabase Auth session | Tracker browser, key isolated by environment and project ref | Shared Lexi identity, but Tracker requires its own sign-in because browser origins differ |
| Managed AI data-binding confirmation | Tracker browser | Blocks sending the device dataset from the wrong account |
| Saved AI suggestion/report/plan/writing artifact | Tracker browser | Managed artifacts are hidden or locked after an account mismatch |
| AI request snapshot | Sent transiently to `lexi-ai-gateway` | Purpose-limited; not stored as Tracker business data |
| Quota, request receipt, outcome metadata | Private production Supabase tables | Bound to verified `auth.uid`; no prompt or report body |
| Agnes/provider key and routing | Supabase Edge Function secrets and Lexi Control | Never included in the Tracker browser bundle |

Only the five eligible content types participate in the current optional sync
contract. The user controls each item, and administrators control the global
switch, five independent limits, and per-account overrides. Existing cloud
records remain available and are not deleted by a new limit.

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

Keep optional content-cloud storage disabled until the compatible Supabase
migrations, matching Tracker build, and Lexi Control build are online.

1. Export a JSON Backup V3 before testing on a browser with valuable local data.
2. Record counts for words, practice, timers, plans, diaries, and AI artifacts.
3. Sign in to Tracker with an existing Lexi account; confirm counts are unchanged.
4. Confirm the device-data ownership prompt and select Managed AI.
5. Generate a plan draft, choose “仅本机”, and confirm that it remains local.
6. Generate another plan draft, choose “同步云端”, and confirm that the plan
   appears on a second signed-in device after the paired cloud transfer.
7. Lower that account's plan allowance to zero in Lexi Control and verify the
   next cloud selection stays local with an honest quota message.
8. Check a second account cannot read or change the first account's quota or
   cloud content.

The acceptance claim is “Tracker remains local-first while explicitly chosen
content can safely sync through the shared Lexi account.”

## Production acceptance result

Completed on 2026-08-02 against the formal Tracker and Lexi Control domains:

- An existing Lexi account signed in successfully. Words, practice, timers,
  plans, streak state and saved AI artifact counts stayed unchanged at zero.
- The explicit device-data ownership gate completed without uploading or
  replacing ordinary Tracker records.
- Lexi Control temporarily enabled only `daily_suggestion` on the Agnes
  `default` route (policy v3), then restored it to disabled (policy v4). Both
  changes have `ai_gateway.policy.updated` audit entries. The other three
  purposes remained disabled throughout.
- One strict `DailySuggestionV2` result rendered successfully and the local AI
  artifact library increased from zero to one.
- `lexi-ai-gateway` v3 returned HTTP 200 in 13,045 ms. Supabase gained exactly
  one `succeeded` receipt and one usage increment: 2,750 input tokens, 693
  output tokens, no error and no rate-limit event.
- The three AI Gateway metadata tables expose no prompt, content, response,
  artifact, essay or snapshot columns. No Tracker business table appeared, so
  the generated suggestion body remains in the browser.
- Final state: all four Tracker Managed AI policies are disabled.
