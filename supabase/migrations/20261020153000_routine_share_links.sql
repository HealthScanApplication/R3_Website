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
--
-- Attribution (added 2026-10-20): the link also credits the routine's owner (the Guardian).
--   * The token already identifies the owner, so credit comes from the token, not from a code in the URL. Optional
--     utm_source / utm_medium / utm_campaign / utm_content ride along in the query string.
--   * record_routine_share_click (anon) writes one affiliate_clicks row per open: provider 'guardian', product_id = the
--     routine's id, the IP truncated to /24 (/48 for IPv6), rate-limited per link and per salted IP hash. The hash lives
--     only in a counter table with a salt that rotates daily; the raw IP is never stored.
--   * record_routine_share_add (signed in, called by the app after it clones) marks the click converted and, for an
--     account created in the last 14 days that has no referrer yet, writes the same referrals row record_referral_signup
--     writes (status 'completed', reward_amount from the active referral_settings). One add per user per routine.
--   * routine_share_stats (owner only) gives the Guardian counts, never people.

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

  -- The owner's referral code is what an add credits and what the landing page hands to the app. Create-or-reuse it.
  begin
    perform public.ensure_referral_code(v_uid);
  exception when undefined_function then
    null; -- a project without the referral system still gets share links, only without a code to hand over
  end;

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

-- ── Attribution: opens, adds and the Guardian's counts ───────────────────────
-- Three small tables, all locked the same way as protocol_share_links: RLS on, no policy, nothing for anon or
-- authenticated, explicit service_role. Only the functions below touch them.

