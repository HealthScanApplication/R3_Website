import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const share = vi.hoisted(() => ({ getRoutineShareLink: vi.fn(), getRoutineShareStats: vi.fn() }));
vi.mock('../routineShare', () => share);
import { archiveProtocol, deleteProtocol, protocolImpact, restoreProtocol } from '../protocolAdmin';

type Reply = { body?: unknown; range?: string | null; ok?: boolean; status?: number };
const reply = ({ body = [], range = null, ok = true, status = 200 }: Reply = {}) => ({ ok, status, headers: { get: (k: string) => (k.toLowerCase() === 'content-range' ? range : null) }, json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } }) as unknown as Response;
beforeEach(() => { share.getRoutineShareLink.mockReset().mockResolvedValue(null); share.getRoutineShareStats.mockReset().mockResolvedValue({ adds: 0 }); });
afterEach(() => vi.unstubAllGlobals());

it('deleteProtocol sends a DELETE for that id and wants the deleted row back', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return reply({ body: [{ id: 'p1' }] }); }));
  await deleteProtocol('tok', 'p1');
  expect(calls[0].url).toMatch(/\/protocols\?id=eq\.p1$/);
  expect(calls[0].init.method).toBe('DELETE');
  expect((calls[0].init.headers as Record<string, string>).Prefer).toBe('return=representation');
});

it('deleteProtocol says so when nothing was deleted (not the owner, or already gone)', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ body: [] })));
  await expect(deleteProtocol('tok', 'p1')).rejects.toThrow(/Nothing was deleted/);
});

it('deleteProtocol turns a database error into plain words', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: false, status: 409, body: { code: '23503', message: 'violates foreign key constraint' } })));
  await expect(deleteProtocol('tok', 'p1')).rejects.toThrow(/Something still depends on this protocol.*Archive it instead/);
  vi.stubGlobal('fetch', vi.fn(async () => reply({ ok: false, status: 500, body: { message: 'boom' } })));
  await expect(deleteProtocol('tok', 'p1')).rejects.toThrow(/Could not delete this protocol/);
});

it('archive unpublishes and hides; restore only brings it back to the list', async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return reply({ body: [{ id: 'p1' }] }); }));
  await archiveProtocol('tok', 'p1');
  await restoreProtocol('tok', 'p1');
  expect(bodies).toEqual([{ is_active: false, is_public: false }, { is_active: true }]);
});

it('archive and restore say so when no row changed (gone, or not the owner), instead of reporting success', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ body: [] })));
  await expect(archiveProtocol('tok', 'p1')).rejects.toThrow(/Nothing changed/);
  await expect(restoreProtocol('tok', 'p1')).rejects.toThrow(/Nothing changed/);
});

/** One fetch stub for everything protocolImpact reads: the protocol row, and a Content-Range per table or filter. */
function stubDb(opts: { row?: unknown[] | 'forbidden'; counts?: Record<string, string | null> } = {}) {
  const row = opts.row ?? [{ id: 'p1', name: 'Sleep reset', user_id: 'u', is_public: false, is_suggested: false, is_active: true }];
  const counts = { protocol_items: '0-0/12', guide_offer_routines: '*/0', source_child_protocol_id: '*/0', child_protocol_id: '*/0', parent_protocol_id: '*/0', user_active_protocol: '*/0', user_enabled_protocols: '*/0', user_routine_pins: '*/0', protocol_logs: '*/0', ...(opts.counts || {}) };
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url); urls.push(u);
    if (/\/protocols\?id=eq\./.test(u)) return row === 'forbidden' ? reply({ ok: false, status: 403, body: {} }) : reply({ body: row });
    const key = u.includes('source_child_protocol_id') ? 'source_child_protocol_id' : u.includes('child_protocol_id=eq') ? 'child_protocol_id' : u.includes('parent_protocol_id=eq') ? 'parent_protocol_id' : Object.keys(counts).find((k) => u.includes(`/${k}?`))!;
    const range = (counts as Record<string, string | null>)[key];
    return range === null ? reply({ ok: false, status: 403, body: {} }) : reply({ body: [], range });
  }));
  return urls;
}

it('impact: reads the protocol fresh, and the counts that decide what deleting takes with it', async () => {
  const urls = stubDb({ counts: { protocol_logs: '0-0/40' } });
  const impact = await protocolImpact('tok', 'p1');
  expect(impact).toMatchObject({ name: 'Sleep reset', isPublic: false, isSuggested: false, steps: 12, offers: 0, shareLink: false, adds: 0, copiedIntoParents: 0, attachedTo: 0, childPlans: 0, own: { active: 0, enabled: 0, pinned: 0, logs: 40 }, unreadable: false });
  for (const needle of ['protocols?id=eq.p1', 'protocol_items?protocol_id=eq.p1', 'guide_offer_routines?protocol_id=eq.p1', 'source_child_protocol_id=eq.p1', 'protocol_children?child_protocol_id=eq.p1', 'protocol_children?parent_protocol_id=eq.p1', 'user_active_protocol?protocol_id=eq.p1', 'user_enabled_protocols?protocol_id=eq.p1', 'user_routine_pins?protocol_id=eq.p1', 'protocol_logs?protocol_id=eq.p1']) expect(urls.some((u) => u.includes(needle)), needle).toBe(true);
});

it('impact: the published state and the name are the ones in the database now', async () => {
  stubDb({ row: [{ id: 'p1', name: 'Renamed', user_id: 'u', is_public: true, is_suggested: true, is_active: true }] });
  expect(await protocolImpact('tok', 'p1')).toMatchObject({ name: 'Renamed', isPublic: true, isSuggested: true });
});

it('impact: a child plan reports the steps it put into its parent, and where it is attached', async () => {
  stubDb({ counts: { source_child_protocol_id: '0-0/9', child_protocol_id: '0-0/1' } });
  expect(await protocolImpact('tok', 'p1')).toMatchObject({ copiedIntoParents: 9, attachedTo: 1 });
});

it('impact: a missing or foreign protocol is an error, not an empty impact', async () => {
  stubDb({ row: [] });
  await expect(protocolImpact('tok', 'p1')).rejects.toThrow(/no longer exists|not yours/);
  stubDb({ row: 'forbidden' });
  await expect(protocolImpact('tok', 'p1')).rejects.toThrow();
});

it.each([
  ['a table count', () => stubDb({ counts: { guide_offer_routines: null } })],
  ['the share link', () => share.getRoutineShareLink.mockRejectedValue(new Error('x'))],
  ['the adds', () => share.getRoutineShareStats.mockRejectedValue(new Error('x'))],
  ['a missing adds field', () => share.getRoutineShareStats.mockResolvedValue({})],
  ['a null stats answer', () => share.getRoutineShareStats.mockResolvedValue(null)],
  ['a missing Content-Range header', () => stubDb({ counts: { protocol_logs: '' } })],
])('impact: %s that cannot be read is null and flagged unreadable, never zero', async (_name, setup) => {
  stubDb();
  (setup as () => void)();
  const impact = await protocolImpact('tok', 'p1');
  expect(impact.unreadable).toBe(true);
  expect([impact.offers, impact.shareLink, impact.adds, impact.own.logs]).toContain(null);
});
