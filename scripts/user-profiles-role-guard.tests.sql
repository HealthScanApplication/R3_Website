-- STAGING ONLY (project ref mofhvoudjxinvpplsytd). Tests guard_user_profile_role (20261027130000_user_profiles_role_guard.sql) as
-- different callers on throwaway users it creates itself, then raises an exception so EVERYTHING rolls back.
--   dry run (migration not applied yet):  cat supabase/migrations/20261027130000_user_profiles_role_guard.sql scripts/user-profiles-role-guard.tests.sql
--   after applying the migration:         scripts/user-profiles-role-guard.tests.sql on its own
-- Send it as ONE request so the migration and the tests share a transaction. If you run it with psql, wrap it in begin ... .
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
  u_user uuid := gen_random_uuid();     -- an ordinary account with a profile
  u_other uuid := gen_random_uuid();    -- another ordinary account
  u_noprof1 uuid := gen_random_uuid();  -- accounts with no profile row yet
  u_noprof2 uuid := gen_random_uuid();
  u_roleadmin uuid := gen_random_uuid();-- a profile whose stored role is admin but whose token carries no admin claim
  u_target uuid := gen_random_uuid();   -- a profile an admin will change
  c_user jsonb; c_other jsonb; c_np1 jsonb; c_np2 jsonb; c_roleadmin jsonb; c_admin jsonb;
  r text; v_log text := ''; v_pass int; v_fail int; v_expected constant int := 17;
  v_blocked constant text := 'ERR:42501:Only an admin can change a profile''s role.%';
  v_id uuid;
begin
  -- Fixtures, written as the SQL role (privileged), all rolled back at the end.
  foreach v_id in array array[u_user, u_other, u_noprof1, u_noprof2, u_roleadmin, u_target] loop
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guard-' || v_id || '@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
  end loop;
  insert into public.user_profiles (id, email) values (u_user, 'p-' || u_user || '@example.invalid'), (u_other, 'p-' || u_other || '@example.invalid'), (u_target, 'p-' || u_target || '@example.invalid');
  insert into public.user_profiles (id, email, role) values (u_roleadmin, 'p-' || u_roleadmin || '@example.invalid', 'admin');
  c_user := jsonb_build_object('sub', u_user, 'role', 'authenticated');
  c_other := jsonb_build_object('sub', u_other, 'role', 'authenticated');
  c_np1 := jsonb_build_object('sub', u_noprof1, 'role', 'authenticated');
  c_np2 := jsonb_build_object('sub', u_noprof2, 'role', 'authenticated');
  c_roleadmin := jsonb_build_object('sub', u_roleadmin, 'role', 'authenticated');
  c_admin := jsonb_build_object('sub', u_roleadmin, 'role', 'authenticated', 'app_metadata', jsonb_build_object('is_admin', true));

  v_log := v_log || pg_temp.chk('the live is_catalog_admin() reads token claims only (no email)', pg_get_functiondef('public.is_catalog_admin()'::regprocedure) not ilike '%email%', 'mentions email');

  -- An ordinary owner.
  r := pg_temp.try_as('authenticated', c_user, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'admin', u_user));
  v_log := v_log || pg_temp.chk('an owner cannot change their own role to admin', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_user, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'super_admin', u_user));
  v_log := v_log || pg_temp.chk('...nor to super_admin', r like v_blocked, r);
  v_log := v_log || pg_temp.chk('...and the admin check still refuses that account', not public.is_admin(u_user), 'is_admin returned true');
  v_log := v_log || pg_temp.chk('...and the super-admin check still refuses it', not public.is_super_admin(u_user), 'is_super_admin returned true');
  r := pg_temp.try_as('authenticated', c_user, format('with u as (update public.user_profiles set full_name = %L, avatar_url = %L, preferences = %L::jsonb where id = %L returning 1) select count(*)::text from u', 'Test Name', 'https://x/y.png', '{"units":"metric"}', u_user));
  v_log := v_log || pg_temp.chk('an owner can still edit name, photo and preferences', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_user, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'user', u_user));
  v_log := v_log || pg_temp.chk('writing the role they already have is not a change', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_user, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'admin', u_other));
  v_log := v_log || pg_temp.chk('an owner cannot reach someone else''s profile at all (0 rows)', r = 'OK:0', r);

  -- Inserting a profile row.
  r := pg_temp.try_as('authenticated', c_np1, format('with i as (insert into public.user_profiles (id, email, role) values (%L, %L, %L) returning 1) select count(*)::text from i', u_noprof1, 'n1-' || u_noprof1 || '@example.invalid', 'super_admin'));
  v_log := v_log || pg_temp.chk('a new profile cannot be created with an admin role', r like v_blocked, r);
  r := pg_temp.try_as('authenticated', c_np2, format('with i as (insert into public.user_profiles (id, email) values (%L, %L) returning 1) select count(*)::text from i', u_noprof2, 'n2-' || u_noprof2 || '@example.invalid'));
  v_log := v_log || pg_temp.chk('a new profile can still be created with the default role', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_np2, format('select role from public.user_profiles where id = %L', u_noprof2));
  v_log := v_log || pg_temp.chk('...and it is a plain user', r = 'OK:user', r);

  -- An anonymous caller.
  r := pg_temp.try_as('anon', '{"role":"anon"}'::jsonb, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'admin', u_user));
  v_log := v_log || pg_temp.chk('an anonymous caller cannot change a role', r not like 'OK:1', r);

  -- A profile that merely STORES an admin role, without the admin claim in the token, gets no special treatment.
  r := pg_temp.try_as('authenticated', c_roleadmin, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'admin', u_target));
  v_log := v_log || pg_temp.chk('a stored admin role without the admin claim cannot change another profile''s role', r like v_blocked, r);

  -- Callers that may.
  r := pg_temp.try_as('authenticated', c_admin, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'admin', u_target));
  v_log := v_log || pg_temp.chk('an admin (admin claim in the token) can change another profile''s role', r = 'OK:1', r);
  r := pg_temp.try_as('authenticated', c_admin, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'user', u_target));
  v_log := v_log || pg_temp.chk('...and change it back', r = 'OK:1', r);
  r := pg_temp.try_as('service_role', '{"role":"service_role"}'::jsonb, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'admin', u_target));
  v_log := v_log || pg_temp.chk('the service role can change a role', r = 'OK:1', r);
  r := pg_temp.try_as(current_user, null, format('with u as (update public.user_profiles set role = %L where id = %L returning 1) select count(*)::text from u', 'user', u_target));
  v_log := v_log || pg_temp.chk('a SQL session (migrations, the editor) can change a role', r = 'OK:1', r);

  v_pass := (length(E'\n' || v_log) - length(replace(E'\n' || v_log, E'\nPASS ', ''))) / length(E'\nPASS ');
  v_fail := (length(E'\n' || v_log) - length(replace(E'\n' || v_log, E'\nFAIL ', ''))) / length(E'\nFAIL ');
  if v_pass + v_fail <> v_expected then v_log := v_log || format(E'FAIL expected %s checks, counted %s\n', v_expected, v_pass + v_fail); v_fail := v_fail + 1; end if;
  raise exception E'GUARD RESULT (transaction rolled back, nothing persisted): % passed, % failed\n%', v_pass, v_fail, v_log;
end
$guard$;
