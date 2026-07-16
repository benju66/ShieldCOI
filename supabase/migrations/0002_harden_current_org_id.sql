-- Restrict the RLS helper's EXECUTE to signed-in users (it's still called by
-- policies, which run as `authenticated`). Removes anon's ability to call it.
revoke execute on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated;
