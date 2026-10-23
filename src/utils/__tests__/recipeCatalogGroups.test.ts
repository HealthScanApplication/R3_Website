import { afterEach, describe, expect, it, vi } from 'vitest';
import { browseRecipes } from '../protocolBuilders';

describe('recipe catalog groups', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['all', null],
    ['meals', 'category=in.(Meal,Dessert,Snack)'],
    ['drinks', 'category=eq.Drink'],
    ['condiments', 'category=eq.Condiment'],
  ] as const)('maps %s to the expected catalog query', async (group, expected) => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal('fetch', fetchMock);

    await browseRecipes('token', { group });

    const url = String(fetchMock.mock.calls[0][0]);
    if (expected) expect(url).toContain(expected);
    else expect(url).not.toContain('category=');
  });
});
