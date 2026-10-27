-- STAGING ONLY. Tests guard_protocol_suggested_flag (20261027120000_protocol_suggested_flag_guard.sql) as different callers,
-- then raises an exception so EVERYTHING rolls back; the exception text is the result.
--   dry run (migration not applied yet):  cat supabase/migrations/20261027120000_protocol_suggested_flag_guard.sql scripts/protocol-suggested-guard.tests.sql
--   after applying the migration:         scripts/protocol-suggested-guard.tests.sql on its own
-- Run it as ONE request, so the migration and the tests share a transaction and both roll back.

create or replace function pg_temp.try_as(p_role text, p_claims jsonb, p_sql text) returns text
language plpgsql as $f$
declare r text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', coalesce(p_claims, '{}'::jsonb)::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_claims ->> 'sub', ''), true);
    execute p_sql into r;
    reset role;
    return 'OK:' || coalesce(r, 'null');
  exception when others then
    reset role;
    return 'ERR:' || sqlstate || ':' || left(sqlerrm, 80);
  end;
end
$f$;

create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text) returns text
language sql as $f$
  select case when p_ok then 'PASS ' || p_name || E'\n' else 'FAIL ' || p_name || ' -> ' || coalesce(left(p_detail, 300), 'null') || E'\n' end
$f$;

do $guard$
declare
  v_user uuid; v_upid uuid; v_guide uuid; v_gpid uuid;
  u_claims jsonb; g_claims jsonb; a_claims jsonb;
  r text; v_log text := ''; v_blocked constant text := 'ERR:42501:Only a catalog admin can change whether a routine is suggested.%';
  v_pass int; v_fail int;
