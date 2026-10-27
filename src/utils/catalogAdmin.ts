/**
 * Whether the signed-in person is a catalog admin, read from the claims in their access token.
 *
 * It mirrors public.is_catalog_admin() in the database, which reads the same claims: `is_admin` or `role = admin`, at the top
 * level of the token or under `app_metadata`. It is for showing or hiding controls only; the database decides what is allowed.
 * Deliberately not the email-based check in adminUtils, which can disagree with the database.
 */
const yes = (value: unknown) => ['true', '1', 'yes'].includes(String(value ?? '').toLowerCase());
const isAdminRole = (value: unknown) => String(value ?? '').toLowerCase() === 'admin';

export function tokenClaims(accessToken: string | null | undefined): Record<string, any> | null {
  try {
    const payload = String(accessToken || '').split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const claims = JSON.parse(json);
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

export function isCatalogAdminToken(accessToken: string | null | undefined): boolean {
  const claims = tokenClaims(accessToken);
  if (!claims) return false;
  const meta = claims.app_metadata && typeof claims.app_metadata === 'object' ? claims.app_metadata : {};
  return yes(claims.is_admin) || yes(meta.is_admin) || isAdminRole(claims.role) || isAdminRole(meta.role);
}
