-- Only a catalog admin or the service role may set or change `is_suggested` on a routine.
--
-- `is_suggested = true` makes a routine readable by everybody and marks it as a curated catalogue routine: the apps serve
-- the translated names, cover art and video previews of such routines to every user. Ownership is the only UPDATE check on
-- catalog_protocols and UPDATE is granted on the whole table, so the flag needs a rule of its own.
--
-- A trigger rather than an RLS WITH CHECK, because the rule is about a CHANGE: a Guardian who owns a suggested routine
-- (for example Barbara O'Neill's on Staging) must stay able to edit its other columns, and a WITH CHECK cannot see the old row.
--
-- Who may set or change the flag:
--   * privileged: no signed-in user (auth.uid() is null) AND either no role claim at all (a migration, the SQL editor) or the
--     service role. Anonymous callers are not privileged; or
--   * a catalog admin: public.is_catalog_admin(), which reads the admin claims in the token.
-- Everyone else may still insert and update routines, as long as the flag is not true on insert and does not change on update.
--
-- Two triggers with WHEN clauses, so the function (and is_catalog_admin()) runs only when the flag is at stake, not on every
-- routine write. The `zz_` prefix makes them fire after any other BEFORE trigger, so the check sees the final row.
-- Limitation: an INSERT ... ON CONFLICT DO UPDATE that carries is_suggested = true is refused for a non-admin even when the
-- stored value is already true, because the insert leg sees the proposed row first. Nothing in the repo upserts routines.
--
-- Needs public.is_catalog_admin() in its claims-only form: the preflight below refuses to run without it and warns if it
-- mentions email. Apply to Staging before any app change that relies on the flag ships. Not applied to Production here; that
-- is a separate step. Idempotent (create or replace).
-- Rollback: drop trigger zz_guard_protocol_suggested_flag_insert on public.catalog_protocols ;
--           drop trigger zz_guard_protocol_suggested_flag_update on public.catalog_protocols ;
--           drop function public.guard_protocol_suggested_flag() .

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

create or replace function public.guard_protocol_suggested_flag()
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
  raise exception 'Only a catalog admin can change whether a routine is suggested.' using errcode = '42501';
end;
$$;

revoke all on function public.guard_protocol_suggested_flag() from public, anon, authenticated;

create or replace trigger zz_guard_protocol_suggested_flag_insert
  before insert on public.catalog_protocols
  for each row when (new.is_suggested is true)
  execute function public.guard_protocol_suggested_flag();

create or replace trigger zz_guard_protocol_suggested_flag_update
  before update on public.catalog_protocols
  for each row when (coalesce(new.is_suggested, false) is distinct from coalesce(old.is_suggested, false))
  execute function public.guard_protocol_suggested_flag();
