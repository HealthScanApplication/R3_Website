// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const share = vi.hoisted(() => ({
  getRoutineShareLink: vi.fn(),
  createRoutineShareLink: vi.fn(),
  revokeRoutineShareLink: vi.fn(),
  listOfferRoutines: vi.fn(),
  setOfferRoutine: vi.fn(),
  getRoutineShareStats: vi.fn(),
}));
const qr = vi.hoisted(() => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,QR') }));
vi.mock('../routineShare', async (importOriginal) => ({ ...(await importOriginal<typeof import('../routineShare')>()), ...share }));
vi.mock('qrcode', () => ({ default: qr }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...(await importOriginal<typeof import('../guidePortal')>()), listGuideBrands: vi.fn(async () => []) }));
// The studios draw on a canvas; only the props the Content builder hands them matter here.
vi.mock('../../components/guides/ContentStudio', () => ({ ContentStudio: (props: any) => <div data-testid="post-studio" data-site-url={props.siteUrl} data-page-url={props.pageUrl} /> }));
vi.mock('../../components/guides/VideoStudio', () => ({ VideoStudio: (props: any) => <div data-testid="video-studio" data-site-url={props.siteUrl} data-page-url={props.pageUrl} /> }));

import { RoutineShareLink } from '../../components/guides/RoutineShareLink';
import { OfferRoutineLink, suggestOfferRoutine } from '../../components/guides/OfferRoutineLink';
import { ContentBuilder } from '../../components/guides/ContentBuilder';

const TOKEN = '0123456789abcdef0123456789abcdef';
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

beforeEach(() => {
  share.getRoutineShareLink.mockReset().mockResolvedValue(null);
  share.createRoutineShareLink.mockReset().mockResolvedValue(TOKEN);
  share.revokeRoutineShareLink.mockReset().mockResolvedValue(true);
  share.listOfferRoutines.mockReset().mockResolvedValue({});
  share.setOfferRoutine.mockReset().mockResolvedValue(undefined);
  share.getRoutineShareStats.mockReset().mockRejectedValue(new Error('Routine links need the latest database update.'));
  qr.toDataURL.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Share routine link', () => {
  it('creates the link on request and shows the URL with copy and a QR', async () => {
    render(<RoutineShareLink protocolId="p1" protocolName="Sleep reset" />);
    await settle();
    expect(share.createRoutineShareLink).not.toHaveBeenCalled(); // opening the panel mints nothing
    fireEvent.click(screen.getByRole('button', { name: /share routine link/i }));
    await waitFor(() => expect((screen.getByLabelText('Routine link', { selector: 'input' }) as HTMLInputElement).value).toBe(`https://routine3.com/routine/${TOKEN}?utm_medium=link`));
    expect(share.createRoutineShareLink).toHaveBeenCalledWith('p1');
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
    await waitFor(() => expect((screen.getByAltText('QR code for the routine link') as HTMLImageElement).src).toContain('data:image/png'));
  });

  it('copies the link', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<RoutineShareLink protocolId="p1" />);
    await waitFor(() => screen.getByRole('button', { name: /copy/i }));
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`https://routine3.com/routine/${TOKEN}?utm_medium=link`));
  });

  it('names the Guardian and the campaign on the link to send, and says qr on the QR', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<RoutineShareLink protocolId="p1" guardianSlug="john-ferreira" />);
    const input = () => screen.getByLabelText('Routine link', { selector: 'input' }) as HTMLInputElement;
    await waitFor(() => expect(input().value).toBe(`https://routine3.com/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=link`));
    await waitFor(() => expect(qr.toDataURL).toHaveBeenCalledWith(`https://routine3.com/routine/${TOKEN}?utm_medium=qr`, expect.anything()));
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: 'Spring Sleep!' } });
    await waitFor(() => expect(input().value).toBe(`https://routine3.com/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=link&utm_campaign=spring-sleep`));
    await waitFor(() => expect(qr.toDataURL).toHaveBeenLastCalledWith(`https://routine3.com/routine/${TOKEN}?utm_medium=qr&utm_campaign=spring-sleep`, expect.anything()));
  });

  it('never puts an email address typed as a campaign into the link', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<RoutineShareLink protocolId="p1" guardianSlug="john-ferreira" />);
    await waitFor(() => screen.getByLabelText('Campaign'));
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: 'jane@example.com' } });
    const value = (screen.getByLabelText('Routine link', { selector: 'input' }) as HTMLInputElement).value;
    expect(value).not.toMatch(/jane|@|utm_campaign/);
  });

  it('shows the Guardian how the link is doing: opens, adds and new people', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    share.getRoutineShareStats.mockResolvedValue({ opens: 12, opens_7d: 4, last_open_at: null, adds: 3, adds_7d: 1, credited: 2, by_medium: [{ medium: 'qr', opens: 9, adds: 2 }, { medium: 'link', opens: 3, adds: 1 }] });
    render(<RoutineShareLink protocolId="p1" guardianSlug="john-ferreira" />);
    const results = await screen.findByLabelText('Link results');
    expect(results.textContent).toBe('Opened 12 (4 this week) · Added to R³ 3 · New to R³ 2 · qr 9, link 3');
    expect(share.getRoutineShareStats).toHaveBeenCalledWith('p1');
  });

  it('stays quiet about the counts when they cannot be read', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<RoutineShareLink protocolId="p1" />);
    await waitFor(() => screen.getByRole('button', { name: /copy/i }));
    await settle();
    expect(screen.queryByLabelText('Link results')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens on an existing link without creating another, and tells the parent', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    const onToken = vi.fn();
    render(<RoutineShareLink protocolId="p1" onToken={onToken} />);
    await waitFor(() => expect((screen.getByLabelText('Routine link', { selector: 'input' }) as HTMLInputElement).value).toContain(TOKEN));
    expect(share.createRoutineShareLink).not.toHaveBeenCalled();
    expect(onToken).toHaveBeenLastCalledWith(TOKEN);
  });

  it('asks twice before it stops sharing, then goes back to the start', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<RoutineShareLink protocolId="p1" />);
    await waitFor(() => screen.getByRole('button', { name: /stop sharing/i }));
    fireEvent.click(screen.getByRole('button', { name: /stop sharing/i }));
    expect(share.revokeRoutineShareLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /yes, stop sharing/i }));
    await waitFor(() => expect(share.revokeRoutineShareLink).toHaveBeenCalledWith('p1'));
    await waitFor(() => screen.getByRole('button', { name: /share routine link/i }));
  });

  it('warns that a paid offer\'s routine is given away to anyone holding the link', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<RoutineShareLink protocolId="p1" paid />);
    await waitFor(() => expect(screen.getByRole('note').textContent).toMatch(/without paying/));
  });

  it('says so when the database update is not applied, instead of failing silently', async () => {
    share.createRoutineShareLink.mockRejectedValue(new Error('Routine links need the latest database update. Ask an admin to apply it.'));
    render(<RoutineShareLink protocolId="p1" />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /share routine link/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/latest database update/));
  });
});

