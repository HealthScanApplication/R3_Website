// Pure parts of the `higgsfield` Edge Function: the model catalog we allow, request shaping, status mapping and
// credential encryption. No Deno or Supabase imports, so the website's vitest suite can test it directly.
// API facts and sources: docs/higgsfield-integration.md.

export const HF_BASE = 'https://api.higgsfield.ai';

export type Aspect = '9:16' | '4:5' | '1:1' | '16:9';
export const ASPECTS: Aspect[] = ['9:16', '4:5', '1:1', '16:9'];

export interface HfModel {
  id: string; label: string;
  usdPerSecond?: number;               // published API price, for test mode and as a fallback (see docs/higgsfield-integration.md)
  t2v: string; i2v: string;            // endpoint ids (POST {HF_BASE}/{endpoint})
  aspects: string[];                   // aspect_ratio values the text-to-video schema accepts
  i2vAspect: boolean;                  // image-to-video takes aspect_ratio (otherwise it follows the image)
  durations: [number, number];         // seconds, inclusive
  extra?: Record<string, unknown>;     // fixed extras, e.g. sound off (cheaper, and posts get music on-platform)
}

/** Models offered to Guardians. Kept small on purpose: cheap, fast, and covering our four formats. */
export const MODELS: HfModel[] = [
  { id: 'kling-3-std', label: 'Kling 3.0 Standard', t2v: 'kling-video/v3.0/std/text-to-video', i2v: 'kling-video/v3.0/std/image-to-video', aspects: ['16:9', '9:16', '1:1'], i2vAspect: false, durations: [3, 15], extra: { sound: 'off' }, usdPerSecond: 0.084 },
  { id: 'wan-2.7', label: 'Wan 2.7', t2v: 'wan/v2.7/text-to-video', i2v: 'wan/v2.7/image-to-video', aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'], i2vAspect: false, durations: [2, 15] },
  { id: 'seedance-2', label: 'Seedance 2.0', t2v: 'bytedance/seedance-2.0/text-to-video', i2v: 'bytedance/seedance-2.0/image-to-video', aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], i2vAspect: false, durations: [4, 15], usdPerSecond: 0.141 },
];
export const DEFAULT_MODEL = 'kling-3-std';
export const PROMPT_MAX = 1500;

/**
 * The aspect ratio to ask the model for. No Higgsfield video model offers 4:5, so 4:5 is generated at 3:4
 * where the model has it (Instagram's feed shows 3:4 and 4:5 alike), otherwise at 9:16 (a Reel, which the feed
 * crops to 4:5). The client previews it in a 4:5 frame either way.
 */
export function deliveredAspect(model: HfModel, wanted: Aspect): string {
  if (model.aspects.includes(wanted)) return wanted;
  if (wanted === '4:5') return model.aspects.includes('3:4') ? '3:4' : '9:16';
  return model.aspects[0];
}

export interface GenerateInput { model?: string; prompt?: string; aspect_ratio?: string; duration?: number; image_url?: string | null }
export type Shaped = { ok: true; model: HfModel; endpoint: string; body: Record<string, unknown>; aspect: Aspect; delivered: string; duration: number } | { ok: false; error: string };

/** Validate the browser's request and turn it into the Higgsfield endpoint + JSON body. Never trusts the client. */
export function shapeRequest(input: GenerateInput): Shaped {
  const model = MODELS.find((m) => m.id === (input.model || DEFAULT_MODEL));
  if (!model) return { ok: false, error: 'Unknown video model.' };
  const prompt = String(input.prompt || '').replace(/\s+/g, ' ').trim();
  if (prompt.length < 10) return { ok: false, error: 'Describe the video in a sentence or two.' };
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `Keep the prompt under ${PROMPT_MAX} characters.` };
  const aspect = input.aspect_ratio as Aspect;
  if (!ASPECTS.includes(aspect)) return { ok: false, error: 'Choose 9:16, 4:5, 1:1 or 16:9.' };
  const [lo, hi] = model.durations;
  const duration = Math.min(hi, Math.max(lo, Math.round(Number(input.duration) || 5)));
  const image = input.image_url ? String(input.image_url) : '';
  if (image && !/^https:\/\/[^\s]+$/.test(image)) return { ok: false, error: 'The start image must be a public https link.' };
  const delivered = deliveredAspect(model, aspect);
  const body: Record<string, unknown> = { prompt, duration, ...(model.extra || {}) };
  if (image) { body.image_url = image; if (model.i2vAspect) body.aspect_ratio = delivered; } else body.aspect_ratio = delivered;
  return { ok: true, model, endpoint: image ? model.i2v : model.t2v, body, aspect, delivered, duration };
}

