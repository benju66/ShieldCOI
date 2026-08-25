-- Wave 2: persist the original certificate document.
--
-- Until now only the extracted numbers were stored — the uploaded COI itself was
-- discarded when the review drawer closed. For a compliance tool the stored
-- certificate IS the audit artifact, so this adds:
--   1. a private org-scoped Storage bucket for the original files,
--   2. RLS policies keyed on the path's first folder segment (= org_id), and
--   3. file_path / file_mime columns on coi_records pointing at the object.
--
-- Path convention (enforced by policy, written by the app):
--   <org_id>/<subcontractor_id>/<uuid>.<ext>
--
-- The 25 MB bucket limit is deliberately above today's 3 MB client cap: wave 3
-- sends full-resolution documents to extraction via Storage, so the ceiling is
-- set once here rather than re-migrated later.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coi-documents',
  'coi-documents',
  false,
  26214400, -- 25 MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Org isolation: a user may only touch objects whose top-level folder is their
-- own org id. No UPDATE policy — stored certificates are immutable audit
-- artifacts; a correction is a new upload on a new COI record.
create policy "coi-documents org read"
  on storage.objects for select to authenticated
  using (bucket_id = 'coi-documents' and (storage.foldername(name))[1] = current_org_id()::text);

create policy "coi-documents org insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'coi-documents' and (storage.foldername(name))[1] = current_org_id()::text);

create policy "coi-documents org delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'coi-documents' and (storage.foldername(name))[1] = current_org_id()::text);

-- Where the record's original document lives (nullable: manual entries have no
-- file; records saved before this migration never had their file kept).
alter table coi_records add column if not exists file_path text;
alter table coi_records add column if not exists file_mime text;
