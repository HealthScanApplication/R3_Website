import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

type Row = Record<string, any>;
function server(envOverrides: Record<string, string | undefined> = {}) {
  const batches: Row[] = [{ id: 'b1', name: 'first-run', goal_backers: 250, deadline: '2026-12-15T23:59:59Z', status: 'open' }];
  const orders: Row[] = [
    { id: 'o1', batch_id: 'b1', product: 'ring', status: 'paid', stripe_payment_intent_id: 'pi_paid', email: 'someone@example.com', name: 'Some One' },
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
  for (const [k, v] of Object.entries(envOverrides)) { if (v === undefined) delete env[k]; else env[k] = v; }
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

  it('intent uses the server price and creates a pending row', async () => {
    const { handler, orders } = server();
    const res = await handler(post({ action: 'intent', product: 'ring', email: 'QA@Example.com', amount_cents: 1 }));
    const data = await res.json();
    expect(data.amount_cents).toBe(17900); // server price, not the browser's 1
    expect(data.client_secret).toBe('sec');
    const row = orders.find(o => o.id === data.purchase_id);
    expect(row.status).toBe('pending');
    expect(row.email).toBe('qa@example.com'); // lowercased
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
});

describe('hardware-preorders guards', () => {
  it('refuses a live Stripe key unless ALLOW_LIVE_PAYMENTS is true', async () => {
    const off = server({ STRIPE_SECRET_KEY: 'sk_live_x' });
    expect((await off.handler(post({ action: 'count' }))).status).toBe(503);
    const on = server({ STRIPE_SECRET_KEY: 'sk_live_x', ALLOW_LIVE_PAYMENTS: 'true' });
    expect((await on.handler(post({ action: 'count' }))).status).not.toBe(503);
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
