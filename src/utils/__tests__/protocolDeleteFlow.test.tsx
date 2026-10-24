// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Workspace } from '../../components/guides/GuidePortal';

// The whole workspace renders in every test; on a busy machine that outruns the 5s default.
vi.setConfig({ testTimeout: 30000 });

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: 'tok', signOut: () => {} }) }));
const store = vi.hoisted(() => {
  const row = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, user_id: 'owner', name, description: `${name} description.`, category: 'Health', total_days: 7, is_public: false, is_active: true, image_url: null, ...over });
  return {
    profile: { id: 'owner', user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', specialties: [], social_links: {}, headline: 'Guidance', status: 'published' },
    protocols: [] as ReturnType<typeof row>[],
    row,
    owners: new Map<string, unknown>(),
    ownersGate: null as null | Promise<void>,
  };
});
const api = vi.hoisted(() => ({ protocolImpact: vi.fn(), deleteProtocol: vi.fn(), archiveProtocol: vi.fn(), restoreProtocol: vi.fn() }));
vi.mock('../../utils/guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  listGuideLeads: async () => [], listGuideRecipes: async () => [], listGuideOffers: async () => [], listGuideValueRamps: async () => [],
  listRoutineOwners: async () => { if (store.ownersGate) await store.ownersGate; return store.owners; },
  listPersonalProtocolPeople: async () => new Map(), getGuideProfileBySlug: async () => store.profile, listGuardianReviews: async () => [],
}));
vi.mock('../../utils/protocolAdmin', async (importOriginal) => ({
  ...await importOriginal<any>(),
  listProtocols: async () => [...store.protocols],
  listPublicProtocols: async () => store.protocols.filter((p) => p.is_public),
  ...api,
}));

const quiet = { name: 'x', isPublic: false, isSuggested: false, steps: 5, offers: 0, shareLink: false, adds: 0, copiedIntoParents: 0, attachedTo: 0, childPlans: 0, own: { active: 0, enabled: 0, pinned: 0, logs: 0 }, unreadable: false };
beforeEach(() => {
  window.history.replaceState({}, '', '/guardians/workspace?tab=protocols');
  store.protocols = [store.row('p1', 'Sleep reset'), store.row('p2', 'Gut plan', { is_public: true }), store.row('p3', 'Your Routine')];
  store.owners = new Map([['p3', { name: 'Test Guide', avatarUrl: null, relation: 'self' }]]);
  store.ownersGate = null;
  api.protocolImpact.mockReset().mockImplementation(async (_t: string, id: string) => ({ ...quiet, name: store.protocols.find((p) => p.id === id)?.name || '' }));
  api.deleteProtocol.mockReset().mockImplementation(async (_t: string, id: string) => { store.protocols = store.protocols.filter((p) => p.id !== id); });
  api.archiveProtocol.mockReset().mockImplementation(async (_t: string, id: string) => { store.protocols = store.protocols.map((p) => (p.id === id ? { ...p, is_active: false, is_public: false } : p)).filter((p) => p.is_active); });
  api.restoreProtocol.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
const open = async () => { render(<Workspace profile={store.profile as any} onProfile={() => {}} />); await screen.findByRole('heading', { level: 3, name: 'Sleep reset' }); };

it('your own protocols have Delete; your own and family routines do not', async () => {
  await open();
  await screen.findByRole('button', { name: 'Delete Sleep reset' });
  expect(screen.getByRole('button', { name: 'Delete Gut plan' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Delete Your Routine' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit Sleep reset' })).toBeTruthy();
});

it('Delete stays hidden until it is known which routines are yours', async () => {
  let release!: () => void;
  store.ownersGate = new Promise<void>((resolve) => { release = resolve; });
  await open();
  expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
  release();
  await screen.findByRole('button', { name: 'Delete Sleep reset' });
});

it('Archive takes the protocol out of the list, says so, and Undo puts it back', async () => {
  await open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Sleep reset' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete protocol' });
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Archive' }));
  const notice = await screen.findByText(/Archived “Sleep reset”/);
  expect(api.archiveProtocol).toHaveBeenCalledWith('tok', 'p1');
  expect(screen.queryByRole('heading', { level: 3, name: 'Sleep reset' })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(notice.closest('[role="status"]')); // the opener is gone, so focus goes to the notice
  store.protocols = [store.row('p1', 'Sleep reset'), ...store.protocols]; // what the database holds again after the restore
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(api.restoreProtocol).toHaveBeenCalledWith('tok', 'p1'));
  await screen.findByRole('heading', { level: 3, name: 'Sleep reset' });
  expect(screen.queryByText(/Archived “Sleep reset”/)).toBeNull();
});

