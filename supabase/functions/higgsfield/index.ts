// Guardian videos on the Guardian's OWN Higgsfield account (signed-in Guardian only). Two ways to connect:
//   API key (REST API, paid from their Higgsfield API balance), or "Log in with Higgsfield" (OAuth 2.1 + PKCE against
//   Higgsfield's MCP server, which uses their plan credits).
//   action "status":     is this Guardian connected (how, plus a key/email hint only), live or mock mode, which models.
//   action "connect":    store their key ID + secret, AES-GCM encrypted (HIGGSFIELD_ENCRYPTION_KEY). Live mode checks
//                        the key first with Higgsfield's free cost-estimate endpoint.
//   action "oauth_start": the Higgsfield login URL (PKCE; state sealed with the same key). Higgsfield redirects back to
//                        this function (GET ?code&state), which stores the tokens encrypted and returns to the site.
//   action "tools":      (login only) the MCP tools the Guardian's account offers, to map generation onto them.
//   action "disconnect": delete the stored credentials.
//   action "generate":   start a text-to-video (or image-to-video) job on their account.
//   action "poll":       refresh one job; a finished video is copied into the private guardian-videos bucket
//                        (Higgsfield keeps results only ~7 days) and returned as a short-lived signed URL.
//   action "list":       their recent jobs.
// Credentials never leave this function: not to the browser, not to the logs. Mock mode (the default until
// HIGGSFIELD_LIVE=true) never calls Higgsfield and never spends credits. Docs: docs/higgsfield-integration.md
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as hf from './lib.ts';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const LIVE = Deno.env.get('HIGGSFIELD_LIVE') === 'true';
const ENC = Deno.env.get('HIGGSFIELD_ENCRYPTION_KEY') || '';
const MAX_ACTIVE = 3, MAX_PER_DAY = Number(Deno.env.get('HIGGSFIELD_DAILY_LIMIT') || 20);
const BUCKET = 'guardian-videos';
const SELF = `${Deno.env.get('SUPABASE_URL')}/functions/v1/higgsfield`; // OAuth redirect URI (deploy with --no-verify-jwt)
// Keep both local hostname forms available even when production supplies an explicit origin list. Vite may be
// opened as either localhost or 127.0.0.1; OAuth must return to the exact origin that started the login so the
// Guardian keeps the same Supabase session and workspace URL.
const LOCAL_RETURN_ORIGINS = ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
const RETURN_ORIGINS = [...new Set([
  ...(Deno.env.get('HIGGSFIELD_RETURN_ORIGINS') || 'https://routine3.com,https://www.routine3.com').split(',').map((o) => o.trim()).filter(Boolean),
  ...LOCAL_RETURN_ORIGINS,
])];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400) => json({ error }, status);
const JOB_FIELDS = 'id, model, prompt, aspect_ratio, duration_seconds, image_url, status, video_url, storage_path, error, mock, created_at, updated_at';

