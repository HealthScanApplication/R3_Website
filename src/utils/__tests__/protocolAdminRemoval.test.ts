import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const share = vi.hoisted(() => ({ getRoutineShareLink: vi.fn(), getRoutineShareStats: vi.fn() }));
vi.mock('../routineShare', () => share);
import { archiveProtocol, deleteProtocol, protocolImpact, restoreProtocol } from '../protocolAdmin';

const json = (body: unknown, init: { ok?: boolean; status?: number; range?: string } = {}) => ({ ok: init.ok ?? true, status: init.status ?? 200, headers: { get: (k: string) => (k.toLowerCase() === 'content-range' ? init.range ?? null : null) }, json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } }) as unknown as Response;
beforeEach(() => { share.getRoutineShareLink.mockReset().mockResolvedValue(null); share.getRoutineShareStats.mockReset().mockResolvedValue({ adds: 0 }); });
afterEach(() => vi.unstubAllGlobals());

it('deleteProtocol sends a DELETE for that id and wants the deleted row back', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return json([{ id: 'p1' }]); }));
  await deleteProtocol('tok', 'p1');
  expect(calls[0].url).toMatch(/\/protocols\?id=eq\.p1$/);
  expect(calls[0].init.method).toBe('DELETE');
  expect((calls[0].init.headers as Record<string, string>).Prefer).toBe('return=representation');
});

it('deleteProtocol says so when nothing was deleted (not the owner, or already gone)', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json([])));
  await expect(deleteProtocol('tok', 'p1')).rejects.toThrow(/Nothing was deleted/);
});

it('archive unpublishes and hides; restore only brings it back to the list', async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return json([{ id: 'p1' }]); }));
  await archiveProtocol('tok', 'p1');
  await restoreProtocol('tok', 'p1');
  expect(bodies).toEqual([{ is_active: false, is_public: false }, { is_active: true }]);
});

const fetchCounts = (steps: string | null, offers: string | null) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const range = String(url).includes('protocol_items') ? steps : offers;
  return range === null ? json({}, { ok: false, status: 403 }) : json([], { range });
}));

it('impact: a private draft with nothing attached is not shared', async () => {
  fetchCounts('0-0/12', '*/0');
  expect(await protocolImpact('tok', { id: 'p1', is_public: false })).toEqual({ steps: 12, offers: 0, shareLink: false, adds: 0, isPublic: false, shared: false });
});

it.each([
  ['published', { is_public: true }, () => {}],
  ['used by an offer', { is_public: false }, () => fetchCounts('0-0/3', '0-0/1')],
  ['has a live share link', { is_public: false }, () => share.getRoutineShareLink.mockResolvedValue('tok123')],
  ['was added from its link', { is_public: false }, () => share.getRoutineShareStats.mockResolvedValue({ adds: 2 })],
])('impact: %s means shared', async (_name, protocol, setup) => {
  fetchCounts('0-0/3', '*/0');
  (setup as () => void)();
  expect((await protocolImpact('tok', { id: 'p1', ...protocol })).shared).toBe(true);
});

it.each([
  ['the offers count', () => fetchCounts('0-0/3', null)],
  ['the share link', () => share.getRoutineShareLink.mockRejectedValue(new Error('x'))],
  ['the adds', () => share.getRoutineShareStats.mockRejectedValue(new Error('x'))],
])('impact: when %s cannot be read, it counts as shared', async (_name, setup) => {
  fetchCounts('0-0/3', '*/0');
  (setup as () => void)();
  const impact = await protocolImpact('tok', { id: 'p1', is_public: false });
  expect(impact.shared).toBe(true);
  expect([impact.offers, impact.shareLink, impact.adds]).toContain(null);
});
