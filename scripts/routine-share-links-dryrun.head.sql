-- DRY RUN, STAGING ONLY (mofhvoudjxinvpplsytd). Applies 20261020153000_routine_share_links.sql inside one DO block, runs
-- role-based tests against it, then raises an exception so EVERYTHING rolls back. The exception text is the result.
-- Regenerate after editing the migration:
--   { cat scripts/routine-share-links-dryrun.head.sql; cat supabase/migrations/20261020153000_routine_share_links.sql; cat scripts/routine-share-links-dryrun.tests.sql; } > <out>.sql
-- (see scripts/routine-share-links-dryrun.sh)

-- Runs one statement as a role with a given user id (auth.uid()) and optional request headers, returns 'OK:<value>' or 'ERR:<sqlstate>'.
create or replace function pg_temp.try_as(p_role text, p_uid uuid, p_sql text, p_headers jsonb default null) returns text
language plpgsql as $f$
declare r text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    perform set_config('request.headers', coalesce(p_headers::text, ''), true); -- what PostgREST sets from the HTTP request
    execute p_sql into r;
    reset role;
    return 'OK:' || coalesce(r, 'null');
  exception when others then
    reset role;
    return 'ERR:' || sqlstate;
  end;
end
$f$;

create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text) returns text
language sql as $f$
  select case when p_ok then 'PASS ' || p_name || E'\n' else 'FAIL ' || p_name || ' -> ' || coalesce(left(p_detail, 300), 'null') || E'\n' end
$f$;

do $dry$
declare
  v_pid uuid; v_owner uuid; v_other uuid; v_foreign uuid; v_guide uuid; v_gpid uuid; v_other_guide_visitor uuid; v_offer uuid;
  v_name text; v_item_count int; v_tok text; r text; v_log text := '';
  v_tok2 text; v_h1 jsonb; v_res jsonb; v_code text; v_slug text; v_aff text; v_before int; v_click1 uuid; v_reward numeric;
  v_clone uuid; v_clone3 uuid; v_clone4 uuid; v_third uuid; v_fourth uuid; v_ok boolean;
begin
