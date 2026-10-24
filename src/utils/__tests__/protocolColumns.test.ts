import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The list queries remember, for the session, which optional columns the database lacks: load the module fresh per test.
let admin: typeof import('../protocolAdmin');
beforeEach(async () => { vi.resetModules(); admin = await import('../protocolAdmin'); });
afterEach(() => vi.unstubAllGlobals());

const PROFILE = ['profile_role', 'profile_name', 'profile_image_url', 'schedule_basis'];
const AUDIENCE = ['target_age_min', 'target_age_max', 'tags'];
const missing = (column: string) => ({ status: 400, body: { code: '42703', message: `column protocols.${column} does not exist` } });

/** A database whose `protocols` view lacks `lacking`. Records the columns each request asked for. */
function database(lacking: string[], rows: unknown[] = [{ id: 'p1', name: 'One' }], failure?: { status: number; body: unknown }) {
  const asked: string[][] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const columns = /[?&]select=([^&]*)/.exec(String(url))![1].split(',');
    asked.push(columns);
    if (failure) return new Response(JSON.stringify(failure.body), { status: failure.status });
    const gone = columns.find((c) => lacking.includes(c));
    if (gone) { const m = missing(gone); return new Response(JSON.stringify(m.body), { status: m.status }); }
    return new Response(JSON.stringify(rows), { status: 200 });
  }));
  return asked;
}

it("Staging's view has no profile columns but does have tags and ages: only the profile columns are dropped", async () => {
  const asked = database(PROFILE);
  await admin.listProtocols('tok');
  const last = asked[asked.length - 1];
  for (const c of PROFILE) expect(last).not.toContain(c);
  for (const c of AUDIENCE) expect(last).toContain(c);
  expect(last).toContain('target_gender');
  expect(last).toContain('image_url');
});

it('the public list does the same, and remembers: the next request starts from the reduced columns', async () => {
  const asked = database(PROFILE);
  await admin.listPublicProtocols('tok');
  const after = asked.length;
  await admin.listPublicProtocols('tok');
  expect(asked.length - after).toBe(1); // no second round of failures
  expect(asked[asked.length - 1]).toEqual(asked[after - 1]);
  expect(asked[asked.length - 1]).toContain('tags');
});

it('a database missing only the audience columns keeps the profile columns', async () => {
  const asked = database(['tags', 'target_age_min']);
  await admin.listProtocols('tok');
  const last = asked[asked.length - 1];
  for (const c of PROFILE) expect(last).toContain(c);
  expect(last).not.toContain('tags');
  expect(last).not.toContain('target_age_min');
  expect(last).toContain('target_age_max'); // only what is really missing is lost
});

it('a database missing both groups loses both, one column at a time, and still answers', async () => {
  const asked = database([...PROFILE, ...AUDIENCE]);
  const rows = await admin.listProtocols('tok');
  expect(rows).toEqual([{ id: 'p1', name: 'One' }]);
  const last = asked[asked.length - 1];
  for (const c of [...PROFILE, ...AUDIENCE]) expect(last).not.toContain(c);
  expect(last).toContain('name');
});

it('the Protocols tab asks for both lists at once: both succeed even though each is told about the same missing columns', async () => {
  const asked: string[][] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const columns = /[?&]select=([^&]*)/.exec(String(url))![1].split(',');
    asked.push(columns);
    await new Promise((resolve) => setTimeout(resolve, 5)); // both requests are in flight before either answer arrives
    const gone = columns.find((c) => PROFILE.includes(c));
    return gone ? new Response(JSON.stringify(missing(gone).body), { status: 400 }) : new Response(JSON.stringify([{ id: 'p1', name: 'One' }]), { status: 200 });
  }));
  const [mine, everyone] = await Promise.all([admin.listProtocols('tok'), admin.listPublicProtocols('tok')]);
  expect(mine).toEqual([{ id: 'p1', name: 'One' }]);
  expect(everyone).toEqual([{ id: 'p1', name: 'One' }]);
  const last = asked[asked.length - 1];
  for (const c of PROFILE) expect(last).not.toContain(c);
  expect(last).toContain('tags');
});

it('an undefined-column error that names no column drops every optional column', async () => {
  const asked: string[][] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const columns = /[?&]select=([^&]*)/.exec(String(url))![1].split(',');
    asked.push(columns);
    return columns.some((c) => [...PROFILE, ...AUDIENCE].includes(c))
      ? new Response(JSON.stringify({ code: '42703', message: 'undefined column' }), { status: 400 })
      : new Response('[]', { status: 200 });
  }));
  await admin.listProtocols('tok');
  expect(asked).toHaveLength(2);
  expect(asked[1].some((c) => [...PROFILE, ...AUDIENCE].includes(c))).toBe(false);
});

it('any other failure is reported, not worked around: a 503 keeps every column, a missing required column is an error', async () => {
  const asked = database([], [], { status: 503, body: { message: 'unavailable' } });
  await expect(admin.listProtocols('tok')).rejects.toThrow(/List protocols failed \(503\)/);
  expect(asked).toHaveLength(1);
  const required = database(['name']);
  await expect(admin.listProtocols('tok')).rejects.toThrow(/failed \(400\)/);
  expect(required).toHaveLength(1);
});
