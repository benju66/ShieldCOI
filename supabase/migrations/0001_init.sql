-- ShieldCOI initial schema — multi-tenant, Row-Level Security.
--
-- Data is scoped to an "org" (a general contractor company). Every user belongs
-- to exactly one org via `profiles`, and RLS ensures a user can only ever read
-- or write rows for their own org. This works for a single-org deployment today
-- and grows into multi-org SaaS without a schema change.
--
-- Apply with the Supabase CLI (`supabase db push`) or the SQL editor / MCP.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ==========================================================================
-- Tenancy
-- ==========================================================================

create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid not null references orgs (id) on delete cascade,
  email      text,
  role       text not null default 'member', -- 'owner' | 'member'
  created_at timestamptz not null default now()
);
create index if not exists profiles_org_id_idx on profiles (org_id);

-- The org_id of the current authenticated user, used by every RLS policy.
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from profiles where id = auth.uid()
$$;

-- ==========================================================================
-- Org settings (one row per org) — mirrors settingsService.AppSettings
-- ==========================================================================

create table if not exists org_settings (
  org_id               uuid primary key references orgs (id) on delete cascade,
  default_requirements jsonb not null default '{}'::jsonb,
  trades               jsonb not null default '[]'::jsonb,
  trade_rules          jsonb not null default '{}'::jsonb,
  email_templates      jsonb not null default '{}'::jsonb,
  evaluation_date      date,
  updated_at           timestamptz not null default now()
);

-- ==========================================================================
-- Core records — mirror the current TS types (queryable columns + JSONB blobs)
-- ==========================================================================

create table if not exists projects (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references orgs (id) on delete cascade,
  name                        text not null,
  number                      text not null,
  target_completion_date      date,
  requirements                jsonb not null default '{}'::jsonb,
  custom_requirements         jsonb not null default '[]'::jsonb,
  additional_insured_required boolean not null default false,
  additional_insured_names    jsonb not null default '[]'::jsonb,
  accept_blanket_ai           boolean not null default true,
  email_templates             jsonb,
  archived                    boolean not null default false,
  created_at                  timestamptz not null default now()
);
create index if not exists projects_org_id_idx on projects (org_id);

create table if not exists subcontractors (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references orgs (id) on delete cascade,
  project_id             uuid not null references projects (id) on delete cascade,
  company_name           text not null,
  trade                  text not null,
  contract_value         numeric not null default 0,
  compliance_status      text not null default 'Pending Upload',
  manual_override        boolean not null default false,
  override_notes         text not null default '',
  vendor_type            text not null default 'Subcontractor',
  waiver_reason_type     text,
  waiver_authorized_by   text,
  waiver_expiration_date date,
  created_at             timestamptz not null default now()
);
create index if not exists subcontractors_org_id_idx on subcontractors (org_id);
create index if not exists subcontractors_project_id_idx on subcontractors (project_id);

create table if not exists coi_records (
  id                                          uuid primary key default gen_random_uuid(),
  org_id                                      uuid not null references orgs (id) on delete cascade,
  project_id                                  uuid not null references projects (id) on delete cascade,
  subcontractor_id                            uuid not null references subcontractors (id) on delete cascade,
  file_name                                   text,
  insured_extracted_name                      text,
  gl_occurrence_extracted                     numeric,
  gl_aggregate_extracted                      numeric,
  auto_combined_single_limit_extracted        numeric,
  workers_comp_statutory_extracted            boolean,
  policy_expiration_date_extracted            date,
  gl_products_completed_extracted             numeric,
  umbrella_limit_extracted                    numeric,
  employers_liability_accident_extracted      numeric,
  employers_liability_disease_person_extracted numeric,
  employers_liability_disease_limit_extracted numeric,
  professional_liability_extracted            numeric,
  pollution_liability_extracted               numeric,
  validation_errors                           jsonb not null default '[]'::jsonb,
  extraction_method                           text,
  custom_extractions                          jsonb,
  additional_insured_named_extracted          jsonb,
  additional_insured_blanket_extracted        boolean,
  additional_insured_text_extracted           text,
  gl_addl_insd_extracted                      boolean,
  uploaded_at                                 timestamptz not null default now()
);
create index if not exists coi_org_id_idx on coi_records (org_id);
create index if not exists coi_subcontractor_id_idx on coi_records (subcontractor_id);
-- Supports the future "expiring soon" reminder query.
create index if not exists coi_expiration_idx on coi_records (policy_expiration_date_extracted);

create table if not exists notifications (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs (id) on delete cascade,
  project_id        uuid references projects (id) on delete cascade,
  project_name      text,
  subcontractor_name text,
  type              text not null default 'info', -- 'danger' | 'warning' | 'info'
  message           text,
  resolved          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists notifications_org_id_idx on notifications (org_id);

-- ==========================================================================
-- Row-Level Security — every table is org-scoped
-- ==========================================================================

alter table orgs           enable row level security;
alter table profiles       enable row level security;
alter table org_settings   enable row level security;
alter table projects       enable row level security;
alter table subcontractors enable row level security;
alter table coi_records    enable row level security;
alter table notifications  enable row level security;

create policy "orgs read own"       on orgs           for select using (id = current_org_id());
create policy "profiles read org"   on profiles       for select using (org_id = current_org_id());

-- Data tables: full access limited to the caller's own org.
create policy "org_settings rw"     on org_settings   for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "projects rw"         on projects       for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "subcontractors rw"   on subcontractors for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "coi_records rw"      on coi_records    for all using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy "notifications rw"    on notifications  for all using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ==========================================================================
-- Org / profile bootstrapping — DECISION PENDING, left to the app auth layer.
--
-- Single-org (start here): create one org, then attach each new signup to it.
--   insert into orgs (name) values ('Your Company');
--   -- then, per user (or via a trigger that reads a fixed org id):
--   insert into profiles (id, org_id, email) values (auth.uid(), '<org-id>', '<email>');
--
-- Multi-org SaaS (later): a handle_new_user() trigger on auth.users creates a
-- fresh org + owner profile per signup; additional users join via invite.
--
-- Not baked in here so the tenancy model stays a product choice, not a schema one.
-- ==========================================================================
