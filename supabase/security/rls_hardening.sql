-- RLS hardening for Supabase's "rls_disabled_in_public" warning.
-- Run it in the Supabase SQL editor of EACH project (Staging, then Production).
--
--   1. Run as is: it only REPORTS (do_apply = false). Read the table it returns.
--   2. Change the last line to `select * from pg_temp.rls_hardening(true);` to apply.
--
-- What "apply" changes (nothing else is touched):
--   * no client grants (anon/authenticated)  -> ENABLE RLS. No behaviour change.
--   * archive / backup tables (dev###_*, *_backup, *_archive) -> ENABLE RLS, no policy.
--     Clients lose access; the service role and the database owner are unaffected.
--   * catalog_* reference tables -> ENABLE RLS, keep public read (policy), and keep
--     admin writes via public.is_catalog_admin() (skipped, and reported, if that
--     function does not exist).
--   * everything else that clients can reach is NOT changed. It is listed as
--     "needs your decision" because enabling RLS with no policy would break the
--     feature that reads it.
-- Safe to re-run. Extension-owned tables are skipped.

create or replace function pg_temp.rls_hardening(do_apply boolean)
returns table(tbl text, class text, decision text, applied boolean)
language plpgsql as $fn$
declare
  r record;
  has_read boolean;
  has_write boolean;
  admin_fn boolean := to_regprocedure('public.is_catalog_admin()') is not null;
begin
  for r in
    select c.relname::text as relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    order by c.relname
  loop
    select exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = r.relname and g.grantee in ('anon', 'authenticated') and g.privilege_type = 'SELECT'),
           exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = r.relname and g.grantee in ('anon', 'authenticated') and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
      into has_read, has_write;
    tbl := r.relname; applied := false;

    if not has_read and not has_write then
      class := 'no client grants'; decision := 'enable RLS (no behaviour change)';
      if do_apply then execute format('alter table public.%I enable row level security', r.relname); applied := true; end if;

    elsif r.relname ~ '^(dev[0-9]+[a-z]?_|_backup_)' or r.relname ~ '_(backup|archive)(_|$)' then
      class := 'archive / backup'; decision := 'enable RLS, no policy (clients locked out, service role unaffected)';
      if do_apply then execute format('alter table public.%I enable row level security', r.relname); applied := true; end if;

    elsif r.relname ~ '^catalog_' then
      class := 'catalog reference';
      if admin_fn then
        decision := 'enable RLS + public read + admin write';
        if do_apply then
          execute format('alter table public.%I enable row level security', r.relname);
          if has_read then
            execute format('drop policy if exists rls_hardening_read on public.%I', r.relname);
            execute format('create policy rls_hardening_read on public.%I for select to anon, authenticated using (true)', r.relname);
          end if;
          execute format('drop policy if exists rls_hardening_admin_write on public.%I', r.relname);
          execute format('create policy rls_hardening_admin_write on public.%I for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin())', r.relname);
          applied := true;
        end if;
      else
        decision := 'needs review: public.is_catalog_admin() does not exist here (not changed)';
      end if;

    else
      class := 'client-accessible data'; decision := 'needs your decision (not changed)';
    end if;
    return next;
  end loop;
end
$fn$;

select * from pg_temp.rls_hardening(false);
