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
