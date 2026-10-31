// Hardware preorders on the platform Stripe account. Prices come from PRICES, never the browser.
//   action "count":   public — paid backers vs the batch goal (no PII).
//   action "intent":  create a full-amount PaymentIntent + a pending preorder row.
//   action "confirm": verify the PaymentIntent and mark the row paid.
//   Stripe webhook (stripe-signature): payment_intent.succeeded / payment_failed keep rows in sync.
//
// Environment:
//   STRIPE_SECRET_KEY               Stripe API key (test or live).
//   HARDWARE_STRIPE_WEBHOOK_SECRET  Signing secret of THIS function's Stripe endpoint. It is a separate endpoint
//                                   from guardian-payments, so it needs its own secret (never STRIPE_WEBHOOK_SECRET).
//   ALLOW_LIVE_PAYMENTS             Must be 'true' to accept an sk_live_ key.
//   SUPABASE_URL                    Project URL.
//   SUPABASE_SERVICE_ROLE_KEY       Service role key (writes hardware_preorders).
// Deploy with verify_jwt disabled: Stripe's webhook carries no Supabase JWT.
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2025-02-24.acacia', httpClient: Stripe.createFetchHttpClient() });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Keep in step with PRODUCTS in src/components/hardware/copy.ts.
const PRICES: Record<string, number> = { ring: 14900, clip: 19900, bundle: 29900 };
const CURRENCY = 'usd';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 'first-run';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (message: string, status = 400) => json({ error: message }, status);

async function openBatch() {
  const { data, error } = await db.from('hardware_batches').select('id, goal_backers, deadline, status').eq('name', BATCH).single();
  if (error || !data) throw new Error('Batch not found.');
  return data;
}

// Reconcile a row with Stripe's view of its intent. A paid row is terminal: it is never downgraded and paid_at is never rewritten.
async function markFromIntent(pi: any) {
  const status = pi.status === 'succeeded' ? 'paid' : (pi.status === 'canceled' || pi.status === 'requires_payment_method') ? 'failed' : 'pending';
  const update = status === 'paid'
    ? db.from('hardware_preorders').update({ status, paid_at: new Date().toISOString() }).eq('stripe_payment_intent_id', pi.id).is('paid_at', null)
    : db.from('hardware_preorders').update({ status }).eq('stripe_payment_intent_id', pi.id).neq('status', 'paid').neq('status', 'refunded');
  const { error } = await update;
  if (error) throw error;
  const { data, error: readError } = await db.from('hardware_preorders').select('status').eq('stripe_payment_intent_id', pi.id).maybeSingle();
  if (readError) throw readError;
  return data?.status ?? status;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  if (!Deno.env.get('STRIPE_SECRET_KEY')) return fail('Payments are not configured yet.', 503);
  if (/_live_/.test(Deno.env.get('STRIPE_SECRET_KEY')!) && Deno.env.get('ALLOW_LIVE_PAYMENTS') !== 'true') return fail('Live payments are switched off on this environment.', 503);

  const signature = req.headers.get('stripe-signature');
  if (signature) {
    const secret = Deno.env.get('HARDWARE_STRIPE_WEBHOOK_SECRET');
    if (!secret) return fail('Webhook secret missing', 500);
    let event: any;
    try { event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret); }
    catch { return fail('Bad signature', 400); }
    try {
      // Intentionally not gated by batch status/deadline: this only reconciles what Stripe says about an intent created while the batch was open.
      if (String(event.type).startsWith('payment_intent.')) {
        const current = await stripe.paymentIntents.retrieve(event.data.object.id);
        await markFromIntent(current);
      }
      return json({ received: true });
    } catch (err: any) { console.error('hardware webhook', err?.message || err); return fail('Retry', 500); }
  }

  let body: any;
  try { body = await req.json(); } catch { return fail('Invalid JSON'); }

  try {
    if (body.action === 'count') {
      const batch = await openBatch();
      const { count, error } = await db.from('hardware_preorders').select('id', { count: 'exact', head: true }).eq('batch_id', batch.id).eq('status', 'paid');
      if (error) throw error;
      return json({ paid: count ?? 0, goal: batch.goal_backers, deadline: batch.deadline, status: batch.status });
    }
    if (body.action === 'intent') {
      const email = String(body.email || '').trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter a valid email.');
      const product = String(body.product || '');
      const amount = Object.hasOwn(PRICES, product) ? PRICES[product] : 0;
      if (!amount) return fail('Choose a product.');
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
      const batch = await openBatch();
      if (batch.status !== 'open' || new Date(batch.deadline) <= new Date()) return fail('This preorder batch is closed.', 409);
      const found = await stripe.customers.list({ email, limit: 1 });
      const customer = found.data[0] ?? await stripe.customers.create({ email, name: name || undefined });
      const pi = await stripe.paymentIntents.create({
        amount, currency: CURRENCY, customer: customer.id,
        automatic_payment_methods: { enabled: true },
        description: `R³ preorder (${product})`, receipt_email: email,
        metadata: { product, batch_id: batch.id },
      });
      const { data, error } = await db.from('hardware_preorders').insert({
        batch_id: batch.id, product, email, name: name || null,
        amount_cents: amount, currency: CURRENCY.toUpperCase(),
        stripe_customer_id: customer.id, stripe_payment_intent_id: pi.id,
      }).select('id').single();
      if (error) throw error;
      return json({ purchase_id: data.id, client_secret: pi.client_secret, amount_cents: amount, currency: CURRENCY.toUpperCase() });
    }
    if (body.action === 'confirm') {
      // Intentionally not gated by batch status/deadline: it reconciles Stripe's verdict on an intent created while the batch was open.
      const purchaseId = typeof body.purchase_id === 'string' ? body.purchase_id.trim() : '';
      if (!purchaseId) return fail('Missing purchase_id.');
      // id is a uuid column: a malformed id would raise Postgres 22P02 (500), so treat it as not found without querying.
      if (!UUID_RE.test(purchaseId)) return fail('Preorder not found.', 404);
      const { data: row, error } = await db.from('hardware_preorders').select('stripe_payment_intent_id').eq('id', purchaseId).maybeSingle();
      if (error) throw error;
      if (!row?.stripe_payment_intent_id) return fail('Preorder not found.', 404);
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      return json({ status: await markFromIntent(pi) });
    }
    return fail('Unknown action');
  } catch (err: any) {
    console.error('hardware-preorders', err?.message || err);
    return fail('Something went wrong.', 500);
  }
});