-- One row per user per routine that added it. This, not `referrals`, is the "once per user per routine" ledger:
-- referrals.referred_id is unique per user, so a user already referred by someone else could never show up there.
create table if not exists public.routine_share_adds (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.catalog_protocols(id) on delete cascade,
  link_id uuid references public.protocol_share_links(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  cloned_protocol_id uuid references public.catalog_protocols(id) on delete set null,
  click_id uuid references public.affiliate_clicks(id) on delete set null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referral_credited boolean not null default false,
  created_at timestamptz not null default now(),
  constraint routine_share_adds_once unique (protocol_id, user_id)
);

-- A random salt per day, generated here and readable by nobody. It makes the IP hash below useless outside one day
-- and impossible to rebuild from the repository (a salt in this file would be public).
create table if not exists public.routine_share_daily_salt (
  day date primary key,
  salt text not null default encode(extensions.gen_random_bytes(16), 'hex')
);

-- Opens per link per 10 minutes per salted IP hash, to stop one visitor (or one script) inflating a Guardian's counts.
create table if not exists public.routine_share_rate (
  link_id uuid not null references public.protocol_share_links(id) on delete cascade,
  bucket timestamptz not null,
  ip_hash text not null,
  n integer not null default 1,
  primary key (link_id, bucket, ip_hash)
);

alter table public.routine_share_adds enable row level security;
alter table public.routine_share_daily_salt enable row level security;
alter table public.routine_share_rate enable row level security;
revoke all on public.routine_share_adds, public.routine_share_daily_salt, public.routine_share_rate from public, anon, authenticated;
grant select, insert, update, delete on public.routine_share_adds, public.routine_share_daily_salt, public.routine_share_rate to service_role;

create index if not exists routine_share_adds_protocol_idx on public.routine_share_adds (protocol_id, created_at desc);

-- utm values are lower-cased and must be 1 to 64 of a-z 0-9 . _ ~ -, else they are dropped. That keeps markup, spaces and an
-- email address (no @) out of the table and out of the link handed to the app. Internal: no client may call it.
create or replace function public.routine_share_clean_utm(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case when lower(btrim(coalesce(p_value, ''))) ~ '^[a-z0-9][a-z0-9._~-]{0,63}$' then lower(btrim(p_value)) end
$$;

-- One open of a share link. Callable by anyone who holds a live token (the landing page, or the app on a direct open).
-- A bad, revoked or malformed token returns null and writes nothing. Whatever happens, a live token gets the Guardian's
-- referral code back, so the landing page's hand-off to the app never depends on the click being counted.
create or replace function public.record_routine_share_click(
  p_token text,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_link_id uuid;
  v_protocol uuid;
  v_owner uuid;
  v_slug text;
  v_ref text;
  v_headers jsonb;
  v_ip_text text;
  v_ip inet;
  v_ua text;
  v_country text;
  v_salt text;
  v_hash text;
  v_bucket timestamptz;
  v_n integer;
  v_source text;
  v_medium text;
  v_click uuid;
begin
  if v_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select l.id, l.protocol_id, p.user_id, g.slug
  into v_link_id, v_protocol, v_owner, v_slug
  from public.protocol_share_links l
  join public.catalog_protocols p on p.id = l.protocol_id
  left join public.guide_profiles g on g.user_id = p.user_id and g.status = 'approved'
  where l.token = v_token and l.revoked_at is null;
  if not found then
    return null;
  end if;

  select code into v_ref from public.referral_codes where user_id = v_owner;

  -- The owner opening their own link (testing it, or scanning their own QR in the app) is not an open.
  if auth.uid() is not null and auth.uid() = v_owner then
    return jsonb_build_object('ref', v_ref, 'click_id', null, 'counted', false);
  end if;

  v_source := coalesce(
    public.routine_share_clean_utm(p_utm_source),
    case when v_slug is not null then public.routine_share_clean_utm('guardian-' || v_slug) end
  );
  v_medium := coalesce(public.routine_share_clean_utm(p_utm_medium), 'link');

  -- PostgREST puts the request headers in a setting. Only the IP, user agent and country are read.
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip_text := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
  begin
    v_ip := v_ip_text::inet;
  exception when others then
    v_ip := null;
  end;
  v_ua := nullif(left(btrim(coalesce(v_headers ->> 'user-agent', '')), 200), '');
  v_country := upper(nullif(btrim(coalesce(v_headers ->> 'cf-ipcountry', '')), ''));
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  -- At most 3 counted opens per link per 10 minutes from one IP. Without a readable IP this check is skipped.
  if v_ip is not null then
    insert into public.routine_share_daily_salt (day) values (current_date) on conflict (day) do nothing;
    select salt into v_salt from public.routine_share_daily_salt where day = current_date;
    v_hash := encode(extensions.digest(host(v_ip) || ':' || v_link_id::text || ':' || v_salt, 'sha256'), 'hex');
    v_bucket := date_trunc('hour', now()) + floor(extract(minute from now()) / 10)::float8 * interval '10 minutes';
    insert into public.routine_share_rate (link_id, bucket, ip_hash) values (v_link_id, v_bucket, v_hash)
    on conflict (link_id, bucket, ip_hash) do update set n = public.routine_share_rate.n + 1
    returning n into v_n;

    -- Tidy up now and then: old counters and old salts have no use.
    if random() < 0.02 then
      delete from public.routine_share_rate where bucket < now() - interval '1 day';
      delete from public.routine_share_daily_salt where day < current_date - 2;
    end if;

    if v_n > 3 then
      return jsonb_build_object('ref', v_ref, 'click_id', null, 'counted', false);
    end if;
  end if;

  -- And at most 300 counted opens per link per hour.
  if (select count(*) from public.affiliate_clicks
      where provider = 'guardian' and product_id = v_protocol::text and clicked_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('ref', v_ref, 'click_id', null, 'counted', false);
  end if;

  -- destination_url is the shape of the link, never the token itself: affiliate_clicks must not become a token store.
  insert into public.affiliate_clicks
    (product_id, provider, destination_url, utm_source, utm_medium, utm_campaign, utm_content, ip_address, user_agent, country_code)
  values (
    v_protocol::text, 'guardian', 'https://routine3.com/routine/<token>', v_source, v_medium,
    public.routine_share_clean_utm(p_utm_campaign), public.routine_share_clean_utm(p_utm_content),
    case when v_ip is null then null
         when family(v_ip) = 4 then network(set_masklen(v_ip, 24))::inet
         else network(set_masklen(v_ip, 48))::inet end,
    v_ua, v_country
  )
  returning id into v_click;

  return jsonb_build_object('ref', v_ref, 'click_id', v_click, 'counted', true);
end;
$$;

-- The app calls this once its clone of the routine has been saved. p_cloned_protocol_id must be the caller's own
-- routine, so an add cannot be claimed with nothing behind it.
--   * once per user per routine (routine_share_adds);
--   * the click: the one named by p_click_id if it is this routine's and still open, else this routine's most recent
--     open one from the last 14 days;
--   * the credit: if the account is under 14 days old and has no referrer yet, the same referrals row that
--     record_referral_signup writes (status 'completed', reward_amount from the active referral_settings).
--     An older account, or one already referred by someone, is still counted as an add but earns no referral.
create or replace function public.record_routine_share_add(
  p_token text,
  p_cloned_protocol_id uuid,
  p_click_id uuid default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_link_id uuid;
  v_protocol uuid;
  v_owner uuid;
  v_add uuid;
  v_account_created timestamptz;
  v_reward numeric;
  v_rows integer;
  v_credited boolean := false;
  v_click uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_token !~ '^[0-9a-f]{32}$' then
    raise exception 'share link not found' using errcode = 'P0002';
  end if;

  select l.id, l.protocol_id, p.user_id
  into v_link_id, v_protocol, v_owner
  from public.protocol_share_links l
  join public.catalog_protocols p on p.id = l.protocol_id
  where l.token = v_token and l.revoked_at is null;
  if not found then
    raise exception 'share link not found' using errcode = 'P0002';
  end if;

  if v_owner is not distinct from v_uid then
    return jsonb_build_object('added', false, 'reason', 'own_routine');
  end if;

  perform 1 from public.catalog_protocols where id = p_cloned_protocol_id and user_id = v_uid;
  if not found then
    raise exception 'copy not found' using errcode = 'P0002';
  end if;

  insert into public.routine_share_adds (protocol_id, link_id, user_id, cloned_protocol_id, utm_source, utm_medium, utm_campaign)
  values (v_protocol, v_link_id, v_uid, p_cloned_protocol_id,
          public.routine_share_clean_utm(p_utm_source), public.routine_share_clean_utm(p_utm_medium), public.routine_share_clean_utm(p_utm_campaign))
  on conflict (protocol_id, user_id) do nothing
  returning id into v_add;
  if v_add is null then
    return jsonb_build_object('added', false, 'reason', 'already_added');
  end if;

  select created_at into v_account_created from auth.users where id = v_uid;
  if v_account_created is not null and v_account_created > now() - interval '14 days' then
    select reward_amount into v_reward from public.referral_settings where is_active order by created_at desc limit 1;
    insert into public.referrals (referrer_id, referred_id, status, reward_amount)
    values (v_owner, v_uid, 'completed', coalesce(v_reward, 0))
    on conflict (referred_id) do nothing;
    get diagnostics v_rows = row_count;
    v_credited := v_rows > 0;
  end if;

  if p_click_id is not null then
    update public.affiliate_clicks
    set converted = true, conversion_at = now(), external_order_id = 'routine-add:' || v_add::text
    where id = p_click_id and provider = 'guardian' and product_id = v_protocol::text and coalesce(converted, false) = false
    returning id into v_click;
  end if;
  if v_click is null then
    update public.affiliate_clicks
    set converted = true, conversion_at = now(), external_order_id = 'routine-add:' || v_add::text
    where id = (
      select c.id from public.affiliate_clicks c
      where c.provider = 'guardian' and c.product_id = v_protocol::text and coalesce(c.converted, false) = false
        and c.clicked_at > now() - interval '14 days'
      order by c.clicked_at desc limit 1
    )
    returning id into v_click;
  end if;

  update public.routine_share_adds set click_id = v_click, referral_credited = v_credited where id = v_add;
  return jsonb_build_object('added', true, 'referral_credited', v_credited, 'click_id', v_click);
end;
$$;

-- What the Guardian sees under the link: counts, never people.
create or replace function public.routine_share_stats(p_protocol_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id text := p_protocol_id::text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select user_id into v_owner from public.catalog_protocols where id = p_protocol_id;
  if not found or v_owner is distinct from v_uid then
    raise exception 'routine not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'opens', (select count(*) from public.affiliate_clicks where provider = 'guardian' and product_id = v_id),
    'opens_7d', (select count(*) from public.affiliate_clicks where provider = 'guardian' and product_id = v_id and clicked_at > now() - interval '7 days'),
    'last_open_at', (select max(clicked_at) from public.affiliate_clicks where provider = 'guardian' and product_id = v_id),
    'adds', (select count(*) from public.routine_share_adds where protocol_id = p_protocol_id),
    'adds_7d', (select count(*) from public.routine_share_adds where protocol_id = p_protocol_id and created_at > now() - interval '7 days'),
    'credited', (select count(*) from public.routine_share_adds where protocol_id = p_protocol_id and referral_credited),
    'by_medium', (
      select coalesce(jsonb_agg(jsonb_build_object('medium', x.m, 'opens', x.o, 'adds', x.a) order by x.o desc, x.a desc, x.m), '[]'::jsonb)
      from (
        select coalesce(c.m, a.m) as m, coalesce(c.o, 0) as o, coalesce(a.a, 0) as a
        from (select coalesce(utm_medium, 'link') as m, count(*) as o from public.affiliate_clicks
              where provider = 'guardian' and product_id = v_id group by 1) c
        full join (select coalesce(utm_medium, 'unknown') as m, count(*) as a from public.routine_share_adds
                   where protocol_id = p_protocol_id group by 1) a on a.m = c.m
      ) x
    )
  );
end;
$$;

revoke all on function public.routine_share_clean_utm(text) from public, anon, authenticated, service_role;
revoke all on function public.record_routine_share_click(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.record_routine_share_add(text, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.routine_share_stats(uuid) from public, anon, authenticated, service_role;

grant execute on function public.record_routine_share_click(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.record_routine_share_add(text, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.routine_share_stats(uuid) to authenticated;

notify pgrst, 'reload schema';
