// Pure helpers for the guardian-social Edge Function (no Deno or network imports, so vitest can run them).
export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'youtube';
export const PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'youtube'];
export type Env = (name: string) => string | undefined;

export const STATE_TTL_MS = 10 * 60 * 1000;
const enc = new TextEncoder();

interface ProviderSpec {
  label: string;
  authorizeUrl: string;
  scopes: string[];
  scopeSeparator: string;
  clientIdParam: string;
  extraAuthParams: Record<string, string>;
}

export const PROVIDERS: Record<Platform, ProviderSpec> = {
  instagram: { label: 'Instagram', authorizeUrl: 'https://www.instagram.com/oauth/authorize', scopes: ['instagram_business_basic', 'instagram_business_content_publish'], scopeSeparator: ',', clientIdParam: 'client_id', extraAuthParams: { force_reauth: 'true' } },
  facebook: { label: 'Facebook', authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth', scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'], scopeSeparator: ',', clientIdParam: 'client_id', extraAuthParams: {} },
  tiktok: { label: 'TikTok', authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/', scopes: ['user.info.basic', 'video.publish', 'video.upload'], scopeSeparator: ',', clientIdParam: 'client_key', extraAuthParams: {} },
  youtube: { label: 'YouTube', authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'], scopeSeparator: ' ', clientIdParam: 'client_id', extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' } },
};

export const isPlatform = (v: unknown): v is Platform => typeof v === 'string' && (PLATFORMS as string[]).includes(v);
export const envNames = (p: Platform) => ({ id: `${p.toUpperCase()}_CLIENT_ID`, secret: `${p.toUpperCase()}_CLIENT_SECRET` });

export class ConfigError extends Error {}

/** Client credentials for a platform, or a ConfigError naming exactly what is missing (never logs the values). */
export function platformCredentials(p: Platform, env: Env): { clientId: string; clientSecret: string } {
  const names = envNames(p);
  const clientId = env(names.id)?.trim();
  const clientSecret = env(names.secret)?.trim();
  if (!clientId || !clientSecret) throw new ConfigError(`${PROVIDERS[p].label} OAuth is not configured (set ${names.id} and ${names.secret}).`);
  return { clientId, clientSecret };
}

export function requireSecrets(env: Env): { stateSecret: string; encryptionKey: string } {
  const stateSecret = env('SOCIAL_STATE_SECRET')?.trim();
  const encryptionKey = env('SOCIAL_TOKEN_ENCRYPTION_KEY')?.trim();
  if (!stateSecret || !encryptionKey) throw new ConfigError('Social OAuth is not configured (set SOCIAL_STATE_SECRET and SOCIAL_TOKEN_ENCRYPTION_KEY).');
  let keyLength = 0;
  try { keyLength = unb64(encryptionKey).length; } catch { keyLength = 0; }
  if (keyLength !== 32) throw new ConfigError('SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
  return { stateSecret, encryptionKey };
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export interface OAuthState { u: string; b: string | null; p: Platform; r: string; n: string; exp: number }

/** payload.signature, both base64url. `n` is a single-use nonce persisted on the connection row. */
export async function signState(state: OAuthState, secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(state)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyState(token: string, secret: string, now = Date.now()): Promise<OAuthState> {
  const [payload, sig, extra] = String(token || '').split('.');
  if (!payload || !sig || extra !== undefined) throw new Error('Invalid state.');
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(payload)); } catch { ok = false; }
  if (!ok) throw new Error('Invalid state.');
  const state = JSON.parse(new TextDecoder().decode(unb64url(payload))) as OAuthState;
  if (!isPlatform(state.p) || !state.u || !state.n || typeof state.exp !== 'number') throw new Error('Invalid state.');
  if (state.exp < now) throw new Error('This connection link expired. Start again.');
  return state;
}

export const newNonce = () => b64url(crypto.getRandomValues(new Uint8Array(24)));

/** AES-256-GCM; key is 32 random bytes, base64 encoded (openssl rand -base64 32). */
export async function encryptToken(plain: string, keyB64: string): Promise<{ ciphertext: string; iv: string }> {
  const keyBytes = unb64(keyB64);
  if (keyBytes.length !== 32) throw new ConfigError('SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)));
  return { ciphertext: b64(ct), iv: b64(iv) };
}

export async function decryptToken(ciphertext: string, iv: string, keyB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext)));
}

/** return_to may only point at the site itself, localhost, or origins listed in SOCIAL_ALLOWED_RETURN_ORIGINS. */
export function safeReturnTo(raw: unknown, siteUrl: string, extraOrigins = ''): string {
  const fallback = `${siteUrl.replace(/\/$/, '')}/guardians/workspace`;
  try {
    const u = new URL(String(raw));
    const allowed = [siteUrl, ...extraOrigins.split(',')].map((o) => o.trim()).filter(Boolean).map((o) => { try { return new URL(o).origin; } catch { return ''; } });
    const local = u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
    if ((u.protocol === 'https:' || local) && (local || allowed.includes(u.origin))) return u.toString();
  } catch { /* fall through */ }
  return fallback;
}

