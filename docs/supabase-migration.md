# Supabase migration plan

Moving ShieldCOI from browser `localStorage` to a shared Supabase (Postgres +
Auth) backend, so a team sees the same data and can log in. This is the
foundational change that unblocks reminders and real multi-user use.

The data layer was built as a single swap point — `src/dbService.ts` and
`src/settingsService.ts` — so most of the app doesn't change. The compliance
engine (`complianceEngine.ts`, `tradeRules.ts`) is pure and untouched.

## Decisions (defaults chosen; change if needed)

| Decision | Default we're building toward | Notes |
|---|---|---|
| Tenancy | **Single org to start** | Schema already carries `org_id` + RLS, so it grows into multi-org SaaS with no schema change — just an app signup/invite flow. |
| Auth | **Email + password** | Add password reset. Magic-link is an easy alternative later. |
| Hosting | Supabase + Vercel | Existing `/api/scan-*` functions stay on Vercel. |

## Phases

- **Phase 0 — Provision (needs you).** Create a Supabase project (dashboard, CLI,
  or authorize the Supabase connector so an agent can). Apply
  `supabase/migrations/0001_init.sql`. Set env vars (below).
- **Phase A — Auth.** Add `@supabase/supabase-js`, a `supabaseClient.ts`, a login
  screen, and session-gated app. Create one org and attach users (single-org).
  App still reads/writes `localStorage` at this point.
- **Phase B — SettingsProvider.** Refactor `settingsService` from synchronous
  `getSettings()` into a React context loaded once at boot. **This is the biggest
  non-obvious chunk** — `getSettings()` is called during render in `ProjectForm`,
  `SubcontractorModal`, `VerificationDrawer`, `CoiUploadZone`, `App`. They move to
  reading from context (sync) with async save. Do this while still on localStorage
  so it's verifiable in isolation.
- **Phase C — Swap the data layer.** Rewrite `dbService` + `settingsService`
  internals to call Supabase. `dbService` is already async so call sites barely
  change. Migrate existing data using the JSON **export/import** already in
  Settings → Data Management (export from localStorage, import into the org).
- **Phase D — Reminders (done).** A Supabase Edge Function
  (`supabase/functions/send-expiry-reminders`) runs on a daily `pg_cron`
  schedule, finds each subcontractor's latest COI, and flags the ones expiring
  soon (or already lapsed) as **in-app notifications** for the team. Cadence and
  channels are configurable per org (Settings → Automated reminders). Email is a
  built-but-off channel — see "Reminder engine" below.

## Environment variables

Frontend (Vite, exposed to the browser — safe, RLS protects the data):

```
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<anon/publishable key>"
```

Server-side only (never in the browser; used by edge functions / admin tasks):

```
SUPABASE_SERVICE_ROLE_KEY="<service role key>"   # secret; auto-injected into edge functions
```

Reminder email (optional — only needed to turn the email channel on, see below):

```
RESEND_API_KEY="<resend api key>"                # supabase secrets set …
REMINDER_FROM_EMAIL="alerts@yourdomain.com"      # a verified sender
```

## Schema

See `supabase/migrations/0001_init.sql`. Tables: `orgs`, `profiles`,
`org_settings`, `projects`, `subcontractors`, `coi_records`, `notifications`.
Queryable fields are real columns; nested/variable data (requirements,
custom_requirements, extracted custom coverages, validation_errors) is JSONB to
mirror the current TS types. RLS on every table restricts access to the caller's
own `org_id`.

## Reminder engine (Phase D)

`supabase/functions/send-expiry-reminders` + migration `0004_reminders.sql`.

**What it does.** Once a day it iterates every org (using the service-role key,
so it bypasses RLS — cron is not a signed-in user). For each subcontractor on an
**active** project it takes the latest COI on file and works out how many days
until `policy_expiration_date_extracted`. It fires the single *tightest*
reminder step the cert has entered — e.g. with thresholds `[30, 7]` a cert moves
`30` → `7` → `expired` as it ages, one notice per step. Each `(cert, step,
channel)` is recorded in `coi_reminder_log` (unique index), so the daily run is
**idempotent** — re-running never double-sends, and a renewed cert (a new COI
row) starts a fresh set of steps.

**Configurable per org** (Settings → Automated reminders, stored in
`org_settings.reminder_settings`): on/off, the day thresholds, whether to also
notify on lapse, and the channels (`notify_team`, `email_enabled`,
`notify_vendor`).

**Channels.**
- `in_app` (on by default) — writes a `notifications` row for the team. This is
  the whole v1: no external mail, no third-party account.
- `email_team` / `email_vendor` (off by default) — only send when the org has
  `email_enabled` **and** the function has a provider secret set. Vendor email
  also needs `subcontractors.contact_email` (column added, capture UI is a later
  step). Until a provider is configured these are saved but skipped (counted as
  `emails_skipped_no_provider`), so nothing leaks out prematurely.

**Schedule (live).** A `pg_cron` job `coi-expiry-reminders-daily` runs at
`0 13 * * *` (13:00 UTC) and `POST`s the function via `pg_net`, authenticating
with the **publishable** key (public — safe to embed). Manage it with:

```sql
-- inspect / history
select * from cron.job where jobname = 'coi-expiry-reminders-daily';
select * from cron.job_run_details order by start_time desc limit 10;
-- pause / resume
update cron.job set active = false where jobname = 'coi-expiry-reminders-daily';
-- remove
select cron.unschedule('coi-expiry-reminders-daily');
```

Debug affordances (POST body or query): `{"dryRun": true}` reports what it
*would* do without writing; `{"today": "YYYY-MM-DD"}` overrides the reference
date (used to test the sample data against future windows).

**Turning email on later.**
1. Create a provider account (Resend) and verify a sending domain.
2. `supabase secrets set RESEND_API_KEY=… REMINDER_FROM_EMAIL=alerts@yourdomain.com`
   (dashboard → Edge Functions → Secrets, or the CLI).
3. In Settings → Automated reminders, enable **Send email** (and optionally
   *Email the vendor directly* once contact emails are captured).
4. Test with `{"dryRun": false}` against your own address before broad send.

## Open items

- **Org bootstrapping** — how a signup gets a `profiles` row + `org_id`. For
  single-org: create one org, attach users. For multi-org: a `handle_new_user`
  trigger creates an org per signup + invites. Left out of the migration on
  purpose (it's a product choice, not a schema one).
- **Data migration for existing users** — the localStorage → Supabase move relies
  on the export/import JSON; verify it round-trips before cutover.
- **Verification** — the Phase C swap can't be tested without a live project, so
  it's gated on Phase 0.
