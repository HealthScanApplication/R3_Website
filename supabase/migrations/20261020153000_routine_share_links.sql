-- Routine share links: a Guardian's routine opens in the R³ app for a visitor, even when the routine is not public.
--
-- STAGING ONLY until John approves production. Not applied by this commit.
--
-- Adapted from the mobile repo's unapplied design (AI-Health-Scan_Mobile
-- supabase/migrations/20261005100000_routine_share_links.sql). The rule it carries, from John (2026-10-03): the
-- routine stays UNLISTED and the link is the capability. Holding the token is what lets a stranger read the routine,
-- and nothing else does.
--
-- Why there is no "readable by anyone with the token" policy
--   A row-level policy cannot express "only if you already know the secret": the secret is IN the row being
--   protected, so checking it needs read access first. profile_shares shipped a policy named "Anyone can read pending
--   invite by code" with no code predicate (DEV-71 / DEV-1423). So protocol_share_links has RLS on, NO policy, and no
--   privilege for anon or authenticated at all. Everything goes through SECURITY DEFINER functions that take the
--   token as an argument and return nothing unless it matches.
--
-- Where this differs from the mobile draft
--   * The mobile draft let the owner INSERT rows directly (FOR ALL with only created_by = auth.uid()), so a caller
--     could mint a token for a routine they do not own. Here nobody inserts directly: create_routine_share_link()
--     checks ownership and is the only writer.
--   * One active link per routine (partial unique index); revoking is a timestamp, and the next create mints a new token.
--   * Anonymous visitors get a preview (name, description, creator) so the web landing page can say what the link is.
--     Only a signed-in user gets the items, and without the owner-identifying columns (created_by, profile_id,
--     activity_session_id). The result says is_owner instead of returning the owner's user id.
--
-- This project does not grant service_role anything on new tables, and its default privileges DO grant anon and
-- authenticated full DML on new public tables. Both are handled explicitly below.

create extension if not exists pgcrypto with schema extensions;

-- ── The links ────────────────────────────────────────────────────────────────
create table if not exists public.protocol_share_links (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.catalog_protocols(id) on delete cascade,
  -- 32 hex chars = 128 bits, generated in the DATABASE so a weak client RNG cannot produce a guessable token.
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  -- Revocation is a timestamp, not a delete, so a revoked link stays distinguishable from one that never existed.
  revoked_at timestamptz,
  constraint protocol_share_links_token_shape check (token ~ '^[0-9a-f]{32}$')
);

-- At most one live link per routine: create_routine_share_link() reuses it instead of piling up tokens.
create unique index if not exists protocol_share_links_one_active_idx
  on public.protocol_share_links (protocol_id) where revoked_at is null;

alter table public.protocol_share_links enable row level security;

-- Deliberately NO policy and NO privilege for anon/authenticated. RLS with no policy already denies; the revoke is the
-- second lock, needed because this project's default privileges would otherwise grant them DML.
revoke all on public.protocol_share_links from public, anon, authenticated;
grant select, insert, update, delete on public.protocol_share_links to service_role;

-- ── Owner functions ──────────────────────────────────────────────────────────
-- One message for "no such routine" and "not yours": telling them apart would let a caller probe which ids exist.