it('Delete permanently needs the name, removes the card, and a published one also leaves the public list', async () => {
  await open();
  await waitFor(() => expect(screen.getAllByRole('heading', { level: 3, name: 'Gut plan' }).length).toBe(2)); // your list and "All public protocols"
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Gut plan' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete protocol' });
  const del = await within(dialog).findByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;
  expect(del.disabled).toBe(true);
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'gut plan' } });
  fireEvent.click(del);
  await screen.findByText(/Deleted “Gut plan”/);
  expect(api.deleteProtocol).toHaveBeenCalledWith('tok', 'p2');
  expect(screen.queryAllByRole('heading', { level: 3, name: 'Gut plan' })).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull(); // a delete cannot be undone
});

it('a cancelled dialog changes nothing', async () => {
  await open();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Sleep reset' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete protocol' });
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(api.archiveProtocol).not.toHaveBeenCalled();
  expect(api.deleteProtocol).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { level: 3, name: 'Sleep reset' })).toBeTruthy();
});

it('the cards say what each protocol is and who it is for, from data it actually has', async () => {
  store.protocols = [
    store.row('t1', 'Teen routine', { category: 'Hygiene', total_days: 1, target_gender: 'female', target_age_min: 13, target_age_max: 19 }),
    store.row('t2', 'Slow start', { is_public: true, category: 'Morning', tags: ['morning', 'Wellness'], total_days: 14, target_gender: null }),
    store.row('t3', 'Your Routine'),
  ];
  render(<Workspace profile={store.profile as any} onProfile={() => {}} />);
  await screen.findByRole('heading', { level: 3, name: 'Teen routine' });
  const cardOf = (title: string, kicker: RegExp) => screen.getAllByRole('heading', { level: 3, name: title }).map((h) => h.closest('.r3-pcard') as HTMLElement).find((c) => kicker.test(c.querySelector('.r3-pcard-kicker')!.textContent || ''))!;
  const tagsOf = (card: HTMLElement) => [...card.querySelectorAll('.r3-pcard-tag')].map((t) => t.textContent);
  // General list, already grouped by theme (the heading says Hygiene): who it is for only, and "1 day" not "1 days"
  const teen = cardOf('Teen routine', /Draft/);
  expect(teen.querySelector('.r3-pcard-kicker')!.textContent).toBe('1 day · Draft');
  expect(tagsOf(teen)).toEqual(['Women', 'Ages 13–19']);
  // Public list: the part of the day on the top line, the category from its tags, no audience made up
  const slow = cardOf('Slow start', /Public$/);
  expect(slow.querySelector('.r3-pcard-kicker')!.textContent).toBe('Morning · 14 days · Public');
  expect(tagsOf(slow)).toEqual(['Wellness']);
});

it('your own and your family\'s routines are cards with the app\'s default avatar for each person, or their own photo', async () => {
  store.protocols = [store.row('s1', 'Sleep reset'), store.row('m1', 'Your Routine'), store.row('m2', 'Your Routine'), store.row('m3', 'Your Routine'), store.row('m4', 'Your Routine'), store.row('m5', 'Your Routine')];
  store.owners = new Map<string, unknown>([
    ['m1', { name: 'John Ferreira', avatarUrl: null, relation: 'self', gender: 'male', age: 44 }],
    ['m2', { name: 'Pati Pirog', avatarUrl: null, relation: 'family', gender: 'female', age: 41 }],
    ['m3', { name: 'Zoe Ferreira', avatarUrl: null, relation: 'family', gender: 'female', age: 8 }],
    ['m4', { name: 'Sam', avatarUrl: null, relation: 'family', gender: null, age: null }],
    ['m5', { name: 'Kit', avatarUrl: 'https://example.com/kit.jpg', relation: 'family', gender: 'male', age: 9 }],
  ]);
  render(<Workspace profile={store.profile as any} onProfile={() => {}} />);
  await screen.findByRole('heading', { level: 3, name: 'John Ferreira’s routine' });
  const card = (name: string) => screen.getByRole('heading', { level: 3, name: name }).closest('.r3-pcard') as HTMLElement;
  const avatar = (name: string) => card(name).querySelector('.r3-pcard-plate-slot img')?.getAttribute('src');
  expect(avatar('John Ferreira’s routine')).toBe('/images/guides/avatars/member/man.png');
  expect(avatar('Pati Pirog’s routine')).toBe('/images/guides/avatars/member/woman.png');
  expect(avatar('Zoe Ferreira’s routine')).toBe('/images/guides/avatars/member/child-girl.png');
  expect(avatar('Sam’s routine')).toBe('/images/guides/avatars/member/neutral.png'); // no gender stated: not guessed
  // their own photo is the picture, with no avatar on a plate
  expect(avatar('Kit’s routine')).toBeUndefined();
  expect(card('Kit’s routine').querySelector('.r3-pcard-img')!.getAttribute('src')).toBe('https://example.com/kit.jpg');
  expect(card('John Ferreira’s routine').querySelector('.r3-pcard-kicker')!.textContent).toBe('You · 7 days · Draft');
  expect(card('Zoe Ferreira’s routine').querySelector('.r3-pcard-kicker')!.textContent).toBe('Family · 7 days · Draft');
  // no Delete on a person's own routine
  expect(screen.queryByRole('button', { name: /^Delete .*routine/ })).toBeNull();
});
