// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GuardianWebsite } from '../../components/guides/GuidePortal';
import { resetRates } from '../displayMoney';
import { brandSitePath, brandSiteProfile, brandSlugFromPath, savedBrandId, savedBrandMoves, siteOwns } from '../brandSite';

const treat = (id: string, title: string, brand_id: string | null) => ({ id, guide_id: 'owner', kind: 'treat', title, description: 'Massage · 60 min\nA treat.', cover_url: null, price_cents: 13000, currency: 'AUD', affiliate_url: null, access_model: 'paid', file_path: null, booking_url: null, status: 'published', brand_id });
const PROFILE = { user_id: 'owner', slug: 'barbara-oneill', display_name: "Barbara O'Neill", headline: 'Self Heal by Design', bio: 'Her bio.', avatar_url: 'https://x/barbara.jpg', specialties: ['Wellness'], status: 'approved', onboarding_step: 5, contact_email: 'barbara@example.com', social_links: { instagram: 'https://instagram.com/barbara' } };
const BRANDS = [
  { id: 'b-personal', guide_id: 'owner', name: "Barbara O'Neill", kind: 'personal', slug: null, logo_url: null, website_url: '', social_links: {}, is_primary: true },
  { id: 'b-tre', guide_id: 'owner', name: 'Tre Lune', kind: 'business', slug: 'tre-lune', logo_url: 'https://x/logo-mono-1.png', website_url: 'https://www.trelune.com.au/', social_links: { headline: 'Natural hormonal support', about_short: 'Natural products', instagram: 'https://instagram.com/trelune_' }, is_primary: false },
  { id: 'b-mmh', guide_id: 'owner', name: 'Misty Mountain Lifestyle Retreat', kind: 'business', slug: 'misty-mountain', logo_url: null, website_url: 'https://www.mmh.com.au/', social_links: { section_order: 'treats,events', name_suffix: 'Lifestyle Retreat', email_capture: 'off' }, is_primary: false },
];
const shopSpy = vi.hoisted(() => vi.fn());
const optInSpy = vi.hoisted(() => vi.fn());
const event = (id: string, title: string, brand_id: string | null) => ({ id, guide_id: 'owner', title, description: null, start_at: '2099-03-28T00:00:00.000Z', end_at: null, timezone: 'Australia/Sydney', venue: null, location: 'Bellbrook NSW', format: 'in_person', image_url: null, info_url: null, source_url: 'manual', source_name: null, source_external_id: id, status: 'published', brand_id });
const EVENTS = [event('e1', 'Personal Talk', null), event('e2', 'Tre Lune Workshop', 'b-tre'), event('e3', 'Misty Weekend', 'b-mmh')];
const OFFERS = [treat('t1', 'Personal Treat', null), treat('t2', 'Tre Lune Treat', 'b-tre'), treat('t3', 'Misty Treat', 'b-mmh')];

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {}, loading: false }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfileBySlug: async () => PROFILE,
  listGuideOffers: async () => OFFERS,
  listGuideValueRamps: async () => [],
  listGuideEvents: async () => EVENTS,
  listPublicGuideBrands: async () => BRANDS,
  submitGuardianOptIn: async (...args: unknown[]) => { optInSpy(...args); },
  listPublicGuideProducts: async (guide: string, brand?: string | null) => { shopSpy(guide, brand); return []; },
}));