/**
 * Cost before generating. Higgsfield's `POST /estimate/{endpoint}` (free, same body) answers with strings such as
 * {"credits":"1.500","usd":"0.094"}; without it (test mode, or the call failing) we fall back to the published
 * per-second price, flagged as approximate. Unknown price → null, and the panel says so.
 */
export interface Estimate { usd: number | null; credits: number | null; source: 'higgsfield' | 'price_list'; per_second: number | null }
export function parseEstimate(body: any): Estimate | null {
  const usd = Number(body?.usd), credits = Number(body?.credits);
  if (!Number.isFinite(usd) || usd < 0) return null;
  return { usd, credits: Number.isFinite(credits) ? credits : null, source: 'higgsfield', per_second: null };
}
export function listEstimate(model: HfModel, duration: number): Estimate {
  const per = model.usdPerSecond ?? null;
  return { usd: per === null ? null : Math.round(per * duration * 1000) / 1000, credits: null, source: 'price_list', per_second: per };
}

export type JobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled';
export const TERMINAL: JobStatus[] = ['completed', 'failed', 'nsfw', 'canceled'];

/** Map a Higgsfield status body (or webhook payload) to our job row fields. Unknown statuses stay in progress. */
export function mapStatus(res: any): { status: JobStatus; video_url: string | null; error: string | null } {
  const raw = String(res?.status || '').toLowerCase().replace(/\s+/g, '_');
  const status: JobStatus = raw === 'cancelled' ? 'canceled' : (['queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled'] as const).includes(raw as JobStatus) ? raw as JobStatus : 'in_progress';
  const url = res?.video?.url || res?.payload?.video?.url || null;
  const video_url = typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
  const error = status === 'nsfw' ? 'Higgsfield flagged this video as unsafe, so it was not delivered (no credits used). Try a gentler prompt.'
    : status === 'failed' ? String(res?.error || 'The video could not be generated (no credits used).')
    : status === 'canceled' ? 'Cancelled.' : null;
  if (status === 'completed' && !video_url) return { status: 'failed', video_url: null, error: 'Higgsfield finished without a video.' };
  return { status, video_url, error };
}

/** A friendly message for a Higgsfield HTTP error, without echoing anything sensitive. */
export function errorMessage(httpStatus: number, body: any): string {
  const detail = typeof body?.detail === 'string' ? body.detail : '';
  if (httpStatus === 401) return 'Higgsfield did not accept this API key. Check the key ID and secret, or create a new key.';
  if (httpStatus === 403) return 'Your Higgsfield API balance is too low. Top up at open.higgsfield.ai (API balance is separate from a Higgsfield subscription).';
  if (httpStatus === 400 && /concurrent/i.test(detail)) return 'Higgsfield is already making the maximum number of videos at once for your account. Try again when one finishes.';
  if (httpStatus === 404 || httpStatus === 423 || httpStatus === 503) return 'This model is not available on your Higgsfield account right now. Try another model.';
  if (httpStatus === 422) return detail ? `Higgsfield rejected the request: ${detail.slice(0, 200)}` : 'Higgsfield rejected the request.';
  return `Higgsfield error (${httpStatus}). Try again in a minute.`;
}

/** `Authorization: Key KEY_ID:KEY_SECRET` (Bearer is not supported). */
export const authHeader = (c: { key: string; secret: string }) => `Key ${c.key}:${c.secret}`;

/** Basic shape check on pasted credentials; whitespace and a pasted "id:secret" pair are handled. */
export function parseCredentials(input: { key?: string; secret?: string }): { key: string; secret: string } | null {
  let key = String(input.key || '').trim(), secret = String(input.secret || '').trim();
  if (!secret && key.includes(':')) [key, secret] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const ok = (v: string) => /^[A-Za-z0-9_\-.]{8,200}$/.test(v);
  return ok(key) && ok(secret) ? { key, secret } : null;
}
export const keyHint = (key: string) => key.slice(-4);

/* ── credentials at rest: AES-256-GCM, the user id as associated data so a row can't be moved to another user ── */
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function aesKey(secretB64: string): Promise<CryptoKey> {
  const raw = unb64(secretB64);
  if (raw.length !== 32) throw new Error('HIGGSFIELD_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptCredentials(c: { key: string; secret: string }, userId: string, secretB64: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(c));
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(userId) }, await aesKey(secretB64), data);
  return { ciphertext: b64(new Uint8Array(out)), iv: b64(iv) };
}
export async function decryptCredentials(row: { credentials_ciphertext: string; credentials_iv: string }, userId: string, secretB64: string): Promise<{ key: string; secret: string }> {
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.credentials_iv), additionalData: new TextEncoder().encode(userId) }, await aesKey(secretB64), unb64(row.credentials_ciphertext));
  return JSON.parse(new TextDecoder().decode(out));
}

