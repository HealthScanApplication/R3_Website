// Guardian post backgrounds from an image model, composed for the post's text layout (the browser sends the prompt
// with postLayout.compositionBrief folded in). Two ways to pay:
//   source "house": R³'s own OpenAI key (OPENAI_API_KEY), capped per Guardian per day (GUARDIAN_IMAGES_DAILY_LIMIT).
//   source "own":   the Guardian's own OpenAI API key, AES-GCM encrypted (GUARDIAN_IMAGES_ENCRYPTION_KEY).
// Actions: status · connect · disconnect · estimate · generate. Test mode (the default until
// GUARDIAN_IMAGES_LIVE=true) never calls OpenAI and never spends credit: it returns a placeholder image.
// The image comes back as a data URL; nothing is stored but a small log row per generation (for the daily cap).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as gi from './lib.ts';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const LIVE = Deno.env.get('GUARDIAN_IMAGES_LIVE') === 'true';
const ENC = Deno.env.get('GUARDIAN_IMAGES_ENCRYPTION_KEY') || '';
const HOUSE_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const MODEL = Deno.env.get('GUARDIAN_IMAGES_MODEL') || gi.DEFAULT_MODEL;
const HOUSE_PER_DAY = Number(Deno.env.get('GUARDIAN_IMAGES_DAILY_LIMIT') || 10);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400) => json({ error }, status);

async function ownKey(userId: string): Promise<string | null> {
  const { data } = await service.from('guardian_openai_connections').select('credentials_ciphertext, credentials_iv').eq('user_id', userId).maybeSingle();
  return data ? gi.decryptKey(data, userId, ENC) : null;
}
async function houseUsedToday(userId: string): Promise<number> {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count } = await service.from('guardian_image_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('source', 'house').eq('mock', false).gte('created_at', since.toISOString());
  return count || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return fail('Sign in first.', 401);
  const { data: guide } = await service.from('guide_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!guide) return fail('Image generation is for Guardians.', 403);
  let body: any; try { body = await req.json(); } catch { return fail('Invalid JSON'); }
  const action = String(body?.action || '');

  if (action === 'status') {
    const { data } = await service.from('guardian_openai_connections').select('key_hint, connected_at').eq('user_id', user.id).maybeSingle();
    return json({ live: LIVE, house: !!HOUSE_KEY, house_left: Math.max(0, HOUSE_PER_DAY - await houseUsedToday(user.id)), house_per_day: HOUSE_PER_DAY,
      own: { connected: !!data, key_hint: data?.key_hint ?? null, connected_at: data?.connected_at ?? null, available: !!ENC }, model: MODEL, prices: gi.PRICE_USD });
  }

  if (action === 'connect') {
    if (!ENC) return fail('Connecting your own OpenAI key is not configured yet.', 503);
    const key = String(body.key || '').trim();
    if (!gi.looksLikeOpenAIKey(key)) return fail('Paste an OpenAI secret key (it starts with sk-), from platform.openai.com → API keys.');
    if (LIVE) { // listing models is free: a cheap check that the key works
      const res = await fetch(`${gi.OPENAI_BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
      if (res.status === 401) return fail('OpenAI did not accept this API key.');
    }
    const sealed = await gi.encryptKey(key, user.id, ENC);
    const { error } = await service.from('guardian_openai_connections').upsert({ user_id: user.id, key_hint: gi.keyHint(key), credentials_ciphertext: sealed.ciphertext, credentials_iv: sealed.iv, connected_at: new Date().toISOString() });
    if (error) return fail('Could not save the connection.', 500);
    return json({ connected: true, key_hint: gi.keyHint(key) });
  }

  if (action === 'disconnect') {
    const { error } = await service.from('guardian_openai_connections').delete().eq('user_id', user.id);
    if (error) return fail('Could not disconnect.', 500);
    return json({ connected: false });
  }

  if (action === 'estimate') {
    const shaped = gi.shapeImageRequest({ ...body, prompt: 'A calm morning routine at home.' }, MODEL);
    if (!shaped.ok) return fail(shaped.error);
    return json({ usd: shaped.usd, size: shaped.body.size, quality: shaped.quality, source: 'price_list', live: LIVE });
  }

  if (action === 'generate') {
    const shaped = gi.shapeImageRequest(body, MODEL);
    if (!shaped.ok) return fail(shaped.error);
    let key: string | null = null;
    if (shaped.source === 'own') {
      key = await ownKey(user.id).catch(() => null);
      if (!key) return fail('Connect your OpenAI key first.', 409);
    } else {
      if (!HOUSE_KEY) return fail('R³ images are not available right now; connect your own OpenAI key instead.', 503);
      if (LIVE && await houseUsedToday(user.id) >= HOUSE_PER_DAY) return fail(`You've used today's ${HOUSE_PER_DAY} R³ images. Connect your own OpenAI key for more.`, 429);
      key = HOUSE_KEY;
    }
    const log = { user_id: user.id, source: shaped.source, model: MODEL, aspect_ratio: shaped.aspect, quality: shaped.quality, usd: shaped.usd, prompt: shaped.body.prompt, mock: !LIVE };
    if (!LIVE) {
      await service.from('guardian_image_jobs').insert({ ...log, status: 'completed' });
      return json({ image: gi.mockImage(shaped.aspect), usd: 0, mock: true, size: shaped.body.size });
    }
    const res = await fetch(`${gi.OPENAI_BASE}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(shaped.body) });
    const out = await res.json().catch(() => ({}));
    const b64 = out?.data?.[0]?.b64_json;
    if (!res.ok || !b64) {
      const error = gi.friendlyOpenAIError(res.status, out);
      console.warn('guardian-images openai', res.status, out?.error?.code || '');
      await service.from('guardian_image_jobs').insert({ ...log, status: 'failed', error });
      return fail(error, 502);
    }
    await service.from('guardian_image_jobs').insert({ ...log, status: 'completed' });
    return json({ image: `data:image/webp;base64,${b64}`, usd: shaped.usd, mock: false, size: shaped.body.size });
  }

  return fail('Unknown action.');
});
