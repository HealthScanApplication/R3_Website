# R³ Hardware Preorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated `/ring` product page with an interactive 3D ring and a full-prepay, all-or-nothing batch-goal preorder (Stripe test mode), replacing the homepage email-waitlist.

**Architecture:** A new `hardware` page slots into the app's existing `PageType`/`useNavigation` routing. The preorder reuses the Guardian Stripe pattern — a Deno edge function (`hardware-preorders`) owns prices and writes `hardware_preorders` rows; the browser only sends a product key and confirms a PaymentIntent via Stripe Elements. A public `count` action feeds a live backer bar. The 3D ring is a decimated `.glb` rendered by `@google/model-viewer`.

**Tech Stack:** React + Vite, TypeScript, inline styles via `src/config/editorialTheme`, vitest + @testing-library/react, Supabase (Postgres + Deno edge functions), Stripe (`@stripe/stripe-js` frontend, `npm:stripe` in Deno), `@google/model-viewer`, Blender headless for asset conversion.

**Spec:** `docs/superpowers/specs/2026-10-31-r3-hardware-preorder-design.md`

## Global Constraints

- **Styling:** inline styles only, via `ed` / `DISPLAY` / `GRO` from `src/config/editorialTheme`. No new Tailwind utility classes (CSS is prebuilt / no JIT — new classes render transparent).
- **Prices are server-authored.** The edge function resolves amount from a server-side map; the browser sends only `product: 'ring' | 'bundle'`. Prices (cents, USD): `ring` = `17900`, `bundle` = `29900`. Display-only regular prices: ring `19900`, bundle `34900`.
- **Payments guard:** the function rejects live Stripe keys unless `ALLOW_LIVE_PAYMENTS === 'true'` (copy the guard verbatim from `supabase/functions/guardian-payments/index.ts`). This build runs **test mode only**.
- **Batch goal:** 250 backers. Deadline and ship-window are **data/constants**, not hardcoded in logic: deadline lives in the seeded `hardware_batches` row (example `2026-12-15T23:59:59Z`, owner edits later); ship-window copy is a constant in `copy.ts` (default `"Ships Q3 2027"`).
- **Device copy is centralized** in `src/components/hardware/copy.ts` so names (R³ Ring / R³ Clip) and prices change in one place.
- **DB grants:** every new table must `GRANT` to `service_role` explicitly (new tables grant it nothing by default; Edge Functions fail silently otherwise).
- **No PII in the public `count` action.** It returns only `{ paid, goal, deadline, status }`.
- **Commit** after each task.

---

### Task 1: Centralized hardware copy + pricing constants

**Files:**
- Create: `src/components/hardware/copy.ts`
- Test: `src/components/hardware/__tests__/copy.test.ts`

**Interfaces:**
- Produces: `PRODUCTS: Record<'ring'|'bundle', { key, name, priceCents, regPriceCents }>`, `BATCH_GOAL: number`, `SHIP_WINDOW: string`, `formatUsd(cents: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { PRODUCTS, BATCH_GOAL, SHIP_WINDOW, formatUsd } from '../copy';

describe('hardware copy', () => {
  it('prices the ring and bundle in cents', () => {
    expect(PRODUCTS.ring.priceCents).toBe(17900);
    expect(PRODUCTS.bundle.priceCents).toBe(29900);
  });
  it('exposes the batch goal and a ship window', () => {
    expect(BATCH_GOAL).toBe(250);
    expect(SHIP_WINDOW).toMatch(/\w/);
  });
  it('formats cents as USD', () => {
    expect(formatUsd(17900)).toBe('$179');
    expect(formatUsd(29900)).toBe('$299');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/hardware/__tests__/copy.test.ts`
Expected: FAIL (cannot find module `../copy`).

- [ ] **Step 3: Write minimal implementation**

```ts
export const PRODUCTS = {
  ring:   { key: 'ring'   as const, name: 'R³ Ring',        priceCents: 17900, regPriceCents: 19900 },
  bundle: { key: 'bundle' as const, name: 'R³ Ring + Clip', priceCents: 29900, regPriceCents: 34900 },
};
export type ProductKey = keyof typeof PRODUCTS;
export const BATCH_GOAL = 250;
export const SHIP_WINDOW = 'Ships Q3 2027';
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/hardware/__tests__/copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/copy.ts src/components/hardware/__tests__/copy.test.ts
git commit -m "feat(hardware): centralized preorder copy and pricing constants"
```

---

### Task 2: Add the `hardware` page to routing

**Files:**
- Modify: `src/types/app.tsx:1` (add `'hardware'` to `PageType`)
- Modify: `src/hooks/useUrlParameterHandling.tsx` (map `/ring`)
- Create: `src/components/hardware/HardwarePage.tsx` (placeholder shell for now)
- Modify: `src/App.tsx` (render `<HardwarePage/>` when `currentPage === 'hardware'`)
- Test: `src/hooks/__tests__/hardwareRoute.test.ts`

**Interfaces:**
- Consumes: `setCurrentPage` from `useNavigation`.
- Produces: page key `'hardware'`; path `/ring`; component `HardwarePage`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUrlParameterHandling } from '../useUrlParameterHandling';

function at(path: string) {
  window.history.replaceState({}, '', path);
}

