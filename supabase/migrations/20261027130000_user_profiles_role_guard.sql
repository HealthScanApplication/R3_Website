-- A profile's role is assigned by an admin. This enforces that in the database for user_profiles.role: admin checks read this
-- column, so only an admin (or the service role) changes it. A trigger refuses a change of the role (or a non-default role on
-- insert) unless the caller is:
--   * privileged: no signed-in user (auth.uid() is null) AND either no role claim at all (a migration, the SQL editor) or the
--     service role (Edge Functions with the service key). Anonymous callers are not privileged; or
--   * a catalog admin: public.is_catalog_admin(), which reads the admin claims in the token.
-- Everything else about a profile (name, photo, preferences) stays editable by its owner, as before.
--
-- A trigger rather than a policy change because the rule is about a CHANGE of one column, which a WITH CHECK cannot see.
-- The WHEN clauses keep the function off the normal write path: it runs only when the role is at stake.
--
-- Needs public.is_catalog_admin() in its claims-only form: the preflight below refuses to run without it and warns if it
-- mentions email. Staging first. Not applied to Production by this change. Idempotent (create or replace, no drops).
-- Rollback: drop trigger zz_guard_user_profile_role_insert on public.user_profiles ;  drop trigger zz_guard_user_profile_role_update on public.user_profiles ;
--           drop function public.guard_user_profile_role() .

do $pre$
begin
  if to_regprocedure('public.is_catalog_admin()') is null then
    raise exception 'public.is_catalog_admin() is missing: apply its claims-only version before this migration';
  end if;
  if pg_get_functiondef('public.is_catalog_admin()'::regprocedure) ilike '%email%' then
    raise warning 'public.is_catalog_admin() mentions email: it should read token claims only';
  end if;
end
$pre$;

create or replace function public.guard_user_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;
  if public.is_catalog_admin() then
    return new;
  end if;
  raise exception 'Only an admin can change a profile''s role.' using errcode = '42501';
end;
$$;

revoke all on function public.guard_user_profile_role() from public, anon, authenticated;

create or replace trigger zz_guard_user_profile_role_insert
  before insert on public.user_profiles
  for each row when (new.role is not null and new.role <> 'user')
  execute function public.guard_user_profile_role();

create or replace trigger zz_guard_user_profile_role_update
  before update on public.user_profiles
  for each row when (new.role is distinct from old.role)
  execute function public.guard_user_profile_role();