create or replace function public.create_routine_share_link(p_protocol_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_token text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select user_id into v_owner from public.catalog_protocols where id = p_protocol_id;
  if not found or v_owner is distinct from v_uid then
    raise exception 'routine not found' using errcode = 'P0002';
  end if;

  select token into v_token
  from public.protocol_share_links
  where protocol_id = p_protocol_id and revoked_at is null;
  if v_token is not null then
    return v_token;
  end if;

  insert into public.protocol_share_links (protocol_id, created_by)
  values (p_protocol_id, v_uid)
  on conflict (protocol_id) where revoked_at is null do nothing
  returning token into v_token;

  if v_token is null then
    -- Lost a race with a second create for the same routine: use the winner's token.
    select token into v_token
    from public.protocol_share_links
    where protocol_id = p_protocol_id and revoked_at is null;
  end if;
  return v_token;
end;
$$;

create or replace function public.get_routine_share_link(p_protocol_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select user_id into v_owner from public.catalog_protocols where id = p_protocol_id;
  if not found or v_owner is distinct from v_uid then
    raise exception 'routine not found' using errcode = 'P0002';
  end if;

  return (select token from public.protocol_share_links where protocol_id = p_protocol_id and revoked_at is null);
end;
$$;

create or replace function public.revoke_routine_share_link(p_protocol_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select user_id into v_owner from public.catalog_protocols where id = p_protocol_id;
  if not found or v_owner is distinct from v_uid then
    raise exception 'routine not found' using errcode = 'P0002';
  end if;

  update public.protocol_share_links set revoked_at = now()
  where protocol_id = p_protocol_id and revoked_at is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ── Redemption ───────────────────────────────────────────────────────────────

-- What the web landing page may show before anyone signs in. A bad, revoked or malformed token returns null (not an
-- error), so the page can fall back to a generic message and the response says nothing about which strings are real.
-- The creator is the routine's own creator text, else an APPROVED Guardian's display name.
create or replace function public.routine_share_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_row record;
begin
  if v_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select p.name, p.description, coalesce(nullif(btrim(p.creator), ''), g.display_name) as creator
  into v_row
  from public.protocol_share_links l
  join public.catalog_protocols p on p.id = l.protocol_id
  left join public.guide_profiles g on g.user_id = p.user_id and g.status = 'approved'
  where l.token = v_token and l.revoked_at is null;

  if not found then
    return null;
  end if;
  return jsonb_build_object('name', v_row.name, 'description', v_row.description, 'creator', v_row.creator);
end;
$$;

-- The full routine for a signed-in user, to clone. A SNAPSHOT (json), not a reference: the caller still cannot select
-- the routine afterwards, so ids would be useless. Same name and error codes as the mobile draft; same single message
-- for "no such token" and "revoked" so it is not an oracle.
create or replace function public.redeem_routine_share(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_protocol public.catalog_protocols;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_token !~ '^[0-9a-f]{32}$' then
    raise exception 'share link not found' using errcode = 'P0002';
  end if;

  select p.* into v_protocol
  from public.protocol_share_links l
  join public.catalog_protocols p on p.id = l.protocol_id
  where l.token = v_token and l.revoked_at is null;
  if not found then
    raise exception 'share link not found' using errcode = 'P0002';
  end if;

  -- Without the columns that point at the sharer or at one of their family profiles.
  select coalesce(
    jsonb_agg(
      to_jsonb(i) - 'created_by' - 'profile_id' - 'activity_session_id'
      order by i.week_number nulls first, i.day_number nulls first, i.scheduled_time nulls last, i.sort_order nulls last, i.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.protocol_items i
  where i.protocol_id = v_protocol.id;

  return jsonb_build_object(
    'protocol', jsonb_build_object(
      'id', v_protocol.id,
      'name', v_protocol.name,
      'description', v_protocol.description,
      'type', v_protocol.type,
      'image_url', v_protocol.image_url,
      'source_attribution', v_protocol.source_attribution,
      'creator', v_protocol.creator,
      'category', v_protocol.category,
      'tags', v_protocol.tags,
      'total_days', v_protocol.total_days,
      'frequency', v_protocol.frequency,
      'frequency_days', v_protocol.frequency_days,
      'start_time', v_protocol.start_time,
      'phases', v_protocol.phases,
      'nutrition_cycle_days', v_protocol.nutrition_cycle_days,
      'fitness_cycle_days', v_protocol.fitness_cycle_days,
      -- Answers "is this mine?" (open it, do not offer a clone) without handing over the owner's user id.
      'is_owner', v_protocol.user_id is not distinct from v_uid
    ),
    'items', v_items
  );
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions, and this project's defaults add anon/authenticated/service_role.
-- Close all of that, then open exactly what each function is for.
revoke all on function public.create_routine_share_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_routine_share_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.revoke_routine_share_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.routine_share_preview(text) from public, anon, authenticated, service_role;
revoke all on function public.redeem_routine_share(text) from public, anon, authenticated, service_role;

grant execute on function public.create_routine_share_link(uuid) to authenticated;
grant execute on function public.get_routine_share_link(uuid) to authenticated;
grant execute on function public.revoke_routine_share_link(uuid) to authenticated;
grant execute on function public.routine_share_preview(text) to anon, authenticated, service_role;
grant execute on function public.redeem_routine_share(text) to authenticated;

-- ── Which routine an offer delivers ──────────────────────────────────────────
-- guide_offers has no protocol link today (onboarding makes a routine named like the offer, nothing records it).
-- A separate table, not a guide_offers column: guide_offers is publicly readable for published offers, and a column
-- there would publish the routine's id. This table is the Guardian's alone.
create table if not exists public.guide_offer_routines (
  offer_id uuid primary key references public.guide_offers(id) on delete cascade,
  guide_id uuid not null references public.guide_profiles(user_id) on delete cascade,
  protocol_id uuid not null references public.catalog_protocols(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists guide_offer_routines_guide_idx on public.guide_offer_routines (guide_id);

alter table public.guide_offer_routines enable row level security;

drop policy if exists "guides manage own offer routines" on public.guide_offer_routines;
create policy "guides manage own offer routines" on public.guide_offer_routines
  for all to authenticated
  using (guide_id = (select auth.uid()))
  with check (
    guide_id = (select auth.uid())
    and exists (select 1 from public.guide_offers o where o.id = offer_id and o.guide_id = (select auth.uid()))
    and exists (select 1 from public.catalog_protocols p where p.id = protocol_id and p.user_id = (select auth.uid()))
  );

revoke all on public.guide_offer_routines from public, anon, authenticated;
grant select, insert, update, delete on public.guide_offer_routines to authenticated;
grant select, insert, update, delete on public.guide_offer_routines to service_role;

notify pgrst, 'reload schema';
