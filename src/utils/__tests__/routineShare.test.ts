import { beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';

const client = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../supabase/client', () => ({ getSupabaseClient: () => client }));

import {
  createRoutineShareLink, getRoutineShareLink, isShareToken, listOfferRoutines, parseRoutineShareLink, postLinkTarget, revokeRoutineShareLink,
  routineMayBeLinked, routineShareAppUrl, routineSharePath, routineShareUrl, routineShareErrorMessage, setOfferRoutine,
} from '../routineShare';
import { qrLink } from '../../components/guides/ContentStudio';

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
    expect(postLinkTarget({ ...base, routineToken: TOKEN, useRoutine: true })).toBe(`/routine/${TOKEN}`);
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
  it('encodes the canonical lower-case https link, not the upper-case /G/ form', () => {
    expect(qrLink(`/routine/${TOKEN}`)).toBe(`https://routine3.com/routine/${TOKEN}`);
    expect(qrLink(`https://routine3.com/routine/${TOKEN}`)).toBe(`https://routine3.com/routine/${TOKEN}`);
    expect(qrLink(`https://routine3.com/routine/${TOKEN.toUpperCase()}?utm=qr`)).toBe(`https://routine3.com/routine/${TOKEN}`);
  });

  it('still shortens a Guardian page and leaves other links alone', () => {
    expect(qrLink('/guardians/john-ferreira')).toBe('HTTPS://ROUTINE3.COM/G/JOHN-FERREIRA');
    expect(qrLink('/routine/not-a-token')).toBe('https://routine3.com/routine/not-a-token');
    expect(qrLink('https://example.com/Page')).toBe('https://example.com/Page');
  });

  it('fits a QR the post can still draw its logo on (below version 7)', () => {
    expect(QRCode.create(qrLink(`/routine/${TOKEN}`), { errorCorrectionLevel: 'Q' }).version).toBeLessThan(7);
    expect(QRCode.create(qrLink(`/routine/${TOKEN}`), { errorCorrectionLevel: 'H' }).version).toBeLessThan(7);
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
