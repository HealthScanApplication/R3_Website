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
 *
 * The link is also how the Guardian is credited. The token already names the Guardian, so credit does not depend on anything
 * in the URL; optional utm_source / utm_medium / utm_campaign / utm_content ride along to say where an open came from.
 * They are normalised the way the database accepts them (lower case, a-z 0-9 . _ ~ -, 1 to 64 characters) and anything
 * that could be personal data (an @) is dropped, so an email address can never end up in a link.
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

/** Where an open came from. All optional; the database fills utm_source (guardian-<slug>) and utm_medium (link) when absent. */
export interface RoutineShareTracking { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null }
/** What the landing page adds when it hands the link to the app: the Guardian's referral code and the id of the recorded open. */
export interface RoutineShareHandoff extends RoutineShareTracking { ref?: string | null; click?: string | null }

/**
 * One tracking value as the database will accept it: lower case, a-z 0-9 . _ ~ -, starting with a letter or digit, at most 64
 * characters. Other characters become "-". A value that contains an @ is dropped whole (it may be an email address), as is
 * an empty one.
 */
export function utmValue(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.includes('@')) return null;
  const cleaned = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[^a-z0-9]+|[-]+$/g, '').slice(0, 64).replace(/[-]+$/, '');
  return /^[a-z0-9][a-z0-9._~-]{0,63}$/.test(cleaned) ? cleaned : null;
}

/**
 * A value read back from a link, as strict as the database: lower-cased and trimmed, then it must already be 1 to 64 of
 * a-z 0-9 . _ ~ -. Nothing is repaired; a value that fails is dropped. (utmValue above is for building a link from
 * what a person typed.)
 */
export function utmStrict(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[a-z0-9][a-z0-9._~-]{0,63}$/.test(value) ? value : null;
}

/** The utm_source for a Guardian's own links. */
export const guardianUtmSource = (slug: string) => utmValue(`guardian-${slug}`);

/** A referral code as the app issues it: 4 to 16 letters and digits. */
export function referralCode(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9]{4,16}$/.test(raw) ? raw : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function query(params: Array<[string, string | null | undefined]>): string {
  const parts = params.filter((pair): pair is [string, string] => !!pair[1]).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

const utmQuery = (tracking?: RoutineShareTracking): Array<[string, string | null]> => [
  ['utm_source', utmValue(tracking?.source)], ['utm_medium', utmValue(tracking?.medium)],
  ['utm_campaign', utmValue(tracking?.campaign)], ['utm_content', utmValue(tracking?.content)],
];

/** `/routine/<token>[?utm_...]`: the path on routine3.com, and what the Content builder hands to qrLink. */
export const routineSharePath = (token: string, tracking?: RoutineShareTracking) => `/routine/${assertToken(token)}${query(utmQuery(tracking))}`;
/** The link to send: `https://routine3.com/routine/<token>[?utm_...]`. */
export const routineShareUrl = (token: string, tracking?: RoutineShareTracking) => `${ROUTINE_SHARE_ORIGIN}${routineSharePath(token, tracking)}`;
/**
 * The same routine through the app scheme: `healthscan://routine/<token>[?ref=..&click=..&utm_...]`. `ref` is the Guardian's
 * referral code and `click` the id of the open the database recorded; either is left out unless it is well formed.
 */
export const routineShareAppUrl = (token: string, handoff?: RoutineShareHandoff) =>
  `${ROUTINE_SHARE_APP_SCHEME}://routine/${assertToken(token)}${query([
    ['ref', referralCode(handoff?.ref)], ['click', handoff?.click && UUID_RE.test(handoff.click) ? handoff.click.toLowerCase() : null], ...utmQuery(handoff),
  ])}`;

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

/** The token and the tracking carried by a link in any of its forms, or null when it is not a routine share link. */
export function parseRoutineShareParams(input: string | null | undefined): ({ token: string; ref: string | null; click: string | null } & Record<'source' | 'medium' | 'campaign' | 'content', string | null>) | null {
  const token = parseRoutineShareLink(input);
  if (!token || !input) return null;
  const search = input.trim().split('#')[0].split('?')[1] || '';
  const params = new URLSearchParams(search);
  const click = params.get('click');
  return {
    token, ref: referralCode(params.get('ref')), click: click && UUID_RE.test(click) ? click.toLowerCase() : null,
    source: utmStrict(params.get('utm_source')), medium: utmStrict(params.get('utm_medium')),
    campaign: utmStrict(params.get('utm_campaign')), content: utmStrict(params.get('utm_content')),
  };
}

/**
 * Where a post's QR and link should point. A routine link replaces the Guardian page only when the Guardian chose it,
 * the routine has a live token, and the routine may be given away (see routineMayBeLinked).
 */
export function postLinkTarget(opts: { guardianSlug: string; routineToken?: string | null; useRoutine: boolean; campaign?: string | null }): string {
  if (opts.useRoutine && isShareToken(opts.routineToken)) return routineSharePath(opts.routineToken, { source: guardianUtmSource(opts.guardianSlug), medium: 'post', campaign: opts.campaign });
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

/** What the Guardian sees under a link: counts, never people. Opens count landing-page and app opens of the link. */
export interface RoutineShareStats {
  opens: number; opens_7d: number; last_open_at: string | null;
  adds: number; adds_7d: number; credited: number;
  by_medium: Array<{ medium: string; opens: number; adds: number }>;
}

export async function getRoutineShareStats(protocolId: string): Promise<RoutineShareStats> {
  const { data, error } = await db().rpc('routine_share_stats', { p_protocol_id: protocolId });
  if (error) throw Object.assign(new Error(routineShareErrorMessage(error)), { code: error.code });
  return data as RoutineShareStats;
}
