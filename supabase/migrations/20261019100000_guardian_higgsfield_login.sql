-- "Log in with Higgsfield" next to the API key (docs/higgsfield-integration.md). A connection is now either an API key
-- pair or OAuth tokens from Higgsfield's MCP server; both stay AES-GCM encrypted in credentials_ciphertext and are only
-- read by the `higgsfield` Edge Function. key_hint holds "…ef12" for a key or a masked email for a login.

alter table public.guardian_higgsfield_connections
  add column if not exists method text not null default 'api_key';
alter table public.guardian_higgsfield_connections
  drop constraint if exists guardian_higgsfield_connections_method_check;
alter table public.guardian_higgsfield_connections
  add constraint guardian_higgsfield_connections_method_check check (method in ('api_key', 'oauth'));
grant select (method) on public.guardian_higgsfield_connections to authenticated;

-- Our OAuth client at Higgsfield, one per callback URL (i.e. per environment), from dynamic client registration.
-- Public client (PKCE, no secret); only the Edge Function (service role) reads or writes it.
create table if not exists public.higgsfield_oauth_clients (
  redirect_uri text primary key,
  client_id text not null,
  created_at timestamptz not null default now()
);
alter table public.higgsfield_oauth_clients enable row level security;
revoke all on public.higgsfield_oauth_clients from anon, authenticated;
