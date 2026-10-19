/*
 * Routine share links: the link that opens a Guardian's routine in the R³ app so a visitor can add it, even when the
 * routine is not public.
 *
 *   https://routine3.com/routine/<token>     what a QR or a message carries (a universal link)
 *   healthscan://routine/<token>             the same link through the app scheme (the landing page's "open" button)
 *
 * The token IS the permission: 32 lowercase hex characters (128 bits) minted in the database by
 * create_routine_share_link(), which only the routine's owner can call. The routine's id never appears in a link.
 * Migration: supabase/migrations/20261020153000_routine_share_links.sql. Mobile hand-over: docs/routine-share-links.md.
 */
import { getSupabaseClient } from './supabase/client';

export const ROUTINE_SHARE_ORIGIN = 'https://routine3.com';
/** The app scheme the mobile app registers (APP_SCHEME in its deepLinks.ts). */
export const ROUTINE_SHARE_APP_SCHEME = 'healthscan';

const TOKEN_RE = /^[0-9a-f]{32}$/;

export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

function assertToken(token: string): string {
  if (!isShareToken(token)) throw new RangeError('A routine share token is 32 lowercase hex characters.');
  return token;
}

/** `/routine/<token>`: the path on routine3.com, and what the Content builder hands to qrLink. */
export const routineSharePath = (token: string) => `/routine/${assertToken(token)}`;
/** The link to send: `https://routine3.com/routine/<token>`. */
export const routineShareUrl = (token: string) => `${ROUTINE_SHARE_ORIGIN}${routineSharePath(token)}`;
/** The same routine through the app scheme: `healthscan://routine/<token>`. */
export const routineShareAppUrl = (token: string) => `${ROUTINE_SHARE_APP_SCHEME}://routine/${assertToken(token)}`;

/**
 * The token inside any form of the link, or null. Accepts the https link (www. tolerated), the app scheme, an upper-cased
 * copy (a QR may be encoded in upper case), and a trailing slash, query or fragment a messenger adds. Rejects other
 * hosts (look-alikes included), other paths, and anything that is not 32 hex characters.
 */
export function parseRoutineShareLink(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const bare = input.trim().split(/[?#]/)[0].replace(/\/+$/, '');
  const match = bare.match(/^(?:https:\/\/(?:www\.)?routine3\.com|healthscan:\/)\/routine\/([^/]+)$/i);
  const token = match?.[1].toLowerCase();
  return token && isShareToken(token) ? token : null;
}

/**
 * Where a post's QR and link should point. A routine link replaces the Guardian page only when the Guardian chose it,
 * the routine has a live token, and the routine may be given away (see routineMayBeLinked).
 */
export function postLinkTarget(opts: { guardianSlug: string; routineToken?: string | null; useRoutine: boolean }): string {
  if (opts.useRoutine && isShareToken(opts.routineToken)) return routineSharePath(opts.routineToken);
  return `/guardians/${opts.guardianSlug}`;
}

/**
 * A paid offer's QR keeps pointing at the Guardian's page: the routine link hands the routine to anyone who scans it, which
 * would skip the checkout. A free offer, or a routine shared as itself, may use the routine link.
 */
export function routineMayBeLinked(offer: { access_model?: string | null } | null | undefined): boolean {
  return !offer || offer.access_model !== 'paid';
}

const db = () => getSupabaseClient();

/** Friendly copy for the errors these calls raise, including the migration not being applied yet. */
export function routineShareErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  const code = error?.code || '';
  const message = error?.message || '';
  const missing = /could not find the function|schema cache|does not exist/i.test(message) && /routine_share|offer_routines/.test(message);
  if (['PGRST202', '42883', '42P01', 'PGRST205'].includes(code) || missing) {
    return 'Routine links need the latest database update. Ask an admin to apply it.';
  }
  if (code === 'P0002') return 'Only the person who owns a routine can share it.';
  if (code === '28000') return 'Sign in again to share this routine.';
  return message || 'Could not create the routine link.';
}

function tokenFrom(data: unknown): string {
  if (!isShareToken(data)) throw new Error('The database did not return a routine link.');
  return data;
}

/** Create the routine's link, or return the live one. Owner only: the database refuses anyone else. */
export async function createRoutineShareLink(protocolId: string): Promise<string> {
  const { data, error } = await db().rpc('create_routine_share_link', { p_protocol_id: protocolId });
  if (error) throw Object.assign(new Error(routineShareErrorMessage(error)), { code: error.code });
  return tokenFrom(data);
}

/** The live token, or null when the routine has no link. Never creates one. */
export async function getRoutineShareLink(protocolId: string): Promise<string | null> {
  const { data, error } = await db().rpc('get_routine_share_link', { p_protocol_id: protocolId });
  if (error) throw Object.assign(new Error(routineShareErrorMessage(error)), { code: error.code });
  return data == null ? null : tokenFrom(data);
}

/** Switch the live link off. The next create mints a different token; the old one stays dead. */
export async function revokeRoutineShareLink(protocolId: string): Promise<boolean> {
  const { data, error } = await db().rpc('revoke_routine_share_link', { p_protocol_id: protocolId });
  if (error) throw Object.assign(new Error(routineShareErrorMessage(error)), { code: error.code });
  return data === true;
}

/** offer id -> routine id, for the Guardian's offers that deliver a routine. */
export async function listOfferRoutines(guideId: string): Promise<Record<string, string>> {
  const { data, error } = await db().from('guide_offer_routines').select('offer_id, protocol_id').eq('guide_id', guideId);
  if (error) throw Object.assign(new Error(routineShareErrorMessage(error)), { code: error.code });
  return Object.fromEntries(((data || []) as { offer_id: string; protocol_id: string }[]).map((row) => [row.offer_id, row.protocol_id]));
}

/** Say which routine an offer delivers, or null to clear it. */
export async function setOfferRoutine(guideId: string, offerId: string, protocolId: string | null): Promise<void> {
  const query = protocolId
    ? db().from('guide_offer_routines').upsert({ offer_id: offerId, guide_id: guideId, protocol_id: protocolId }, { onConflict: 'offer_id' })
    : db().from('guide_offer_routines').delete().eq('offer_id', offerId).eq('guide_id', guideId);
  const { error } = await query;
  if (error) throw Object.assign(new Error(routineShareErrorMessage(error)), { code: error.code });
}
