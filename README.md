# ShieldCOI

Project-level insurance compliance manager for general contractors. Track active
construction projects, configure required insurance limits per project and per
trade, scan subcontractor Certificates of Insurance (ACORD 25) with AI-assisted
extraction, and manage vendor compliance — with a human reviewer always in the
loop.

## What it does

- **Projects & requirements** — per-project baselines for GL (occurrence /
  aggregate / products-completed), Auto CSL, Umbrella, Employers' Liability,
  Workers' Comp, plus optional Professional / Pollution baselines and custom
  coverage requirements.
- **Contract scanning** — upload a prime-contract insurance exhibit and the app
  extracts the required baselines, per-trade escalations, additional-insured
  entities, and required endorsements to configure the project automatically.
- **COI scanning & verification** — upload a subcontractor's ACORD 25; extracted
  limits are checked against the project + trade requirements by a deterministic
  compliance engine. Extraction **fails closed**: an unreadable certificate is an
  error, never fabricated data.
- **Review drawer** — side-by-side certificate view with field highlights,
  per-check pass/fail, manual correction, and a documented waiver/override flow.
- **Trade rules** — per-trade minimums (e.g. higher umbrella for crane work) that
  can raise, never lower, the project baseline.
- **Reminders** — scheduled expiration reminders with an idempotent send-ledger
  (Supabase edge function + pg_cron).

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS 4, pdf.js (in-browser certificate
  rendering + text-layer field highlighting)
- **Backend:** Express (local dev) / Vercel serverless functions (`api/`),
  Gemini for document extraction
- **Data:** Supabase (Postgres with multi-tenant row-level security, Auth,
  Edge Functions) — see `supabase/migrations/`

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create `.env.local` with:

   ```sh
   GEMINI_API_KEY=...            # AI extraction (COI + contract scanning)
   VITE_SUPABASE_URL=...         # Supabase project URL
   VITE_SUPABASE_ANON_KEY=...    # Supabase anon (publishable) key
   ```

   Without `GEMINI_API_KEY`, uploads fail closed with a clear error and the
   built-in sandbox sample documents still work (they use canned data by
   design). Without Supabase credentials the app runs against local storage.

3. Start the dev server (Express + Vite middleware):

   ```sh
   npm run dev
   ```

## Scripts

| Command          | Purpose                                      |
| ---------------- | -------------------------------------------- |
| `npm run dev`    | Local dev server (Express + Vite middleware) |
| `npm test`       | Run the unit test suite (vitest)             |
| `npm run lint`   | Type-check (`tsc --noEmit`)                  |
| `npm run build`  | Production build (Vite client + server bundle) |
| `npm start`      | Serve the production build                   |

## Deployment

- **Vercel:** `vercel.json` routes `api/scan-coi` and `api/scan-contract` as
  serverless functions; set `GEMINI_API_KEY` and the `VITE_SUPABASE_*` variables
  in the project environment.
- **Supabase:** apply `supabase/migrations/` with `supabase db push`; deploy
  `supabase/functions/send-expiry-reminders` for scheduled reminders.
