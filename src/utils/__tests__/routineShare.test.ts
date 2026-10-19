import { beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';

const client = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../supabase/client', () => ({ getSupabaseClient: () => client }));

import {
  createRoutineShareLink, getRoutineShareLink, getRoutineShareStats, guardianUtmSource, isShareToken, listOfferRoutines, parseRoutineShareLink, parseRoutineShareParams,
  postLinkTarget, referralCode, revokeRoutineShareLink, routineMayBeLinked, routineShareAppUrl, routineSharePath, routineShareUrl, routineShareErrorMessage, setOfferRoutine, utmValue,
} from '../routineShare';
import { qrLink, qrPlan } from '../../components/guides/ContentStudio';

const TOKEN = '0123456789abcdef0123456789abcdef';

beforeEach(() => { client.rpc.mockReset(); client.from.mockReset(); });

describe('routine share link builder', () => {
  it('builds the https link, the path and the app-scheme link from a token', () => {
    expect(routineSharePath(TOKEN)).toBe(`/routine/${TOKEN}`);
    expect(routineShareUrl(TOKEN)).toBe(`https://routine3.com/routine/${TOKEN}`);
    expect(routineShareAppUrl(TOKEN)).toBe(`healthscan://routine/${TOKEN}`);
  });

  it('refuses anything that is not a 32-hex token rather than building a link that cannot work', () => {
    for (const bad of ['', 'short', TOKEN.toUpperCase(), `${TOKEN}0`, TOKEN.slice(1), 'g'.repeat(32), '0123456789abcdef0123456789abcde/', '../'.repeat(11)]) {
      expect(isShareToken(bad)).toBe(false);
      expect(() => routineShareUrl(bad)).toThrow(RangeError);
      expect(() => routineShareAppUrl(bad)).toThrow(RangeError);
    }
    expect(isShareToken(TOKEN)).toBe(true);
    expect(isShareToken(null)).toBe(false);
    expect(isShareToken(12)).toBe(false);
  });

  it('reads a token back out of every form of the link', () => {
    expect(parseRoutineShareLink(routineShareUrl(TOKEN))).toBe(TOKEN);
    expect(parseRoutineShareLink(routineShareAppUrl(TOKEN))).toBe(TOKEN);
    expect(parseRoutineShareLink(`https://www.routine3.com/routine/${TOKEN}`)).toBe(TOKEN);
    expect(parseRoutineShareLink(`HTTPS://ROUTINE3.COM/ROUTINE/${TOKEN.toUpperCase()}`)).toBe(TOKEN);
    for (const suffix of ['/', '?utm_source=whatsapp', '#x', '/?a=b']) expect(parseRoutineShareLink(routineShareUrl(TOKEN) + suffix)).toBe(TOKEN);
  });

  it('refuses look-alike hosts, other schemes, other paths and malformed tokens', () => {
    for (const bad of [
      `https://routine3.com.evil.example/routine/${TOKEN}`, `https://evilroutine3.com/routine/${TOKEN}`, `https://routine3.com@evil.example/routine/${TOKEN}`,
      `http://routine3.com/routine/${TOKEN}`, `evil://routine/${TOKEN}`, `https://routine3.com/join/${TOKEN}`, `https://routine3.com/protocol/${TOKEN}`,
      `https://routine3.com/routine/${TOKEN}/extra`, 'https://routine3.com/routine/short', 'https://routine3.com/routine/', '', null, undefined,
    ]) expect(parseRoutineShareLink(bad as string)).toBeNull();
  });

  it('points a post at the routine only when the Guardian chose it and the link exists', () => {
    const base = { guardianSlug: 'john-ferreira' };
    expect(postLinkTarget({ ...base, routineToken: TOKEN, useRoutine: true })).toBe(`/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=post`);
    expect(postLinkTarget({ ...base, routineToken: TOKEN, useRoutine: true, campaign: 'Spring Sleep' })).toBe(`/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=post&utm_campaign=spring-sleep`);
    expect(postLinkTarget({ ...base, routineToken: TOKEN, useRoutine: false })).toBe('/guardians/john-ferreira');
    expect(postLinkTarget({ ...base, routineToken: null, useRoutine: true })).toBe('/guardians/john-ferreira');
    expect(postLinkTarget({ ...base, routineToken: 'not-a-token', useRoutine: true })).toBe('/guardians/john-ferreira');
  });

  it('keeps a paid offer on the Guardian page so the routine is not given away', () => {
    expect(routineMayBeLinked({ access_model: 'free' })).toBe(true);
    expect(routineMayBeLinked({ access_model: 'paid' })).toBe(false);
    expect(routineMayBeLinked(undefined)).toBe(true); // a routine shared as itself
  });
});

describe('qrLink with a routine share link', () => {
  it('encodes the canonical lower-case https link with utm_medium=qr, not the upper-case /G/ form', () => {
    expect(qrLink(`/routine/${TOKEN}`)).toBe(`https://routine3.com/routine/${TOKEN}?utm_medium=qr`);
    expect(qrLink(`https://routine3.com/routine/${TOKEN}`)).toBe(`https://routine3.com/routine/${TOKEN}?utm_medium=qr`);
    expect(qrLink(`https://routine3.com/routine/${TOKEN.toUpperCase()}?utm=qr`)).toBe(`https://routine3.com/routine/${TOKEN}?utm_medium=qr`);
  });

  it('turns a post link into a QR link: medium becomes qr, the campaign stays, the source is left to the database', () => {
    expect(qrLink(`/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=post&utm_campaign=Spring-Sleep`)).toBe(`https://routine3.com/routine/${TOKEN}?utm_medium=qr&utm_campaign=spring-sleep`);
  });

  it('still shortens a Guardian page and leaves other links alone', () => {
    expect(qrLink('/guardians/john-ferreira')).toBe('HTTPS://ROUTINE3.COM/G/JOHN-FERREIRA');
    expect(qrLink('/routine/not-a-token')).toBe('https://routine3.com/routine/not-a-token');
    expect(qrLink('https://example.com/Page')).toBe('https://example.com/Page');
  });

  it('keeps the R³ mark on the code: version 6 on Q, and the large mark falls back to the medium one on Q', () => {
    const link = qrLink(`/routine/${TOKEN}`);
    expect(QRCode.create(link, { errorCorrectionLevel: 'Q' }).version).toBeLessThan(7);
    // At H this link is version 8, where the mark cannot be drawn; the plan switches to the medium mark on Q instead.
    expect(QRCode.create(link, { errorCorrectionLevel: 'H' }).version).toBeGreaterThanOrEqual(7);
    expect(qrPlan(link, 'large')).toMatchObject({ logo: 'medium', mark: true });
    expect(qrPlan(link, 'small')).toMatchObject({ logo: 'small', mark: true });
    expect(qrPlan(link, 'medium')).toMatchObject({ logo: 'medium', mark: true });
  });

  it('leaves a link that already fits the large mark as it was', () => {
    expect(qrPlan('HTTPS://ROUTINE3.COM/G/JOHN-FERREIRA', 'large')).toMatchObject({ logo: 'large', mark: true });
  });
});

describe('tracking in a routine share link', () => {
  it('normalises each value the way the database accepts it', () => {
    expect(utmValue('Guardian-John Ferreira')).toBe('guardian-john-ferreira');
    expect(utmValue('Spring Sleep!')).toBe('spring-sleep');
    expect(utmValue('  QR ')).toBe('qr');
    expect(utmValue('crème brûlée')).toBe('creme-brulee');
    expect(utmValue('a&b=c?d#e')).toBe('a-b-c-d-e');
    expect(utmValue('<script>alert(1)</script>')).toBe('script-alert-1-script');
    expect(utmValue('x'.repeat(80))).toBe('x'.repeat(64));
    expect(utmValue('')).toBeNull();
    expect(utmValue('---')).toBeNull();
    expect(utmValue(null)).toBeNull();
    expect(utmValue(7)).toBeNull();
    for (const v of ['spring-sleep', 'a.b_c~d', '9lives']) expect(utmValue(v)).toBe(v);
  });

  it('never lets an email address, or anything with an @, into a link', () => {
    for (const personal of ['jane@example.com', 'john.ferreira@gmail.com', '@john', 'x@y']) expect(utmValue(personal)).toBeNull();
    const url = routineShareUrl(TOKEN, { source: 'jane@example.com', medium: 'john@x.com', campaign: 'a@b.c', content: '@z' });
    expect(url).toBe(`https://routine3.com/routine/${TOKEN}`);
    expect(routineShareAppUrl(TOKEN, { source: 'jane@example.com', ref: 'jane@example.com' })).toBe(`healthscan://routine/${TOKEN}`);
    expect(url).not.toMatch(/[@%]/);
  });

  it('builds the tracked link in a fixed order and escapes what it carries', () => {
    expect(routineShareUrl(TOKEN, { source: 'Guardian-John Ferreira', medium: 'QR', campaign: 'Spring Sleep', content: 'Story 1' }))
      .toBe(`https://routine3.com/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=qr&utm_campaign=spring-sleep&utm_content=story-1`);
    expect(routineSharePath(TOKEN, { medium: 'post' })).toBe(`/routine/${TOKEN}?utm_medium=post`);
    expect(routineShareUrl(TOKEN, {})).toBe(`https://routine3.com/routine/${TOKEN}`);
    expect(routineShareUrl(TOKEN, { medium: 'a&utm_medium=evil' })).toBe(`https://routine3.com/routine/${TOKEN}?utm_medium=a-utm_medium-evil`);
  });

  it('names the Guardian as the source: guardian-<slug>', () => {
    expect(guardianUtmSource('john-ferreira')).toBe('guardian-john-ferreira');
    expect(guardianUtmSource('x'.repeat(80))).toBe(`guardian-${'x'.repeat(55)}`);
  });

  it('hands the app the referral code, the recorded open and the tracking, and drops what is malformed', () => {
    const click = '3f9a1c7e-5b2d-4a60-8c1e-9b7d2f4a6c80';
    expect(routineShareAppUrl(TOKEN, { ref: 'D1A1ABB4', click, source: 'guardian-john-ferreira', medium: 'qr' }))
      .toBe(`healthscan://routine/${TOKEN}?ref=D1A1ABB4&click=${click}&utm_source=guardian-john-ferreira&utm_medium=qr`);
    expect(routineShareAppUrl(TOKEN, { ref: 'no spaces', click: 'not-a-uuid' })).toBe(`healthscan://routine/${TOKEN}`);
    expect(routineShareAppUrl(TOKEN)).toBe(`healthscan://routine/${TOKEN}`);
    expect(referralCode('D1A1ABB4')).toBe('D1A1ABB4');
    for (const bad of ['abc', 'a'.repeat(17), 'D1A1 ABB4', 'D1A1&ABB4', '', null, 4]) expect(referralCode(bad)).toBeNull();
  });

  it('reads the token and the tracking back out of a link, ignoring what is not well formed', () => {
    const click = '3f9a1c7e-5b2d-4a60-8c1e-9b7d2f4a6c80';
    expect(parseRoutineShareParams(routineShareAppUrl(TOKEN, { ref: 'D1A1ABB4', click, source: 'guardian-x', medium: 'qr', campaign: 'spring' })))
      .toEqual({ token: TOKEN, ref: 'D1A1ABB4', click, source: 'guardian-x', medium: 'qr', campaign: 'spring', content: null });
    expect(parseRoutineShareParams(`https://routine3.com/routine/${TOKEN}?utm_medium=<b>&ref=a@b.c&click=1#x`))
      .toEqual({ token: TOKEN, ref: null, click: null, source: null, medium: null, campaign: null, content: null });
    expect(parseRoutineShareParams('https://evil.example/routine/' + TOKEN)).toBeNull();
    expect(parseRoutineShareParams(null)).toBeNull();
  });

  it('still reads the token from a tracked link (the query is not part of the path)', () => {
    expect(parseRoutineShareLink(routineShareUrl(TOKEN, { source: 'guardian-x', medium: 'qr' }))).toBe(TOKEN);
    expect(parseRoutineShareLink(routineShareAppUrl(TOKEN, { ref: 'D1A1ABB4' }))).toBe(TOKEN);
  });
});

describe('routine share calls', () => {
  it('creates or reuses a link through the owner-only function and validates what comes back', async () => {
    client.rpc.mockResolvedValueOnce({ data: TOKEN, error: null });
    await expect(createRoutineShareLink('p1')).resolves.toBe(TOKEN);
    expect(client.rpc).toHaveBeenCalledWith('create_routine_share_link', { p_protocol_id: 'p1' });
    client.rpc.mockResolvedValueOnce({ data: 'oops', error: null });
    await expect(createRoutineShareLink('p1')).rejects.toThrow(/did not return a routine link/);
  });

  it('reads the live token without creating one, and says null when there is none', async () => {
    client.rpc.mockResolvedValueOnce({ data: TOKEN, error: null });
    await expect(getRoutineShareLink('p1')).resolves.toBe(TOKEN);
    expect(client.rpc).toHaveBeenLastCalledWith('get_routine_share_link', { p_protocol_id: 'p1' });
    client.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getRoutineShareLink('p1')).resolves.toBeNull();
  });

  it('revokes and reports whether a live link was switched off', async () => {
    client.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(revokeRoutineShareLink('p1')).resolves.toBe(true);
    expect(client.rpc).toHaveBeenLastCalledWith('revoke_routine_share_link', { p_protocol_id: 'p1' });
    client.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(revokeRoutineShareLink('p1')).resolves.toBe(false);
  });

  it('explains a missing migration and a routine that is not yours', async () => {
    expect(routineShareErrorMessage({ code: 'PGRST202', message: 'Could not find the function public.create_routine_share_link' })).toMatch(/latest database update/);
    expect(routineShareErrorMessage({ code: '42P01', message: 'relation "guide_offer_routines" does not exist' })).toMatch(/latest database update/);
    expect(routineShareErrorMessage({ code: 'P0002', message: 'routine not found' })).toMatch(/owns a routine/);
    expect(routineShareErrorMessage({ code: '28000', message: 'authentication required' })).toMatch(/Sign in/);
    expect(routineShareErrorMessage({ message: 'boom' })).toBe('boom');
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.create_routine_share_link' } });
    await expect(createRoutineShareLink('p1')).rejects.toThrow(/latest database update/);
  });

  it('reads the Guardian\'s counts for a routine', async () => {
    const stats = { opens: 12, opens_7d: 4, last_open_at: null, adds: 3, adds_7d: 1, credited: 2, by_medium: [{ medium: 'qr', opens: 9, adds: 2 }] };
    client.rpc.mockResolvedValueOnce({ data: stats, error: null });
    await expect(getRoutineShareStats('p1')).resolves.toEqual(stats);
    expect(client.rpc).toHaveBeenLastCalledWith('routine_share_stats', { p_protocol_id: 'p1' });
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'routine not found' } });
    await expect(getRoutineShareStats('p1')).rejects.toThrow(/owns a routine/);
  });

  it('lists and sets the routine an offer delivers', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{ offer_id: 'o1', protocol_id: 'p1' }, { offer_id: 'o2', protocol_id: 'p2' }], error: null });
    client.from.mockReturnValueOnce({ select: () => ({ eq }) });
    await expect(listOfferRoutines('g1')).resolves.toEqual({ o1: 'p1', o2: 'p2' });
    expect(client.from).toHaveBeenLastCalledWith('guide_offer_routines');
    expect(eq).toHaveBeenCalledWith('guide_id', 'g1');

    const upsert = vi.fn().mockResolvedValue({ error: null });
    client.from.mockReturnValueOnce({ upsert });
    await setOfferRoutine('g1', 'o1', 'p1');
    expect(upsert).toHaveBeenCalledWith({ offer_id: 'o1', guide_id: 'g1', protocol_id: 'p1' }, { onConflict: 'offer_id' });

    const secondEq = vi.fn().mockResolvedValue({ error: null });
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    client.from.mockReturnValueOnce({ delete: () => ({ eq: firstEq }) });
    await setOfferRoutine('g1', 'o1', null);
    expect(firstEq).toHaveBeenCalledWith('offer_id', 'o1');
    expect(secondEq).toHaveBeenCalledWith('guide_id', 'g1');
  });
});
