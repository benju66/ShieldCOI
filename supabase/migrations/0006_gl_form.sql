-- ShieldCOI — GL coverage form (occurrence vs claims-made).
--
-- The compliance engine requires OCCURRENCE-based General Liability. This column
-- records the basis extracted from the ACORD 25 "OCCUR / CLAIMS-MADE" checkbox so
-- the engine can fail a claims-made policy. Nullable: legacy COI records predate
-- extraction and the engine only flags an explicit 'Claims-Made' value.

alter table coi_records
  add column if not exists gl_form_extracted text; -- 'Occurrence' | 'Claims-Made' | 'Unknown'
