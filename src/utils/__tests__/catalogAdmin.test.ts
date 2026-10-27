import { describe, expect, it } from 'vitest';
import { isCatalogAdminToken, tokenClaims } from '../catalogAdmin';

const b64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (claims: Record<string, unknown>) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.signature`;

describe('isCatalogAdminToken mirrors the database check (is_catalog_admin): token claims only', () => {
  it.each([
    ['is_admin at the top level (true)', { is_admin: true }],
    ['is_admin at the top level ("true")', { is_admin: 'true' }],
    ['is_admin under app_metadata (true)', { app_metadata: { is_admin: true } }],
    ['is_admin under app_metadata ("yes")', { app_metadata: { is_admin: 'yes' } }],
    ['is_admin under app_metadata ("1")', { app_metadata: { is_admin: '1' } }],
    ['role admin at the top level', { role: 'admin' }],
    ['role admin under app_metadata', { app_metadata: { role: 'Admin' } }],
  ])('%s is an admin', (_label, claims) => expect(isCatalogAdminToken(token(claims))).toBe(true));

  it.each([
    ['an ordinary signed-in user', { role: 'authenticated', sub: 'u-1' }],
    ['is_admin false', { app_metadata: { is_admin: false } }],
    ['an admin-looking email address', { role: 'authenticated', email: 'someone@healthscan.com' }],
    ['user_metadata that says admin (a user can edit it)', { user_metadata: { is_admin: true, role: 'admin' } }],
    ['the service role', { role: 'service_role' }],
  ])('%s is not', (_label, claims) => expect(isCatalogAdminToken(token(claims))).toBe(false));

  it('is false for a missing, empty or malformed token', () => {
    for (const value of [undefined, null, '', 'abc', 'a.b.c', 'a.!!!.c']) expect(isCatalogAdminToken(value as any)).toBe(false);
  });
  it('reads a base64url payload without padding', () => {
    expect(tokenClaims(token({ app_metadata: { is_admin: true }, n: 'é' }))?.app_metadata.is_admin).toBe(true);
  });
});