describe('Offer → routine', () => {
  const offer: any = { id: 'o1', guide_id: 'g1', kind: 'routine', title: 'Calm evenings reset', description: null, price_cents: 0, currency: 'GBP', affiliate_url: null, access_model: 'free', file_path: null, booking_url: null, status: 'published' };
  const protocols: any[] = [
    { id: 'p1', user_id: 'g1', name: 'Calm evenings reset', description: null },
    { id: 'p2', user_id: 'g1', name: 'Morning light', description: null },
    { id: 'px', user_id: 'someone-else', name: 'Calm evenings reset', description: null },
  ];

  it('suggests the Guardian\'s own routine named like the offer, and never someone else\'s', () => {
    expect(suggestOfferRoutine('Calm Evenings — Reset!', protocols, 'g1')?.id).toBe('p1');
    expect(suggestOfferRoutine('Something else', protocols, 'g1')).toBeNull();
    expect(suggestOfferRoutine('Calm evenings reset', [protocols[2]], 'g1')).toBeNull();
  });

  it('links an offer to a routine the Guardian picks', async () => {
    const onChange = vi.fn();
    render(<OfferRoutineLink offer={offer} protocols={protocols} guideId="g1" onChange={onChange} />);
    const select = screen.getByLabelText('Routine this offer delivers') as HTMLSelectElement;
    expect(select.value).toBe('p1'); // the suggestion
    expect(Array.from(select.options).map((o) => o.value)).not.toContain('px');
    fireEvent.click(screen.getByRole('button', { name: /use this routine/i }));
    await waitFor(() => expect(share.setOfferRoutine).toHaveBeenCalledWith('g1', 'o1', 'p1'));
    expect(onChange).toHaveBeenCalledWith('o1', 'p1');
  });

  it('shows "Share routine link" for an offer that has a routine, with the paid warning when it is paid', async () => {
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<OfferRoutineLink offer={{ ...offer, access_model: 'paid', price_cents: 4900 }} protocols={protocols} guideId="g1" linkedProtocolId="p1" onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('note').textContent).toMatch(/paid offer/));
    expect(share.getRoutineShareLink).toHaveBeenCalledWith('p1');
    expect(screen.getByText('Calm evenings reset')).toBeTruthy();
  });
});

