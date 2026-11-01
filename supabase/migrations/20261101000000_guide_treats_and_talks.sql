-- Treats (spa and wellness treatments) and Talks (lectures and talks) are Guardian offers, managed in the Guardian admin like any
-- other offer. This only widens the allowed offer kinds; the category and length of a treat live on the first line of its description.
-- The list is the full set (it includes community and course from earlier migrations, so applying this alone on a database that
-- missed them cannot narrow it).
alter table public.guide_offers drop constraint if exists guide_offers_kind_check;
alter table public.guide_offers add constraint guide_offers_kind_check check (kind in (
  'lead_magnet','ebook','recipe_book','routine','routine_guidance',
  'one_to_one_call','group_call','community','course','in_person','journey','festival',
  'team_program','product','program',
  'treat','talk'
));
