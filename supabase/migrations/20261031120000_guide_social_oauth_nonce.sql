-- Single-use OAuth state for guardian-social: the nonce is stored on the connection row at "start",
-- checked and cleared at "callback". Not granted to anon/authenticated (column grants on this table are an allowlist).
alter table public.guide_social_connections add column if not exists oauth_nonce text;
alter table public.guide_social_connections add column if not exists oauth_nonce_expires_at timestamptz;
grant select, insert, update on public.guide_social_connections to service_role;