beforeEach(() => { optInSpy.mockReset(); shopSpy.mockReset(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const visit = (path: string, brandSlug?: string) => { window.history.replaceState({}, '', path); return render(<GuardianWebsite slug="barbara-oneill" brandSlug={brandSlug} isSignedIn={false} />); };

describe('brand page helpers', () => {
  it('reads a brand page from the address, and leaves the other sub-pages alone', () => {
    expect(brandSlugFromPath('/guardians/barbara-oneill/tre-lune')).toEqual({ guardian: 'barbara-oneill', brand: 'tre-lune' });
    expect(brandSlugFromPath('/guardians/barbara-oneill/tre-lune/')).toEqual({ guardian: 'barbara-oneill', brand: 'tre-lune' });
    expect(brandSlugFromPath('/guardians/barbara-oneill')).toBeNull();
    expect(brandSlugFromPath('/guardians/workspace')).toBeNull();
    expect(brandSlugFromPath('/guardians/barbara-oneill/community')).toBeNull();
    expect(brandSlugFromPath('/guardians/barbara-oneill/value-ramp')).toBeNull();
  });
  it('gives each brand its own address and the personal brand the Guardian\'s', () => {
    expect(brandSitePath('barbara-oneill', BRANDS[1] as any)).toBe('/guardians/barbara-oneill/tre-lune');
    expect(brandSitePath('barbara-oneill', BRANDS[0] as any)).toBe('/guardians/barbara-oneill');
    expect(brandSitePath('barbara-oneill', null)).toBe('/guardians/barbara-oneill');
  });
  it('shows a brand page its own content and the personal page what has no brand', () => {
    expect(siteOwns('b-tre', 'b-personal', 'b-tre')).toBe(true);
    expect(siteOwns('b-tre', 'b-personal', null)).toBe(false);
    expect(siteOwns(undefined, 'b-personal', null)).toBe(true);
    expect(siteOwns(undefined, 'b-personal', 'b-personal')).toBe(true);
    expect(siteOwns(undefined, 'b-personal', 'b-tre')).toBe(false);
  });
  it('puts the brand\'s name, logo, tagline and links over the Guardian\'s, keeping the rest', () => {
    const profile = brandSiteProfile(PROFILE as any, BRANDS[1] as any)!;
    expect(profile).toMatchObject({ display_name: 'Tre Lune', avatar_url: 'https://x/logo-mono-1.png', headline: 'Natural hormonal support', contact_email: 'barbara@example.com', user_id: 'owner', slug: 'barbara-oneill' });
    expect(profile.social_links).toMatchObject({ instagram: 'https://instagram.com/trelune_', website: 'https://www.trelune.com.au/' });
    expect(brandSiteProfile(PROFILE as any, BRANDS[0] as any)).toBe(PROFILE);
  });
});

describe('brands added this session get their saved ids after a save', () => {
  it('reads a saved id from a local id', () => {
    expect(savedBrandId('brand-0b1c2d3e-aaaa-bbbb-cccc-111122223333')).toBe('0b1c2d3e-aaaa-bbbb-cccc-111122223333');
    expect(savedBrandId('brand-1730000000000')).toBeUndefined();
    expect(savedBrandId('personal')).toBeUndefined();
  });
  it('moves a temporary local id to the saved one (with its page address) and leaves saved and personal brands alone', () => {
    const drafts = [
      { localId: 'personal', name: "Barbara O'Neill", kind: 'personal' },
      { localId: 'brand-1730000000000', name: 'Tre Lune', kind: 'business' },
      { localId: 'brand-0b1c2d3e-aaaa-bbbb-cccc-111122223333', name: 'Misty Mountain', kind: 'business' },
    ];
    const saved = [{ id: 'p', name: "Barbara O'Neill", kind: 'personal', slug: null }, { id: 'new-id', name: 'tre lune ', kind: 'business', slug: 'tre-lune' }, { id: '0b1c2d3e-aaaa-bbbb-cccc-111122223333', name: 'Misty Mountain', kind: 'business', slug: 'misty-mountain' }] as any;
    const moves = savedBrandMoves(drafts, saved);
    expect([...moves.entries()]).toEqual([['brand-1730000000000', { localId: 'brand-new-id', slug: 'tre-lune' }]]);
  });
});

describe('the public page of each brand', () => {
  it('the Guardian\'s own page shows only what has no brand', async () => {
    visit('/guardians/barbara-oneill');
    const section = await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    expect(within(section).getByText('Personal Treat')).toBeTruthy();
    expect(within(section).queryByText('Tre Lune Treat')).toBeNull();
    expect(within(section).queryByText('Misty Treat')).toBeNull();
  });

  it('links the Guardian and each brand in the header after the logo and in the second-to-last footer row, marking the page you are on', async () => {
    const { container } = visit('/guardians/misty-mountain'.replace('/guardians/misty-mountain', '/guardians/barbara-oneill/misty-mountain'), 'misty-mountain');
    await screen.findByRole('region', { name: "Misty Mountain Lifestyle Retreat's treats" });
    const header = await waitFor(() => { const el = container.querySelector('[data-brand-links="header"]'); if (!el) throw new Error('no header links'); return el as HTMLElement; });
    expect([...header.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/guardians/barbara-oneill', '/guardians/barbara-oneill/tre-lune', '/guardians/barbara-oneill/misty-mountain']);
    expect([...header.querySelectorAll('a')].every((a) => a.style.borderBottom === '' || a.style.borderBottomWidth === '0px' || /^0/.test(a.style.borderBottom))).toBe(true); // no underline in the header
    expect(header.querySelector('a[aria-label="Tre Lune"]')).not.toBeNull(); // names are hover-only, so each link keeps its name for screen readers
    expect(header.querySelector('a[aria-current="page"]')!.getAttribute('href')).toBe('/guardians/barbara-oneill/misty-mountain');
    const footer = container.querySelector('[data-brand-links="footer"]') as HTMLElement;
    expect(footer.querySelectorAll('a').length).toBe(3);
    expect(footer.querySelectorAll('img').length).toBe(0); // the footer row is names only: the logos are in the row just above it
    expect(header.querySelectorAll('img').length).toBeGreaterThan(0);
    expect(footer.parentElement!.lastChild).not.toBe(footer.parentElement!.querySelector('div')); // the disclaimer text comes after the brand row
  });

  it('a brand\'s page carries its name and shows only its own content', async () => {
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    const section = await screen.findByRole('region', { name: "Tre Lune's treats" });
    expect(within(section).getByText('Tre Lune Treat')).toBeTruthy();
    expect(within(section).queryByText('Personal Treat')).toBeNull();
    expect(within(section).queryByText('Misty Treat')).toBeNull();
    expect(screen.queryByRole('region', { name: "Barbara O'Neill's treats" })).toBeNull();
  });

  it('asks for each page\'s own products in the query, so another brand\'s products cannot crowd them out', async () => {
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    await screen.findByRole('region', { name: "Tre Lune's treats" });
    await waitFor(() => expect(shopSpy).toHaveBeenCalledWith('owner', 'b-tre'));
    cleanup(); shopSpy.mockReset();
    visit('/guardians/barbara-oneill');
    await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    await waitFor(() => expect(shopSpy).toHaveBeenCalledWith('owner', null)); // her own page: products with no brand
  });

  it('shows a brand\'s flat logo white on the dark hero, and a normal photo as it is', async () => {
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    await screen.findByRole('region', { name: "Tre Lune's treats" });
    const logo = document.querySelector('.guardian-public-site main img[src="https://x/logo-mono-1.png"]') as HTMLImageElement;
    expect(logo.style.filter).toBe('invert(1)');
    cleanup();
    visit('/guardians/barbara-oneill');
    await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    const portrait = document.querySelector('img[src="https://x/barbara.jpg"]') as HTMLImageElement | null;
    if (portrait) expect(portrait.style.filter).not.toBe('invert(1)');
  });

  it('puts a brand\'s logo across the edge of the event map, black on the card\'s own white background, under a white text area', async () => {
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    const section = await screen.findByRole('region', { name: "Tre Lune's events" });
    const card = await within(section).findByText('Tre Lune Workshop').then((el) => el.closest('article') as HTMLElement);
    expect(card.style.background).toMatch(/rgb\(255, 255, 255\)|#FFFFFF/i); // a white card on the dark section
    expect(card.style.color).toMatch(/rgb\(17, 18, 15\)|#11120F/i); // with dark text
    const header = card.querySelector('[data-destination-header]') as HTMLElement;
    const badge = card.querySelector('[data-destination-badge]') as HTMLElement;
    expect(header.contains(badge)).toBe(false); // it sits across the edge of the map, not on it
    expect(badge.style.bottom).toBe('-34px');
    expect(badge.style.background).toMatch(/rgb\(255, 255, 255\)|#FFFFFF/i); // cut from the card's own white
    expect((badge.querySelector('img') as HTMLImageElement).style.filter).toBe(''); // the flat logo stays black on white
    expect(within(section).queryByText('Personal Talk')).toBeNull(); // only this brand's events
  });

  it('gives visitors no Refresh events button', async () => {
    visit('/guardians/barbara-oneill');
    const section = await screen.findByRole('region', { name: "Barbara O'Neill's events" });
    expect(within(section).queryByRole('button', { name: /refresh events/i })).toBeNull();
  });

  it('lists the official brands after the page\'s content and subscription, as white tiles with dark text and a dark logo', async () => {
    visit('/guardians/barbara-oneill');
    await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    const brands = document.querySelector('section[aria-labelledby="guardian-brands-title"]') as HTMLElement;
    expect(brands).not.toBeNull();
    const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(screen.getByRole('region', { name: "Barbara O'Neill's treats" }), brands)).toBe(true); // below the page's content
    expect(brands.nextElementSibling).toBe(document.querySelector('footer')); // the last thing before the footer, so below the subscription
    const tiles = [...brands.querySelectorAll('[data-brand-tile]')] as HTMLElement[];
    expect(tiles.length).toBe(3); // Barbara first, then her brands
    expect(tiles[0].textContent).toMatch(/Barbara O'Neill/);
    const r3 = tiles.map((tile) => (tile.querySelector('[data-r3-icon]') as HTMLAnchorElement).getAttribute('href'));
    expect(r3).toEqual(['/guardians/barbara-oneill', '/guardians/barbara-oneill/tre-lune', '/guardians/barbara-oneill/misty-mountain']); // each tile opens that brand's R³ Guardian page
    expect((tiles[0].querySelector('[data-r3-icon]') as HTMLElement).getAttribute('aria-current')).toBe('page'); // you are on Barbara's page
    for (const tile of tiles) { expect(tile.style.background).toMatch(/rgb\(255, 255, 255\)|#FFFFFF/i); expect(tile.style.color).toMatch(/rgb\(17, 18, 15\)|#11120F/i); }
    // The address as people read it, a short description under each name, and the R³ mark last in the row.
    const tre = tiles[1];
    expect(tre.querySelector('[data-brand-website]')!.textContent).toMatch(/^www\.trelune\.com\.au/);
    expect(tre.querySelector('[data-brand-website]')!.querySelector('svg')).toBeNull(); // the address alone, no arrow icon
    for (const tile of tiles) expect(tile.style.transform).toMatch(/perspective/); // tilts under the pointer like the review cards
    expect(tre.querySelector('strong')!.textContent).toBe('Tre Lune');
    expect(tre.querySelector('[data-brand-blurb]')!.textContent).toBe('Natural products');
    expect(tiles[2].querySelector('strong')!.textContent).toBe('Misty Mountain'); // the name, then the grey descriptor under it
    expect(tiles[2].querySelector('[data-brand-blurb]')!.textContent).toBe('Lifestyle Retreat');
    expect(tiles[0].querySelector('[data-brand-blurb]')!.textContent).toBe('Self Heal by Design'); // Barbara: her own headline
    for (const tile of tiles) { const row = tile.querySelector('[data-r3-icon]')!.parentElement!; expect(row.lastElementChild).toBe(tile.querySelector('[data-r3-icon]')); expect(tile.querySelector('[data-r3-icon]')!.textContent).toBe('R³'); }
    const logo = brands.querySelector('img[src="https://x/logo-mono-1.png"]') as HTMLImageElement;
    expect(logo.style.filter).toBe(''); // black logo on the white tile, not inverted
  });

  it('shows the sections in the order the brand chose: treats before events on Misty Mountain, events before treats elsewhere', async () => {
    visit('/guardians/barbara-oneill/misty-mountain', 'misty-mountain');
    const treats = await screen.findByRole('region', { name: "Misty Mountain Lifestyle Retreat's treats" });
    const events = await screen.findByRole('region', { name: "Misty Mountain Lifestyle Retreat's events" });
    expect(!!(treats.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    cleanup();
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    const treLuneTreats = await screen.findByRole('region', { name: "Tre Lune's treats" });
    const treLuneEvents = await screen.findByRole('region', { name: "Tre Lune's events" });
    expect(!!(treLuneEvents.compareDocumentPosition(treLuneTreats) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true); // the default
  });

  it('puts a brand\'s name and its descriptor on two lines in the hero', async () => {
    const hero = async () => { await screen.findByRole('region', { name: /treats/i }); const section = document.querySelector('.guardian-public-site main > section') as HTMLElement; return within(section).getAllByText((_, el) => el?.tagName === 'STRONG')[0]; };
    visit('/guardians/barbara-oneill/misty-mountain', 'misty-mountain');
    const name = await hero();
    expect(name.textContent).toBe('Misty Mountain');
    expect(name.nextElementSibling!.textContent).toBe('Lifestyle Retreat'); // in place of the specialties line
    cleanup();
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    const tre = await hero();
    expect(tre.textContent).toBe('Tre Lune');
    expect(tre.nextElementSibling!.textContent).toBe('Natural products');
    cleanup();
    visit('/guardians/barbara-oneill');
    const barbara = await hero();
    expect(barbara.nextElementSibling!.textContent).toBe('Wellness'); // her own page is unchanged
  });

  it('shows treat prices in the picked currency, marked as converted', async () => {
    resetRates();
    localStorage.setItem('r3-store-locale', JSON.stringify({ region: 'Europe', locale: 'en', currency: 'EUR' }));
    vi.stubGlobal('fetch', vi.fn(async (input: any) => (String(input).includes('frankfurter') ? ({ ok: true, status: 200, json: async () => ({ rates: { AUD: 1.6 } }) } as Response) : ({ ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response))));
    visit('/guardians/barbara-oneill');
    const section = await screen.findByRole('region', { name: "Barbara O'Neill's treats" });
    await waitFor(() => expect(section.querySelector('[data-offer-price]')!.textContent).toBe('≈ €81.25')); // A$130 at 1.6 per euro
    localStorage.clear();
  });

  it('puts an email sign-up at the bottom of a page with no free offer, and saves the lead', async () => {
    visit('/guardians/barbara-oneill/tre-lune', 'tre-lune');
    const follow = await screen.findByRole('region', { name: 'Follow Tre Lune' });
    expect(follow.compareDocumentPosition(document.querySelector('footer')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // above the footer
    fireEvent.change(within(follow).getByLabelText('Email address'), { target: { value: 'ana@example.com' } });
    fireEvent.click(within(follow).getByRole('checkbox'));
    fireEvent.click(within(follow).getByRole('button', { name: 'Follow' }));
    await within(follow).findByText(/You’re subscribed/);
    expect(optInSpy).toHaveBeenCalledWith('owner', expect.objectContaining({ email: 'ana@example.com', marketingConsent: true, name: 'ana' }));
  });

  it('shows the sign-up on Barbara\'s own page too, and not on a page whose owner turned it off', async () => {
    visit('/guardians/barbara-oneill');
    expect(await screen.findByRole('region', { name: "Follow Barbara O'Neill" })).toBeTruthy();
    cleanup();
    visit('/guardians/barbara-oneill/misty-mountain', 'misty-mountain');
    await screen.findByRole('region', { name: "Misty Mountain Lifestyle Retreat's treats" });
    expect(document.querySelector('#follow')).toBeNull(); // Misty Mountain's setting: email_capture off
  });

  it('an address that is not one of the Guardian\'s brands is a page that is not published', async () => {
    visit('/guardians/barbara-oneill/nothing-here', 'nothing-here');
    expect(await screen.findByText('This page is not published yet.')).toBeTruthy();
  });
});
