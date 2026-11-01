-- Members-only Q&A challenge forum on a Guardian site.
-- A channel can require a membership: an active paid purchase of the Guardian's own community offer.
-- Members ask questions; the Guardian answers, pins and hides. Public sourced answers stay readable by everyone.

alter table public.guide_community_channels add column if not exists members_only boolean not null default false;
alter table public.guide_community_channels add column if not exists membership_offer_id uuid references public.guide_offers(id) on delete set null;

alter table public.guide_community_messages add column if not exists kind text not null default 'message' check (kind in ('message','question','answer'));
alter table public.guide_community_messages add column if not exists parent_id uuid references public.guide_community_messages(id) on delete cascade;
alter table public.guide_community_messages add column if not exists pinned boolean not null default false;
alter table public.guide_community_messages add column if not exists hidden boolean not null default false;
create index if not exists guide_community_messages_parent_idx on public.guide_community_messages(parent_id);

-- True when the signed-in user may be in the channel: the Guardian, anyone on an open channel,
-- or a customer whose email has a paid purchase of the channel's membership offer.
create or replace function public.has_guide_membership(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.guide_community_channels c
    where c.id = p_channel_id
      and (
        c.guide_id = auth.uid()
        or not c.members_only
        or exists (
          select 1 from public.guardian_purchases p
          where p.offer_id = c.membership_offer_id
            and p.status = 'paid'
            and lower(p.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  )
$$;
grant execute on function public.has_guide_membership(uuid) to authenticated;

-- Joining a members-only channel needs the membership.
drop policy if exists "people join communities" on public.guide_community_members;
create policy "people join communities" on public.guide_community_members for insert to authenticated
  with check (user_id = auth.uid() and public.has_guide_membership(channel_id));

-- Members ask and chat; only the Guardian answers.
drop policy if exists "community members post messages" on public.guide_community_messages;
create policy "community members post messages" on public.guide_community_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_guide_community_member(channel_id)
    and public.has_guide_membership(channel_id)
    and (kind <> 'answer' or exists (select 1 from public.guide_community_channels c where c.id = channel_id and c.guide_id = auth.uid()))
  );

-- Hidden posts are only visible to their author and the Guardian.
drop policy if exists "community members read messages" on public.guide_community_messages;
create policy "community members read messages" on public.guide_community_messages for select to authenticated
  using (
    (public.is_guide_community_member(channel_id) and public.has_guide_membership(channel_id) and (not hidden or user_id = auth.uid()))
    or exists (select 1 from public.guide_community_channels c where c.id = channel_id and c.guide_id = auth.uid())
  );

-- The Guardian pins and hides.
drop policy if exists "guardians moderate messages" on public.guide_community_messages;
create policy "guardians moderate messages" on public.guide_community_messages for update to authenticated
  using (exists (select 1 from public.guide_community_channels c where c.id = channel_id and c.guide_id = auth.uid()))
  with check (exists (select 1 from public.guide_community_channels c where c.id = channel_id and c.guide_id = auth.uid()));
grant update (pinned, hidden) on public.guide_community_messages to authenticated;

-- The Q&A channel is the members-only forum; the Guardian chooses its membership offer in the workspace.
update public.guide_community_channels set members_only = true where slug = 'questions-answers';
