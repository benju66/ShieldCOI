-- Organization identity + per-user profiles.
--
-- Adds a display name to profiles, lets a user maintain their own profile row
-- (e.g. their display name / password via auth), and lets an org owner rename
-- their organization. RLS keeps both changes scoped: a user can only edit their
-- own profile, and only an owner can rename the org.

-- Per-user display name (nullable; the UI falls back to the account email).
alter table profiles add column if not exists full_name text;

-- A user may update their OWN profile row only.
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- An owner may rename their own organization. current_org_id() scopes it to the
-- caller's org; the role check limits it to owners. (Reads already allowed by the
-- existing "orgs read own" policy.)
drop policy if exists "orgs update own" on orgs;
create policy "orgs update own"
  on orgs for update
  using (
    id = current_org_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  )
  with check (id = current_org_id());
