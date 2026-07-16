-- Single-org bootstrap: the first user to sign up creates the org and becomes
-- its owner; subsequent signups join that same org as members. Runs as a
-- SECURITY DEFINER trigger so it can write orgs/profiles despite RLS.
--
-- For a multi-org SaaS later, replace the "use existing org" branch with one
-- that creates a fresh org per signup (and add an invite flow).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
begin
  select id into target_org from orgs order by created_at asc limit 1;
  if target_org is null then
    insert into orgs (name) values ('My Company') returning id into target_org;
    insert into org_settings (org_id) values (target_org);
    insert into profiles (id, org_id, email, role) values (new.id, target_org, new.email, 'owner');
  else
    insert into profiles (id, org_id, email, role) values (new.id, target_org, new.email, 'member');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
