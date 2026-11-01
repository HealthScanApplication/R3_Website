// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

const mocks = vi.hoisted(() => ({ save: vi.fn(), brands: vi.fn(), upload: vi.fn(), profile: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfile: async () => mocks.profile(),
  listGuideBrands: async () => [],
  saveGuideProfile: mocks.save,
  replaceGuideBrands: mocks.brands,
  uploadGuideImage: mocks.upload,
}));

const ACCOUNT_AVATAR = 'https://lh3.example/account-photo.jpg';
const UPLOADED = 'https://cdn.example/guide-assets/owner/photo-2.webp';

beforeEach(() => {
  mocks.save.mockReset(); mocks.brands.mockReset(); mocks.upload.mockReset(); mocks.profile.mockReset(); mocks.profile.mockReturnValue(null);
  mocks.save.mockImplementation(async (row: any) => ({ ...row, status: row.status, onboarding_step: row.onboarding_step }));
  mocks.brands.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue(UPLOADED);
  window.history.replaceState({}, '', '/guardians/workspace?step=1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setup = (name = 'Test Guide', avatar: string | null = ACCOUNT_AVATAR) => render(<Onboarding userId="owner" accessToken="t" name={name} email="guide@example.com" accountAvatarUrl={avatar} onDone={() => {}} />);
const photos = () => screen.getByRole('region', { name: 'Your photos' });

describe('photo grid', () => {
  it('lives inside the profile image card, directly under its actions and above the collapsed style reference', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    const card = screen.getByRole('region', { name: 'R3 house style profile image' });
    expect(card.contains(photos())).toBe(true);
    const order = [...card.querySelectorAll('button, section[aria-label="Your photos"], details')];
    const createIndex = order.findIndex((el) => /Create my R3 house style/.test(el.textContent || '') && el.tagName === 'BUTTON');
    const gridIndex = order.indexOf(card.querySelector('section[aria-label="Your photos"]')!);
    const referenceIndex = order.indexOf(card.querySelector('details')!);
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(gridIndex).toBeGreaterThan(createIndex);
    expect(referenceIndex).toBeGreaterThan(gridIndex);
    expect((card.querySelector('details') as HTMLDetailsElement).open).toBe(false); // the style reference is collapsed
  });

  it('is a grid of four, the first being the avatar from their account email, with the rest empty and a nudge to add 2 to 4', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    const grid = photos();
    expect(within(grid).getByText(/add 2 to 4/i)).toBeTruthy();
    const first = within(grid).getByAltText('Your account photo') as HTMLImageElement;
    expect(first.getAttribute('src')).toBe(ACCOUNT_AVATAR);
    expect(within(grid).getByText('From your account')).toBeTruthy();
    for (const n of [2, 3, 4]) expect(within(grid).getByLabelText(`Add photo ${n}`)).toBeTruthy();
    expect(within(grid).queryByLabelText('Add photo 1')).toBeNull();
    expect(within(grid).getByText(/Add at least 2 real photos/)).toBeTruthy(); // only one so far
  });

  it('starts fully empty without an account photo, and fills a cell on upload until there are enough', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    const grid = photos();
    for (const n of [1, 2, 3, 4]) expect(within(grid).getByLabelText(`Add photo ${n}`)).toBeTruthy();
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    fireEvent.change(within(grid).getByLabelText('Add photo 1'), { target: { files: [file] } });
    await waitFor(() => expect(within(photos()).getByAltText('Photo 1')).toBeTruthy());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(within(photos()).getByText(/Add at least 2/)).toBeTruthy();
    fireEvent.change(within(photos()).getByLabelText('Add photo 2'), { target: { files: [new File(['y'], 'work.png', { type: 'image/png' })] } });
    await waitFor(() => expect(within(photos()).getByText(/2 of 4 added/)).toBeTruthy());
    fireEvent.click(within(photos()).getByRole('button', { name: 'Remove photo 2' }));
    await waitFor(() => expect(within(photos()).getByText(/Add at least 2/)).toBeTruthy());
  });

  it('rejects a file that is not an image', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    fireEvent.change(within(photos()).getByLabelText('Add photo 1'), { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('Choose a JPG, PNG, WebP or GIF image.')).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('save on every part of the flow', () => {
  it('has a Save on the profile image, on the photos and under the step', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    expect(within(screen.getByRole('region', { name: 'R3 house style profile image' })).getByRole('button', { name: 'Save profile image' })).toBeTruthy();
    expect(within(photos()).getByRole('button', { name: 'Save photos' })).toBeTruthy();
    expect(within(screen.getByLabelText('Save this step')).getByRole('button', { name: 'Save progress' })).toBeTruthy();
  });

  it('saves a draft with the photos and the step, never publishing, and says when it saved', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    fireEvent.click(within(photos()).getByRole('button', { name: 'Save photos' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const row = mocks.save.mock.calls[0][0];
    expect(row.user_id).toBe('owner');
    expect(row.status).toBe('draft'); // saving never submits or approves
    expect(row.onboarding_step).toBe(1);
    expect(JSON.parse(row.social_links.photos)).toEqual([ACCOUNT_AVATAR]);
    expect(row.display_name).toBe('Test Guide');
    await waitFor(() => expect(mocks.brands).toHaveBeenCalledTimes(1));
    expect((await within(photos()).findByRole('status')).textContent).toMatch(/^Saved/);
  });

  it('saves from the step bar with the same result, and keeps what was published', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    fireEvent.click(within(screen.getByLabelText('Save this step')).getByRole('button', { name: 'Save progress' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].status).toBe('draft');
  });

  it('will not save without a name, and says why', async () => {
    setup('', ACCOUNT_AVATAR);
    await screen.findByRole('region', { name: 'Your photos' });
    fireEvent.click(within(photos()).getByRole('button', { name: 'Save photos' }));
    expect((await within(photos()).findByRole('alert')).textContent).toMatch(/Add the name people should call you/);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('shows a failed save instead of pretending it worked', async () => {
    mocks.save.mockRejectedValue(new Error('Network down'));
    setup();
    await screen.findByDisplayValue('Test Guide');
    fireEvent.click(within(photos()).getByRole('button', { name: 'Save photos' }));
    expect((await within(photos()).findByRole('alert')).textContent).toBe('Network down');
  });
});

const LIVE_PROFILE = { user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', status: 'approved', onboarding_step: 5, social_links: {}, avatar_url: null, contact_email: 'guide@example.com' };
const addBrand = async () => { fireEvent.click(await screen.findByRole('button', { name: /add brand/i })); await screen.findByDisplayValue('New brand'); };
// The "Publishing as" chips read as an initial plus the name ("TTest Guide"); the sites filter has a chip with the bare name too.
const openBrand = (name: string) => fireEvent.click(screen.getAllByRole('button').find((button) => button.textContent === `${name[0]}${name}`)!);
const pickFile = (cell: string, name: string) => fireEvent.change(within(photos()).getByLabelText(cell), { target: { files: [new File(['x'], name, { type: 'image/png' })] } });

describe('photos belong to the selected brand', () => {
  it('a new business brand starts with an empty grid: no account photo, and it says whose photos they are', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    expect(within(photos()).getByAltText('Your account photo')).toBeTruthy();
    await addBrand();
    const grid = photos();
    expect(within(grid).queryByAltText('Your account photo')).toBeNull();
    for (const n of [1, 2, 3, 4]) expect(within(grid).getByLabelText(`Add photo ${n}`)).toBeTruthy();
    expect(within(grid).getByText('For New brand')).toBeTruthy();
  });

  it('keeps each brand\'s photos separate while switching between them', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    await addBrand();
    pickFile('Add photo 1', 'brand.png');
    await waitFor(() => expect(within(photos()).getByAltText('Photo 1')).toBeTruthy());
    expect(within(photos()).getByText(/1 of 4 added|Add at least 2/)).toBeTruthy();
    openBrand('Test Guide');
    await screen.findByDisplayValue('Test Guide');
    expect(within(photos()).getByAltText('Your account photo')).toBeTruthy(); // the personal brand's own
    expect(within(photos()).queryByAltText('Photo 1')).toBeNull(); // not the other brand's upload
    openBrand('New brand');
    await screen.findByDisplayValue('New brand');
    expect(within(photos()).getByAltText('Photo 1')).toBeTruthy(); // and it is still there
  });
});

describe('a draft save cannot change who they publish as', () => {
  it('keeps the live public url and status when the name is edited, and saves the photos', async () => {
    mocks.profile.mockReturnValue(LIVE_PROFILE);
    setup('Renamed Guide');
    await waitFor(() => expect(screen.getByDisplayValue('Renamed Guide')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(within(photos()).getByRole('button', { name: 'Save photos' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const row = mocks.save.mock.calls[0][0];
    expect(row.slug).toBe('test-guide'); // not renamed to "renamed-guide"
    expect(row.status).toBe('approved'); // a save never un-publishes
  });

  it('saving while a business brand is open leaves the profile row alone and keeps the personal brand primary', async () => {
    mocks.profile.mockReturnValue(LIVE_PROFILE);
    setup();
    await screen.findByDisplayValue('Test Guide');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await addBrand();
    fireEvent.click(within(photos()).getByRole('button', { name: 'Save photos' }));
    await waitFor(() => expect(mocks.brands).toHaveBeenCalledTimes(1));
    expect(mocks.save).not.toHaveBeenCalled(); // no rename, no new slug, no photos written over the profile
    const brands = mocks.brands.mock.calls[0][1] as Array<{ name: string; kind: string; is_primary: boolean; social_links: Record<string, string> }>;
    expect(brands.filter((brand) => brand.is_primary).map((brand) => brand.kind)).toEqual(['personal']);
    expect(brands.find((brand) => brand.name === 'New brand')!.is_primary).toBe(false);
    expect(JSON.parse(brands.find((brand) => brand.kind === 'personal')!.social_links.photos)).toEqual([ACCOUNT_AVATAR]);
  });

  it('asks for the personal profile to be saved first when there is no profile yet', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    await addBrand();
    fireEvent.click(within(photos()).getByRole('button', { name: 'Save photos' }));
    expect((await within(photos()).findByRole('alert')).textContent).toMatch(/Save your personal profile first/);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.brands).not.toHaveBeenCalled();
  });
});