/** Call Higgsfield. Returns the parsed body or a friendly error; never logs or returns the credentials. */
async function higgsfield(creds: { key: string; secret: string }, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}) {
  const res = await fetch(`${hf.HF_BASE}/${path}`, {
    method: init.method || 'POST',
    headers: { Authorization: hf.authHeader(creds), 'Content-Type': 'application/json', Accept: 'application/json', ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) { console.warn('higgsfield http', res.status, res.headers.get('x-correlation-id')); return { ok: false as const, error: hf.errorMessage(res.status, body), status: res.status }; }
  return { ok: true as const, body };
}

type Connection = { method: 'api_key'; creds: { key: string; secret: string } } | { method: 'oauth'; tokens: hf.OAuthTokens };
async function connectionFor(userId: string): Promise<Connection | null> {
  const { data } = await service.from('guardian_higgsfield_connections').select('method, credentials_ciphertext, credentials_iv').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  const sealed: any = await hf.decryptCredentials(data, userId, ENC);
  if (data.method !== 'oauth') return { method: 'api_key', creds: sealed };
  let tokens: hf.OAuthTokens = sealed.oauth;
  if (hf.needsRefresh(tokens) && tokens.refresh_token) { // refresh quietly; keep the old token if it fails
    const clientId = await oauthClientId(SELF).catch(() => null);
    const res = clientId ? await fetch(hf.OAUTH.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId, resource: hf.MCP_URL }) }).catch(() => null) : null;
    const next = res?.ok ? hf.tokensFrom(await res.json().catch(() => null), Date.now(), tokens.refresh_token) : null;
    if (next) { tokens = next; await saveConnection(userId, 'oauth', { oauth: next }); }
  }
  return { method: 'oauth', tokens };
}
async function credentialsFor(userId: string) {
  const c = await connectionFor(userId);
  return c?.method === 'api_key' ? c.creds : null;
}
async function saveConnection(userId: string, method: 'api_key' | 'oauth', secret: unknown, hint?: string) {
  const sealed = await hf.encryptCredentials(secret as any, userId, ENC);
  const row: Record<string, unknown> = { user_id: userId, method, credentials_ciphertext: sealed.ciphertext, credentials_iv: sealed.iv };
  if (hint !== undefined) { row.key_hint = hint; row.connected_at = new Date().toISOString(); }
  return hint === undefined
    ? service.from('guardian_higgsfield_connections').update(row).eq('user_id', userId)
    : service.from('guardian_higgsfield_connections').upsert(row);
}

/** Our OAuth client at Higgsfield, registered once per environment (dynamic client registration) and remembered. */
async function oauthClientId(redirectUri = SELF): Promise<string> {
  const { data } = await service.from('higgsfield_oauth_clients').select('client_id').eq('redirect_uri', redirectUri).maybeSingle();
  if (data?.client_id) return data.client_id;
  const res = await fetch(hf.OAUTH.register, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hf.registrationBody(redirectUri)) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.client_id) throw new Error(body?.error === 'invalid_redirect_uri' ? 'Higgsfield has not approved this ROUTINE³ login address yet. Use an API key for now.' : 'Higgsfield login is not available right now.');
  const saved = await service.from('higgsfield_oauth_clients').upsert({ redirect_uri: redirectUri, client_id: body.client_id });
  if (saved.error) console.warn('higgsfield oauth client not saved', saved.error.message); // the login carries its client id in its state, so it still completes
  return body.client_id;
}

/** One JSON-RPC call to Higgsfield's MCP server (streamable HTTP): initialize, then the call, on one session. */
async function mcp(tokens: hf.OAuthTokens, method: string, params: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const post = async (id: number | null, m: string, p: unknown) => {
    const res = await fetch(hf.MCP_URL, { method: 'POST', headers, body: JSON.stringify(id === null ? { jsonrpc: '2.0', method: m, params: p } : { jsonrpc: '2.0', id, method: m, params: p }) });
    const session = res.headers.get('mcp-session-id'); if (session) headers['Mcp-Session-Id'] = session;
    if (!res.ok) throw new Error(res.status === 401 ? 'Your Higgsfield login has expired. Log in again.' : `Higgsfield error (${res.status}).`);
    return id === null ? null : hf.parseMcpResponse(await res.text(), res.headers.get('content-type') || '', id);
  };
  await post(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ROUTINE3 Guardians', version: '1.0' } });
  await post(null, 'notifications/initialized', {});
  const answer = await post(2, method, params);
  if (answer?.error) throw new Error(String(answer.error.message || 'Higgsfield refused the request.'));
  return answer?.result;
}

/** GET from Higgsfield after login: swap the code for tokens, store them encrypted, send the Guardian back. */
async function oauthCallback(url: URL): Promise<Response> {
  const state = await hf.openState(url.searchParams.get('state') || '', ENC);
  const back = (outcome: string) => {
    const to = new URL(state?.return_to || RETURN_ORIGINS[0]); to.searchParams.set('higgsfield', outcome);
    return new Response(null, { status: 302, headers: { Location: to.toString() } });
  };
  if (!state) return new Response('This login link has expired. Go back to ROUTINE³ and try again.', { status: 400 });
  const code = url.searchParams.get('code');
  if (!code) return back(url.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'error');
  try {
    const clientId = state.client_id || await oauthClientId(state.redirect_uri || SELF); // the client the login started with, never a fresh registration
    const res = await fetch(hf.OAUTH.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: state.redirect_uri || SELF, client_id: clientId, code_verifier: state.verifier, resource: hf.MCP_URL }) });
    const body = await res.json().catch(() => null);
    const tokens = res.ok ? hf.tokensFrom(body) : null;
    if (!tokens) { console.warn('higgsfield oauth token exchange', res.status); return back('error'); }
    const { error } = await saveConnection(state.user_id, 'oauth', { oauth: tokens }, hf.emailHint(body?.id_token));
    return back(error ? 'error' : 'connected');
  } catch { return back('error'); }
}

