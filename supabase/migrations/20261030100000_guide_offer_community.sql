-- Guardians can sell or share access to a forum or other digital community.
alter table public.guide_offers
  drop constraint if exists guide_offers_kind_check;

alter table public.guide_offers
  add constraint guide_offers_kind_check check (kind in (
    'lead_magnet','ebook','recipe_book','routine','routine_guidance',
    'one_to_one_call','group_call','community','in_person','journey','festival',
    'team_program','product','program'
  ));
