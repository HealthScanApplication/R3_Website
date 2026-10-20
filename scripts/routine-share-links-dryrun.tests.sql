
  -- ═══ TESTS (everything below runs inside the same transaction and is rolled back) ═══
  -- Fixtures: an owner with items on a routine, a different signed-in visitor, and a Guardian who owns a routine.
  select p.id, p.user_id into v_pid, v_owner
  from public.catalog_protocols p
  where p.user_id is not null and p.is_public = false and p.is_suggested is not true
    and exists (select 1 from public.protocol_items i where i.protocol_id = p.id)
  order by (select count(*) from public.protocol_items i where i.protocol_id = p.id) desc
  limit 1;
  select u.id into v_other from auth.users u where u.id <> v_owner limit 1;
  select p.id into v_foreign from public.catalog_protocols p where p.user_id is not null and p.user_id <> v_owner limit 1;
  select p.user_id, p.id into v_guide, v_gpid
  from public.catalog_protocols p join public.guide_profiles g on g.user_id = p.user_id
  limit 1;
  select u.id into v_other_guide_visitor from auth.users u where u.id <> v_guide limit 1;
  select p.name into v_name from public.catalog_protocols p where p.id = v_pid;
  select count(*) into v_item_count from public.protocol_items i where i.protocol_id = v_pid;
  v_log := v_log || format(E'fixture: routine %s (%s items), owner %s, visitor %s, guide %s\n', v_pid, v_item_count, v_owner, v_other, v_guide);

  -- premise: the visitor cannot read the routine directly (this is why the link needs SECURITY DEFINER)
  r := pg_temp.try_as('authenticated', v_other, format('select count(*)::text from public.catalog_protocols where id = %L', v_pid));
  v_log := v_log || pg_temp.chk('premise: visitor cannot select the routine', r = 'OK:0', r);
  r := pg_temp.try_as('authenticated', v_other, format('select count(*)::text from public.protocol_items where protocol_id = %L', v_pid));
  v_log := v_log || pg_temp.chk('premise: visitor cannot select its items', r = 'OK:0', r);

  -- owner: create, reuse, get
  r := pg_temp.try_as('authenticated', v_owner, format('select public.create_routine_share_link(%L)', v_pid));
  v_tok := substr(r, 4);
  v_log := v_log || pg_temp.chk('owner create returns a 32-hex token', r like 'OK:%' and v_tok ~ '^[0-9a-f]{32}$', r);
  r := pg_temp.try_as('authenticated', v_owner, format('select public.create_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('owner create again reuses the same token', r = 'OK:' || v_tok, r);
  r := pg_temp.try_as('authenticated', v_owner, format('select public.get_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('owner get returns the active token', r = 'OK:' || v_tok, r);

  -- not the owner: signed in
  r := pg_temp.try_as('authenticated', v_other, format('select public.create_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('non-owner create is refused (P0002)', r = 'ERR:P0002', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.get_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('non-owner get is refused (P0002)', r = 'ERR:P0002', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.revoke_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('non-owner revoke is refused (P0002)', r = 'ERR:P0002', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.create_routine_share_link(%L)', gen_random_uuid()));
  v_log := v_log || pg_temp.chk('unknown routine gives the same refusal as not-yours', r = 'ERR:P0002', r);

  -- anon: cannot call any owner function nor redeem
  r := pg_temp.try_as('anon', null, format('select public.create_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('anon create is denied (42501)', r = 'ERR:42501', r);
  r := pg_temp.try_as('anon', null, format('select public.get_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('anon get is denied (42501)', r = 'ERR:42501', r);
  r := pg_temp.try_as('anon', null, format('select public.revoke_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('anon revoke is denied (42501)', r = 'ERR:42501', r);
  r := pg_temp.try_as('anon', null, format('select public.redeem_routine_share(%L)', v_tok));
  v_log := v_log || pg_temp.chk('anon redeem is denied (42501)', r = 'ERR:42501', r);

  -- anon: the landing-page preview
  r := pg_temp.try_as('anon', null, format('select public.routine_share_preview(%L)::text', v_tok));
  v_log := v_log || pg_temp.chk('anon preview returns the routine name', r like 'OK:%' and (substr(r, 4)::jsonb ->> 'name') = v_name, r);
  r := pg_temp.try_as('anon', null, format('select (public.routine_share_preview(%L) - %L - %L - %L)::text', v_tok, 'name', 'description', 'creator'));
  v_log := v_log || pg_temp.chk('anon preview carries only name, description, creator', r = 'OK:{}', r);
  r := pg_temp.try_as('anon', null, format('select public.routine_share_preview(%L)::text', upper(v_tok)));
  v_log := v_log || pg_temp.chk('preview accepts an upper-case token (a QR may be upper-cased)', r like 'OK:{%', r);
  r := pg_temp.try_as('anon', null, format('select coalesce(public.routine_share_preview(%L)::text, %L)', repeat('0', 32), 'null'));
  v_log := v_log || pg_temp.chk('preview of an unknown token is null, not an error', r = 'OK:null', r);
  r := pg_temp.try_as('anon', null, format('select coalesce(public.routine_share_preview(%L)::text, %L)', 'not-a-token', 'null'));
  v_log := v_log || pg_temp.chk('preview of a malformed token is null', r = 'OK:null', r);
  r := pg_temp.try_as('anon', null, format('select coalesce(public.routine_share_preview(null)::text, %L)', 'null'));
  v_log := v_log || pg_temp.chk('preview of null is null', r = 'OK:null', r);

  -- signed-in visitor: redeem
  r := pg_temp.try_as('authenticated', v_other, format('select jsonb_array_length(public.redeem_routine_share(%L) -> %L)::text', v_tok, 'items'));
  v_log := v_log || pg_temp.chk('visitor redeem returns every item', r = 'OK:' || v_item_count, r);
  r := pg_temp.try_as('authenticated', v_other, format('select length(public.redeem_routine_share(%L)::text)::text', v_tok));
  v_log := v_log || format(E'NOTE redeem payload for this %s-item routine: %s bytes\n', v_item_count, r);
  r := pg_temp.try_as('authenticated', v_other, format('select (public.redeem_routine_share(%L) -> %L ->> %L)', v_tok, 'protocol', 'is_owner'));
  v_log := v_log || pg_temp.chk('visitor redeem says is_owner = false', r = 'OK:false', r);
  r := pg_temp.try_as('authenticated', v_owner, format('select (public.redeem_routine_share(%L) -> %L ->> %L)', v_tok, 'protocol', 'is_owner'));
  v_log := v_log || pg_temp.chk('owner redeem says is_owner = true', r = 'OK:true', r);
  r := pg_temp.try_as('authenticated', v_other, format($q$select count(*)::text from jsonb_array_elements(public.redeem_routine_share(%L) -> 'items') e where e ? 'created_by' or e ? 'profile_id' or e ? 'activity_session_id'$q$, v_tok));
  v_log := v_log || pg_temp.chk('redeemed items carry no created_by / profile_id / activity_session_id', r = 'OK:0', r);
  r := pg_temp.try_as('authenticated', v_other, format($q$select count(*)::text from jsonb_array_elements(public.redeem_routine_share(%L) -> 'items') e where e ? 'id' and e ? 'protocol_id' and e ? 'parent_protocol_item_id' and e ? 'display_name'$q$, v_tok));
  v_log := v_log || pg_temp.chk('redeemed items keep what a clone needs (id, protocol_id, parent_protocol_item_id, display_name)', r = 'OK:' || v_item_count, r);
  r := pg_temp.try_as('authenticated', v_other, format($q$select (public.redeem_routine_share(%L) -> 'protocol') ? 'owner_id' or (public.redeem_routine_share(%L) -> 'protocol') ? 'user_id'$q$, v_tok, v_tok));
  v_log := v_log || pg_temp.chk('redeemed protocol does not expose the owner user id', r = 'OK:false', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.redeem_routine_share(%L)::text', repeat('0', 32)));
  v_log := v_log || pg_temp.chk('redeem of an unknown token raises P0002', r = 'ERR:P0002', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.redeem_routine_share(%L)::text', 'zzz'));
  v_log := v_log || pg_temp.chk('redeem of a malformed token raises P0002', r = 'ERR:P0002', r);

  -- the table itself: nobody but service_role
  r := pg_temp.try_as('authenticated', v_owner, 'select count(*)::text from public.protocol_share_links');
  v_log := v_log || pg_temp.chk('authenticated cannot select the table, even the owner', r = 'ERR:42501', r);
  r := pg_temp.try_as('authenticated', v_other, format('insert into public.protocol_share_links (protocol_id, created_by) values (%L, %L) returning token', v_pid, v_other));
  v_log := v_log || pg_temp.chk('authenticated cannot mint a token for someone else''s routine by INSERT', r = 'ERR:42501', r);
  r := pg_temp.try_as('authenticated', v_owner, 'update public.protocol_share_links set revoked_at = null returning token');
  v_log := v_log || pg_temp.chk('authenticated cannot update the table', r = 'ERR:42501', r);
  r := pg_temp.try_as('authenticated', v_owner, 'delete from public.protocol_share_links returning token');
  v_log := v_log || pg_temp.chk('authenticated cannot delete from the table', r = 'ERR:42501', r);
  r := pg_temp.try_as('anon', null, 'select count(*)::text from public.protocol_share_links');
  v_log := v_log || pg_temp.chk('anon cannot select the table', r = 'ERR:42501', r);
  r := pg_temp.try_as('anon', null, format('insert into public.protocol_share_links (protocol_id, created_by) values (%L, %L) returning token', v_pid, v_other));
  v_log := v_log || pg_temp.chk('anon cannot insert into the table', r = 'ERR:42501', r);
  r := pg_temp.try_as('service_role', null, 'select count(*)::text from public.protocol_share_links');
  v_log := v_log || pg_temp.chk('service_role can read the table', r like 'OK:%', r);
  r := pg_temp.try_as('service_role', null, format('select public.routine_share_preview(%L)::text', v_tok));
  v_log := v_log || pg_temp.chk('service_role can call the preview', r like 'OK:{%', r);
  r := pg_temp.try_as('service_role', null, format('select public.create_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('service_role cannot call the owner functions', r = 'ERR:42501', r);

  -- constraints (as the migration role)
  begin
    insert into public.protocol_share_links (protocol_id, created_by) values (v_pid, v_owner);
    v_log := v_log || 'FAIL a second active link for the same routine was accepted' || E'\n';
  exception when unique_violation then
    v_log := v_log || E'PASS only one active link per routine (23505)\n';
  end;
  begin
    insert into public.protocol_share_links (protocol_id, created_by, token, revoked_at) values (v_pid, v_owner, 'xyz', now());
    v_log := v_log || 'FAIL a malformed token was accepted' || E'\n';
  exception when check_violation then
    v_log := v_log || E'PASS the token must be 32 lowercase hex (23514)\n';
  end;

  -- revoke, then a fresh token
  r := pg_temp.try_as('authenticated', v_owner, format('select public.revoke_routine_share_link(%L)::text', v_pid));
  v_log := v_log || pg_temp.chk('owner revoke returns true', r = 'OK:true', r);
  r := pg_temp.try_as('authenticated', v_owner, format('select public.revoke_routine_share_link(%L)::text', v_pid));
  v_log := v_log || pg_temp.chk('revoking again returns false', r = 'OK:false', r);
  r := pg_temp.try_as('anon', null, format('select coalesce(public.routine_share_preview(%L)::text, %L)', v_tok, 'null'));
  v_log := v_log || pg_temp.chk('a revoked token previews as null', r = 'OK:null', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.redeem_routine_share(%L)::text', v_tok));
  v_log := v_log || pg_temp.chk('a revoked token cannot be redeemed (P0002)', r = 'ERR:P0002', r);
  r := pg_temp.try_as('authenticated', v_owner, format('select coalesce(public.get_routine_share_link(%L), %L)', v_pid, 'none'));
  v_log := v_log || pg_temp.chk('get after revoke returns null', r = 'OK:none', r);
  r := pg_temp.try_as('authenticated', v_owner, format('select public.create_routine_share_link(%L)', v_pid));
  v_log := v_log || pg_temp.chk('create after revoke mints a NEW token', r like 'OK:%' and substr(r, 4) <> v_tok and substr(r, 4) ~ '^[0-9a-f]{32}$', r);
  r := pg_temp.try_as('anon', null, format('select coalesce(public.routine_share_preview(%L)::text, %L)', v_tok, 'null'));
  v_log := v_log || pg_temp.chk('the old token stays dead after the new one exists', r = 'OK:null', r);

  -- guide_offer_routines
  if v_guide is null then
    v_log := v_log || E'SKIP guide_offer_routines: no Guardian with a routine on this database\n';
  else
    insert into public.guide_offers (guide_id, kind, title, status) values (v_guide, 'routine', 'dry-run offer', 'draft') returning id into v_offer;
    r := pg_temp.try_as('authenticated', v_guide, format('insert into public.guide_offer_routines (offer_id, guide_id, protocol_id) values (%L, %L, %L) returning offer_id::text', v_offer, v_guide, v_gpid));
    v_log := v_log || pg_temp.chk('a Guardian can link their offer to their routine', r = 'OK:' || v_offer, r);
    r := pg_temp.try_as('authenticated', v_guide, format('select count(*)::text from public.guide_offer_routines where offer_id = %L', v_offer));
    v_log := v_log || pg_temp.chk('...and read it back', r = 'OK:1', r);
    r := pg_temp.try_as('authenticated', v_other_guide_visitor, format('select count(*)::text from public.guide_offer_routines where offer_id = %L', v_offer));
    v_log := v_log || pg_temp.chk('another user cannot see the link', r = 'OK:0', r);
    r := pg_temp.try_as('authenticated', v_other_guide_visitor, format('insert into public.guide_offer_routines (offer_id, guide_id, protocol_id) values (%L, %L, %L)', v_offer, v_other_guide_visitor, v_gpid));
    v_log := v_log || pg_temp.chk('another user cannot link to the Guardian''s offer', r = 'ERR:42501', r);
    r := pg_temp.try_as('anon', null, format('select count(*)::text from public.guide_offer_routines where offer_id = %L', v_offer));
    v_log := v_log || pg_temp.chk('anon cannot read offer routines', r = 'ERR:42501', r);
    if v_foreign is not null then
      delete from public.guide_offer_routines where offer_id = v_offer;
      r := pg_temp.try_as('authenticated', v_guide, format('insert into public.guide_offer_routines (offer_id, guide_id, protocol_id) values (%L, %L, %L)', v_offer, v_guide, v_foreign));
      v_log := v_log || pg_temp.chk('a Guardian cannot link an offer to someone else''s routine', r = 'ERR:42501', r);
    end if;
  end if;

  -- ═══ ATTRIBUTION: opens, adds, referral credit, stats ═══
  -- The first token (v_tok) was revoked above; the live one is the token minted after it.
  r := pg_temp.try_as('authenticated', v_owner, format('select public.get_routine_share_link(%L)', v_pid));
  v_tok2 := substr(r, 4);
  select code into v_code from public.referral_codes where user_id = v_owner;
  select g.slug into v_slug from public.guide_profiles g where g.user_id = v_owner and g.status = 'approved';
  select count(*) into v_before from public.affiliate_clicks where product_id = v_pid::text;
  v_h1 := jsonb_build_object('x-forwarded-for', '203.0.113.45, 10.0.0.1', 'user-agent', 'DryRunUA/1.0', 'cf-ipcountry', 'nl');

  -- an open
  r := pg_temp.try_as('anon', null, format('select public.record_routine_share_click(%L, %L, %L, %L)::text', v_tok2, 'Guardian-Test', 'QR', 'spring-sleep'), v_h1);
  v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
  v_click1 := (v_res ->> 'click_id')::uuid;
  v_log := v_log || pg_temp.chk('anon open is counted and returns the owner''s referral code', (v_res ->> 'counted') = 'true' and v_click1 is not null and (v_res ->> 'ref') is not distinct from v_code, r);
  select format('%s|%s|%s|%s|%s|%s|%s|%s|%s', provider, product_id = v_pid::text, utm_source, utm_medium, utm_campaign, host(ip_address) || '/' || masklen(ip_address), user_agent, country_code, destination_url)
    into v_aff from public.affiliate_clicks where id = v_click1;
  v_log := v_log || pg_temp.chk('the click row: provider, routine, utm lower-cased, IP truncated to /24, UA, country, no token in the URL',
    v_aff = 'guardian|t|guardian-test|qr|spring-sleep|203.0.113.0/24|DryRunUA/1.0|NL|https://routine3.com/routine/<token>', v_aff);
  v_log := v_log || pg_temp.chk('the raw IP is stored nowhere', (select count(*) from public.affiliate_clicks where host(ip_address) = '203.0.113.45') = 0
    and (select count(*) from public.routine_share_rate where ip_hash like '%203.0.113.45%' or length(ip_hash) <> 64) = 0, 'raw ip found');
  v_log := v_log || pg_temp.chk('the click row never holds the token', (select count(*) from public.affiliate_clicks where destination_url like '%' || v_tok2 || '%' or utm_source like '%' || v_tok2 || '%') = 0, 'token found');

  -- defaults and sanitising
  r := pg_temp.try_as('anon', null, format('select public.record_routine_share_click(%L)::text', v_tok2), jsonb_build_object('x-forwarded-for', '203.0.113.77', 'user-agent', 'DefaultsUA'));
  v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
  select format('%s|%s', utm_source is not distinct from case when v_slug is not null then 'guardian-' || v_slug end, utm_medium) into v_aff from public.affiliate_clicks where id = (v_res ->> 'click_id')::uuid;
  v_log := v_log || pg_temp.chk('no utm: source defaults to guardian-<slug>, medium to link', v_aff = 't|link', coalesce(v_aff, r));
  r := pg_temp.try_as('anon', null, format('select public.record_routine_share_click(%L, %L, %L, %L, %L)::text', v_tok2, 'a@b.com', 'x y', '<script>alert(1)</script>', repeat('a', 65)), jsonb_build_object('x-forwarded-for', '203.0.113.78', 'user-agent', 'DirtyUA'));
  v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
  select format('%s|%s|%s|%s', utm_source not like '%@%' or utm_source is null, utm_medium, utm_campaign is null, utm_content is null) into v_aff from public.affiliate_clicks where id = (v_res ->> 'click_id')::uuid;
  v_log := v_log || pg_temp.chk('an email, a space, markup and an over-long value are dropped, not stored', v_aff = 't|link|t|t', coalesce(v_aff, r));

  -- unknown, malformed and revoked tokens write nothing
  select count(*) into v_before from public.affiliate_clicks where product_id = v_pid::text;
  r := pg_temp.try_as('anon', null, format('select coalesce(public.record_routine_share_click(%L)::text, %L)', repeat('0', 32), 'null'), v_h1);
  v_log := v_log || pg_temp.chk('click on an unknown token returns null', r = 'OK:null', r);
  r := pg_temp.try_as('anon', null, format('select coalesce(public.record_routine_share_click(%L)::text, %L)', 'nope', 'null'), v_h1);
  v_log := v_log || pg_temp.chk('click on a malformed token returns null', r = 'OK:null', r);
  r := pg_temp.try_as('anon', null, format('select coalesce(public.record_routine_share_click(%L)::text, %L)', v_tok, 'null'), v_h1);
  v_log := v_log || pg_temp.chk('click on the revoked token returns null', r = 'OK:null', r);
  v_log := v_log || pg_temp.chk('...and none of those wrote a row', (select count(*) from public.affiliate_clicks where product_id = v_pid::text) = v_before, 'rows changed');

  -- the owner's own open is not an open
  r := pg_temp.try_as('authenticated', v_owner, format('select public.record_routine_share_click(%L)::text', v_tok2), jsonb_build_object('x-forwarded-for', '203.0.113.99', 'user-agent', 'OwnerUA'));
  v_log := v_log || pg_temp.chk('the owner opening their own link is not counted (but gets the ref)', r like 'OK:{%' and (substr(r, 4)::jsonb ->> 'counted') = 'false' and (substr(r, 4)::jsonb ->> 'ref') is not distinct from v_code, r);

  -- rate limit per IP: 3 counted opens per 10 minutes, the 4th is not counted and still hands the visitor the ref
  v_ok := true;
  for i in 1..4 loop
    r := pg_temp.try_as('anon', null, format('select public.record_routine_share_click(%L)::text', v_tok2), jsonb_build_object('x-forwarded-for', '198.51.100.9', 'user-agent', 'RateUA'));
    v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
    if (v_res ->> 'counted') is distinct from (case when i <= 3 then 'true' else 'false' end) then v_ok := false; end if;
    if (v_res ->> 'ref') is distinct from v_code then v_ok := false; end if;
  end loop;
  v_log := v_log || pg_temp.chk('one IP: three opens counted, the fourth is not, all four get the ref', v_ok and (select count(*) from public.affiliate_clicks where user_agent = 'RateUA') = 3, 'rate limit');
  r := pg_temp.try_as('anon', null, format('select public.record_routine_share_click(%L)::text', v_tok2), jsonb_build_object('x-forwarded-for', '198.51.100.10', 'user-agent', 'RateUA2'));
  v_log := v_log || pg_temp.chk('a different IP is not held back by it', r like 'OK:{%' and (substr(r, 4)::jsonb ->> 'counted') = 'true', r);
  r := pg_temp.try_as('anon', null, format('select public.record_routine_share_click(%L)::text', v_tok2));
  v_log := v_log || pg_temp.chk('no readable IP: counted, stored with no address', r like 'OK:{%' and (substr(r, 4)::jsonb ->> 'counted') = 'true', r);

  -- lockdown
  foreach v_aff in array array['public.affiliate_clicks', 'public.routine_share_adds', 'public.routine_share_rate', 'public.routine_share_daily_salt'] loop
    r := pg_temp.try_as('anon', null, format('select count(*)::text from %s', v_aff));
    v_log := v_log || pg_temp.chk('anon cannot read ' || v_aff, r = 'ERR:42501', r);
    r := pg_temp.try_as('authenticated', v_owner, format('select count(*)::text from %s', v_aff));
    v_log := v_log || pg_temp.chk('authenticated cannot read ' || v_aff, r = 'ERR:42501', r);
    r := pg_temp.try_as('service_role', null, format('select count(*)::text from %s', v_aff));
    v_log := v_log || pg_temp.chk('service_role can read ' || v_aff, r like 'OK:%', r);
  end loop;
  r := pg_temp.try_as('anon', null, format('select public.routine_share_clean_utm(%L)', 'x'));
  v_log := v_log || pg_temp.chk('the utm helper is not callable by anon', r = 'ERR:42501', r);
  r := pg_temp.try_as('authenticated', v_owner, format('select public.routine_share_clean_utm(%L)', 'x'));
  v_log := v_log || pg_temp.chk('...nor by authenticated', r = 'ERR:42501', r);

  -- adds: fixtures (a clone owned by the visitor; a fresh account; no referrer yet)
  select id into v_third from auth.users where id not in (v_owner, v_other) order by id limit 1;
  select id into v_fourth from auth.users where id not in (v_owner, v_other, v_third) order by id limit 1;
  delete from public.referrals where referred_id in (v_other, v_third, v_fourth);
  delete from public.referral_codes where user_id = v_other;
  insert into public.catalog_protocols (user_id, name, type) select v_other, 'dry-run copy', type from public.catalog_protocols where id = v_pid returning id into v_clone;
  begin
    update auth.users set created_at = now() - interval '1 day' where id = v_other;
    if v_third is not null then update auth.users set created_at = now() - interval '60 days' where id = v_third; end if;
    if v_fourth is not null then update auth.users set created_at = now() - interval '1 day' where id = v_fourth; end if;
    v_ok := true;
  exception when others then
    v_ok := false;
    v_log := v_log || E'SKIP add tests that need fresh accounts: cannot edit auth.users.created_at here (' || sqlerrm || E')\n';
  end;
  select reward_amount into v_reward from public.referral_settings where is_active order by created_at desc limit 1;

  r := pg_temp.try_as('anon', null, format('select public.record_routine_share_add(%L, %L)', v_tok2, v_clone));
  v_log := v_log || pg_temp.chk('anon cannot record an add (42501)', r = 'ERR:42501', r);
  r := pg_temp.try_as('authenticated', v_owner, format('select public.record_routine_share_add(%L, %L)::text', v_tok2, v_pid));
  v_log := v_log || pg_temp.chk('the owner adding their own routine is not an add', r like 'OK:{%' and (substr(r, 4)::jsonb ->> 'added') = 'false' and (substr(r, 4)::jsonb ->> 'reason') = 'own_routine', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.record_routine_share_add(%L, %L)::text', v_tok2, v_pid));
  v_log := v_log || pg_temp.chk('an add must name a routine the caller owns (P0002)', r = 'ERR:P0002', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.record_routine_share_add(%L, %L)::text', v_tok, v_clone));
  v_log := v_log || pg_temp.chk('the revoked token cannot be added (P0002)', r = 'ERR:P0002', r);
  r := pg_temp.try_as('authenticated', v_other, format('select public.record_routine_share_add(%L, %L)::text', 'nope', v_clone));
  v_log := v_log || pg_temp.chk('a malformed token cannot be added (P0002)', r = 'ERR:P0002', r);

  if v_ok then
    r := pg_temp.try_as('authenticated', v_other, format('select public.record_routine_share_add(%L, %L, %L, %L, %L, %L)::text', v_tok2, v_clone, v_click1, 'Guardian-Test', 'QR', 'spring-sleep'));
    v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
    v_log := v_log || pg_temp.chk('a new account adds: added, credited, tied to the click it came from', (v_res ->> 'added') = 'true' and (v_res ->> 'referral_credited') = 'true' and (v_res ->> 'click_id') = v_click1::text, r);
    v_log := v_log || pg_temp.chk('...the click is marked converted', (select converted and conversion_at is not null and external_order_id like 'routine-add:%' from public.affiliate_clicks where id = v_click1), 'click not converted');
    v_log := v_log || pg_temp.chk('...a referrals row: referrer = the owner, referred = the user, completed, reward from referral_settings',
      (select count(*) from public.referrals where referrer_id = v_owner and referred_id = v_other and status = 'completed' and reward_amount = coalesce(v_reward, 0)) = 1, 'no referrals row');
    r := pg_temp.try_as('authenticated', v_other, format('select public.record_routine_share_add(%L, %L)::text', v_tok2, v_clone));
    v_log := v_log || pg_temp.chk('adding again is not a second add (already_added)', r like 'OK:{%' and (substr(r, 4)::jsonb ->> 'added') = 'false' and (substr(r, 4)::jsonb ->> 'reason') = 'already_added', r);
    v_log := v_log || pg_temp.chk('...one add, one referral', (select count(*) from public.routine_share_adds where protocol_id = v_pid and user_id = v_other) = 1 and (select count(*) from public.referrals where referred_id = v_other) = 1, 'duplicates');

    if v_third is not null then
      insert into public.catalog_protocols (user_id, name, type) select v_third, 'dry-run copy', type from public.catalog_protocols where id = v_pid returning id into v_clone3;
      r := pg_temp.try_as('authenticated', v_third, format('select public.record_routine_share_add(%L, %L)::text', v_tok2, v_clone3));
      v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
      v_log := v_log || pg_temp.chk('an account older than 14 days still adds, but earns no referral', (v_res ->> 'added') = 'true' and (v_res ->> 'referral_credited') = 'false'
        and (select count(*) from public.referrals where referred_id = v_third) = 0, r);
      v_log := v_log || pg_temp.chk('an add with no click id converts the most recent open click', (v_res ->> 'click_id') is not null and (select converted from public.affiliate_clicks where id = (v_res ->> 'click_id')::uuid), r);
    end if;
    if v_fourth is not null then
      insert into public.referrals (referrer_id, referred_id, status, reward_amount) values (v_third, v_fourth, 'completed', 0);
      insert into public.catalog_protocols (user_id, name, type) select v_fourth, 'dry-run copy', type from public.catalog_protocols where id = v_pid returning id into v_clone4;
      r := pg_temp.try_as('authenticated', v_fourth, format('select public.record_routine_share_add(%L, %L)::text', v_tok2, v_clone4));
      v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
      v_log := v_log || pg_temp.chk('a new account that already has a referrer adds, and the first referrer keeps the credit', (v_res ->> 'added') = 'true' and (v_res ->> 'referral_credited') = 'false'
        and (select referrer_id from public.referrals where referred_id = v_fourth) = v_third, r);
    end if;

    -- stats
    r := pg_temp.try_as('authenticated', v_owner, format('select public.routine_share_stats(%L)::text', v_pid));
    v_res := case when r like 'OK:{%' then substr(r, 4)::jsonb else '{}'::jsonb end;
    v_log := v_log || pg_temp.chk('stats: opens, adds and credited add up', (v_res ->> 'opens')::int >= 6 and (v_res ->> 'adds')::int = (select count(*) from public.routine_share_adds where protocol_id = v_pid)
      and (v_res ->> 'credited')::int = 1, r);
    v_log := v_log || pg_temp.chk('stats carry counts only, no people',
      (select array_agg(k order by k) from jsonb_object_keys(v_res) k) = array['adds', 'adds_7d', 'by_medium', 'credited', 'last_open_at', 'opens', 'opens_7d']
      and position(v_other::text in r) = 0 and position(v_owner::text in r) = 0, r);
    v_log := v_log || pg_temp.chk('stats by medium include the QR open and its add', exists (select 1 from jsonb_array_elements(v_res -> 'by_medium') e where e ->> 'medium' = 'qr' and (e ->> 'opens')::int >= 1 and (e ->> 'adds')::int >= 1), r);
  end if;
  r := pg_temp.try_as('authenticated', v_other, format('select public.routine_share_stats(%L)::text', v_pid));
  v_log := v_log || pg_temp.chk('stats are owner only (P0002)', r = 'ERR:P0002', r);
  r := pg_temp.try_as('anon', null, format('select public.routine_share_stats(%L)::text', v_pid));
  v_log := v_log || pg_temp.chk('stats are not for anon (42501)', r = 'ERR:42501', r);

  -- creating a link makes sure the owner has a referral code
  r := pg_temp.try_as('authenticated', v_other, format('select public.create_routine_share_link(%L)', v_clone));
  v_log := v_log || pg_temp.chk('creating a link also creates the owner''s referral code', r like 'OK:%' and (select count(*) from public.referral_codes where user_id = v_other) = 1, r);

  -- the per-link hourly cap (last: it fills the hour)
  insert into public.affiliate_clicks (product_id, provider) select v_pid::text, 'guardian' from generate_series(1, 300);
  r := pg_temp.try_as('anon', null, format('select public.record_routine_share_click(%L)::text', v_tok2), jsonb_build_object('x-forwarded-for', '192.0.2.200', 'user-agent', 'CapUA'));
  v_log := v_log || pg_temp.chk('past 300 opens in an hour the link stops counting, and still hands over the ref', r like 'OK:{%' and (substr(r, 4)::jsonb ->> 'counted') = 'false' and (substr(r, 4)::jsonb ->> 'ref') is not distinct from v_code, r);

  raise exception E'DRYRUN RESULT (transaction rolled back, nothing applied):\n%', v_log;
end
$dry$;
