import { describe, expect, it } from 'vitest';
import { ConfigError, buildAuthorizeUrl, decryptToken, encryptToken, exchangeCode, platformCredentials, redirectUri, requireSecrets, safeReturnTo, signState, verifyState } from '../../../supabase/functions/guardian-social/lib';

const base = { u: 'user-1', b: null, p: 'tiktok' as const, r: 'https://routine3.com/guardians/workspace', n: 'nonce-1' };

describe('guardian-social state', () => {
  it('round-trips a signed state', async () => {
    const token = await signState({ ...base, exp: Date.now() + 60_000 }, 'secret');
    expect(await verifyState(token, 'secret')).toMatchObject({ u: 'user-1', p: 'tiktok', n: 'nonce-1' });
  });
  it('rejects tampering, a wrong secret and expiry', async () => {
    const token = await signState({ ...base, exp: Date.now() + 60_000 }, 'secret');
    const [payload, sig] = token.split('.');
    const forged = btoa(JSON.stringify({ ...base, u: 'attacker', exp: Date.now() + 60_000 })).replace(/=+$/, '');
    await expect(verifyState(`${forged}.${sig}`, 'secret')).rejects.toThrow('Invalid state');
    await expect(verifyState(token, 'other')).rejects.toThrow('Invalid state');
    await expect(verifyState(`${payload}.`, 'secret')).rejects.toThrow('Invalid state');
    const old = await signState({ ...base, exp: Date.now() - 1 }, 'secret');
    await expect(verifyState(old, 'secret')).rejects.toThrow('expired');
  });
});

