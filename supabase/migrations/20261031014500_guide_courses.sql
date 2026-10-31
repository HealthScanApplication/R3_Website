-- Structured Guardian courses: reusable chapters containing mixed lesson types.
alter table public.guide_offers drop constraint if exists guide_offers_kind_check;
alter table public.guide_offers add constraint guide_offers_kind_check check (kind in (
  'lead_magnet','ebook','recipe_book','routine','routine_guidance',
  'one_to_one_call','group_call','community','course','in_person','journey','festival',
  'team_program','product','program'
));

create table if not exists public.guide_course_chapters (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.guide_offers(id) on delete cascade,
  guide_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guide_course_lessons (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.guide_course_chapters(id) on delete cascade,
  guide_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  kind text not null check (kind in ('video','checklist','link','document','pdf','protocol')),
  body text,
  resource_url text,
  file_path text,
  protocol_id uuid references public.protocols(id) on delete set null,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guide_course_chapters_offer_order_idx on public.guide_course_chapters(offer_id, sort_order, created_at);
create index if not exists guide_course_lessons_chapter_order_idx on public.guide_course_lessons(chapter_id, sort_order, created_at);

alter table public.guide_course_chapters enable row level security;
alter table public.guide_course_lessons enable row level security;

drop policy if exists "published courses are readable" on public.guide_course_chapters;
create policy "published courses are readable" on public.guide_course_chapters for select using (
  guide_id = auth.uid() or exists(select 1 from public.guide_offers o where o.id = offer_id and o.status = 'published')
);
drop policy if exists "guardians manage course chapters" on public.guide_course_chapters;
create policy "guardians manage course chapters" on public.guide_course_chapters for all to authenticated using (guide_id = auth.uid()) with check (guide_id = auth.uid());

drop policy if exists "published course lessons are readable" on public.guide_course_lessons;
create policy "published course lessons are readable" on public.guide_course_lessons for select using (
  guide_id = auth.uid() or exists(
    select 1 from public.guide_course_chapters c join public.guide_offers o on o.id = c.offer_id
    where c.id = chapter_id and o.status = 'published'
  )
);
drop policy if exists "guardians manage course lessons" on public.guide_course_lessons;
create policy "guardians manage course lessons" on public.guide_course_lessons for all to authenticated using (guide_id = auth.uid()) with check (guide_id = auth.uid());

grant select, insert, update, delete on public.guide_course_chapters to authenticated;
grant select, insert, update, delete on public.guide_course_lessons to authenticated;
grant select on public.guide_course_chapters, public.guide_course_lessons to anon;
