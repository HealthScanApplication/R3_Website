// Guardian social account linking (Instagram, Facebook, TikTok, YouTube) through each platform's official OAuth.
//   POST ?action=start    (signed-in Guardian) body {platform, brand_id, return_to} -> {url} to send the browser to.
//   GET  ?action=callback (platform redirect, no JWT)  -> exchanges the code, stores the encrypted token, redirects to return_to.
// Deploy with --no-verify-jwt: the callback is a browser redirect from the platform; "start" verifies the JWT itself.
// Env: <PLATFORM>_CLIENT_ID / <PLATFORM>_CLIENT_SECRET per platform, SOCIAL_STATE_SECRET, SOCIAL_TOKEN_ENCRYPTION_KEY,
//      PUBLIC_SITE_URL, SOCIAL_ALLOWED_RETURN_ORIGINS (optional). See README.md next to this file.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ConfigError, STATE_TTL_MS, buildAuthorizeUrl, encryptToken, exchangeCode, isPlatform, newNonce, platformCredentials, redirectUri, requireSecrets, safeReturnTo, signState, verifyState, type Platform } from './lib.ts';

const env = (name: string) => Deno.env.get(name);
const supabaseUrl = env('SUPABASE_URL')!;
const db = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY')!);
const SITE = env('PUBLIC_SITE_URL') || 'https://routine3.com';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function back(returnTo: string, platform: string, result: 'connected' | 'error', message?: string) {
  const u = new URL(returnTo);
  u.searchParams.set('social', result);
  u.searchParams.set('platform', platform);
  if (message) u.searchParams.set('social_error', message.slice(0, 200));
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

async function connectionRow(guideId: string, brandId: string | null, platform: Platform) {
  let q = db.from('guide_social_connections').select('id').eq('guide_id', guideId).eq('platform', platform);
  q = brandId ? q.eq('brand_id', brandId) : q.is('brand_id', null);
  const { data } = await q.maybeSingle();
  return data?.id as string | undefined;
}

async function start(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: 'Sign in first.' }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!isPlatform(body.platform)) return json({ error: 'Unsupported platform.' }, 400);
  const platform: Platform = body.platform;
  const creds = platformCredentials(platform, env);
  const { stateSecret } = requireSecrets(env);

  const { data: profile } = await db.from('guide_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!profile) return json({ error: 'Create your Guardian profile first.' }, 403);
  const brandId: string | null = body.brand_id ? String(body.brand_id) : null;
  if (brandId) {
    const { data: brand } = await db.from('guide_brands').select('id').eq('id', brandId).eq('guide_id', user.id).maybeSingle();
    if (!brand) return json({ error: 'Brand not found.' }, 404);
  }

  const nonce = newNonce();
  const exp = Date.now() + STATE_TTL_MS;
  const fields = { oauth_nonce: nonce, oauth_nonce_expires_at: new Date(exp).toISOString(), updated_at: new Date().toISOString() };
  const existing = await connectionRow(user.id, brandId, platform);
  const { error } = existing
    ? await db.from('guide_social_connections').update(fields).eq('id', existing)
    : await db.from('guide_social_connections').insert({ guide_id: user.id, brand_id: brandId, platform, status: 'pending', ...fields });
  if (error) return json({ error: error.message }, 500);

  const returnTo = safeReturnTo(body.return_to, SITE, env('SOCIAL_ALLOWED_RETURN_ORIGINS') || '');
  const state = await signState({ u: user.id, b: brandId, p: platform, r: returnTo, n: nonce, exp }, stateSecret);
  return json({ url: buildAuthorizeUrl(platform, creds.clientId, state, redirectUri(supabaseUrl)) });
}

async function callback(url: URL) {
  const { stateSecret, encryptionKey } = requireSecrets(env);
  let state;
  try { state = await verifyState(url.searchParams.get('state') || '', stateSecret); } catch (e) { return json({ error: (e as Error).message }, 400); }
  const platform = state.p;
  const fail = (message: string) => back(state.r, platform, 'error', message);
  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error') || url.searchParams.get('error_reason');
  const code = url.searchParams.get('code');

  const rowId = await connectionRow(state.u, state.b, platform);
  const { data: row } = rowId ? await db.from('guide_social_connections').select('oauth_nonce, oauth_nonce_expires_at').eq('id', rowId).maybeSingle() : { data: null };
  if (!rowId || !row?.oauth_nonce || row.oauth_nonce !== state.n || new Date(row.oauth_nonce_expires_at || 0).getTime() < Date.now()) return fail('This connection link was already used or expired. Start again.');
  // Burn the nonce first so the same redirect can never be replayed.
  await db.from('guide_social_connections').update({ oauth_nonce: null, oauth_nonce_expires_at: null }).eq('id', rowId);

  if (providerError || !code) {
    await db.from('guide_social_connections').update({ status: 'error', last_error: String(providerError || 'Authorization was cancelled.').slice(0, 300) }).eq('id', rowId);
    return fail(String(providerError || 'Authorization was cancelled.'));
  }
  try {
    const result = await exchangeCode(platform, code, platformCredentials(platform, env), redirectUri(supabaseUrl));
    const { ciphertext, iv } = await encryptToken(result.token, encryptionKey);
    const { error } = await db.from('guide_social_connections').update({
      status: 'connected', token_ciphertext: ciphertext, token_iv: iv, provider_account_id: result.providerAccountId,
      account_label: result.label, account_handle: result.handle, connected_at: new Date().toISOString(), expires_at: result.expiresAt, last_error: null, updated_at: new Date().toISOString(),
    }).eq('id', rowId);
    if (error) throw new Error(error.message);
    return back(state.r, platform, 'connected');
  } catch (e) {
    const message = (e as Error).message;
    await db.from('guide_social_connections').update({ status: 'error', last_error: message.slice(0, 300) }).eq('id', rowId);
    return fail(message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  try {
    if (action === 'start' && req.method === 'POST') return await start(req);
    if (action === 'callback' && req.method === 'GET') return await callback(url);
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    if (e instanceof ConfigError) return json({ error: e.message }, 503);
    return json({ error: (e as Error).message || 'Unexpected error.' }, 500);
  }
});
