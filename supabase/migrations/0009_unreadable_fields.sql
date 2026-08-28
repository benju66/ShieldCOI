-- Wave 3: persist which fields the extractor could not read.
--
-- Until now a value the extractor could not read was indistinguishable from a
-- value the certificate does not carry — both arrived as 0, and both failed as
-- "Insufficient Coverage". That asserts a coverage shortfall we have no
-- evidence for, so the app cried wolf on vendors whose coverage is fine.
--
-- The extractor now reports the difference (api/_scan.ts), and the compliance
-- engine turns an unreadable REQUIRED field into the "Needs Review" status --
-- never a pass, but never a claimed shortfall either.
--
-- This column carries that list onto the record so the status survives a
-- re-evaluation: submitCoiRecord re-runs verifyCompliance from the stored row,
-- and without this the readability signal would be lost on save and the record
-- would silently fall back to "Insufficient Coverage".
--
-- Nullable: manual entries, sandbox samples, and every record written before
-- wave 3 have no readability information, and are treated as fully legible.

alter table coi_records
  add column if not exists unreadable_fields_extracted jsonb;

comment on column coi_records.unreadable_fields_extracted is
  'Field names the extractor could not read off this certificate. NULL/[] = fully legible. Drives the "Needs Review" compliance status.';
