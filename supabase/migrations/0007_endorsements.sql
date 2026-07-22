-- ShieldCOI — opt-in endorsement verification (advisory).
--
-- Projects may require specific endorsements (Waiver of Subrogation, Primary &
-- Non-Contributory, per-project aggregate, completed-ops additional insured).
-- These are verified as ADVISORIES only — a COI checkbox is not proof of the
-- underlying endorsement form — so they never fail a certificate's status.
--
-- `endorsement_requirements` (projects): which endorsements this project requires.
-- `endorsement_facts_extracted` (coi_records): which the certificate indicated.
-- Both default empty; legacy rows are simply treated as "none required / none found".

alter table projects
  add column if not exists endorsement_requirements jsonb not null default '{}'::jsonb;

alter table coi_records
  add column if not exists endorsement_facts_extracted jsonb;