describe('Content builder: QR and link', () => {
  const profile: any = { user_id: 'g1', slug: 'john-ferreira', display_name: 'John Ferreira', avatar_url: null, specialties: ['Sleep'], headline: '', bio: '', status: 'approved', social_links: {} };
  const offerOf = (over: Record<string, unknown>): any => ({ id: 'o1', guide_id: 'g1', kind: 'routine', title: 'Calm evenings reset', description: 'A calm evening.', price_cents: 0, currency: 'GBP', affiliate_url: null, access_model: 'free', file_path: null, booking_url: null, status: 'published', ...over });
  const protocols: any[] = [{ id: 'p1', user_id: 'g1', name: 'Calm evenings reset', description: null, is_public: false }];
  const studio = () => screen.getByTestId('post-studio');

  it('points the post at the routine link when the offer has a routine that is already shared', async () => {
    share.listOfferRoutines.mockResolvedValue({ o1: 'p1' });
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<ContentBuilder profile={profile} offers={[offerOf({})]} protocols={protocols} recipes={[]} />);
    await waitFor(() => expect(studio().getAttribute('data-site-url')).toBe(`/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=post`));
    expect(studio().getAttribute('data-page-url')).toBe('/guardians/john-ferreira'); // the @handle keeps coming from the page
    expect(screen.getByTestId('video-studio').getAttribute('data-site-url')).toBe(`/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=post`);
    expect(screen.getByRole('button', { name: 'Routine in the app' }).getAttribute('aria-pressed')).toBe('true');
    expect(share.createRoutineShareLink).not.toHaveBeenCalled();
  });

  it('keeps the Guardian page until the Guardian creates the link, then switches', async () => {
    share.listOfferRoutines.mockResolvedValue({ o1: 'p1' });
    render(<ContentBuilder profile={profile} offers={[offerOf({})]} protocols={protocols} recipes={[]} />);
    const create = await screen.findByRole('button', { name: /routine in the app · create link/i });
    expect(studio().getAttribute('data-site-url')).toBe('/guardians/john-ferreira');
    expect(share.createRoutineShareLink).not.toHaveBeenCalled();
    fireEvent.click(create);
    await waitFor(() => expect(studio().getAttribute('data-site-url')).toBe(`/routine/${TOKEN}?utm_source=guardian-john-ferreira&utm_medium=post`));
    expect(share.createRoutineShareLink).toHaveBeenCalledWith('p1');
    fireEvent.click(screen.getByRole('button', { name: 'Your page' }));
    await waitFor(() => expect(studio().getAttribute('data-site-url')).toBe('/guardians/john-ferreira'));
  });

  it('never points a paid offer at the routine: it would skip the checkout', async () => {
    share.listOfferRoutines.mockResolvedValue({ o1: 'p1' });
    share.getRoutineShareLink.mockResolvedValue(TOKEN);
    render(<ContentBuilder profile={profile} offers={[offerOf({ access_model: 'paid', price_cents: 4900 })]} protocols={protocols} recipes={[]} />);
    const button = await screen.findByRole('button', { name: /routine in the app/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(studio().getAttribute('data-site-url')).toBe('/guardians/john-ferreira');
    expect(share.getRoutineShareLink).not.toHaveBeenCalled();
  });

  it('offers no routine choice for an offer that has no routine', async () => {
    share.listOfferRoutines.mockResolvedValue({});
    render(<ContentBuilder profile={profile} offers={[offerOf({})]} protocols={protocols} recipes={[]} />);
    await settle();
    expect(screen.queryByRole('group', { name: 'QR and link go to' })).toBeNull();
    expect(studio().getAttribute('data-site-url')).toBe('/guardians/john-ferreira');
  });
});
