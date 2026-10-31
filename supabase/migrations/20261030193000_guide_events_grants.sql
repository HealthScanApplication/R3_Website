-- RLS policies decide which rows are visible; these grants let PostgREST reach
-- the tables so those policies can be evaluated.
grant select on table public.guide_events to anon;
grant select, insert, update, delete on table public.guide_events to authenticated;

grant select on table public.guide_event_sources to anon;
grant select, insert, update, delete on table public.guide_event_sources to authenticated;