describe('/ring route', () => {
  beforeEach(() => at('/'));
  it('maps /ring to the hardware page', () => {
    at('/ring');
    const setCurrentPage = vi.fn();
    renderHook(() => useUrlParameterHandling({ setCurrentPage }));
    expect(setCurrentPage).toHaveBeenCalledWith('hardware');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/hardwareRoute.test.ts`
Expected: FAIL (`setCurrentPage` not called with `'hardware'`).

- [ ] **Step 3: Write minimal implementation**

In `src/types/app.tsx`, extend the union:

```ts
export type PageType = 'home' | 'profile' | 'settings' | 'admin' | 'guides' | 'diagnostic' | 'network-test' | 'blog' | 'referral-test' | 'hardware';
```

In `src/hooks/useUrlParameterHandling.tsx`, inside the first path-matching `useEffect` (the one that handles `/admin` and `/guardians`), add a branch:

```ts
    } else if (path === '/ring' || path === '/hardware') {
      setCurrentPage('hardware');
    }
```

Create `src/components/hardware/HardwarePage.tsx` (placeholder; later tasks fill it):

```tsx
import React from 'react';
import { ed } from '../../config/editorialTheme';

export function HardwarePage() {
  return <main id="hardware-page" style={{ background: ed.dark, color: ed.onDark, minHeight: '60vh' }} />;
}
```

In `src/App.tsx`, next to the other page conditionals (near `currentPage === "home"`), render the page and import it at the top:

```tsx
import { HardwarePage } from "./components/hardware/HardwarePage";
// ...
{currentPage === "hardware" && <HardwarePage />}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/hardwareRoute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/app.tsx src/hooks/useUrlParameterHandling.tsx src/components/hardware/HardwarePage.tsx src/App.tsx src/hooks/__tests__/hardwareRoute.test.ts
git commit -m "feat(hardware): add /ring page route"
```

---

### Task 3: DB migration — batches + preorders tables

**Files:**
- Create: `supabase/migrations/20261031010000_hardware_preorders.sql`
- Test: `supabase/migrations/__tests__/hardwarePreorders.sql.test.ts`

**Interfaces:**
- Produces: tables `hardware_batches`, `hardware_preorders`; a seeded open batch named `first-run`.

- [ ] **Step 1: Write the failing test** (asserts the migration contains the required DDL + grants)

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261031010000_hardware_preorders.sql', 'utf8');
describe('hardware preorder migration', () => {
  it('creates both tables', () => {
    expect(sql).toMatch(/create table[^;]*hardware_batches/i);
    expect(sql).toMatch(/create table[^;]*hardware_preorders/i);
  });
  it('enables RLS and grants service_role', () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/grant[\s\S]*service_role/i);
  });
  it('seeds a batch with goal 250', () => {
    expect(sql).toMatch(/insert into[\s\S]*hardware_batches[\s\S]*250/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/migrations/__tests__/hardwarePreorders.sql.test.ts`
Expected: FAIL (file not found).

- [ ] **Step 3: Write minimal implementation**

```sql
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/migrations/__tests__/hardwarePreorders.sql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261031010000_hardware_preorders.sql supabase/migrations/__tests__/hardwarePreorders.sql.test.ts
git commit -m "feat(hardware): preorder tables, RLS, grants, seed batch"
```

> **Apply note (not a code step):** after merge, apply to Staging with the usual migration workflow and confirm the batch row exists. Production is a later, owner-run step.

---

### Task 4: Edge function — `count` action + test harness

**Files:**
- Create: `supabase/functions/hardware-preorders/index.ts`
- Create: `src/utils/__tests__/hardwarePreorderServer.test.ts`

**Interfaces:**
- Produces: HTTP handler. `POST {action:'count'}` → `{ paid, goal, deadline, status }`. The test `server()` helper (reused by Tasks 5–6) compiling the function with esbuild and mocking Stripe + Postgres.

- [ ] **Step 1: Write the failing test** (establishes the harness, mirroring `guardianPaymentServer.test.ts`)

```ts
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

type Row = Record<string, any>;
function server() {
  const batches: Row[] = [{ id: 'b1', name: 'first-run', goal_backers: 250, deadline: '2026-12-15T23:59:59Z', status: 'open' }];
  const orders: Row[] = [
    { id: 'o1', batch_id: 'b1', product: 'ring', status: 'paid', stripe_payment_intent_id: 'pi_paid' },
    { id: 'o2', batch_id: 'b1', product: 'bundle', status: 'pending', stripe_payment_intent_id: 'pi_pending' },
  ];
  const intents = new Map<string, Row>([['pi_pending', { id: 'pi_pending', status: 'processing' }]]);
  const table = (rows: Row[]) => {
    let action = 'select', payload: Row, filters: ((r: Row) => boolean)[] = [];
    const q: any = {
      select() { return q; },
      eq(k: string, v: any) { filters.push(r => r[k] === v); return q; },
      is(k: string, v: any) { filters.push(r => (r[k] ?? null) === v); return q; },
      neq(k: string, v: any) { filters.push(r => r[k] !== v); return q; },
      insert(v: Row) { action = 'insert'; payload = v; return q; },
      update(v: Row) { action = 'update'; payload = v; return q; },
      single() { return run(true); }, maybeSingle() { return run(true); },
      then(res: any, rej: any) { return run(false).then(res, rej); },
    };
    async function run(single: boolean) {
      if (action === 'insert') { const row = { id: `row_${rows.length}`, status: 'pending', paid_at: null, ...payload }; rows.push(row); return { data: single ? row : [row], error: null }; }
      const found = rows.filter(r => filters.every(f => f(r)));
      if (action === 'update') found.forEach(r => Object.assign(r, payload));
      return { data: single ? found[0] ?? null : found, error: null, count: found.length };
    }
    return q;
  };
  const db = { from: (t: string) => t === 'hardware_batches' ? table(batches) : table(orders) };
  const stripe = {
    customers: { async list() { return { data: [] }; }, async create() { return { id: 'cus_new' }; } },
    paymentIntents: {
      async create(p: Row) { const i = { id: `pi_${intents.size + 1}`, status: 'processing', client_secret: 'sec', ...p }; intents.set(i.id, i); return i; },
      async retrieve(id: string) { return intents.get(id); },
    },
    webhooks: { async constructEventAsync(body: string) { return JSON.parse(body); } },
  };
  const src = readFileSync('supabase/functions/hardware-preorders/index.ts', 'utf8')
    .replace(/import Stripe from[^\n]*\n/, '')
    .replace(/import \{ createClient \}[^\n]*\n/, '')
    .replace(/const stripe =[^\n]*\n/, 'const stripe = globalThis.__stripe;\n')
    .replace(/const db =[^\n]*\n/, 'const db = globalThis.__db;\n');
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  (globalThis as any).__stripe = stripe; (globalThis as any).__db = db;
  const env: Row = { STRIPE_SECRET_KEY: 'sk_test_x', SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'x' };
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { (globalThis as any).__handler = h; } };
  const mod: any = { exports: {} };
  new Function('module', 'exports', 'globalThis', js)(mod, mod.exports, globalThis);
  return { handler: (globalThis as any).__handler as (r: Request) => Promise<Response>, orders, batches };
}
const post = (body: Row) => new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('hardware-preorders count', () => {
  it('returns paid count, goal, deadline and status (no PII)', async () => {
    const { handler } = server();
    const res = await handler(post({ action: 'count' }));
    const data = await res.json();
    expect(data).toEqual({ paid: 1, goal: 250, deadline: '2026-12-15T23:59:59Z', status: 'open' });
    expect(JSON.stringify(data)).not.toMatch(/@/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/hardwarePreorderServer.test.ts`
Expected: FAIL (function file not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// Hardware preorders on the platform Stripe account. Prices come from PRICES, never the browser.
//   action "count":   public — paid backers vs the batch goal (no PII).
//   action "intent":  create a full-amount PaymentIntent + a pending preorder row.
//   action "confirm": verify the PaymentIntent and mark the row paid.
//   Stripe webhook (stripe-signature): payment_intent.succeeded / payment_failed keep rows in sync.
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2025-02-24.acacia', httpClient: Stripe.createFetchHttpClient() });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const PRICES: Record<string, number> = { ring: 17900, bundle: 29900 };
const CURRENCY = 'usd';
const BATCH = 'first-run';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

async function openBatch() {
  const { data, error } = await db.from('hardware_batches').select('id, goal_backers, deadline, status').eq('name', BATCH).single();
  if (error || !data) throw new Error('Batch not found.');
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  if (!Deno.env.get('STRIPE_SECRET_KEY')) return fail('Payments are not configured yet.', 503);
  if (/_live_/.test(Deno.env.get('STRIPE_SECRET_KEY')!) && Deno.env.get('ALLOW_LIVE_PAYMENTS') !== 'true') return fail('Live payments are switched off on this environment.', 503);

  let body: any;
  try { body = await req.json(); } catch { return fail('Invalid JSON'); }

  try {
    if (body.action === 'count') {
      const batch = await openBatch();
      const { data, error } = await db.from('hardware_preorders').select('id').eq('batch_id', batch.id).eq('status', 'paid');
      if (error) throw error;
      return json({ paid: (data ?? []).length, goal: batch.goal_backers, deadline: batch.deadline, status: batch.status });
    }
    return fail('Unknown action');
  } catch (err: any) {
    console.error('hardware-preorders', err?.message || err);
    return fail('Something went wrong.', 500);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/hardwarePreorderServer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/hardware-preorders/index.ts src/utils/__tests__/hardwarePreorderServer.test.ts
git commit -m "feat(hardware): preorder edge function with public count action"
```

---

### Task 5: Edge function — `intent` action (full-amount PaymentIntent)

**Files:**
- Modify: `supabase/functions/hardware-preorders/index.ts`
- Modify: `src/utils/__tests__/hardwarePreorderServer.test.ts` (add cases)

**Interfaces:**
- Consumes: `server()` harness, `openBatch`, `PRICES`.
- Produces: `POST {action:'intent', product, email, name?}` → `{ purchase_id, client_secret, amount_cents, currency }`. Ignores any browser-sent price.

- [ ] **Step 1: Write the failing test** (append to the describe block)

```ts
it('intent uses the server price and creates a pending row', async () => {
  const { handler, orders } = server();
  const res = await handler(post({ action: 'intent', product: 'ring', email: 'QA@Example.com', amount_cents: 1 }));
  const data = await res.json();
  expect(data.amount_cents).toBe(17900);           // server price, not the browser's 1
  expect(data.client_secret).toBe('sec');
  const row = orders.find(o => o.id === data.purchase_id);
  expect(row.status).toBe('pending');
  expect(row.email).toBe('qa@example.com');          // lowercased
  expect(row.product).toBe('ring');
});
it('intent rejects an unknown product', async () => {
  const { handler } = server();
  const res = await handler(post({ action: 'intent', product: 'hat', email: 'qa@example.com' }));
  expect(res.status).toBe(400);
});
it('intent rejects a bad email', async () => {
  const { handler } = server();
  const res = await handler(post({ action: 'intent', product: 'ring', email: 'nope' }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/hardwarePreorderServer.test.ts`
Expected: FAIL (intent returns "Unknown action").

- [ ] **Step 3: Write minimal implementation** (add before the `return fail('Unknown action')` line)

```ts
    if (body.action === 'intent') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter a valid email.');
      const product = String(body.product || '');
      const amount = PRICES[product];
      if (!amount) return fail('Choose a product.');
      const batch = await openBatch();
      const found = await stripe.customers.list({ email, limit: 1 });
      const customer = found.data[0] ?? await stripe.customers.create({ email, name: body.name || undefined });
      const pi = await stripe.paymentIntents.create({
        amount, currency: CURRENCY, customer: customer.id,
        automatic_payment_methods: { enabled: true },
        description: `R³ preorder (${product})`, receipt_email: email,
        metadata: { product, batch_id: batch.id },
      });
      const { data, error } = await db.from('hardware_preorders').insert({
        batch_id: batch.id, product, email, name: body.name || null,
        amount_cents: amount, currency: CURRENCY.toUpperCase(),
        stripe_customer_id: customer.id, stripe_payment_intent_id: pi.id,
      }).select('id').single();
      if (error) throw error;
      return json({ purchase_id: data.id, client_secret: pi.client_secret, amount_cents: amount, currency: CURRENCY.toUpperCase() });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/hardwarePreorderServer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/hardware-preorders/index.ts src/utils/__tests__/hardwarePreorderServer.test.ts
git commit -m "feat(hardware): intent action with server-authored pricing"
```

---

### Task 6: Edge function — `confirm` action + Stripe webhook

**Files:**
- Modify: `supabase/functions/hardware-preorders/index.ts`
- Modify: `src/utils/__tests__/hardwarePreorderServer.test.ts` (add cases)

**Interfaces:**
- Produces: `POST {action:'confirm', purchase_id}` → `{ status }`; webhook (`stripe-signature` header) reconciling `payment_intent.*`.

- [ ] **Step 1: Write the failing test** (append; also extend the harness `intents` map at the top of `server()` so `pi_pending` can succeed — change its retrieve to allow status override via a settable map; simplest: add `intents.set('pi_paid', { id: 'pi_paid', status: 'succeeded' })` in the harness and a confirm test against `o2` after flipping its intent)

```ts
it('confirm marks a pending row paid when Stripe says succeeded', async () => {
  const { handler, orders } = server();
  // o2 -> pi_pending; make Stripe report it succeeded:
  (globalThis as any).__stripe.paymentIntents.retrieve = async () => ({ id: 'pi_pending', status: 'succeeded' });
  const res = await handler(post({ action: 'confirm', purchase_id: 'o2' }));
  const data = await res.json();
  expect(data.status).toBe('paid');
  expect(orders.find(o => o.id === 'o2').status).toBe('paid');
});
it('webhook reconciles a succeeded intent', async () => {
  const { handler, orders } = server();
  (globalThis as any).__stripe.paymentIntents.retrieve = async () => ({ id: 'pi_pending', status: 'succeeded' });
  const req = new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 'sig' },
    body: JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_pending' } } }) });
  const res = await handler(req);
  expect((await res.json()).received).toBe(true);
  expect(orders.find(o => o.id === 'o2').status).toBe('paid');
});
```

> Add to the top of `server()`: `const env: Row = { ..., STRIPE_WEBHOOK_SECRET: 'whsec_x' };` so the webhook branch is enabled.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/hardwarePreorderServer.test.ts`
Expected: FAIL (confirm unknown; webhook not handled).

- [ ] **Step 3: Write minimal implementation**

Add a shared reconcile helper (near `openBatch`):

```ts
async function markFromIntent(pi: any) {
  const status = pi.status === 'succeeded' ? 'paid' : (pi.status === 'canceled' || pi.status === 'requires_payment_method') ? 'failed' : 'pending';
  const update = status === 'paid'
    ? db.from('hardware_preorders').update({ status, paid_at: new Date().toISOString() }).eq('stripe_payment_intent_id', pi.id).is('paid_at', null)
    : db.from('hardware_preorders').update({ status }).eq('stripe_payment_intent_id', pi.id).neq('status', 'paid');
  const { error } = await update;
  if (error) throw error;
  const { data } = await db.from('hardware_preorders').select('status').eq('stripe_payment_intent_id', pi.id).maybeSingle();
  return data?.status ?? status;
}
```

Add the webhook branch right after the method/guard checks and before `req.json()`:

```ts
  const signature = req.headers.get('stripe-signature');
  if (signature) {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!secret) return fail('Webhook secret missing', 500);
    let event: any;
    try { event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret); }
    catch { return fail('Bad signature', 400); }
    try {
      if (String(event.type).startsWith('payment_intent.')) {
        const current = await stripe.paymentIntents.retrieve(event.data.object.id);
        await markFromIntent(current);
      }
      return json({ received: true });
    } catch (err: any) { console.error('hardware webhook', err?.message || err); return fail('Retry', 500); }
  }
```

Add the `confirm` action (before `return fail('Unknown action')`):

```ts
    if (body.action === 'confirm') {
      const { data: row, error } = await db.from('hardware_preorders').select('stripe_payment_intent_id').eq('id', body.purchase_id).single();
      if (error) throw error;
      if (!row?.stripe_payment_intent_id) return fail('Preorder not found.', 404);
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      return json({ status: await markFromIntent(pi) });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/hardwarePreorderServer.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/hardware-preorders/index.ts src/utils/__tests__/hardwarePreorderServer.test.ts
git commit -m "feat(hardware): confirm action and Stripe webhook reconciliation"
```

---

### Task 7: Frontend preorder client (fetch wrapper)

**Files:**
- Create: `src/utils/hardwarePreorder.ts`
- Test: `src/utils/__tests__/hardwarePreorder.test.ts`

**Interfaces:**
- Consumes: `projectId`, `publicAnonKey` from `src/utils/supabase/info`.
- Produces: `fetchBackerCount(): Promise<{paid,goal,deadline,status}>`, `createPreorderIntent(product, email, name?): Promise<{purchase_id, client_secret, amount_cents, currency}>`, `confirmPreorder(purchaseId): Promise<{status}>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('../supabase/info', () => ({ projectId: 'proj', publicAnonKey: 'anon' }));
import { fetchBackerCount, createPreorderIntent } from '../hardwarePreorder';

beforeEach(() => { (globalThis as any).fetch = vi.fn(); });

describe('hardware preorder client', () => {
  it('fetches the backer count', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ paid: 3, goal: 250, deadline: 'd', status: 'open' }) });
    const data = await fetchBackerCount();
    expect(data.paid).toBe(3);
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('/hardware-preorders');
    expect(JSON.parse(opts.body).action).toBe('count');
  });
  it('throws on an error response for intent', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
    await expect(createPreorderIntent('ring', 'a@b.co')).rejects.toThrow('nope');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/hardwarePreorder.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
import { projectId, publicAnonKey } from './supabase/info';
import type { ProductKey } from '../components/hardware/copy';

const base = `https://${projectId}.supabase.co/functions/v1/hardware-preorders`;
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || 'Request failed.');
  return data as T;
}
export const fetchBackerCount = () => call<{ paid: number; goal: number; deadline: string; status: string }>({ action: 'count' });
export const createPreorderIntent = (product: ProductKey, email: string, name?: string) =>
  call<{ purchase_id: string; client_secret: string; amount_cents: number; currency: string }>({ action: 'intent', product, email, name });
export const confirmPreorder = (purchaseId: string) => call<{ status: string }>({ action: 'confirm', purchase_id: purchaseId });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/hardwarePreorder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/hardwarePreorder.ts src/utils/__tests__/hardwarePreorder.test.ts
git commit -m "feat(hardware): frontend preorder API client"
```

---

### Task 8: `BackerBar` component

**Files:**
- Create: `src/components/hardware/BackerBar.tsx`
- Test: `src/components/hardware/__tests__/BackerBar.test.tsx`

**Interfaces:**
- Consumes: `fetchBackerCount` (Task 7), `BATCH_GOAL` (Task 1).
- Produces: `<BackerBar refreshKey?: number />` rendering `"{paid} of {goal} backers"` and a progress fill; degrades to a neutral label on fetch failure.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('../../../utils/hardwarePreorder', () => ({ fetchBackerCount: vi.fn() }));
import { fetchBackerCount } from '../../../utils/hardwarePreorder';
import { BackerBar } from '../BackerBar';

beforeEach(() => vi.clearAllMocks());

describe('BackerBar', () => {
  it('shows paid of goal when the count loads', async () => {
    (fetchBackerCount as any).mockResolvedValue({ paid: 142, goal: 250, deadline: 'd', status: 'open' });
    render(<BackerBar />);
    expect(await screen.findByText(/142 of 250 backers/i)).toBeTruthy();
  });
  it('degrades gracefully when the count fails', async () => {
    (fetchBackerCount as any).mockRejectedValue(new Error('down'));
    render(<BackerBar />);
    expect(await screen.findByText(/reserve yours/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/hardware/__tests__/BackerBar.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```tsx
import React, { useEffect, useState } from 'react';
import { ed, GRO } from '../../config/editorialTheme';
import { fetchBackerCount } from '../../utils/hardwarePreorder';
import { BATCH_GOAL } from './copy';

export function BackerBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<{ paid: number; goal: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetchBackerCount().then(d => { if (live) setState({ paid: d.paid, goal: d.goal || BATCH_GOAL }); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [refreshKey]);

  if (failed) return <p style={{ fontFamily: GRO, fontSize: 13, color: ed.onDarkSoft, margin: 0 }}>Reserve yours — first batch is filling.</p>;
  const paid = state?.paid ?? 0, goal = state?.goal ?? BATCH_GOAL;
  const pct = Math.min(100, Math.round((paid / goal) * 100));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ fontFamily: GRO, fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#C7D99F', margin: 0 }}>{paid} of {goal} backers</p>
      <div role="progressbar" aria-valuenow={paid} aria-valuemax={goal} style={{ height: 6, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#C7D99F' }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/hardware/__tests__/BackerBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/BackerBar.tsx src/components/hardware/__tests__/BackerBar.test.tsx
git commit -m "feat(hardware): live backer progress bar"
```

---

### Task 9: Stripe Payment Element helper (`mountPayment`)

> **Plan revision (controller ruling, found before dispatch):** the original Tasks 9–10 had a one-step email form and a `confirmPayment({clientSecret})` call with no card field, which cannot collect card details. This revision mirrors the Guardian checkout (`GuidePortal.tsx`): `stripe.elements({clientSecret})`, a mounted Payment Element, and `confirmPayment({ elements, redirect: 'if_required', ... })`. The publishable key and the production hold come from `getGuardianStripeConfiguration()` (`src/utils/guardianStripe.ts`), reused as-is. Task order is swapped: the helper (this task) comes before the checkout block (Task 10).

**Files:**
- Create: `src/utils/hardwareStripe.ts`
- Test: `src/utils/__tests__/hardwareStripe.test.ts`

**Interfaces:**
- Consumes: `loadStripe` from `@stripe/stripe-js` (already a dependency); `getGuardianStripeConfiguration(): { enabled: boolean; publishableKey: string | null; error: string | null; environment: ... }` from `./guardianStripe`.
- Produces (Task 10 relies on these exact names):
  - `export type PaymentHandle = { confirm(email: string): Promise<void>; destroy(): void };`
  - `export type MountPayment = (container: HTMLElement, clientSecret: string) => Promise<PaymentHandle>;`
  - `export const mountPayment: MountPayment`

- [ ] **Step 1: Write the failing test** (`// @vitest-environment jsdom` first line)

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mount = vi.fn();
const destroy = vi.fn();
const create = vi.fn(() => ({ mount, destroy }));
const elementsFactory = vi.fn(() => ({ create }));
const confirmPayment = vi.fn();
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue({ elements: elementsFactory, confirmPayment }) }));
const config = { enabled: true, publishableKey: 'pk_test_abc', error: null as string | null };
vi.mock('../guardianStripe', () => ({ getGuardianStripeConfiguration: () => config }));
import { loadStripe } from '@stripe/stripe-js';
import { mountPayment } from '../hardwareStripe';

beforeEach(() => { vi.clearAllMocks(); config.enabled = true; config.publishableKey = 'pk_test_abc'; config.error = null; });

describe('mountPayment', () => {
  it('refuses when checkout is not enabled for this environment', async () => {
    config.enabled = false; config.publishableKey = null; config.error = 'Live payments are disabled pending full staging verification.';
    await expect(mountPayment(document.createElement('div'), 'cs')).rejects.toThrow('Live payments are disabled');
    expect(loadStripe).not.toHaveBeenCalled();
  });
  it('creates elements from the client secret and mounts a payment element', async () => {
    const container = document.createElement('div');
    await mountPayment(container, 'cs_123');
    expect(loadStripe).toHaveBeenCalledWith('pk_test_abc');
    expect(elementsFactory.mock.calls[0][0].clientSecret).toBe('cs_123');
    expect(create).toHaveBeenCalledWith('payment');
    expect(mount).toHaveBeenCalledWith(container);
  });
  it('confirms in place with the receipt email and no redirect when possible', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } });
    const handle = await mountPayment(document.createElement('div'), 'cs');
    await handle.confirm('qa@example.com');
    const arg = confirmPayment.mock.calls[0][0];
    expect(arg.redirect).toBe('if_required');
    expect(arg.confirmParams.receipt_email).toBe('qa@example.com');
    expect(arg.elements).toBeTruthy();
  });
  it('throws Stripe\'s message when confirmation errors', async () => {
    confirmPayment.mockResolvedValue({ error: { message: 'Your card was declined.' } });
    const handle = await mountPayment(document.createElement('div'), 'cs');
    await expect(handle.confirm('qa@example.com')).rejects.toThrow('Your card was declined.');
  });
  it('throws when the intent is neither succeeded nor processing', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { status: 'requires_payment_method' } });
    const handle = await mountPayment(document.createElement('div'), 'cs');
    await expect(handle.confirm('qa@example.com')).rejects.toThrow('Payment did not complete.');
  });
  it('destroy tears down the payment element', async () => {
    const handle = await mountPayment(document.createElement('div'), 'cs');
    handle.destroy();
    expect(destroy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/__tests__/hardwareStripe.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
import { loadStripe } from '@stripe/stripe-js';
import { getGuardianStripeConfiguration } from './guardianStripe';

export type PaymentHandle = { confirm(email: string): Promise<void>; destroy(): void };
export type MountPayment = (container: HTMLElement, clientSecret: string) => Promise<PaymentHandle>;

// Mirrors the Guardian checkout (GuidePortal.tsx): Elements from the client secret, one Payment Element, confirm in place.
export const mountPayment: MountPayment = async (container, clientSecret) => {
  const config = getGuardianStripeConfiguration();
  if (!config.enabled || !config.publishableKey) throw new Error(config.error || 'Checkout is unavailable.');
  const stripe = await loadStripe(config.publishableKey);
  if (!stripe) throw new Error('Could not load the payment form.');
  const elements = stripe.elements({ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#C7D99F', borderRadius: '0px' } } });
  const payment = elements.create('payment');
  payment.mount(container);
  return {
    async confirm(email: string) {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href, receipt_email: email } });
      if (error) throw new Error(error.message || 'Payment failed.');
      if (!paymentIntent || (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing')) throw new Error('Payment did not complete.');
    },
    destroy() { payment.destroy(); },
  };
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/__tests__/hardwareStripe.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/hardwareStripe.ts src/utils/__tests__/hardwareStripe.test.ts
git commit -m "feat(hardware): Stripe payment element helper mirroring guardian checkout"
```

---

### Task 10: `PreorderBlock` — product toggle and two-step checkout

**Files:**
- Create: `src/components/hardware/PreorderBlock.tsx`
- Test: `src/components/hardware/__tests__/PreorderBlock.test.tsx` (`// @vitest-environment jsdom` first line; `afterEach(cleanup)`)
- Modify: `src/utils/__tests__/hardwarePreorder.test.ts` (add the request-body test below)

**Interfaces:**
- Consumes: `PRODUCTS`, `ProductKey`, `formatUsd`, `SHIP_WINDOW` (Task 1); `BackerBar` with `refreshKey` prop (Task 8); `createPreorderIntent`, `confirmPreorder` (Task 7); `mountPayment`, `MountPayment`, `PaymentHandle` (Task 9); `getGuardianStripeConfiguration` from `../../utils/guardianStripe`.
- Produces: `export function PreorderBlock(props: { mountPayment?: MountPayment; stripeConfig?: { enabled: boolean; error: string | null } })` — defaults: `mountPayment` from `../../utils/hardwareStripe`, `stripeConfig` from `getGuardianStripeConfiguration()`. Task 12 renders `<PreorderBlock />`.

**Behavior (all must be covered by tests):**
1. Two product buttons (R³ Ring $179, R³ Ring + Clip $299, with the regular price struck through); default `ring`; the primary button shows the selected price. Prices come from `PRODUCTS`/`formatUsd`.
2. Step 1 (details): email input + button "Continue to payment". If `stripeConfig.enabled` is false, show `stripeConfig.error` (fallback "Preorders open soon.") and disable the button.
3. Continue → `createPreorderIntent(product, email.trim(), undefined)`. **Fail closed**: if the response lacks a string `client_secret` or string `purchase_id`, show "Could not start checkout. Please try again." and stay on step 1. If the call rejects with a `TypeError` (network), show "Network problem — check your connection and try again."; any other `Error` shows its own message. The button is disabled while the request is in flight (no double submit).
4. Step 2 (payment): a container `<div>` (ref) receives the Payment Element via `mountPayment(container, client_secret)`; if mounting rejects, show the message and return to step 1. Show the selected product/price, a "Pay $179" (selected price) button, and a "Change details" button that calls `handle.destroy()` and returns to step 1.
5. Pay → `handle.confirm(email)` then `confirmPreorder(purchase_id)`. Only a server status of `paid` shows success "You're in — {product name} reserved." and bumps `BackerBar`'s `refreshKey`. A server status of `pending` (Stripe still processing; `mountPayment.confirm` resolves for `processing` too) shows the neutral notice "Your payment is processing. We'll email you as soon as it's confirmed." — no success message, no bar bump, no retry button (a retry could double-charge). Any other status (`failed`, `refunded`, unknown) shows "Payment did not complete." and returns to the retry state. If `confirm` throws, show its message and stay on step 2 with the Pay button enabled again (retry). Pay is disabled while in flight.
6. Copy under the form: "Full payment today. {SHIP_WINDOW}. If we don't reach the first-batch goal by the deadline, you're refunded in full."
7. On unmount, `handle.destroy()` is called if a payment element is mounted.
8. Inline styles only via `ed`/`DISPLAY`/`GRO` (editorial theme tokens as in the existing homepage section); no Tailwind classes.

- [ ] **Step 1: Write the failing tests** — inject `mountPayment` (a vi.fn returning a fake handle `{ confirm: vi.fn(), destroy: vi.fn() }`) and `stripeConfig={{ enabled: true, error: null }}`; mock `../../../utils/hardwarePreorder` (`createPreorderIntent`, `confirmPreorder`, `fetchBackerCount` resolving `{ paid: 10, goal: 250, deadline: 'd', status: 'open' }`). Cases: prices shown and ring default; product toggle changes the primary price; disabled with the config error when `enabled: false`; happy path (type email, click "Continue to payment" → `createPreorderIntent` called with `('ring', 'qa@example.com', undefined)` and no price argument; `mountPayment` called with an `HTMLElement` and `'cs'`; click "Pay $179" → `handle.confirm('qa@example.com')`, `confirmPreorder('p1')`, "You're in" shown, `fetchBackerCount` called twice); fail-closed when `client_secret` missing; friendly network message on `TypeError('Failed to fetch')`; confirm throwing keeps step 2 with the error and a re-enabled Pay button; `pending` status shows the processing notice with no success text, no bar refetch and no Pay button; `failed` status shows "Payment did not complete." and re-enables Pay; "Change details" destroys the handle and returns to step 1; unmount destroys the handle; Continue is disabled while the request is in flight.

Request-body test to add to `src/utils/__tests__/hardwarePreorder.test.ts` (client file otherwise unchanged): calling `createPreorderIntent('bundle', 'a@b.co', 'Ann')` posts to `https://proj.supabase.co/functions/v1/hardware-preorders` with headers `Content-Type: application/json` and `Authorization: Bearer anon`, and the parsed body's keys are exactly `['action', 'product', 'email', 'name']` (so it can never carry a price).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/__tests__/PreorderBlock.test.tsx src/utils/__tests__/hardwarePreorder.test.ts` — Expected: FAIL (component missing; body test fails or is new).

- [ ] **Step 3: Implement `PreorderBlock.tsx`** to satisfy the behavior list above (a `step: 'details' | 'payment' | 'success'` state, `intent` state `{ purchaseId, clientSecret }`, a `handleRef`, a `containerRef`, an effect that mounts the payment element when `step === 'payment'`).

- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS, output pristine (no act warnings).

- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/PreorderBlock.tsx src/components/hardware/__tests__/PreorderBlock.test.tsx src/utils/__tests__/hardwarePreorder.test.ts
git commit -m "feat(hardware): preorder block with two-step Stripe Payment Element checkout"
```

---

### Task 11: 3D ring viewer component (asset conversion is an owner step)

> **Plan revision (controller ruling):** Blender is not installed on this machine and the shared-machine gate was RED when this task was reached, so the STL → `.glb` conversion cannot run here. This task builds the viewer component, its dependency declaration, and the owner's conversion instructions. The component MUST work without the model file: if the `.glb` is missing, or the viewer fails to register or load, it shows the SVG ring illustration instead, so `/ring` is never broken. The two asset files (`public/models/r3-ring.glb`, `public/models/r3-ring-poster.webp`) are NOT created by this task.

**Files:**
- Create: `src/components/hardware/registerModelViewer.ts`
- Create: `src/components/hardware/RingViewer.tsx`
- Create: `src/components/hardware/model-viewer.d.ts`
- Create: `scripts/convert-ring-stl.md`
- Modify: `package.json` and `package-lock.json` (declare `@google/model-viewer@4.0.0` WITHOUT touching `node_modules`: run `npm install --package-lock-only @google/model-viewer@4.0.0`; do NOT run a plain `npm install`/`npm ci`)
- Test: `src/components/hardware/__tests__/RingViewer.test.tsx` (`// @vitest-environment jsdom` first line; `afterEach(cleanup)`)

**Interfaces:**
- Produces: `export function RingViewer()` (no props; fills its parent: `width: 100%; height: 100%; min-height: 360px`). Task 12 renders `<RingViewer />` in the hero.
- Produces: `registerModelViewer.ts` whose entire body is `import '@google/model-viewer';` (isolated so tests mock this one relative module and never resolve the package).

**Behavior (all covered by tests):**
1. Renders a `<model-viewer>` element with `src="/models/r3-ring.glb"`, `poster="/models/r3-ring-poster.webp"`, an `alt` ("R³ Ring — drag to rotate"), the `camera-controls` attribute, `shadow-intensity`, and `auto-rotate` ONLY when `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is false (guard `matchMedia` being undefined).
2. On mount it dynamically `import('./registerModelViewer')`; if that import rejects, show the fallback.
3. If the `<model-viewer>` element fires an `error` event (e.g. the `.glb` 404s), replace it with the fallback.
4. If `window.customElements` is unavailable, show the fallback without registering.
5. Fallback = an inline SVG ring illustration with `role="img"` and `aria-label="R³ Ring"` (a simple ellipse ring in the same stone/ochre palette as the homepage hardware art: dark ellipse shell, inner ellipse, one `#C7D99F` indicator dot) inside a container that fills the parent. Inline styles only; no Tailwind classes.
6. Never set state after unmount (guard the async import).
7. `scripts/convert-ring-stl.md` documents, for the OWNER to run later: the exact Blender command (`blender -b --python <script>`) that imports `Meshy_AI_smart_ring_refined_20261031_generate.stl`, applies a Decimate modifier (target a `.glb` under ~2 MB; ratio starting at 0.25, adjust), exports GLB with Draco compression to `public/models/r3-ring.glb`, plus how to produce `public/models/r3-ring-poster.webp` (a 1:1 viewport render), and a note that until these two files exist the page shows the SVG fallback. No execution in this task.

- [ ] **Step 1: Write the failing tests** — mock `../registerModelViewer` with `vi.mock('../registerModelViewer', () => ({}))` for the happy path and a throwing factory (or a mocked-rejecting dynamic import) for the failure path. Cases: renders `model-viewer` with the exact `src`, `poster`, `camera-controls`, and an `alt`; `auto-rotate` present normally and absent under reduced motion (stub `window.matchMedia`); dispatching an `error` event on the element swaps in the fallback (`getByRole('img', { name: 'R³ Ring' })` present, `model-viewer` gone); a failing registration shows the fallback; missing `customElements` shows the fallback and does not call registration; registration is requested exactly once; unmounting before the import resolves does not warn or set state.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/components/hardware/__tests__/RingViewer.test.tsx` — Expected: FAIL (component missing).

- [ ] **Step 3: Implement** `registerModelViewer.ts`, `RingViewer.tsx`, `model-viewer.d.ts` (a JSX `IntrinsicElements` declaration for `'model-viewer'`), and `scripts/convert-ring-stl.md`; declare the dependency with the lockfile-only command above.

- [ ] **Step 4: Run to verify they pass** — same command — Expected: PASS, pristine output.

- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/registerModelViewer.ts src/components/hardware/RingViewer.tsx src/components/hardware/model-viewer.d.ts src/components/hardware/__tests__/RingViewer.test.tsx scripts/convert-ring-stl.md package.json package-lock.json
git commit -m "feat(hardware): 3D ring viewer with SVG fallback; STL conversion documented for the owner"
```

---

### Task 12: Page sections and `HardwarePage` assembly

> **Plan revision (controller rulings):** (1) `HardwarePage` renders inside App's existing `<main>` via `PageRenderer` (Task 2 fix), so it MUST NOT render `Header`, `Footer`, or a `<main>`; its root is `<div id="hardware-page">` (already in place — keep it). (2) Device names follow the spec: **R³ Ring** (touch/slide controller) and **R³ Clip** (camera pod worn as a necklace, a watch, or a clip). (3) **Do not invent hardware facts.** Copy may only use claims from the owner's message and spec sheet (listed below). Ring specs are not final; say so rather than inventing numbers. (4) Shared device art moves to its own file.

**Files:**
- Create: `src/components/hardware/DeviceArt.tsx` (exports `RingArt`, `ClipArt` — moved from `NoteRingArt` and `HeartCameraArt` in `src/components/HardwarePreorder.tsx`)
- Modify: `src/components/HardwarePreorder.tsx` (delete the two SVG functions; import `RingArt as NoteRingArt` and `ClipArt as HeartCameraArt` temporarily so the homepage section keeps rendering — Task 13 rewrites this file's copy)
- Create: `src/components/hardware/HardwareHero.tsx`, `HowItWorks.tsx`, `DevicePair.tsx`, `AiAssistant.tsx`, `SpecSheet.tsx`
- Modify: `src/components/hardware/HardwarePage.tsx` (compose the sections)
- Test: `src/components/hardware/__tests__/HardwarePage.test.tsx` (`// @vitest-environment jsdom` first line; `afterEach(cleanup)`)

**Interfaces:**
- Consumes: `RingViewer` (Task 11, no props), `PreorderBlock` (Task 10, no required props), `BackerBar` (Task 8), `PRODUCTS`/`formatUsd`/`SHIP_WINDOW`/`BATCH_GOAL` (Task 1), `ed`/`DISPLAY`/`GRO` from `src/config/editorialTheme` (match the dark editorial look of `src/components/HardwarePreorder.tsx`: `ed.dark` background, `ed.onDark`, `ed.onDarkSoft`, `ed.onDarkHair`, accent `#C7D99F`).
- Produces: `HardwarePage` with the sections below in this order; every section is a `<section>` with an `aria-labelledby` heading; exactly ONE `<h1>` on the page (the hero's).

**Facts copy may use (nothing else about hardware):**
- Ring: a controller worn on the finger with a touch and slide surface that controls the clip. Final ring specifications are not published yet.
- Clip: a camera pod worn as a necklace, a watch, or a clip; it captures your food, activity, voice notes, and AI requests. Planned specs from the owner's spec sheet: 8 MP wide-angle camera (160° field of view); a physical slider that cuts the camera, microphones, and radios; a red camera LED while the camera is active.
- AI assistant: manages your routine, your calendar, and your email.
- Pricing/terms come ONLY from `copy.ts` (`PRODUCTS`, `formatUsd`, `SHIP_WINDOW`, `BATCH_GOAL`).

**Sections and exact strings (tests assert these):**
1. **Hero** (`HardwareHero`): eyebrow "R³ hardware · first batch"; `<h1>` "Track your routine without lifting a finger."; subcopy "Touch or slide the R³ Ring to control the R³ Clip's camera, record a voice note, or hand a request to your AI assistant."; two anchor links to `#preorder` with text "Reserve the R³ Ring — $179" and "Ring + Clip — $299" (prices via `formatUsd(PRODUCTS.x.priceCents)`); a `BackerBar`; the `RingViewer` in a fixed-aspect container (e.g. `aspect-ratio: 1 / 1`, min-height via the viewer).
2. **How it works** (`HowItWorks`): `<h2>` "How it works"; an ordered list of three steps with these headings — "Touch or slide", "Capture", "Your assistant handles it" — and one-sentence bodies using only the facts above (step 1 mentions the ring's touch and slide surface controlling the clip; step 2 the clip capturing food, activity, voice notes, and AI requests; step 3 the assistant managing routine, calendar, and email).
3. **Two devices** (`DevicePair`): `<h2>` "Two devices, one routine"; two articles: "R³ Ring" (label "Controller") with `RingArt`, and "R³ Clip" (label "Camera pod") with `ClipArt`, each with one or two sentences from the facts above; mention "necklace", "watch", and "clip" in the Clip article.
4. **AI assistant** (`AiAssistant`): `<h2>` "A personal assistant for your routine"; three short items titled "Routine", "Calendar", "Email", one sentence each from the facts above (no specifics about features that are not in the facts).
5. **Specifications** (`SpecSheet`): `<h2>` "Specifications"; a notice "Planned specifications. Final details are confirmed before manufacturing."; a definition list for the Ring (Control: "Touch and slide"; Works with: "R³ Clip") and for the Clip (Camera: "8 MP wide-angle, 160° field of view"; Captures: "Food, activity, voice notes, AI requests"; Worn as: "Necklace, watch, or clip"; Privacy: "Physical slider cuts the camera, microphones, and radios; red LED while the camera is on").
6. **Preorder** (inline in `HardwarePage`): `<section id="preorder" aria-labelledby="preorder-title">` with `<h2 id="preorder-title">` "Reserve your early-backer price" and `<PreorderBlock />`.

**Other requirements:**
- `DeviceArt.tsx`: move the two SVGs verbatim EXCEPT: rename to `RingArt`/`ClipArt`; change the `aria-label`s to "Concept illustration of the R3 Ring smart ring" and "Concept illustration of the R3 Clip camera wearable"; make every gradient/filter `id` unique per instance with `useId()` (strip every non-word character from the id, e.g. `.replace(/[^\w-]/g, '')`, and prefix each id) so two instances cannot collide.
- Inline styles only via the theme tokens; responsive layout via a small `<style>` block with `@media (max-width: 800px)` like `HardwarePreorder.tsx` does (no Tailwind classes). Keep each section component small and single-purpose.
- No `<main>`, `Header`, or `Footer` inside `HardwarePage`.

- [ ] **Step 1: Write the failing test.** Render `<HardwarePage />` with `vi.mock('../../../utils/hardwarePreorder', ...)` (`fetchBackerCount` resolving `{ paid: 5, goal: 250, deadline: 'd', status: 'open' }`, plus `createPreorderIntent`/`confirmPreorder` as `vi.fn()`) and `vi.mock('../registerModelViewer', () => ({}))` (so the unavailable package is never resolved). Assert: exactly one heading level 1 with name "Track your routine without lifting a finger."; the two hero links have the exact texts and `href="#preorder"`; `R³ Ring` and `R³ Clip` appear as article headings; headings "How it works", "Two devices, one routine", "A personal assistant for your routine", "Specifications", "Reserve your early-backer price" exist; the page text contains "touch", "slide", "necklace", "watch", "routine", "calendar", and "email"; the `#preorder` section exists and contains the "Continue to payment" button; there is NO `main` element and no `footer`/`banner` landmark inside `#hardware-page`; the SVG ids across `RingArt` and `ClipArt` rendered together are all distinct; the page never contains the strings "Note" or "Heart" as device names and never mentions a price other than $179, $299, $199, $349 (regex-scan the text for `\$\d+` and assert the set).

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/components/hardware/__tests__/HardwarePage.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** the files above. After moving the art, run the homepage section's existing tests if any (`npx vitest run src/components/__tests__` limited to files that mention HardwarePreorder) to confirm the import change did not break it.

- [ ] **Step 4: Run to verify it passes** — same command — Expected: PASS, output pristine.

- [ ] **Step 5: Commit**

```bash
git add src/components/hardware/ src/components/HardwarePreorder.tsx
git commit -m "feat(hardware): ring product page sections and assembly"
```

---

### Task 13: Homepage section becomes a teaser linking to `/ring`

> **Plan revision (controller rulings):** (1) The CTA is a real `<a href="/ring">` — the app's own pattern (the header's Guardians link is `href: '/guardians'`), shareable, and `navigateToPage` only changes in-memory state, not the URL, so no callback prop and NO `App.tsx` change (`{currentPage === "home" && <HardwarePreorder />}` stays). (2) The old section's unverified claims must not survive (they describe the old Note/Heart design): remove "Capture the moment. Not your life.", "Nothing records until you deliberately press the control", "Press to record · release to stop · no ambient listening", "Visible capture light · deliberate clips · camera off by default". (3) The inline email waitlist form and its `make-server-ed0fe4c2/email-waitlist` POST are removed; the preorder on `/ring` replaces them. (4) Adding a link to the global header nav is intentionally NOT part of this build (it affects every page and the existing header layout tests; it is the owner's design call) — proposed as a follow-up.

**Files:**
- Modify (rewrite): `src/components/HardwarePreorder.tsx`
- Test: `src/components/__tests__/HardwarePreorderTeaser.test.tsx` (`// @vitest-environment jsdom` first line; `afterEach(cleanup)`)

**Interfaces:**
- Consumes: `RingArt`, `ClipArt` from `./hardware/DeviceArt` (Task 12 — import them directly; delete the temporary `NoteRingArt`/`HeartCameraArt` aliases); `PRODUCTS`, `formatUsd`, `SHIP_WINDOW` from `./hardware/copy`; `ed`, `DISPLAY`, `GRO` from `../config/editorialTheme`.
- Produces: `export function HardwarePreorder()` — same exported name, NO props. `App.tsx` already renders `<HardwarePreorder />` on the home page.

**Behavior (all covered by tests):**
1. Root `<section id="hardware-preorder" aria-labelledby="hardware-preorder-title">` in the same dark editorial style as today (`ed.dark`/`ed.onDark`/`ed.onDarkHair`, accent `#C7D99F`), inline styles plus a small namespaced `<style>` block (`r3-hw-teaser-*` classes, `@media (max-width: 800px)` single-column); no Tailwind classes.
2. Content, using ONLY permitted facts: eyebrow "R³ hardware · first batch"; `<h2 id="hardware-preorder-title">` "Meet the R³ Ring and R³ Clip."; deck "A touch-and-slide ring controls a camera clip you can wear as a necklace, a watch, or a clip. Your AI assistant manages your routine, calendar, and email."; two articles: **R³ Ring** (label "Controller", `RingArt`, "A controller worn on the finger. Its touch and slide surface controls the clip.") and **R³ Clip** (label "Camera pod", `ClipArt`, "A camera pod you can wear as a necklace, a watch, or a clip. It captures your food, activity, voice notes, and AI requests.").
3. One call to action: `<a href="/ring">` with text `See the R³ Ring — from ${formatUsd(PRODUCTS.ring.priceCents)}` (renders "See the R³ Ring — from $179"); beneath it one line: "Full payment today. {SHIP_WINDOW}. If we don't reach the first-batch goal by the deadline, you're refunded in full."
4. No form, no inputs, no buttons, no network calls, no `useState`, no imports of `projectId`/`publicAnonKey`/`FormEvent`. The only price on the section is `$179`.
5. The `RingArt`/`ClipArt` ids are already per-instance unique (Task 12); nothing else to do for them.

- [ ] **Step 1: Write the failing test.** Stub `globalThis.fetch` with `vi.fn()`. Render `<HardwarePreorder />` and assert: the link with accessible name matching /See the R³ Ring/ exists with `getAttribute('href') === '/ring'` and text "See the R³ Ring — from $179"; the `<h2>` text is "Meet the R³ Ring and R³ Clip."; "R³ Ring" and "R³ Clip" appear as article headings; no `textbox`, no `button`, and no `form` element; the section has `id="hardware-preorder"` and its `aria-labelledby` points at an existing heading; none of these strings appear in the text: "Note", "Heart", "Nothing records", "ambient", "camera off by default", "Capture the moment"; the `$\d+` prices in the text are exactly `['$179']`; `fetch` was never called.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/components/__tests__/HardwarePreorderTeaser.test.tsx` — Expected: FAIL (old section has the form/old copy).

- [ ] **Step 3: Implement** the rewrite of `src/components/HardwarePreorder.tsx` per the behavior list (the file should end up well under 100 lines).

- [ ] **Step 4: Run to verify it passes** — same command — Expected: PASS, pristine output. Also run `npx vitest run src/components/hardware/__tests__/HardwarePage.test.tsx` to confirm the shared art still works for the page.

- [ ] **Step 5: Commit**

```bash
git add src/components/HardwarePreorder.tsx src/components/__tests__/HardwarePreorderTeaser.test.tsx
git commit -m "feat(hardware): homepage section is now a teaser linking to /ring"
```

---

### Task 14: Full suite + Staging verification

**Files:** none (verification task)

- [ ] **Step 1:** Run the whole suite: `npx vitest run` → all green.
- [ ] **Step 2:** Build: `npm run build` → succeeds (model-viewer + glb bundle cleanly).
- [ ] **Step 3:** Preview the `/ring` page (dev server), confirm: hero + 3D ring rotates, product toggle switches price, backer bar loads.
- [ ] **Step 4 (manual, Staging):** Apply the migration; deploy the `hardware-preorders` function to Staging (test keys, `ALLOW_LIVE_PAYMENTS` unset) with its own `verify_jwt` setting matching the deploy workflow; set the Stripe webhook secret. Run a Stripe **test card** (`4242 4242 4242 4242`) through the preorder; confirm a `paid` row and the backer bar increments.
- [ ] **Step 5:** Confirm the live-key guard: with a `sk_live_` key and `ALLOW_LIVE_PAYMENTS` unset, the function returns 503.

> **Production go-live is NOT part of this plan** — it is an owner-run step: deploy to prod, set live keys, flip `ALLOW_LIVE_PAYMENTS=true`, confirm refund/ship terms.

---

## Self-Review

**Spec coverage:** routing (T2) ✓; teaser→page (T13) ✓; 3D ring (T11) ✓; data model + grants + seed (T3) ✓; edge function count/intent/confirm/webhook + live guard (T4–T6) ✓; server-authored prices (T1, T5) ✓; frontend checkout (T7, T9, T10) ✓; backer bar (T8) ✓; page sections incl. AI assistant + spec (T12) ✓; tests throughout; Staging verification (T14) ✓. Out-of-scope items (spec-sheet artifact update, auto mass-refund, prod go-live) intentionally excluded and noted.

**Placeholder scan:** no "TBD/TODO". The two "check how guardian does X" notes (T10 publishable key, T12 Header/Footer props) point at concrete existing files to copy from, not vague instructions — acceptable because the exact prop shape must match existing code the executor can read. Deadline/ship-window are concrete data/constants, not placeholders.

**Type consistency:** `ProductKey` defined in T1, used in T7/T9/T10. `createPreorderIntent`/`confirmPreorder`/`fetchBackerCount` signatures defined in T7 and used identically in T8/T9. `payWithCard(clientSecret)` signature matches between T9 (prop) and T10 (impl). Edge actions `count`/`intent`/`confirm` names consistent across T4–T7. `markFromIntent` defined once in T6.
