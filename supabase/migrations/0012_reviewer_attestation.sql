-- Wave 3: reviewer attestation.
--
-- Until now the record showed what the extractor read, but not whether a person
-- ever checked it. For a compliance file that distinction matters: "the AI said
-- these limits" and "a named person confirmed these limits against the document"
-- carry very different weight if a claim is ever disputed.
--
-- This is a WHOLE-CERTIFICATE sign-off: one person attesting they reviewed this
-- certificate against the document. It is deliberately orthogonal to compliance
-- status — signing off records that a human looked, NOT that the values are
-- correct. A reviewer who finds a wrong value fixes it through manual entry,
-- which re-runs the engine; the attestation never launders a bad certificate
-- into a passing one.
--
-- reviewed_by_name is denormalized on purpose: the history drawer must still be
-- able to say who signed off after that person leaves the org and their profile
-- row is gone. reviewed_by keeps the referential link while the account exists.
--
-- Per-FIELD attestation is deliberately NOT built here. It stays a clean
-- addition rather than a rewrite: per-field extraction data is already stored as
-- keyed structures (unreadable_fields_extracted, cross_check_extracted), so a
-- future reviewed_fields jsonb of {field: {by, at}} slots in alongside these
-- columns without touching what exists.

alter table coi_records
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_at timestamptz;

comment on column coi_records.reviewed_by is
  'The user who attested to reviewing this certificate against the document. NULL = never signed off.';
comment on column coi_records.reviewed_by_name is
  'Display name captured at sign-off, so history survives the account being removed.';
comment on column coi_records.reviewed_at is
  'When the sign-off was recorded. Attestation of review only — it does not affect compliance status.';
