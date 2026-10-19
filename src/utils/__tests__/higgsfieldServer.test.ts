// The `higgsfield` Edge Function: pure request shaping / status mapping / encryption, then the handler itself
// executed with only its Supabase and Higgsfield (fetch) boundaries replaced. No real credentials, no credits.
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as hf from '../../../supabase/functions/higgsfield/lib';

const ENC = Buffer.alloc(32, 7).toString('base64');

describe('higgsfield lib', () => {
  it('shapes a text-to-video request for the default model', () => {
    const r = hf.shapeRequest({ prompt: '  A calm   evening wind-down at home. ', aspect_ratio: '9:16', duration: 6 });
    expect(r.ok && r.endpoint).toBe('kling-video/v3.0/std/text-to-video');
    expect(r.ok && r.body).toEqual({ prompt: 'A calm evening wind-down at home.', duration: 6, aspect_ratio: '9:16', sound: 'off' });
  });
  it('generates 4:5 at 3:4 where the model has it, otherwise at 9:16', () => {
    const wan = hf.shapeRequest({ model: 'wan-2.7', prompt: 'A calm morning routine.', aspect_ratio: '4:5' });
    const kling = hf.shapeRequest({ model: 'kling-3-std', prompt: 'A calm morning routine.', aspect_ratio: '4:5' });
    expect(wan.ok && [wan.aspect, wan.body.aspect_ratio]).toEqual(['4:5', '3:4']);
    expect(kling.ok && kling.body.aspect_ratio).toBe('9:16');
  });
  it('clamps duration to the model range and uses image-to-video with a start image', () => {
    const r = hf.shapeRequest({ prompt: 'Animate this gently.', aspect_ratio: '9:16', duration: 60, image_url: 'https://routine3.com/images/content/12-evening-reset.webp' });
    expect(r.ok && r.endpoint).toBe('kling-video/v3.0/std/image-to-video');
    expect(r.ok && r.body.duration).toBe(15);
    expect(r.ok && r.body.image_url).toMatch(/^https:/);
    expect(r.ok && 'aspect_ratio' in r.body).toBe(false); // Kling i2v follows the image
  });
  it('rejects bad input before anything is sent', () => {
    expect(hf.shapeRequest({ prompt: 'short', aspect_ratio: '9:16' })).toMatchObject({ ok: false });
    expect(hf.shapeRequest({ prompt: 'A calm morning routine.', aspect_ratio: '2:1' })).toMatchObject({ ok: false });
    expect(hf.shapeRequest({ prompt: 'A calm morning routine.', aspect_ratio: '1:1', model: 'sora' })).toMatchObject({ ok: false });
    expect(hf.shapeRequest({ prompt: 'A calm morning routine.', aspect_ratio: '1:1', image_url: 'http://x.test/a.png' })).toMatchObject({ ok: false });
    expect(hf.shapeRequest({ prompt: 'x'.repeat(hf.PROMPT_MAX + 1), aspect_ratio: '1:1' })).toMatchObject({ ok: false });
  });
  it('maps Higgsfield statuses and results', () => {
    expect(hf.mapStatus({ status: 'queued' })).toEqual({ status: 'queued', video_url: null, error: null });
    expect(hf.mapStatus({ status: 'completed', video: { url: 'https://cdn.test/v.mp4' } })).toEqual({ status: 'completed', video_url: 'https://cdn.test/v.mp4', error: null });
    expect(hf.mapStatus({ status: 'completed', payload: { video: { url: 'https://cdn.test/w.mp4' } } }).video_url).toBe('https://cdn.test/w.mp4');
    expect(hf.mapStatus({ status: 'completed' }).status).toBe('failed');
    expect(hf.mapStatus({ status: 'nsfw' }).error).toMatch(/unsafe/);
    expect(hf.mapStatus({ status: 'failed', error: 'boom' }).error).toBe('boom');
    expect(hf.mapStatus({ status: 'Cancelled' }).status).toBe('canceled');
    expect(hf.mapStatus({ status: 'something-new' }).status).toBe('in_progress');
  });
  it('reads Higgsfield estimates and falls back to the published per-second price', () => {
    expect(hf.parseEstimate({ credits: '1.500', usd: '0.094' })).toEqual({ usd: 0.094, credits: 1.5, source: 'higgsfield', per_second: null });
    expect(hf.parseEstimate({ detail: 'nope' })).toBeNull();
    expect(hf.listEstimate(hf.MODELS.find((m) => m.id === 'kling-3-std')!, 5)).toEqual({ usd: 0.42, credits: null, source: 'price_list', per_second: 0.084 });
    expect(hf.listEstimate(hf.MODELS.find((m) => m.id === 'wan-2.7')!, 5).usd).toBeNull();
  });
  it('explains HTTP errors without echoing credentials', () => {
    expect(hf.errorMessage(401, {})).toMatch(/did not accept/);
    expect(hf.errorMessage(403, {})).toMatch(/balance/);
    expect(hf.errorMessage(400, { detail: 'Maximum number of concurrent requests (4) has been reached' })).toMatch(/at once/);
  });
  it('parses pasted credentials, including a single "id:secret" string', () => {
    expect(hf.parseCredentials({ key: ' key_abcdef12 ', secret: 'sec_ret_123456' })).toEqual({ key: 'key_abcdef12', secret: 'sec_ret_123456' });
    expect(hf.parseCredentials({ key: 'key_abcdef12:sec_ret_123456' })).toEqual({ key: 'key_abcdef12', secret: 'sec_ret_123456' });
    expect(hf.parseCredentials({ key: 'short', secret: 'x' })).toBeNull();
    expect(hf.authHeader({ key: 'id', secret: 's' })).toBe('Key id:s');
  });
  it('encrypts credentials so only the same user can decrypt them', async () => {
    const sealed = await hf.encryptCredentials({ key: 'key_abcdef12', secret: 'sec_ret_123456' }, 'user-a', ENC);
    expect(sealed.ciphertext).not.toContain('sec_ret');
    const row = { credentials_ciphertext: sealed.ciphertext, credentials_iv: sealed.iv };
    await expect(hf.decryptCredentials(row, 'user-a', ENC)).resolves.toEqual({ key: 'key_abcdef12', secret: 'sec_ret_123456' });
    await expect(hf.decryptCredentials(row, 'user-b', ENC)).rejects.toBeTruthy();
  });
});

