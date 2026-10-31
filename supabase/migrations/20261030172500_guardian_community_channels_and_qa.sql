-- A Guardian community is a collection of channels, not only one channel per paid offer.
alter table public.guide_community_channels alter column offer_id drop not null;
alter table public.guide_community_channels add column if not exists sort_order integer not null default 0;
create unique index if not exists guide_community_channels_guide_slug_unique
  on public.guide_community_channels (guide_id, slug);

create table if not exists public.guide_community_questions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references public.guide_community_channels(id) on delete set null,
  question text not null check (char_length(question) between 3 and 500),
  answer text not null check (char_length(answer) between 1 and 8000),
  exact_quote text check (exact_quote is null or char_length(exact_quote) <= 1200),
  source_title text,
  source_url text,
  status text not null default 'draft' check (status in ('draft','published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guide_community_questions enable row level security;
drop policy if exists "people read published guardian questions" on public.guide_community_questions;
create policy "people read published guardian questions" on public.guide_community_questions for select
  using (status = 'published' or guide_id = auth.uid());
drop policy if exists "guardians manage their questions" on public.guide_community_questions;
create policy "guardians manage their questions" on public.guide_community_questions for all to authenticated
  using (guide_id = auth.uid()) with check (guide_id = auth.uid());
grant select on public.guide_community_questions to anon, authenticated;
grant insert, update, delete on public.guide_community_questions to authenticated;

-- Default rooms for every existing Guardian. New profiles get the same rooms from the workspace bootstrap.
insert into public.guide_community_channels (guide_id, name, slug, description, sort_order)
select p.user_id, d.name, d.slug, d.description, d.sort_order
from public.guide_profiles p
cross join (values
  ('General','general','Introductions, updates and conversations for the whole community.',10),
  ('Protocols','protocols','Questions and discussion about the Guardian''s published protocols.',20),
  ('Daily details','daily-details','Practical details, progress notes and everyday implementation.',30),
  ('Questions & answers','questions-answers','Sourced questions and answers from the Guardian.',40)
) as d(name,slug,description,sort_order)
on conflict (guide_id,slug) do nothing;

-- Starter Q&A for Barbara: short verbatim excerpts, source-linked and clearly separated from editorial context.
insert into public.guide_community_questions
  (guide_id, channel_id, question, answer, exact_quote, source_title, source_url, status, sort_order)
select p.user_id, c.id,
  q.question, q.answer, q.exact_quote, q.source_title, q.source_url, 'published', q.sort_order
from public.guide_profiles p
join public.guide_community_channels c on c.guide_id = p.user_id and c.slug = 'questions-answers'
cross join (values
  ('What does Barbara mean by “Self Heal by Design”?',
   'Barbara presents it as working with the body’s innate capacity to recover when its conditions and lifestyle support that process.',
   'The body can self heal by its very design.',
   'Self Heal by Design — official product page',
   'https://www.barbaraoneill.com/products/self-heal-by-design', 10),
  ('Who does Barbara say performs healing?',
   'In the description of Sustain Me, Barbara’s position is that healing is performed by the body when it is given suitable conditions.',
   'The body, and the body only, has the power to heal.',
   'Sustain Me — official product page',
   'https://www.barbaraoneill.com/products/sustain-me', 20),
  ('Does Barbara teach quick fixes?',
   'Her official description of Sustain Me frames the approach as lasting lifestyle change rather than a short-term intervention.',
   'This book isn''t about quick-fix solutions.',
   'Sustain Me — official product page',
   'https://www.barbaraoneill.com/products/sustain-me', 30),
  ('How does faith fit into Barbara’s approach?',
   'Barbara’s official profile describes faith, prayer and living according to her Christian beliefs as part of her understanding of wellbeing.',
   'True healing comes not just from nature’s remedies but also from faith, prayer.',
   'Barbara — official profile',
   'https://www.barbaraoneill.com/pages/barbara', 40)
) as q(question,answer,exact_quote,source_title,source_url,sort_order)
where p.slug in ('barbara-oneill','barbara-o-neill')
and not exists (
  select 1 from public.guide_community_questions existing
  where existing.guide_id = p.user_id and existing.question = q.question
);
