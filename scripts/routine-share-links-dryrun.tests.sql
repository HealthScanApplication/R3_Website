
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

  raise exception E'DRYRUN RESULT (transaction rolled back, nothing applied):\n%', v_log;
end
$dry$;
