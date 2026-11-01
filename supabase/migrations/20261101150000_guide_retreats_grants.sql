-- guide_retreats had row level security and policies but no table privileges, so every read and write failed with
-- "permission denied" (the public Retreats section and the Guardian's own list). Same grants as the other guide tables.
grant select on public.guide_retreats to anon, authenticated;
grant insert, update, delete on public.guide_retreats to authenticated;
