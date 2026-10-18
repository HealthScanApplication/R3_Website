// Guardian videos with the Guardian's OWN Higgsfield API key (signed-in Guardian only).
//   action "status":     is this Guardian connected (key hint only), live or mock mode, which models.
//   action "connect":    store their key ID + secret, AES-GCM encrypted (HIGGSFIELD_ENCRYPTION_KEY). Live mode checks
//                        the key first with Higgsfield's free cost-estimate endpoint.
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

async function credentialsFor(userId: string) {
  const { data } = await service.from('guardian_higgsfield_connections').select('credentials_ciphertext, credentials_iv').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  return hf.decryptCredentials(data, userId, ENC);
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
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  if (!ENC) return fail('Video generation is not configured yet.', 503);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return fail('Sign in first.', 401);
  const { data: guide } = await service.from('guide_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!guide) return fail('Video generation is for Guardians.', 403);
  let body: any; try { body = await req.json(); } catch { return fail('Invalid JSON'); }
  const action = String(body?.action || '');

  if (action === 'status') {
    const { data } = await service.from('guardian_higgsfield_connections').select('key_hint, connected_at, last_used_at').eq('user_id', user.id).maybeSingle();
    return json({ connected: !!data, key_hint: data?.key_hint ?? null, connected_at: data?.connected_at ?? null, live: LIVE,
      models: hf.MODELS.map((m) => ({ id: m.id, label: m.label, durations: m.durations, aspects: hf.ASPECTS.map((a) => ({ aspect: a, delivered: hf.deliveredAspect(m, a) })) })) });
  }

  if (action === 'connect') {
    const creds = hf.parseCredentials(body);
    if (!creds) return fail('Paste your Higgsfield API key ID and secret (from open.higgsfield.ai → API keys).');
    if (LIVE) { // the estimate endpoint is authenticated but free: a cheap way to check the key works
      const check = await higgsfield(creds, `estimate/${hf.MODELS[0].t2v}`, { body: { prompt: 'A calm morning routine at home.', duration: 5, aspect_ratio: '9:16' } });
      if (!check.ok && check.status === 401) return fail(check.error, 400); // other errors (e.g. low balance) don't mean a bad key
    }
    const sealed = await hf.encryptCredentials(creds, user.id, ENC);
    const { error } = await service.from('guardian_higgsfield_connections').upsert({ user_id: user.id, key_hint: hf.keyHint(creds.key), credentials_ciphertext: sealed.ciphertext, credentials_iv: sealed.iv, connected_at: new Date().toISOString() });
    if (error) return fail('Could not save the connection.', 500);
    return json({ connected: true, key_hint: hf.keyHint(creds.key), live: LIVE });
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

  if (action === 'generate') {
    const shaped = hf.shapeRequest(body);
    if (!shaped.ok) return fail(shaped.error);
    const creds = await credentialsFor(user.id).catch(() => null);
    if (!creds) return fail('Connect your Higgsfield account first.', 409);
    // Spend guard on the Guardian's own balance: a few at a time, and a daily ceiling.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await service.from('guardian_video_jobs').select('status').eq('user_id', user.id).gte('created_at', since);
    if ((recent || []).filter((j: any) => !hf.TERMINAL.includes(j.status)).length >= MAX_ACTIVE) return fail(`You already have ${MAX_ACTIVE} videos rendering. Wait for one to finish.`, 429);
    if ((recent || []).length >= MAX_PER_DAY) return fail(`That's ${MAX_PER_DAY} videos today. Try again tomorrow.`, 429);
    const id = crypto.randomUUID();
    let requestId = `mock-${id}`;
    if (LIVE) {
      const res = await higgsfield(creds, shaped.endpoint, { body: shaped.body, idempotencyKey: id });
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
