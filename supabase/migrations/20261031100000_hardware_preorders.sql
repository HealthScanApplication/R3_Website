create table if not exists public.hardware_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  goal_backers int not null,
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('open','funded','failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.hardware_preorders (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.hardware_batches(id),
  product text not null check (product in ('ring','bundle')),
  email text not null,
  name text,
  amount_cents int not null,
  currency text not null default 'USD',
  stripe_customer_id text,
  stripe_payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending','paid','refunded','failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create index if not exists hardware_preorders_batch_status_idx on public.hardware_preorders (batch_id, status);

alter table public.hardware_batches enable row level security;
alter table public.hardware_preorders enable row level security;
-- No policies: only the service role (edge function) touches these tables.

grant select, insert, update on public.hardware_batches to service_role;
grant select, insert, update on public.hardware_preorders to service_role;

insert into public.hardware_batches (name, goal_backers, deadline, status)
values ('first-run', 250, '2026-12-15T23:59:59Z', 'open')
on conflict (name) do nothing;
