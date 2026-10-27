-- Only a catalog admin, the service role or a SQL session may set or change `is_suggested` on a routine.
--
-- Why. `is_suggested = true` makes a routine readable by everybody (the "suggested" read policies), and the apps treat it
-- as "a curated catalogue routine". Nothing stopped a signed-in user from setting it on a routine they own: "Users can
-- update own protocols" has no WITH CHECK, and the column is granted to `authenticated`. Verified on Staging on
-- 2026-10-27 in a rolled-back transaction: a non-admin user set their own routine to is_suggested = true,
-- source = 'system' and an arbitrary cover URL, and an unrelated signed-in user then read all three. Anything that trusts
-- the flag (catalogue translations and cover art in the mobile app, the sign-up recommendation) could be fed by any account.
--
-- A trigger rather than an RLS WITH CHECK, because the rule is about a CHANGE: a Guardian who owns a suggested routine
-- (Barbara O'Neill owns 13) must stay able to edit its other columns, and a WITH CHECK cannot see the old row.
--
-- Who may change the flag: a caller with no signed-in user (auth.uid() is null: the service role, migrations, the SQL
-- editor), or a catalog admin (is_catalog_admin(): the is_admin / role claims in the JWT, which an admin sets, never the user).
-- Everyone else may still insert or update routines as long as the flag is not true on insert and does not change on update.
--
-- Staging first. NOT applied to Production here: the user-data project has the same table and probably the same hole,
-- which is a separate, deliberate step. Idempotent: create or replace, no drops.

create or replace function public.guard_protocol_suggested_flag()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or public.is_catalog_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_suggested, false) then
      raise exception 'Only a catalog admin can change whether a routine is suggested.' using errcode = '42501';
    end if;
  elsif coalesce(new.is_suggested, false) is distinct from coalesce(old.is_suggested, false) then
    raise exception 'Only a catalog admin can change whether a routine is suggested.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger guard_protocol_suggested_flag
  before insert or update on public.catalog_protocols
  for each row execute function public.guard_protocol_suggested_flag();