describe('guardian-social config', () => {
  it('names the missing env vars instead of failing opaquely', () => {
    expect(() => platformCredentials('instagram', () => undefined)).toThrow('Instagram OAuth is not configured (set FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET).');
    expect(() => platformCredentials('youtube', (n) => (n === 'YOUTUBE_CLIENT_ID' ? 'id' : undefined))).toThrow(ConfigError);
    expect(platformCredentials('tiktok', (n) => `v-${n}`)).toEqual({ clientId: 'v-TIKTOK_CLIENT_ID', clientSecret: 'v-TIKTOK_CLIENT_SECRET' });
    expect(() => requireSecrets(() => undefined)).toThrow('SOCIAL_STATE_SECRET');
    expect(() => requireSecrets((n) => (n === 'SOCIAL_STATE_SECRET' ? 's' : btoa('short')))).toThrow('32 bytes');
    expect(() => requireSecrets((n) => (n === 'SOCIAL_STATE_SECRET' ? 's' : '!!not-base64!!'))).toThrow(ConfigError);
  });
  it('builds each official authorize URL with the callback and state', () => {
    const redirect = redirectUri('https://x.supabase.co/');
    expect(redirect).toBe('https://x.supabase.co/functions/v1/guardian-social');
    const tt = new URL(buildAuthorizeUrl('tiktok', 'ck', 'st', redirect));
    expect(tt.origin + tt.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(tt.searchParams.get('client_key')).toBe('ck');
    expect(tt.searchParams.get('state')).toBe('st');
    expect(tt.searchParams.get('redirect_uri')).toBe(redirect);
    const yt = new URL(buildAuthorizeUrl('youtube', 'cid', 'st', redirect));
    expect(yt.searchParams.get('access_type')).toBe('offline');
    const ig = new URL(buildAuthorizeUrl('instagram', 'cid', 'st', redirect));
    expect(ig.host).toBe('www.facebook.com');
    expect(ig.searchParams.get('scope')).toContain('instagram_content_publish');
    expect(new URL(buildAuthorizeUrl('facebook', 'cid', 'st', redirect)).host).toBe('www.facebook.com');
  });
  it('only returns to the site, localhost or allowed origins', () => {
    const site = 'https://routine3.com';
    expect(safeReturnTo('https://routine3.com/guardians/workspace?tab=social', site)).toContain('tab=social');
    expect(safeReturnTo('http://localhost:5173/x', site)).toBe('http://localhost:5173/x');
    expect(safeReturnTo('https://evil.example/x', site)).toBe('https://routine3.com/guardians/workspace');
    expect(safeReturnTo('https://stg.example.app/x', site, 'https://stg.example.app')).toBe('https://stg.example.app/x');
    expect(safeReturnTo('javascript:alert(1)', site)).toBe('https://routine3.com/guardians/workspace');
  });
});

describe('guardian-social tokens', () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  it('encrypts and decrypts, with a fresh IV each time', async () => {
    const a = await encryptToken('{"access_token":"abc"}', key);
    const b = await encryptToken('{"access_token":"abc"}', key);
    expect(a.ciphertext).not.toContain('abc');
    expect(a.iv).not.toBe(b.iv);
    expect(await decryptToken(a.ciphertext, a.iv, key)).toBe('{"access_token":"abc"}');
  });
  it('refuses a wrong-sized key', async () => {
    await expect(encryptToken('x', btoa('short'))).rejects.toThrow(ConfigError);
  });
  it('exchanges a TikTok code through the token and user-info endpoints', async () => {
    const calls: string[] = [];
    const bodies: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (init?.body) bodies.push(String(init.body));
      const body = String(url).includes('oauth/token') ? { access_token: 'at', refresh_token: 'rt', expires_in: 86400, open_id: 'oid' } : { data: { user: { display_name: 'Barbara' } } };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await exchangeCode('tiktok', 'code', { clientId: 'a', clientSecret: 'b' }, 'https://r', f);
    expect(JSON.parse(r.token)).toEqual({ access_token: 'at', refresh_token: 'rt' });
    expect(r).toMatchObject({ providerAccountId: 'oid', label: 'Barbara' });
    expect(calls).toHaveLength(2);
    const sent = new URLSearchParams(bodies[0]);
    expect(Object.fromEntries(sent)).toMatchObject({ client_key: 'a', client_secret: 'b', code: 'code', grant_type: 'authorization_code', redirect_uri: 'https://r' });
  });
  it('rejects a success response without an access token and a YouTube account without a channel', async () => {
    const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeCode('tiktok', 'c', { clientId: 'a', clientSecret: 'b' }, 'https://r', ok({}))).rejects.toThrow('no access token');
    let n = 0;
    const yt = (async () => new Response(JSON.stringify(n++ === 0 ? { access_token: 'at' } : { items: [] }), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeCode('youtube', 'c', { clientId: 'a', clientSecret: 'b' }, 'https://r', yt)).rejects.toThrow('No YouTube channel');
  });
  it('connects Instagram through Facebook Login and finds the Page-linked Instagram account', async () => {
    const f = (async (url: string) => {
      const u = String(url);
      const body = u.includes('/me/accounts') ? { data: [{ id: 'p0', name: 'No IG' }, { id: 'p1', access_token: 'pt', instagram_business_account: { id: 'ig1', username: 'barbara' } }] }
        : u.includes('fb_exchange_token') ? { access_token: 'long', expires_in: 5184000 } : { access_token: 'short' };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await exchangeCode('instagram', 'c', { clientId: 'a', clientSecret: 'b' }, 'https://r', f);
    expect(JSON.parse(r.token)).toMatchObject({ page_id: 'p1', page_access_token: 'pt', ig_user_id: 'ig1' });
    expect(r).toMatchObject({ providerAccountId: 'ig1', label: '@barbara' });
    const none = (async (url: string) => new Response(JSON.stringify(String(url).includes('/me/accounts') ? { data: [{ id: 'p0' }] } : { access_token: 't' }), { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeCode('instagram', 'c', { clientId: 'a', clientSecret: 'b' }, 'https://r', none)).rejects.toThrow('No Instagram Business');
  });
  it('surfaces provider errors', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad code' }), { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode('youtube', 'c', { clientId: 'a', clientSecret: 'b' }, 'https://r', f)).rejects.toThrow('bad code');
  });
});