type Row = Record<string, any>;
function server(opts: { live?: boolean; hf?: (url: string, init: any) => { status: number; body: any } } = {}) {
  const tables: Record<string, Row[]> = { guide_profiles: [{ user_id: 'guardian' }], guardian_higgsfield_connections: [], guardian_video_jobs: [] };
  const uploads: string[] = [];
  const db = {
    auth: { async getUser(token: string) { return { data: { user: token === 'good' ? { id: 'guardian' } : token === 'visitor' ? { id: 'visitor' } : null } }; } },
    storage: { from: () => ({
      async upload(path: string) { uploads.push(path); return { error: null }; },
      async createSignedUrl(path: string) { return { data: { signedUrl: `https://storage.test/${path}?sig=1` } }; },
    }) },
    from(table: string) {
      let action = 'select', payload: Row = {}, fields: string[] | null = null; const filters: ((r: Row) => boolean)[] = [];
      const pick = (r: Row | null) => (r && fields ? Object.fromEntries(fields.map((f) => [f, r[f] ?? null])) : r);
      const q: any = {
        select(f?: string) { if (f) fields = f.split(',').map((x) => x.trim()); return q; }, order() { return q; }, limit() { return q; },
        eq(k: string, v: any) { filters.push((r) => r[k] === v); return q; },
        gte(k: string, v: any) { filters.push((r) => r[k] >= v); return q; },
        not(k: string, _op: string, list: string) { const vals = list.replace(/[()]/g, '').split(','); filters.push((r) => !vals.includes(r[k])); return q; },
        insert(v: Row) { action = 'insert'; payload = v; return q; }, upsert(v: Row) { action = 'upsert'; payload = v; return q; },
        update(v: Row) { action = 'update'; payload = v; return q; }, delete() { action = 'delete'; return q; },
        single() { return run(true); }, maybeSingle() { return run(true); }, then(ok: any, no: any) { return run(false).then(ok, no); },
      };
      async function run(single: boolean) {
        const rows = tables[table];
        if (action === 'insert') { const row = { created_at: new Date().toISOString(), error: null, video_url: null, storage_path: null, ...payload }; rows.push(row); return { data: pick(row), error: null }; }
        if (action === 'upsert') { const i = rows.findIndex((r) => r.user_id === payload.user_id); if (i >= 0) rows[i] = payload; else rows.push(payload); return { data: payload, error: null }; }
        const found = rows.filter((r) => filters.every((f) => f(r)));
        if (action === 'delete') { tables[table] = rows.filter((r) => !found.includes(r)); return { data: null, error: null }; }
        if (action === 'update') found.forEach((r) => Object.assign(r, payload));
        return { data: single ? pick(found[0] ?? null) : found.map(pick), error: null };
      }
      return q;
    },
  };
  const calls: { url: string; init: any }[] = [];
  const fetchMock = vi.fn(async (url: string, init: any = {}) => {
    calls.push({ url, init });
    if (url.startsWith('https://cdn.test/')) return new Response(new Uint8Array([0, 0, 0, 24]), { status: 200 });
    const r = opts.hf?.(url, init) ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  let handler!: (r: Request) => Promise<Response>;
  const source = readFileSync(new URL('../../../supabase/functions/higgsfield/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const code = transformSync(source, { loader: 'ts', target: 'es2022' }).code;
  const env: Row = { HIGGSFIELD_ENCRYPTION_KEY: ENC, ...(opts.live ? { HIGGSFIELD_LIVE: 'true' } : {}) };
  new Function('createClient', 'hf', 'Deno', code)(() => db, hf, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });
  return {
    tables, uploads, calls,
    async call(body: Row, token = 'good') {
      const res = await handler(new Request('https://staging.invalid', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
      return { status: res.status, body: await res.json() };
    },
  };
}

const KEY = { key: 'key_abcdef12', secret: 'sec_ret_123456' };

describe('higgsfield Edge Function', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('only serves signed-in Guardians', async () => {
    const s = server();
    expect((await s.call({ action: 'status' }, 'nobody')).status).toBe(401);
    expect((await s.call({ action: 'status' }, 'visitor')).status).toBe(403);
  });

  it('connects, stores only ciphertext, reports a key hint and disconnects', async () => {
    const s = server();
    expect((await s.call({ action: 'connect', ...KEY })).body).toMatchObject({ connected: true, key_hint: 'ef12', live: false });
    const stored = JSON.stringify(s.tables.guardian_higgsfield_connections);
    expect(stored).not.toContain(KEY.secret);
    expect(stored).not.toContain(KEY.key);
    const status = (await s.call({ action: 'status' })).body;
    expect(status).toMatchObject({ connected: true, key_hint: 'ef12' });
    expect(JSON.stringify(status)).not.toContain(KEY.secret);
    expect((await s.call({ action: 'disconnect' })).body).toEqual({ connected: false });
    expect(s.tables.guardian_higgsfield_connections).toHaveLength(0);
  });

  it('mock mode never calls Higgsfield and finishes without spending credits', async () => {
    const s = server();
    await s.call({ action: 'connect', ...KEY });
    const { body } = await s.call({ action: 'generate', prompt: 'A calm evening wind-down at home.', aspect_ratio: '4:5' });
    expect(body.job).toMatchObject({ status: 'queued', mock: true, aspect_ratio: '4:5', delivered_aspect: '9:16' });
    expect(s.calls).toHaveLength(0);
    s.tables.guardian_video_jobs[0].created_at = new Date(Date.now() - 20000).toISOString();
    expect((await s.call({ action: 'poll', job_id: body.job.id })).body.job.status).toBe('completed');
    expect(s.calls).toHaveLength(0);
  });

  it('refuses to generate before connecting', async () => {
    const s = server();
    expect((await s.call({ action: 'generate', prompt: 'A calm evening wind-down at home.', aspect_ratio: '9:16' })).status).toBe(409);
  });

  it('live mode checks the key on connect and rejects a bad one', async () => {
    const s = server({ live: true, hf: () => ({ status: 401, body: { detail: 'Invalid credentials' } }) });
    const res = await s.call({ action: 'connect', ...KEY });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/did not accept/);
    expect(s.calls[0].url).toMatch(/\/estimate\/kling-video\/v3\.0\/std\/text-to-video$/);
    expect(s.tables.guardian_higgsfield_connections).toHaveLength(0);
  });

  it('live mode submits with the Key header, polls, and keeps the finished video', async () => {
    let state = 'in_progress';
    const s = server({ live: true, hf: (url) => url.includes('/requests/') ? { status: 200, body: state === 'done' ? { status: 'completed', request_id: 'req-1', video: { url: 'https://cdn.test/v.mp4' } } : { status: 'in_progress', request_id: 'req-1' } } : url.includes('/estimate/') ? { status: 200, body: { credits: '1.0' } } : { status: 200, body: { status: 'queued', request_id: 'req-1' } } });
    await s.call({ action: 'connect', ...KEY });
    const { body } = await s.call({ action: 'generate', prompt: 'A calm evening wind-down at home.', aspect_ratio: '9:16', duration: 5 });
    const submit = s.calls.find((c) => c.url === 'https://api.higgsfield.ai/kling-video/v3.0/std/text-to-video')!;
    expect(submit.init.headers.Authorization).toBe(`Key ${KEY.key}:${KEY.secret}`);
    expect(submit.init.headers['Idempotency-Key']).toBe(body.job.id);
    expect(JSON.parse(submit.init.body)).toEqual({ prompt: 'A calm evening wind-down at home.', duration: 5, aspect_ratio: '9:16', sound: 'off' });
    expect(JSON.stringify(body)).not.toContain(KEY.secret);
    expect(JSON.stringify(body)).not.toContain('req-1'); // the Higgsfield request id stays server-side

    expect((await s.call({ action: 'poll', job_id: body.job.id })).body.job.status).toBe('in_progress');
    state = 'done';
    const done = (await s.call({ action: 'poll', job_id: body.job.id })).body.job;
    expect(done.status).toBe('completed');
    expect(s.uploads).toEqual([`guardian/${body.job.id}.mp4`]);
    expect(done.video_url).toMatch(/^https:\/\/storage\.test\/guardian\//);
    // A finished job is not polled again.
    const before = s.calls.length;
    await s.call({ action: 'poll', job_id: body.job.id });
    expect(s.calls.length).toBe(before);
  });

  it('quotes a price before generating: list price in test mode, Higgsfield’s free estimate when live', async () => {
    const mock = server();
    await mock.call({ action: 'connect', ...KEY });
    expect((await mock.call({ action: 'estimate', model: 'kling-3-std', aspect_ratio: '9:16', duration: 8 })).body.estimate).toEqual({ usd: 0.672, credits: null, source: 'price_list', per_second: 0.084 });
    expect(mock.calls).toHaveLength(0);

    const live = server({ live: true, hf: (url) => url.includes('/estimate/') ? { status: 200, body: { credits: '6.720', usd: '0.672' } } : { status: 200, body: {} } });
    await live.call({ action: 'connect', ...KEY });
    const res = (await live.call({ action: 'estimate', model: 'kling-3-std', aspect_ratio: '1:1', duration: 8, prompt: 'my private idea' })).body;
    expect(res.estimate).toEqual({ usd: 0.672, credits: 6.72, source: 'higgsfield', per_second: null });
    const call = live.calls.at(-1)!;
    expect(call.url).toBe('https://api.higgsfield.ai/estimate/kling-video/v3.0/std/text-to-video');
    expect(JSON.parse(call.init.body)).toEqual({ prompt: 'A calm morning routine at home.', duration: 8, aspect_ratio: '1:1', sound: 'off' });
    expect(live.tables.guardian_video_jobs).toHaveLength(0); // an estimate never starts a job

    const down = server({ live: true, hf: (url) => url.includes('/estimate/') ? { status: 503, body: {} } : { status: 200, body: {} } });
    await down.call({ action: 'connect', ...KEY });
    expect((await down.call({ action: 'estimate', model: 'kling-3-std', aspect_ratio: '9:16', duration: 5 })).body.estimate.source).toBe('price_list');
  });

  it('caps videos rendering at once', async () => {
    const s = server();
    await s.call({ action: 'connect', ...KEY });
    for (let i = 0; i < 3; i++) expect((await s.call({ action: 'generate', prompt: 'A calm evening wind-down at home.', aspect_ratio: '1:1' })).status).toBe(200);
    expect((await s.call({ action: 'generate', prompt: 'A calm evening wind-down at home.', aspect_ratio: '1:1' })).status).toBe(429);
  });

  it("can't read another Guardian's job", async () => {
    const s = server();
    s.tables.guardian_video_jobs.push({ id: 'other-job', user_id: 'someone-else', status: 'queued', created_at: new Date().toISOString() });
    expect((await s.call({ action: 'poll', job_id: 'other-job' })).status).toBe(404);
  });
});
