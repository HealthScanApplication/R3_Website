// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { brandSelection, cardByline, itemBrandIds, itemBrandSelection, protocolOnSite, siteOwns } from '../brandSite';
import { inBrandScope } from '../brandScope';

const PERSONAL = 'p', MMH = 'm', TL = 't';
const brands = [
  { id: PERSONAL, name: 'Barbara O’Neill', kind: 'personal' as const, logo_url: null },
  { id: MMH, name: 'Misty Mountain', kind: 'business' as const, logo_url: 'mmh.png' },
  { id: TL, name: 'Tre Lune', kind: 'business' as const, logo_url: 'tl.png' },
];

describe('protocols on brand pages', () => {
  it('a protocol with no links is on the personal page only; links put it on each listed page', () => {
    expect(protocolOnSite(null, PERSONAL, undefined)).toBe(true);
    expect(protocolOnSite(MMH, PERSONAL, undefined)).toBe(false);
    expect(protocolOnSite(MMH, PERSONAL, [MMH, PERSONAL])).toBe(true);
    expect(protocolOnSite(null, PERSONAL, [MMH, PERSONAL])).toBe(true);
    expect(protocolOnSite(null, PERSONAL, [TL])).toBe(false);
    expect(protocolOnSite(TL, PERSONAL, [TL])).toBe(true);
  });
});

describe('items on more than one brand', () => {
  it('lists the primary brand first and drops repeats', () => {
    expect(itemBrandIds({ brand_id: MMH, brand_ids: [PERSONAL, MMH] })).toEqual([MMH, PERSONAL]);
    expect(itemBrandIds({ brand_id: null })).toEqual([]);
  });
  it('shows an item on each brand page that lists it', () => {
    const item = { brand_id: MMH, brand_ids: [PERSONAL] };
    expect(siteOwns(MMH, PERSONAL, item)).toBe(true);
    expect(siteOwns(null, PERSONAL, item)).toBe(true);
    expect(siteOwns(TL, PERSONAL, item)).toBe(false);
    expect(siteOwns(null, PERSONAL, { brand_id: MMH })).toBe(false);
    expect(siteOwns(null, PERSONAL, {})).toBe(true);
    expect(siteOwns(MMH, PERSONAL, MMH)).toBe(true);
  });
  it('filters the workspace by any of an item’s brands', () => {
    expect(inBrandScope(TL, { brand_id: MMH, brand_ids: [TL] })).toBe(true);
    expect(inBrandScope(TL, { brand_id: MMH })).toBe(false);
    expect(inBrandScope('personal', {})).toBe(true);
  });
  it('stores ticked brands as a primary and the rest', () => {
    expect(brandSelection([PERSONAL], PERSONAL)).toEqual({ brand_id: null, brand_ids: [] });
    expect(brandSelection([PERSONAL, MMH], PERSONAL)).toEqual({ brand_id: MMH, brand_ids: [PERSONAL] });
    expect(brandSelection([MMH, TL], PERSONAL)).toEqual({ brand_id: MMH, brand_ids: [TL] });
    expect(itemBrandSelection({}, PERSONAL)).toEqual([PERSONAL]);
  });
  it('credits a card to its brand, or the Guardian when it is theirs', () => {
    const owner = { name: 'Barbara O’Neill', avatarUrl: 'b.png' };
    expect(cardByline({ brand_id: MMH, brand_ids: [PERSONAL] }, brands, null, owner)).toEqual({ name: 'Misty Mountain', avatarUrl: 'mmh.png' });
    expect(cardByline({ brand_id: MMH, brand_ids: [TL] }, brands, TL, owner)).toEqual({ name: 'Tre Lune', avatarUrl: 'tl.png' });
    expect(cardByline({}, brands, null, owner)).toEqual(owner);
    expect(cardByline({ brand_id: PERSONAL }, brands, null, owner)).toEqual(owner);
  });
});

const setItemBrands = vi.fn();
vi.mock('../guidePortal', async () => ({
  listGuideBrands: vi.fn(async () => brands),
  setItemBrands: (...args: unknown[]) => setItemBrands(...args),
}));

describe('ItemBrands chooser', () => {
  beforeEach(() => { cleanup(); setItemBrands.mockReset(); });
  it('ticks a second brand and saves it', async () => {
    const { ItemBrands } = await import('../../components/guides/ItemBrands');
    setItemBrands.mockResolvedValue({ brand_id: MMH, brand_ids: [PERSONAL] });
    const saved = vi.fn();
    render(<ItemBrands guideId="g" table="guide_offers" item={{ id: 'o1' }} onSaved={saved} />);
    const box = await screen.findByLabelText('Show on Misty Mountain');
    fireEvent.click(box);
    await waitFor(() => expect(setItemBrands).toHaveBeenCalledWith('guide_offers', 'g', 'o1', { brand_id: MMH, brand_ids: [PERSONAL] }));
    expect(saved).toHaveBeenCalled();
  });
  it('will not clear the last page', async () => {
    const { ItemBrands } = await import('../../components/guides/ItemBrands');
    render(<ItemBrands guideId="g" table="guide_offers" item={{ id: 'o1' }} />);
    fireEvent.click(await screen.findByLabelText('Show on Barbara O’Neill'));
    expect((await screen.findByRole('alert')).textContent).toContain('Keep at least one page');
    expect(setItemBrands).not.toHaveBeenCalled();
  });
});