/** Mock mode (default until HIGGSFIELD_LIVE=true): a job "renders" for ~12 s and completes without a video. */
export function mockStatus(createdAtMs: number, nowMs: number): JobStatus {
  const t = nowMs - createdAtMs;
  return t < 3000 ? 'queued' : t < 12000 ? 'in_progress' : 'completed';
}

/* ── "Log in with Higgsfield": OAuth 2.1 + PKCE against Higgsfield's MCP server (the REST API has no OAuth) ── */
// Published at https://mcp.higgsfield.ai/.well-known/oauth-authorization-server (read 2026-10-19).
export const MCP_URL = 'https://mcp.higgsfield.ai/mcp';
export const OAUTH = {
  authorize: 'https://mcp.higgsfield.ai/oauth2/authorize',
  token: 'https://mcp.higgsfield.ai/oauth2/token',
  register: 'https://mcp.higgsfield.ai/oauth2/register',
  scope: 'openid email offline_access',
};

const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function pkceVerifier(): string { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/**
 * OAuth `state`: who started the login, their PKCE verifier and where to send them back, sealed with the same
 * AES-GCM key so nothing needs storing and nobody can forge or read it. Expires after 15 minutes.
 */
/** `client_id` is the OAuth client the login started with: the callback must exchange the code with that same client. */
export interface LoginState { user_id: string; verifier: string; return_to: string; exp: number; client_id?: string }
export async function sealState(s: LoginState, secretB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('higgsfield-oauth-state') }, await aesKey(secretB64), new TextEncoder().encode(JSON.stringify(s)));
  return `${b64url(iv)}.${b64url(new Uint8Array(out))}`;
}
export async function openState(token: string, secretB64: string, now = Date.now()): Promise<LoginState | null> {
  try {
    const [iv, data] = token.split('.').map((p) => unb64(p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.length % 4)) % 4)));
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('higgsfield-oauth-state') }, await aesKey(secretB64), data);
    const s = JSON.parse(new TextDecoder().decode(out)) as LoginState;
    return s.exp > now ? s : null;
  } catch { return null; }
}

/** Only send people back to our own sites (open-redirect guard). */
export function safeReturn(url: string, allowedOrigins: string[]): string | null {
  try { const u = new URL(url); return allowedOrigins.includes(u.origin) ? u.toString() : null; } catch { return null; }
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const q = new URLSearchParams({ response_type: 'code', client_id: p.clientId, redirect_uri: p.redirectUri, scope: OAUTH.scope, state: p.state, code_challenge: p.challenge, code_challenge_method: 'S256', resource: MCP_URL, prompt: 'consent' });
  return `${OAUTH.authorize}?${q}`;
}

/** Dynamic client registration body: a public client (PKCE, no secret) for our callback URL. */
export const registrationBody = (redirectUri: string) => ({ client_name: 'ROUTINE³ Guardians', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: OAUTH.scope });

export interface OAuthTokens { access_token: string; refresh_token: string | null; expires_at: number }
/** Token endpoint answer → what we store (encrypted). `expires_in` is seconds. */
export function tokensFrom(body: any, now = Date.now(), previousRefresh: string | null = null): OAuthTokens | null {
  if (typeof body?.access_token !== 'string' || !body.access_token) return null;
  const ttl = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
  return { access_token: body.access_token, refresh_token: typeof body.refresh_token === 'string' ? body.refresh_token : previousRefresh, expires_at: now + ttl * 1000 };
}
export const needsRefresh = (t: OAuthTokens, now = Date.now()) => t.expires_at - now < 60_000;

/** The signed-in email from an id_token (display only, never trusted for auth), masked: "jo…@gmail.com". */
export function emailHint(idToken: unknown): string {
  try {
    const payload = JSON.parse(atob(String(idToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const [name, domain] = String(payload.email || '').split('@');
    return name && domain ? `${name.slice(0, 2)}…@${domain}` : 'Higgsfield account';
  } catch { return 'Higgsfield account'; }
}

/** MCP streamable HTTP answers either JSON or an SSE stream; return the JSON-RPC message with our id. */
export function parseMcpResponse(text: string, contentType: string, id: number): any {
  const messages = /text\/event-stream/.test(contentType)
    ? text.split(/\n\n+/).map((ev) => ev.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')).filter(Boolean).map((d) => { try { return JSON.parse(d); } catch { return null; } })
    : [(() => { try { return JSON.parse(text); } catch { return null; } })()];
  return messages.find((m) => m && m.id === id) ?? null;
}