/** Copy a finished video into our bucket; on failure keep Higgsfield's URL (valid for at least 7 days). */
async function keepVideo(userId: string, jobId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const path = `${userId}/${jobId}.mp4`;
    const { error } = await service.storage.from(BUCKET).upload(path, await res.arrayBuffer(), { contentType: 'video/mp4', upsert: true });
    return error ? null : path;
  } catch { return null; }
}

async function withSignedUrl(job: any) {
  if (!job?.storage_path) return job;
  const { data } = await service.storage.from(BUCKET).createSignedUrl(job.storage_path, 60 * 60, { download: `routine3-video-${String(job.aspect_ratio).replace(':', 'x')}.mp4` });
  return { ...job, video_url: data?.signedUrl || job.video_url };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!ENC) return fail('Video generation is not configured yet.', 503);
  if (req.method === 'GET') { const url = new URL(req.url); if (url.searchParams.has('state')) return oauthCallback(url); }
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return fail('Sign in first.', 401);
  const { data: guide } = await service.from('guide_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!guide) return fail('Video generation is for Guardians.', 403);
  let body: any; try { body = await req.json(); } catch { return fail('Invalid JSON'); }
  const action = String(body?.action || '');

  if (action === 'status') {
    const { data } = await service.from('guardian_higgsfield_connections').select('method, key_hint, connected_at, last_used_at').eq('user_id', user.id).maybeSingle();
    return json({ connected: !!data, method: data?.method ?? null, key_hint: data?.key_hint ?? null, connected_at: data?.connected_at ?? null, live: LIVE,
      models: hf.MODELS.map((m) => ({ id: m.id, label: m.label, durations: m.durations, aspects: hf.ASPECTS.map((a) => ({ aspect: a, delivered: hf.deliveredAspect(m, a) })) })) });
  }

  if (action === 'connect') {
    const creds = hf.parseCredentials(body);
    if (!creds) return fail('Paste your Higgsfield API key ID and secret (from open.higgsfield.ai → API keys).');
    if (LIVE) { // the estimate endpoint is authenticated but free: a cheap way to check the key works
      const check = await higgsfield(creds, `estimate/${hf.MODELS[0].t2v}`, { body: { prompt: 'A calm morning routine at home.', duration: 5, aspect_ratio: '9:16' } });
      if (!check.ok && check.status === 401) return fail(check.error, 400); // other errors (e.g. low balance) don't mean a bad key
    }
    const { error } = await saveConnection(user.id, 'api_key', creds, hf.keyHint(creds.key));
    if (error) return fail('Could not save the connection.', 500);
    return json({ connected: true, method: 'api_key', key_hint: hf.keyHint(creds.key), live: LIVE });
  }

  if (action === 'oauth_start') {
    const returnTo = hf.safeReturn(String(body.return_to || ''), RETURN_ORIGINS);
    if (!returnTo) return fail('Logging in with Higgsfield isn’t enabled for this site address yet.');
    try {
      const returnUrl = new URL(returnTo);
      const loopback = returnUrl.hostname === 'localhost' || returnUrl.hostname === '127.0.0.1';
      // Keep the workspace tab in the loopback callback. Without ?tab=content the app returns to the
      // default workspace view, VideoStudio never mounts, and the browser cannot complete the code exchange.
      const redirectUri = loopback ? returnUrl.toString() : SELF;
      const verifier = hf.pkceVerifier();
      const clientId = await oauthClientId(redirectUri);
      const state = await hf.sealState({ user_id: user.id, verifier, return_to: returnTo, redirect_uri: redirectUri, exp: Date.now() + 15 * 60 * 1000, client_id: clientId }, ENC);
      return json({ url: hf.authorizeUrl({ clientId, redirectUri, state, challenge: await hf.pkceChallenge(verifier) }) });
    } catch (e) { return fail((e as Error).message, 502); }
  }

  if (action === 'oauth_complete') {
    const state = await hf.openState(String(body.state || ''), ENC);
    if (!state || state.user_id !== user.id) return fail('This Higgsfield login link has expired.', 400);
    if (body.error) return json({ outcome: body.error === 'access_denied' ? 'cancelled' : 'error' });
    const code = String(body.code || '');
    if (!code) return fail('Higgsfield did not return a login code.');
    try {
      const clientId = state.client_id || await oauthClientId(state.redirect_uri || SELF);
      const res = await fetch(hf.OAUTH.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: state.redirect_uri || SELF, client_id: clientId, code_verifier: state.verifier, resource: hf.MCP_URL }) });
      const payload = await res.json().catch(() => null);
      const tokens = res.ok ? hf.tokensFrom(payload) : null;
      if (!tokens) return fail('Higgsfield could not finish the login.', 502);
      const { error } = await saveConnection(user.id, 'oauth', { oauth: tokens }, hf.emailHint(payload?.id_token));
      if (error) return fail('Could not save the Higgsfield connection.', 500);
      return json({ outcome: 'connected' });
    } catch { return fail('Higgsfield could not finish the login.', 502); }
  }

  if (action === 'tools') {
    const c = await connectionFor(user.id).catch(() => null);
    if (c?.method !== 'oauth') return fail('Log in with Higgsfield first.', 409);
    try { const r = await mcp(c.tokens, 'tools/list', {}); return json({ tools: (r?.tools || []).map((t: any) => ({ name: t.name, description: String(t.description || '').slice(0, 300), input: t.inputSchema ?? null })) }); }
    catch (e) { return fail((e as Error).message, 502); }
  }

  if (action === 'disconnect') {
    const { error } = await service.from('guardian_higgsfield_connections').delete().eq('user_id', user.id);
    if (error) return fail('Could not disconnect.', 500);
    return json({ connected: false });
  }

  if (action === 'list') {
    const { data } = await service.from('guardian_video_jobs').select(JOB_FIELDS).eq('user_id', user.id).order('created_at', { ascending: false }).limit(12);
    return json({ jobs: await Promise.all((data || []).map(withSignedUrl)) });
  }

  if (action === 'estimate') {
    // Cost doesn't depend on the words, so a fixed prompt is sent: the Guardian's prompt isn't shared before they generate.
    const shaped = hf.shapeRequest({ ...body, prompt: 'A calm morning routine at home.', image_url: null });
    if (!shaped.ok) return fail(shaped.error);
    const fallback = hf.listEstimate(shaped.model, shaped.duration);
    const conn = await connectionFor(user.id).catch(() => null);
    if (conn?.method === 'oauth') return json({ estimate: { usd: null, credits: null, source: 'plan', per_second: null }, duration: shaped.duration, delivered_aspect: shaped.delivered });
    if (!LIVE) return json({ estimate: fallback, duration: shaped.duration, delivered_aspect: shaped.delivered });
    const creds = conn?.method === 'api_key' ? conn.creds : null;
    if (!creds) return json({ estimate: fallback, duration: shaped.duration, delivered_aspect: shaped.delivered });
    const res = await higgsfield(creds, `estimate/${shaped.endpoint}`, { body: shaped.body });
    return json({ estimate: (res.ok && hf.parseEstimate(res.body)) || fallback, duration: shaped.duration, delivered_aspect: shaped.delivered });
  }

  if (action === 'generate') {
    const shaped = hf.shapeRequest(body);
    if (!shaped.ok) return fail(shaped.error);
    const conn = await connectionFor(user.id).catch(() => null);
    if (!conn) return fail('Connect your Higgsfield account first.', 409);
    // Video through the Higgsfield login runs on MCP tools whose names we map after the first real login ("tools").
    if (LIVE && conn.method === 'oauth') return fail('Making videos through your Higgsfield login isn’t switched on yet. Connect with an API key for now.', 501);
    const creds = conn.method === 'api_key' ? conn.creds : null;
    // Spend guard on the Guardian's own balance: a few at a time, and a daily ceiling.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await service.from('guardian_video_jobs').select('status').eq('user_id', user.id).gte('created_at', since);
    if ((recent || []).filter((j: any) => !hf.TERMINAL.includes(j.status)).length >= MAX_ACTIVE) return fail(`You already have ${MAX_ACTIVE} videos rendering. Wait for one to finish.`, 429);
    if ((recent || []).length >= MAX_PER_DAY) return fail(`That's ${MAX_PER_DAY} videos today. Try again tomorrow.`, 429);
    const id = crypto.randomUUID();
    let requestId = `mock-${id}`;
    if (LIVE) {
      const res = await higgsfield(creds!, shaped.endpoint, { body: shaped.body, idempotencyKey: id });
      if (!res.ok) return fail(res.error, res.status === 401 ? 400 : 502);
      requestId = String(res.body?.request_id || '');
      if (!requestId) return fail('Higgsfield did not start the job.', 502);
    }
    const row = { id, user_id: user.id, brand_id: body.brand_id || null, request_id: requestId, model: shaped.model.id, prompt: String(shaped.body.prompt), aspect_ratio: shaped.aspect, duration_seconds: shaped.duration, image_url: (shaped.body.image_url as string) || null, status: 'queued', mock: !LIVE };
    const { data: job, error } = await service.from('guardian_video_jobs').insert(row).select(JOB_FIELDS).single();
    if (error) return fail('Could not save the job.', 500);
    await service.from('guardian_higgsfield_connections').update({ last_used_at: new Date().toISOString() }).eq('user_id', user.id);
    return json({ job: { ...job, delivered_aspect: shaped.delivered } });
  }

  if (action === 'poll') {
    const { data: job } = await service.from('guardian_video_jobs').select(`${JOB_FIELDS}, request_id`).eq('id', String(body.job_id || '')).eq('user_id', user.id).maybeSingle();
    if (!job) return fail('Video not found.', 404);
    const { request_id, ...visible } = job;
    if (hf.TERMINAL.includes(job.status)) return json({ job: await withSignedUrl(visible) });
    let next: { status: hf.JobStatus; video_url: string | null; error: string | null };
    if (job.mock) next = { status: hf.mockStatus(Date.parse(job.created_at), Date.now()), video_url: null, error: null };
    else {
      const creds = await credentialsFor(user.id).catch(() => null);
      if (!creds) return fail('Connect your Higgsfield account again to check this video.', 409);
      const res = await higgsfield(creds, `requests/${encodeURIComponent(request_id)}/status`, { method: 'GET' });
      if (!res.ok) return json({ job: visible, warning: res.error });
      next = hf.mapStatus(res.body);
    }
    const patch: Record<string, unknown> = { status: next.status, error: next.error, updated_at: new Date().toISOString() };
    if (next.status === 'completed' && next.video_url) {
      patch.video_url = next.video_url;
      patch.storage_path = await keepVideo(user.id, job.id, next.video_url);
    }
    // Only move forward from a non-terminal state, so two polls can't both copy or overwrite a finished job.
    const { data: updated } = await service.from('guardian_video_jobs').update(patch).eq('id', job.id).not('status', 'in', `(${hf.TERMINAL.join(',')})`).select(JOB_FIELDS).maybeSingle();
    return json({ job: await withSignedUrl(updated || { ...visible, ...patch }) });
  }

  return fail('Unknown action.');
});
