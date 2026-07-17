-- Phase D: scheduled COI-expiration reminders.
--
-- Adds per-org reminder configuration, optional vendor contact fields (for a
-- future "email the vendor directly" channel), and a send-ledger that makes the
-- scheduled edge function idempotent — each cert is notified at most once per
-- step per channel. The `send-expiry-reminders` edge function runs on a daily
-- pg_cron schedule using the service-role key: cron is not an authenticated
-- user, so it bypasses RLS and iterates every org explicitly.

-- ==========================================================================
-- 1. Per-org reminder settings (mirrors AppSettings.reminder_settings).
--    days_before = day thresholds to remind BEFORE expiry (stepped cadence);
--    also_on_expiry adds one notice when the cert lapses. In-app notices go to
--    the team whenever notify_team is on; email is a separate, off-by-default
--    channel (email_enabled) that also honors notify_team / notify_vendor.
-- ==========================================================================
alter table org_settings
  add column if not exists reminder_settings jsonb not null default jsonb_build_object(
    'enabled',        true,
    'days_before',    jsonb_build_array(30, 7),
    'also_on_expiry', true,
    'notify_team',    true,
    'notify_vendor',  false,
    'email_enabled',  false
  );

-- ==========================================================================
-- 2. Optional vendor contact — ready for the vendor-direct email channel.
-- ==========================================================================
alter table subcontractors add column if not exists contact_email text;
alter table subcontractors add column if not exists contact_name  text;

-- ==========================================================================
-- 3. Send-ledger — one row per (cert, step, channel, recipient) notified.
--    Keyed on coi_record_id so renewing a cert (a new COI row) resets its
--    steps. The unique index is the idempotency backstop for the daily run.
-- ==========================================================================
create table if not exists coi_reminder_log (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs (id) on delete cascade,
  coi_record_id    uuid not null references coi_records (id) on delete cascade,
  subcontractor_id uuid references subcontractors (id) on delete set null,
  project_id       uuid references projects (id) on delete set null,
  expiration_date  date,
  bucket           text not null,                 -- '30' | '7' | 'expired' (threshold or 'expired')
  channel          text not null,                 -- 'in_app' | 'email_team' | 'email_vendor'
  recipient        text,                          -- email address, or null for in-app
  status           text not null default 'sent',  -- 'sent' | 'dry_run' | 'failed'
  detail           text,
  created_at       timestamptz not null default now()
);
create index if not exists coi_reminder_log_org_id_idx on coi_reminder_log (org_id);
create index if not exists coi_reminder_log_coi_idx     on coi_reminder_log (coi_record_id);
-- Idempotency: a given cert+step+channel+recipient is recorded at most once.
create unique index if not exists coi_reminder_log_unique
  on coi_reminder_log (coi_record_id, bucket, channel, coalesce(recipient, ''));

alter table coi_reminder_log enable row level security;
-- Org users may read their own reminder history; writes come only from the
-- service-role edge function (which bypasses RLS), so no write policy is granted.
create policy "coi_reminder_log read" on coi_reminder_log
  for select using (org_id = current_org_id());
