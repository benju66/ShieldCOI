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
- **Phase D — Reminders (later).** A Supabase Edge Function on a schedule finds
  COIs expiring within the project's warning window and emails the vendor
  (Resend/Postmark). This is the recurring-value payoff.

## Environment variables

Frontend (Vite, exposed to the browser — safe, RLS protects the data):

```
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<anon/publishable key>"
```

Server-side only (never in the browser; used by edge functions / admin tasks):

```
SUPABASE_SERVICE_ROLE_KEY="<service role key>"   # secret
```

## Schema

See `supabase/migrations/0001_init.sql`. Tables: `orgs`, `profiles`,
`org_settings`, `projects`, `subcontractors`, `coi_records`, `notifications`.
Queryable fields are real columns; nested/variable data (requirements,
custom_requirements, extracted custom coverages, validation_errors) is JSONB to
mirror the current TS types. RLS on every table restricts access to the caller's
own `org_id`.

## Open items

- **Org bootstrapping** — how a signup gets a `profiles` row + `org_id`. For
  single-org: create one org, attach users. For multi-org: a `handle_new_user`
  trigger creates an org per signup + invites. Left out of the migration on
  purpose (it's a product choice, not a schema one).
- **Data migration for existing users** — the localStorage → Supabase move relies
  on the export/import JSON; verify it round-trips before cutover.
- **Verification** — the Phase C swap can't be tested without a live project, so
  it's gated on Phase 0.