/** No query string: TikTok rejects redirect URIs that carry one. A GET with no action is the callback. */
export const redirectUri = (supabaseUrl: string) => `${supabaseUrl.replace(/\/$/, '')}/functions/v1/guardian-social`;

export function buildAuthorizeUrl(p: Platform, clientId: string, state: string, redirect: string): string {
  const spec = PROVIDERS[p];
  const q = new URLSearchParams({ [spec.clientIdParam]: clientId, redirect_uri: redirect, response_type: 'code', scope: spec.scopes.join(spec.scopeSeparator), state, ...spec.extraAuthParams });
  return `${spec.authorizeUrl}?${q}`;
}

export interface ExchangeResult { token: string; expiresAt: string | null; providerAccountId: string | null; label: string; handle: string }
type Fetch = typeof fetch;

async function jsonOrThrow(res: Response, what: string) {
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(`${what} failed: ${data?.error_description || data?.error?.message || data?.error?.code || data?.message || res.status}`);
  return data;
}
async function tokenOrThrow(res: Response, what: string) {
  const data = await jsonOrThrow(res, what);
  if (!data?.access_token) throw new Error(`${what} failed: no access token returned`);
  return data;
}
const expiry = (seconds: unknown) => (Number(seconds) > 0 ? new Date(Date.now() + Number(seconds) * 1000).toISOString() : null);

/** Swap the authorization code for tokens and look up the account name. The stored token JSON holds access (+ refresh) tokens. */
export async function exchangeCode(p: Platform, code: string, creds: { clientId: string; clientSecret: string }, redirect: string, f: Fetch = fetch): Promise<ExchangeResult> {
  const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });
  if (p === 'instagram') {
    const short = await tokenOrThrow(await f('https://api.instagram.com/oauth/access_token', form({ client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: 'authorization_code', redirect_uri: redirect, code })), 'Instagram token exchange');
    const long = await tokenOrThrow(await f(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: creds.clientSecret, access_token: short.access_token })}`), 'Instagram long-lived token');
    const me = await jsonOrThrow(await f(`https://graph.instagram.com/me?${new URLSearchParams({ fields: 'user_id,username', access_token: long.access_token })}`), 'Instagram profile');
    return { token: JSON.stringify({ access_token: long.access_token }), expiresAt: expiry(long.expires_in), providerAccountId: String(me.user_id || short.user_id || ''), label: me.username ? `@${me.username}` : 'Instagram', handle: me.username || '' };
  }
  if (p === 'facebook') {
    const short = await tokenOrThrow(await f(`https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirect, code })}`), 'Facebook token exchange');
    const long = await tokenOrThrow(await f(`https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: creds.clientId, client_secret: creds.clientSecret, fb_exchange_token: short.access_token })}`), 'Facebook long-lived token');
    const me = await jsonOrThrow(await f(`https://graph.facebook.com/v21.0/me?${new URLSearchParams({ fields: 'id,name', access_token: long.access_token })}`), 'Facebook profile');
    return { token: JSON.stringify({ access_token: long.access_token }), expiresAt: expiry(long.expires_in), providerAccountId: String(me.id || ''), label: me.name || 'Facebook', handle: me.name || '' };
  }
  if (p === 'tiktok') {
    const tok = await tokenOrThrow(await f('https://open.tiktokapis.com/v2/oauth/token/', form({ client_key: creds.clientId, client_secret: creds.clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirect })), 'TikTok token exchange');
    const info = await f('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()).catch(() => ({}));
    const name = info?.data?.user?.display_name || '';
    return { token: JSON.stringify({ access_token: tok.access_token, refresh_token: tok.refresh_token }), expiresAt: expiry(tok.expires_in), providerAccountId: String(tok.open_id || ''), label: name || 'TikTok', handle: name };
  }
  const tok = await tokenOrThrow(await f('https://oauth2.googleapis.com/token', form({ client_id: creds.clientId, client_secret: creds.clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirect })), 'Google token exchange');
  const ch = await f('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  const channel = ch?.items?.[0];
  if (!channel?.id) throw new Error('No YouTube channel found on this Google account.');
  return { token: JSON.stringify({ access_token: tok.access_token, refresh_token: tok.refresh_token }), expiresAt: expiry(tok.expires_in), providerAccountId: String(channel?.id || ''), label: channel?.snippet?.title || 'YouTube', handle: channel?.snippet?.customUrl || channel?.snippet?.title || '' };
}
