import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const store = vi.hoisted(() => ({ rows: [] as Row[], next: 1 }));

/** A tiny stand-in for the guide_brands table: select / insert / update / delete with eq and in filters. */
vi.mock('../supabase/client', () => ({
  getSupabaseClient: () => ({
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let action: 'select' | 'delete' | 'update' | 'insert' = 'select';
      let payload: Row = {};
      const builder: any = {
        select: () => builder,
        delete: () => { action = 'delete'; return builder; },
        update: (row: Row) => { action = 'update'; payload = row; return builder; },
        insert: (row: Row) => { action = 'insert'; payload = row; return builder; },
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
        in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
        then: (resolve: (value: { data: Row[]; error: null }) => void) => {
          const hit = (row: Row) => filters.every((filter) => filter(row));
          if (action === 'insert') { store.rows.push({ id: `id-${store.next++}`, ...payload }); resolve({ data: [], error: null }); return; }
          if (action === 'update') store.rows = store.rows.map((row) => (hit(row) ? { ...row, ...payload } : row));
          if (action === 'delete') store.rows = store.rows.filter((row) => !hit(row));
          resolve({ data: store.rows.filter(hit), error: null });
        },
      };
      return builder;
    },
  }),
}));

import { brandSlugify, replaceGuideBrands } from '../guidePortal';

const brand = (name: string, kind: 'personal' | 'business' = 'business', extra: Row = {}) => ({ name, kind, logo_url: null, contact_email: '', whatsapp_phone: '', website_url: '', social_links: {}, language: 'English', pricing_region: 'Australia', currency: 'GBP' as const, is_primary: kind === 'personal', ...extra });

beforeEach(() => { store.rows = []; store.next = 1; });

describe('brandSlugify', () => {
  it('makes a short page address from a name', () => {
    expect(brandSlugify('Tre Lune')).toBe('tre-lune');
    expect(brandSlugify('Misty Mountain Lifestyle Retreat — Australia')).toBe('misty-mountain-lifestyle-retreat-austral');
    expect(brandSlugify('Café Noir!')).toBe('cafe-noir');
    expect(brandSlugify('###')).toBe('brand');
  });
});

describe('replaceGuideBrands keeps brands in place', () => {
  it('gives a new business brand a slug and the personal brand none', async () => {
    const saved = await replaceGuideBrands('g', [brand("Barbara O'Neill", 'personal'), brand('Tre Lune')]);
    expect(saved.find((item) => item.kind === 'personal')!.slug).toBeNull();
    expect(saved.find((item) => item.name === 'Tre Lune')!.slug).toBe('tre-lune');
  });

  it('saving again keeps every brand\'s id and slug, even when nothing about it is sent', async () => {
    const first = await replaceGuideBrands('g', [brand("Barbara O'Neill", 'personal'), brand('Tre Lune')]);
    const ids = Object.fromEntries(first.map((item) => [item.name, item.id]));
    const second = await replaceGuideBrands('g', [brand("Barbara O'Neill", 'personal'), brand('Tre Lune', 'business', { logo_url: 'https://x/logo-mono-1.png' })]);
    expect(Object.fromEntries(second.map((item) => [item.name, item.id]))).toEqual(ids);
    expect(second.find((item) => item.name === 'Tre Lune')).toMatchObject({ slug: 'tre-lune', logo_url: 'https://x/logo-mono-1.png' });
  });

  it('a rename that passes the brand\'s id keeps its id and its page address', async () => {
    const [, tre] = await replaceGuideBrands('g', [brand('Me', 'personal'), brand('Tre Lune')]);
    const after = await replaceGuideBrands('g', [brand('Me', 'personal'), { ...brand('Tre Lune Skincare'), id: tre.id }]);
    const renamed = after.find((item) => item.kind === 'business')!;
    expect(renamed.id).toBe(tre.id);
    expect(renamed.slug).toBe('tre-lune');
  });

  it('removes a brand that is no longer listed, and gives two brands with one name different addresses', async () => {
    await replaceGuideBrands('g', [brand('Me', 'personal'), brand('Tre Lune'), brand('Misty Mountain')]);
    const after = await replaceGuideBrands('g', [brand('Me', 'personal'), brand('Tre Lune'), brand('Tre  Lune!', 'business')]);
    expect(after.map((item) => item.name)).not.toContain('Misty Mountain');
    const slugs = after.filter((item) => item.kind === 'business').map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('never takes an address that already means something', async () => {
    const saved = await replaceGuideBrands('g', [brand('Me', 'personal'), brand('Community')]);
    expect(saved.find((item) => item.name === 'Community')!.slug).toBe('community-brand');
  });
});
