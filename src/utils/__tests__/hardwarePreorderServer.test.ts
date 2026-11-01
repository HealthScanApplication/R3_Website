import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

type Row = Record<string, any>;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const O1 = uuid(1), O2 = uuid(2), O3 = uuid(3), O4 = uuid(4);
function server(envOverrides: Record<string, string | undefined> = {}) {
  const batches: Row[] = [{ id: 'b1', name: 'first-run', goal_backers: 250, deadline: '2099-12-31T23:59:59Z', status: 'open' }];
  const orders: Row[] = [
    { id: O1, batch_id: 'b1', product: 'ring', status: 'paid', stripe_payment_intent_id: 'pi_paid', email: 'someone@example.com', name: 'Some One' },
    { id: O2, batch_id: 'b1', product: 'bundle', status: 'pending', stripe_payment_intent_id: 'pi_pending' },
    { id: uuid(3), batch_id: 'b1', product: 'ring', status: 'refunded', paid_at: '2026-10-01T00:00:00Z', refunded_at: '2026-10-02T00:00:00Z', stripe_payment_intent_id: 'pi_refunded' },
  ];
  const intents = new Map<string, Row>([['pi_pending', { id: 'pi_pending', status: 'processing' }], ['pi_refunded', { id: 'pi_refunded', status: 'succeeded' }]]);
  const probe = { orderQueries: 0, orderSelects: 0, failSelectAt: 0, selectOptions: [] as any[] };
  const table = (rows: Row[], isOrders = false) => {
    let action = 'select', payload: Row, filters: ((r: Row) => boolean)[] = [], head = false;
    const q: any = {
      select(_columns?: string, options?: Row) { if (isOrders && options) probe.selectOptions.push(options); head = !!options?.head; return q; },
      eq(k: string, v: any) { filters.push(r => r[k] === v); return q; },
      is(k: string, v: any) { filters.push(r => (r[k] ?? null) === v); return q; },
      neq(k: string, v: any) { filters.push(r => r[k] !== v); return q; },
      insert(v: Row) { action = 'insert'; payload = v; return q; },
      update(v: Row) { action = 'update'; payload = v; return q; },
      single() { return run(true); }, maybeSingle() { return run(true); },
      then(res: any, rej: any) { return run(false).then(res, rej); },
    };
    async function run(single: boolean) {
      if (isOrders) {
        probe.orderQueries++;
        if (action === 'select' && ++probe.orderSelects === probe.failSelectAt) return { data: null, error: new Error('read failed') };
      }
      if (action === 'insert') { const row = { id: uuid(100 + rows.length), status: 'pending', paid_at: null, ...payload }; rows.push(row); return { data: single ? row : [row], error: null }; }
      const found = rows.filter(r => filters.every(f => f(r)));
      if (action === 'select' && head) return { data: null, error: null, count: found.length };
      if (action === 'update') found.forEach(r => Object.assign(r, payload));
      return { data: single ? found[0] ?? null : found, error: null, count: found.length };
    }
    return q;
  };
  const db = { from: (t: string) => t === 'hardware_batches' ? table(batches) : table(orders, true) };
  const webhook = { reject: false };
  const piCreates: Row[] = [];
  const customerCreates: Row[] = [];
  const stripe = {
    customers: { async list() { return { data: [] }; }, async create(p: Row) { customerCreates.push(p); return { id: 'cus_new' }; } },
    paymentIntents: {
      async create(p: Row) { piCreates.push(p); const i = { id: `pi_${piCreates.length + 1}`, status: 'processing', client_secret: 'sec', ...p }; intents.set(i.id, i); return i; },
      async retrieve(id: string) { return intents.get(id); },
    },
    webhooks: { async constructEventAsync(body: string) { if (webhook.reject) throw new Error('bad sig'); return JSON.parse(body); } },
  };
  const src = readFileSync('supabase/functions/hardware-preorders/index.ts', 'utf8')
    .replace(/import Stripe from[^\n]*\n/, '')
    .replace(/import \{ createClient \}[^\n]*\n/, '')
    .replace(/const stripe =[^\n]*\n/, 'const stripe = globalThis.__stripe;\n')
    .replace(/const db =[^\n]*\n/, 'const db = globalThis.__db;\n');
  const js = transformSync(src, { loader: 'ts', format: 'cjs' }).code;
  (globalThis as any).__stripe = stripe; (globalThis as any).__db = db;
  const env: Row = { STRIPE_SECRET_KEY: 'sk_test_x', SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'x', HARDWARE_STRIPE_WEBHOOK_SECRET: 'whsec_x' };
  for (const [k, v] of Object.entries(envOverrides)) { if (v === undefined) delete env[k]; else env[k] = v; }
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { (globalThis as any).__handler = h; } };
  const mod: any = { exports: {} };
  new Function('module', 'exports', 'globalThis', js)(mod, mod.exports, globalThis);
  return { handler: (globalThis as any).__handler as (r: Request) => Promise<Response>, orders, batches, piCreates, customerCreates, intents, webhook, probe };
}
const post = (body: Row) => new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('hardware-preorders count', () => {
  it('returns paid count, goal, deadline and status (no PII)', async () => {
    const { handler } = server();
    const res = await handler(post({ action: 'count' }));
    const data = await res.json();
    expect(data).toEqual({ paid: 1, goal: 250, deadline: '2099-12-31T23:59:59Z', status: 'open' });
    expect(JSON.stringify(data)).not.toMatch(/@/);
  });

  it('intent uses the server price and creates a pending row', async () => {
    const { handler, orders, piCreates } = server();
    const res = await handler(post({ action: 'intent', product: 'ring', email: 'QA@Example.com', amount_cents: 1 }));
    const data = await res.json();
    expect(data.amount_cents).toBe(14900); // server price, not the browser's 1
    expect(data.client_secret).toBe('sec');
    expect(piCreates).toHaveLength(1);
    expect(piCreates[0]).toMatchObject({ amount: 14900, currency: 'usd', metadata: { product: 'ring' } });
    // No redirect-based methods: the form keeps its state in the page and has no return handling.
    expect(piCreates[0]).toMatchObject({ automatic_payment_methods: { enabled: true, allow_redirects: 'never' } });
    const row = orders.find(o => o.id === data.purchase_id);
    expect(row).toMatchObject({
      status: 'pending', email: 'qa@example.com', product: 'ring', amount_cents: 14900, currency: 'USD',
      batch_id: 'b1', stripe_payment_intent_id: 'pi_2', stripe_customer_id: 'cus_new',
    });
  });
  it('intent prices the clip server-side', async () => {
    const { handler, orders, piCreates } = server();
    const data = await (await handler(post({ action: 'intent', product: 'clip', email: 'qa@example.com', amount_cents: 1 }))).json();
    expect(data.amount_cents).toBe(19900);
    expect(piCreates[0]).toMatchObject({ amount: 19900, metadata: { product: 'clip' } });
    expect(orders.find(o => o.id === data.purchase_id)!.amount_cents).toBe(19900);
  });
  it('intent prices the bundle server-side', async () => {
    const { handler, orders, piCreates } = server();
    const data = await (await handler(post({ action: 'intent', product: 'bundle', email: 'qa@example.com', amount_cents: 1 }))).json();
    expect(data.amount_cents).toBe(29900);
    expect(piCreates[0].amount).toBe(29900);
    expect(orders.find(o => o.id === data.purchase_id)!.amount_cents).toBe(29900);
  });
  it.each([
    ['unknown product', { product: 'hat', email: 'qa@example.com' }, 'Choose a product.'],
    ['__proto__ product', { product: '__proto__', email: 'qa@example.com' }, 'Choose a product.'],
    ['constructor product', { product: 'constructor', email: 'qa@example.com' }, 'Choose a product.'],
    ['bad email', { product: 'ring', email: 'nope' }, 'Enter a valid email.'],
    ['over-length email', { product: 'ring', email: 'a'.repeat(250) + '@x.io' }, 'Enter a valid email.'],
  ])('intent rejects %s', async (_n, input, message) => {
    const { handler, piCreates } = server();
    const res = await handler(post({ action: 'intent', ...input }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
    expect(piCreates).toHaveLength(0);
  });
  it.each([
    ['failed', { status: 'failed' }],
    ['funded', { status: 'funded' }],
    ['past deadline', { deadline: '2020-01-01T00:00:00Z' }],
  ])('intent refuses a closed batch (%s) before touching Stripe', async (_n, over) => {
    const { handler, batches, orders, piCreates, customerCreates } = server();
    Object.assign(batches[0], over);
    const before = orders.length;
    const res = await handler(post({ action: 'intent', product: 'ring', email: 'qa@example.com' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('This preorder batch is closed.');
    expect(piCreates).toHaveLength(0);
    expect(customerCreates).toHaveLength(0);
    expect(orders).toHaveLength(before);
  });
  it('count asks for an exact head count, not a row list capped by the row limit', async () => {
    const { handler, probe } = server();
    const data = await (await handler(post({ action: 'count' }))).json();
    expect(probe.selectOptions).toEqual([{ count: 'exact', head: true }]);
    expect(data.paid).toBe(1);
  });
  it('count still reports a failed batch', async () => {
    const { handler, batches } = server();
    batches[0].status = 'failed';
    const res = await handler(post({ action: 'count' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('failed');
  });
});

describe('hardware-preorders guards', () => {
  it('refuses a live Stripe key unless ALLOW_LIVE_PAYMENTS is true', async () => {
    const off = server({ STRIPE_SECRET_KEY: 'sk_live_x' });
    expect((await off.handler(post({ action: 'count' }))).status).toBe(503);
    const on = server({ STRIPE_SECRET_KEY: 'sk_live_x', ALLOW_LIVE_PAYMENTS: 'true' });
    expect((await on.handler(post({ action: 'count' }))).status).toBe(200);
  });
  it('returns 503 when the Stripe key is missing', async () => {
    const { handler } = server({ STRIPE_SECRET_KEY: undefined });
    expect((await handler(post({ action: 'count' }))).status).toBe(503);
  });
  it('rejects non-POST methods with 405', async () => {
    const { handler } = server();
    expect((await handler(new Request('http://x', { method: 'GET' }))).status).toBe(405);
  });
});

const hook = (type: string, id: string) => new Request('http://x', {
  method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 'sig' },
  body: JSON.stringify({ type, data: { object: { id } } }),
});

describe('hardware-preorders confirm', () => {
  it('marks a pending row paid when Stripe says succeeded', async () => {
    const { handler, orders, intents } = server();
    intents.get('pi_pending')!.status = 'succeeded';
    const res = await handler(post({ action: 'confirm', purchase_id: O2 }));
    expect((await res.json()).status).toBe('paid');
    const row = orders.find(o => o.id === O2)!;
    expect(row.status).toBe('paid');
    expect(row.paid_at).toBeTruthy();
  });
  it('leaves a processing intent pending', async () => {
    const { handler, orders } = server();
    expect((await (await handler(post({ action: 'confirm', purchase_id: O2 }))).json()).status).toBe('pending');
    expect(orders.find(o => o.id === O2)!.paid_at ?? null).toBeNull();
  });
  it('marks a canceled intent failed', async () => {
    const { handler, orders, intents } = server();
    intents.get('pi_pending')!.status = 'canceled';
    expect((await (await handler(post({ action: 'confirm', purchase_id: O2 }))).json()).status).toBe('failed');
    expect(orders.find(o => o.id === O2)!.status).toBe('failed');
  });
  it('is idempotent: a repeat confirm keeps paid_at and a later cancel never downgrades paid', async () => {
    const { handler, orders, intents } = server();
    intents.get('pi_pending')!.status = 'succeeded';
    await handler(post({ action: 'confirm', purchase_id: O2 }));
    const row = orders.find(o => o.id === O2)!;
    const firstPaidAt = row.paid_at;
    expect(firstPaidAt).toBeTruthy();
    await new Promise(r => setTimeout(r, 5));
    const again = await (await handler(post({ action: 'confirm', purchase_id: O2 }))).json();
    expect(again.status).toBe('paid');
    expect(row.paid_at).toBe(firstPaidAt);
    intents.get('pi_pending')!.status = 'canceled';
    const hookRes = await handler(hook('payment_intent.canceled', 'pi_pending'));
    expect((await hookRes.json()).received).toBe(true);
    expect(row.status).toBe('paid');
    expect(row.paid_at).toBe(firstPaidAt);
    const late = await (await handler(post({ action: 'confirm', purchase_id: O2 }))).json();
    expect(late.status).toBe('paid');
  });
  it('returns 404 for an unknown purchase_id', async () => {
    const { handler } = server();
    const res = await handler(post({ action: 'confirm', purchase_id: 'nope' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Preorder not found.');
  });
  it.each([['missing', {}], ['blank', { purchase_id: '  ' }], ['non-string', { purchase_id: { a: 1 } }]])('rejects a %s purchase_id with 400', async (_n, input) => {
    const { handler } = server();
    const res = await handler(post({ action: 'confirm', ...input }));
    expect(res.status).toBe(400);
  });
});

describe('hardware-preorders webhook', () => {
  it('reconciles a succeeded intent', async () => {
    const { handler, orders, intents } = server();
    intents.get('pi_pending')!.status = 'succeeded';
    const res = await handler(hook('payment_intent.succeeded', 'pi_pending'));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
    expect(orders.find(o => o.id === O2)!.status).toBe('paid');
  });
  it('marks a payment_failed intent failed', async () => {
    const { handler, orders, intents } = server();
    intents.get('pi_pending')!.status = 'requires_payment_method';
    await handler(hook('payment_intent.payment_failed', 'pi_pending'));
    expect(orders.find(o => o.id === O2)!.status).toBe('failed');
  });
  it('acknowledges unrelated event types without touching rows', async () => {
    const { handler, orders } = server();
    const res = await handler(hook('charge.refunded', 'ch_1'));
    expect((await res.json()).received).toBe(true);
    expect(orders.find(o => o.id === O2)!.status).toBe('pending');
  });
  it('returns 500 when a signature is sent but HARDWARE_STRIPE_WEBHOOK_SECRET is unset', async () => {
    const { handler, orders, intents } = server({ HARDWARE_STRIPE_WEBHOOK_SECRET: undefined });
    intents.get('pi_pending')!.status = 'succeeded';
    const res = await handler(hook('payment_intent.succeeded', 'pi_pending'));
    expect(res.status).toBe(500);
    expect(orders.find(o => o.id === O2)!.status).toBe('pending');
  });
  it("never falls back to Guardian's STRIPE_WEBHOOK_SECRET: 500 with the missing-secret error and no row changes", async () => {
    const { handler, orders, intents } = server({ HARDWARE_STRIPE_WEBHOOK_SECRET: undefined, STRIPE_WEBHOOK_SECRET: 'whsec_guardian' });
    intents.get('pi_pending')!.status = 'succeeded';
    const res = await handler(hook('payment_intent.succeeded', 'pi_pending'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Webhook secret missing');
    expect(orders.find(o => o.id === O2)!.status).toBe('pending');
  });
  it('returns 400 on a bad signature and changes nothing', async () => {
    const { handler, orders, intents, webhook } = server();
    intents.get('pi_pending')!.status = 'succeeded';
    webhook.reject = true;
    const res = await handler(hook('payment_intent.succeeded', 'pi_pending'));
    expect(res.status).toBe(400);
    expect(orders.find(o => o.id === O2)!.status).toBe('pending');
  });
});

describe('hardware-preorders confirm hardening', () => {
  it.each([['nope'], ["1' or '1'='1"], ['o2'], [O2.slice(0, -1)]])('non-UUID purchase_id %j returns 404 without querying the database', async (id) => {
    const { handler, probe } = server();
    const res = await handler(post({ action: 'confirm', purchase_id: id }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Preorder not found.');
    expect(probe.orderQueries).toBe(0);
  });
  it('accepts an upper-case UUID', async () => {
    const { handler } = server();
    expect((await handler(post({ action: 'confirm', purchase_id: O2.toUpperCase() }))).status).toBe(200);
  });
  it('returns 500 when the final status read fails, never reporting paid', async () => {
    const { handler, intents, probe } = server();
    intents.get('pi_pending')!.status = 'succeeded';
    probe.failSelectAt = 2; // select #1 = row lookup, #2 = markFromIntent final read
    const res = await handler(post({ action: 'confirm', purchase_id: O2 }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Something went wrong.');
  });
});

describe('hardware-preorders refunded rows are terminal', () => {
  const refunded = (orders: Row[]) => orders.find(o => o.id === O3)!;
  const expectUntouched = (row: Row) => {
    expect(row.status).toBe('refunded');
    expect(row.refunded_at).toBe('2026-10-02T00:00:00Z');
    expect(row.paid_at).toBe('2026-10-01T00:00:00Z');
  };
  it.each([['canceled'], ['requires_payment_method']])('a webhook reporting %s leaves a refunded row refunded', async (st) => {
    const { handler, orders, intents } = server();
    intents.get('pi_refunded')!.status = st;
    expect((await (await handler(hook('payment_intent.canceled', 'pi_refunded'))).json()).received).toBe(true);
    expectUntouched(refunded(orders));
  });
  it('confirm with a succeeded intent does not flip a refunded row back to paid', async () => {
    const { handler, orders } = server();
    const data = await (await handler(post({ action: 'confirm', purchase_id: O3 }))).json();
    expect(data.status).toBe('refunded');
    expectUntouched(refunded(orders));
  });
});
