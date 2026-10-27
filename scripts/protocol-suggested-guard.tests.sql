-- STAGING ONLY (project ref mofhvoudjxinvpplsytd). Tests guard_protocol_suggested_flag (20261027120000_protocol_suggested_flag_guard.sql)
-- as different callers on throwaway users and routines it creates itself, then raises an exception so EVERYTHING rolls back.
--   dry run (migration not applied yet):  cat supabase/migrations/20261027120000_protocol_suggested_flag_guard.sql scripts/protocol-suggested-guard.tests.sql
--   after applying the migration:         scripts/protocol-suggested-guard.tests.sql on its own
-- Send it as ONE request so the migration and the tests share a transaction. If you run it with psql, the begin below keeps it atomic.
begin;

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
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    return 'OK:' || coalesce(r, 'null');
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
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
  u_owner uuid := gen_random_uuid();     -- an ordinary owner of a private routine
  u_other uuid := gen_random_uuid();     -- another ordinary account
  u_guardian uuid := gen_random_uuid();  -- a Guardian who owns a suggested routine
  u_admin uuid := gen_random_uuid();     -- an admin who owns nothing
  r_user uuid := gen_random_uuid();      -- the owner's private routine, not suggested
  r_null uuid := gen_random_uuid();      -- the owner's routine with is_suggested null
  r_guardian uuid := gen_random_uuid();  -- the Guardian's suggested routine
  r_house uuid := gen_random_uuid();     -- a house routine: no owner
  c_owner jsonb; c_guardian jsonb; c_admin jsonb; c_fake jsonb;
  s_upd constant text := 'with u as (update public.catalog_protocols set %s where id = %L returning 1) select count(*)::text from u';
  s_updv constant text := 'with u as (update public.protocols set %s where id = %L returning 1) select count(*)::text from u';
  s_ins constant text := 'with i as (insert into public.catalog_protocols (id, user_id, name, is_suggested) values (gen_random_uuid(), %s, %L, %s) returning 1) select count(*)::text from i';
  s_ups constant text := 'with i as (insert into public.catalog_protocols (id, user_id, name, is_suggested) values (%L, %L, %L, true) on conflict (id) do update set is_suggested = excluded.is_suggested returning 1) select count(*)::text from i';
  v_blocked constant text := 'ERR:42501:Only a catalog admin can change whether a routine is suggested.%';
  v_expected constant int := 28;
  r text; v_log text := ''; v_pass int; v_fail int; v_id uuid;