begin
  -- Fixtures: an ordinary owner of a private, not-suggested routine, and a Guardian who owns a suggested routine.
  select g.user_id, g.id into v_guide, v_gpid from public.catalog_protocols g
   where g.user_id is not null and g.is_suggested is true order by g.created_at limit 1;
  select p.user_id, p.id into v_user, v_upid from public.catalog_protocols p
   where p.user_id is not null and coalesce(p.is_suggested, false) = false and coalesce(p.is_public, false) = false
     and p.user_id is distinct from v_guide order by p.created_at limit 1;
  if v_user is null or v_guide is null then raise exception 'fixtures missing: need an ordinary owner and an owner of a suggested routine'; end if;
  u_claims := jsonb_build_object('sub', v_user, 'role', 'authenticated');
  g_claims := jsonb_build_object('sub', v_guide, 'role', 'authenticated');
  a_claims := jsonb_build_object('sub', v_user, 'role', 'authenticated', 'app_metadata', jsonb_build_object('is_admin', true));
  v_log := format(E'fixtures: ordinary owner %s (routine %s), Guardian %s (suggested routine %s)\n', v_user, v_upid, v_guide, v_gpid);

  -- Inserts, as an ordinary signed-in user (RLS allows own rows, so only the guard can refuse).
  r := pg_temp.try_as('authenticated', u_claims, format($q$ with i as (insert into public.catalog_protocols select (jsonb_populate_record(null::public.catalog_protocols, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'user_id', %L::uuid, 'name', 'guard test ' || gen_random_uuid()::text, 'is_personal_routine', false, 'is_suggested', true))).* from public.catalog_protocols s where s.id = %L returning 1) select count(*)::text from i $q$, v_user, v_upid));
  v_log := v_log || pg_temp.chk('a user cannot insert a routine that is already suggested', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', u_claims, format($q$ with i as (insert into public.catalog_protocols select (jsonb_populate_record(null::public.catalog_protocols, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'user_id', %L::uuid, 'name', 'guard test ' || gen_random_uuid()::text, 'is_personal_routine', false, 'is_suggested', false))).* from public.catalog_protocols s where s.id = %L returning 1) select count(*)::text from i $q$, v_user, v_upid));
  v_log := v_log || pg_temp.chk('a user can still insert an ordinary routine (is_suggested false)', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', u_claims, format($q$ with i as (insert into public.catalog_protocols select (jsonb_populate_record(null::public.catalog_protocols, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'user_id', %L::uuid, 'name', 'guard test ' || gen_random_uuid()::text, 'is_personal_routine', false, 'is_suggested', null))).* from public.catalog_protocols s where s.id = %L returning 1) select count(*)::text from i $q$, v_user, v_upid));
  v_log := v_log || pg_temp.chk('a user can still insert a routine with is_suggested null', r = 'OK:1', r);

  -- Updates, as the owner.
  r := pg_temp.try_as('authenticated', u_claims, format('with u as (update public.catalog_protocols set is_suggested = true where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('a user cannot mark their own routine as suggested', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', u_claims, format('with u as (update public.catalog_protocols set is_suggested = true, source = %L, image_url = %L where id = %L returning 1) select count(*)::text from u', 'system', 'https://example.invalid/x.png', v_upid));
  v_log := v_log || pg_temp.chk('...not even together with source and cover (the attack that was verified)', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', u_claims, format('with u as (update public.protocols set is_suggested = true where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('...nor through the protocols view', r not like 'OK:%', r);
  r := pg_temp.try_as('authenticated', u_claims, format('with u as (update public.catalog_protocols set description = coalesce(description, %L) where id = %L returning 1) select count(*)::text from u', 'x', v_upid));
  v_log := v_log || pg_temp.chk('a user can still edit other columns of their own routine', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', u_claims, format('with u as (update public.catalog_protocols set is_suggested = false where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('false stays false: setting the same value is not a change', r = 'OK:1', r);
  update public.catalog_protocols set is_suggested = null where id = v_upid;
  r := pg_temp.try_as('authenticated', u_claims, format('with u as (update public.catalog_protocols set is_suggested = false where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('null to false is not a change either', r = 'OK:1', r);

  -- A Guardian who owns a suggested routine (Barbara O'Neill's case).
  r := pg_temp.try_as('authenticated', g_claims, format('with u as (update public.catalog_protocols set description = coalesce(description, %L) where id = %L returning 1) select count(*)::text from u', 'x', v_gpid));
  v_log := v_log || pg_temp.chk('a Guardian can still edit the other columns of their suggested routine', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', g_claims, format('with u as (update public.catalog_protocols set is_suggested = false where id = %L returning 1) select count(*)::text from u', v_gpid));
  v_log := v_log || pg_temp.chk('a Guardian cannot un-suggest it', r like v_blocked, r);

  -- Callers that are allowed to change the flag.
  r := pg_temp.try_as('authenticated', a_claims, format('with u as (update public.catalog_protocols set is_suggested = true where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('a catalog admin (is_admin in the JWT) can mark a routine as suggested', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', a_claims, format('with u as (update public.catalog_protocols set is_suggested = false where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('...and take it off again', r = 'OK:1', r);
  r := pg_temp.try_as('service_role', '{"role":"service_role"}'::jsonb, format('with u as (update public.catalog_protocols set is_suggested = true where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('the service role can change it', r = 'OK:1', r);
  r := pg_temp.try_as(current_user, null, format('with u as (update public.catalog_protocols set is_suggested = false where id = %L returning 1) select count(*)::text from u', v_upid));
  v_log := v_log || pg_temp.chk('a SQL session (migrations, the editor) can change it', r = 'OK:1', r);

  v_pass := (length(E'\n' || v_log) - length(replace(E'\n' || v_log, E'\nPASS ', ''))) / length(E'\nPASS ');
  v_fail := (length(E'\n' || v_log) - length(replace(E'\n' || v_log, E'\nFAIL ', ''))) / length(E'\nFAIL ');
  raise exception E'GUARD RESULT (transaction rolled back, nothing persisted): % passed, % failed\n%', v_pass, v_fail, v_log;
end
$guard$;
