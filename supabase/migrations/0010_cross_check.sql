-- Wave 3: persist the extraction cross-check.
--
-- Every certificate now gets up to two independent readings: the AI extraction
-- (api/_scan.ts) and, for true digital PDFs, a deterministic parse of the PDF's
-- own text layer (src/coiTextParse.ts). Where both read the same value, that is
-- real evidence. Where they disagree, we do not know the value — the compliance
-- engine raises "Needs Review" rather than asserting a shortfall it cannot
-- support.
--
-- Stored as one object rather than a bare list of disputed names because the
-- negative case has to survive too: `hadTextLayer` records whether a second
-- reading was possible AT ALL. Photos, scans, and faxed certificates have no
-- text layer, and a reviewer looking at an old record must be able to tell
-- "both sources agreed" from "only one source ever read this". Without that
-- flag an unverified certificate is indistinguishable from a confirmed one.
--
-- Shape:
--   {
--     "agreed":      ["gl_each_occurrence", ...],
--     "disputed":    ["umbrella_limit", ...],
--     "unverified":  ["professional_liability", ...],
--     "hadTextLayer": true
--   }
--
-- Nullable: manual entries, sandbox samples, and every record written before
-- wave 3 have no cross-check, and are treated as unverified rather than agreed.

alter table coi_records
  add column if not exists cross_check_extracted jsonb;

comment on column coi_records.cross_check_extracted is
  'AI reading vs PDF text-layer reading: {agreed, disputed, unverified, hadTextLayer}. NULL = no cross-check was run. hadTextLayer=false means no second reading was possible (photo/scan/fax).';