begin
  -- Fixtures, written as the SQL role (privileged). All of it is rolled back at the end.
  foreach v_id in array array[u_owner, u_other, u_guardian, u_admin] loop
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-' || v_id || '@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
  end loop;
  insert into public.catalog_protocols (id, user_id, name, is_public, is_suggested) values
    (r_user, u_owner, 'guard fixture private', false, false),
    (r_null, u_owner, 'guard fixture null flag', false, null),
    (r_guardian, u_guardian, 'guard fixture guardian', true, true),
    (r_house, null, 'guard fixture house', true, false);
  c_owner := jsonb_build_object('sub', u_owner, 'role', 'authenticated');
  c_guardian := jsonb_build_object('sub', u_guardian, 'role', 'authenticated');
  c_admin := jsonb_build_object('sub', u_admin, 'role', 'authenticated', 'app_metadata', jsonb_build_object('is_admin', true));
  -- Claims that look like admin but are not the ones an admin sets: an email address and user_metadata (which a user can edit).
  c_fake := jsonb_build_object('sub', u_owner, 'role', 'authenticated', 'email', 'someone@healthscan.com', 'user_metadata', jsonb_build_object('is_admin', true, 'role', 'admin'));

  v_log := v_log || pg_temp.chk('the live is_catalog_admin() reads token claims only (no email)', pg_get_functiondef('public.is_catalog_admin()'::regprocedure) not ilike '%email%', 'mentions email');
  v_log := v_log || pg_temp.chk('both triggers exist, each with a WHEN clause', (select count(*) from pg_trigger where tgname like 'zz_guard_protocol_suggested_flag_%' and not tgisinternal and tgtype & 1 = 1 and pg_get_triggerdef(oid) ilike '% WHEN %') = 2, 'trigger set differs');
  v_log := v_log || pg_temp.chk('nobody but the owner role can execute the trigger function directly', not has_function_privilege('authenticated', 'public.guard_protocol_suggested_flag()', 'execute') and not has_function_privilege('anon', 'public.guard_protocol_suggested_flag()', 'execute'), 'authenticated or anon can execute it');

  -- Inserts, as an ordinary owner (RLS allows own rows, so only the guard can refuse).
  r := pg_temp.try_as('authenticated', c_owner, format(s_ins, quote_literal(u_owner::text) || '::uuid', 'guard insert', 'true'));
  v_log := v_log || pg_temp.chk('an owner cannot insert a routine that is already suggested', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_ins, quote_literal(u_owner::text) || '::uuid', 'guard insert', 'false'));
  v_log := v_log || pg_temp.chk('an owner can still insert an ordinary routine', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_ins, quote_literal(u_owner::text) || '::uuid', 'guard insert', 'null'));
  v_log := v_log || pg_temp.chk('...and one with is_suggested null', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_ins, 'null::uuid', 'guard insert', 'false'));
  v_log := v_log || pg_temp.chk('an owner cannot insert a routine with no owner', r not like 'OK:1', r);

  -- Updates, as the owner.
  r := pg_temp.try_as('authenticated', c_owner, format(s_upd, 'is_suggested = true', r_user));
  v_log := v_log || pg_temp.chk('an owner cannot mark their own routine as suggested', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_upd, 'is_suggested = true, source = ' || quote_literal('system') || ', image_url = ' || quote_literal('https://example.invalid/x.png'), r_user));
  v_log := v_log || pg_temp.chk('...not even together with source and cover', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_updv, 'is_suggested = true', r_user));
  v_log := v_log || pg_temp.chk('...nor through the protocols view', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_fake, format(s_upd, 'is_suggested = true', r_user));
  v_log := v_log || pg_temp.chk('an email address or user_metadata that says admin does not count', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_upd, 'description = coalesce(description, ' || quote_literal('x') || ')', r_user));
  v_log := v_log || pg_temp.chk('an owner can still edit other columns of their routine', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_upd, 'is_suggested = false', r_user));
  v_log := v_log || pg_temp.chk('false stays false: setting the same value is not a change', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_upd, 'is_suggested = false', r_null));
  v_log := v_log || pg_temp.chk('null to false is not a change either', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_upd, 'user_id = null', r_user));
  v_log := v_log || pg_temp.chk('an owner cannot take their routine out of ownership (set the owner to null)', r not like 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_owner, format(s_upd, 'user_id = ' || quote_literal(u_other::text) || '::uuid', r_user));
  v_log := v_log || pg_temp.chk('...nor hand it to someone else', r not like 'OK:1', r);

  -- A Guardian who owns a suggested routine.
  r := pg_temp.try_as('authenticated', c_guardian, format(s_upd, 'description = coalesce(description, ' || quote_literal('x') || ')', r_guardian));
  v_log := v_log || pg_temp.chk('a Guardian can still edit the other columns of their suggested routine', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_guardian, format(s_upd, 'is_suggested = false', r_guardian));
  v_log := v_log || pg_temp.chk('a Guardian cannot un-suggest it', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_guardian, format(s_ins, quote_literal(u_guardian::text) || '::uuid', 'guard insert', 'true'));
  v_log := v_log || pg_temp.chk('a Guardian cannot insert a suggested routine', r like v_blocked, r);

  -- Upserts: the insert leg sees the proposed row first.
  r := pg_temp.try_as('authenticated', c_owner, format(s_ups, r_user, u_owner, 'guard fixture private'));
  v_log := v_log || pg_temp.chk('an owner''s upsert that sets the flag is refused', r like v_blocked, r);

  -- An anonymous caller.
  r := pg_temp.try_as('anon', '{"role":"anon"}'::jsonb, format(s_upd, 'is_suggested = true', r_house));
  v_log := v_log || pg_temp.chk('an anonymous caller cannot change the flag', r not like 'OK:1', r);

  -- Callers that may. The admin owns nothing: it acts on other people's routines through the public.protocols view, as the editor does.
  r := pg_temp.try_as('authenticated', c_admin, format(s_updv, 'is_suggested = true', r_user));
  v_log := v_log || pg_temp.chk('an admin (admin claim in the token) can mark someone else''s routine as suggested', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_admin, format(s_updv, 'is_suggested = false', r_user));
  v_log := v_log || pg_temp.chk('...and take it off again', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_admin, format(s_updv, 'is_suggested = true', r_house));
  v_log := v_log || pg_temp.chk('an admin can mark a house routine (no owner) as suggested', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_admin, format(s_updv, 'is_suggested = false', r_guardian));
  v_log := v_log || pg_temp.chk('an admin can change a Guardian''s routine', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_admin, format(s_ups, r_user, u_owner, 'guard fixture private'));
  v_log := v_log || pg_temp.chk('an admin''s upsert that sets the flag goes through', r = 'OK:1', r);
  r := pg_temp.try_as('service_role', '{"role":"service_role"}'::jsonb, format(s_upd, 'is_suggested = false', r_user));
  v_log := v_log || pg_temp.chk('the service role can change the flag', r = 'OK:1', r);
  r := pg_temp.try_as(current_user, null, format(s_upd, 'is_suggested = true', r_user));
  v_log := v_log || pg_temp.chk('a SQL session (migrations, the editor) can change it', r = 'OK:1', r);

  v_pass := (length(E'\n' || v_log) - length(replace(E'\n' || v_log, E'\nPASS ', ''))) / length(E'\nPASS ');
  v_fail := (length(E'\n' || v_log) - length(replace(E'\n' || v_log, E'\nFAIL ', ''))) / length(E'\nFAIL ');
  if v_pass + v_fail <> v_expected then v_log := v_log || format(E'FAIL expected %s checks, counted %s\n', v_expected, v_pass + v_fail); v_fail := v_fail + 1; end if;
  raise exception E'GUARD RESULT (transaction rolled back, nothing persisted): % passed, % failed\n%', v_pass, v_fail, v_log;
end
$guard$;
