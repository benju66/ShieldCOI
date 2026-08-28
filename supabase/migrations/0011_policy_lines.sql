-- Wave 3: persist the per-coverage policy periods.
--
-- An ACORD 25 carries a separate POLICY EFF / POLICY EXP on every coverage row,
-- and they routinely differ — General Liability can run six months past the Auto
-- policy. Storing only one expiration date meant the certificate was evaluated
-- against whichever date the extractor happened to pick.
--
-- Compliance now runs against the EARLIEST expiration among the coverages the
-- project actually requires (GL / Auto / Umbrella / WC), resolved in
-- api/_scan.ts: a certificate is only good until the first required coverage
-- lapses. "Other" rows are deliberately excluded from that calculation — an
-- installation floater or leased-equipment row with a short date must not report
-- a vendor as Expired while every required coverage is in force.
--
-- This column keeps the rows themselves so a reviewer can see WHICH policy
-- governs and when each one lapses, rather than being shown a single date with
-- no explanation of where it came from.
--
-- Shape: [{ "line": "General Liability", "policy_number": "GL-123",
--           "effective": "2026-06-01", "expiration": "2027-06-01" }, ...]
--
-- Nullable: manual entries, sandbox samples, and records written before wave 3.

alter table coi_records
  add column if not exists policy_lines_extracted jsonb;

comment on column coi_records.policy_lines_extracted is
  'Per-coverage policy periods read off the ACORD 25. The earliest expiration among GL/Auto/Umbrella/WC governs compliance; "Other" rows are excluded.';
