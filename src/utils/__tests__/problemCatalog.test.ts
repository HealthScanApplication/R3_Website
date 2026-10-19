import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('reads every page of the catalog before caching (PostgREST caps each response at 1,000 rows)', async () => {
  const total = 1359;
  const ranges: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const range = (init.headers as Record<string, string>).Range; ranges.push(range);
    const [from, to] = range.split('-').map(Number);
    const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: `s${from + i}`, name: `Symptom ${from + i}`, body_system: 'Digestive', category: from + i === 5 ? 'Oncological' : 'General' }));
    return new Response(JSON.stringify(rows), { status: 206 });
  }));
  const { loadProblemCatalog } = await import('../problemCatalog');
  const all = await loadProblemCatalog();
  expect(ranges).toEqual(['0-999', '1000-1999']);
  expect(all).toHaveLength(total - 1); // every page, minus the one oncology row
  expect(await loadProblemCatalog()).toBe(all); // cached
});

it('does not cache a failed load', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
  const { loadProblemCatalog } = await import('../problemCatalog');
  await expect(loadProblemCatalog()).rejects.toThrow(/500/);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
  await expect(loadProblemCatalog()).resolves.toEqual([]);
});
