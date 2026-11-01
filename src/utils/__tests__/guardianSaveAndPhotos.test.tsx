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
const photos = () => screen.getByRole('figure', { name: 'Your photos' });
const panel = () => screen.getByRole('region', { name: 'R3 house style profile image' });
/** A file whose first bytes are a real PNG signature, which is what the image validator checks (the decode is skipped in jsdom). */
const png = (name: string) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], name, { type: 'image/png' });

describe('photo grid', () => {
  it('sits at the top of the profile image card as a two-by-two block beside the house style, above the actions and the collapsed style reference', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    const card = screen.getByRole('region', { name: 'R3 house style profile image' });
    expect(card.contains(photos())).toBe(true);
    const quad = photos();
    expect(quad.hasAttribute('data-photo-quad')).toBe(true);
    // The photos and the house-style slot are the two cells of the top row.
    const slot = within(card).getByLabelText('Your R3 house style will appear here');
    expect(quad.parentElement).toBe(slot.closest('figure')!.parentElement);
    const order = [...card.querySelectorAll('button, figure[aria-label="Your photos"], details')];
    const createIndex = order.findIndex((el) => /Create my R3 house style/.test(el.textContent || '') && el.tagName === 'BUTTON');
    const gridIndex = order.indexOf(quad);
    const referenceIndex = order.indexOf(card.querySelector('details')!);
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(gridIndex).toBeLessThan(createIndex);
    expect(referenceIndex).toBeGreaterThan(createIndex);
    expect((card.querySelector('details') as HTMLDetailsElement).open).toBe(false); // the style reference is collapsed
  });

  it('is a grid of four, the first being the avatar from their account email, with the rest empty and a nudge to add 2 to 4', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    const grid = photos();
    expect(within(grid).getByText(/1 of 4/)).toBeTruthy();
    const first = within(grid).getByAltText('Your account photo') as HTMLImageElement;
    expect(first.getAttribute('src')).toBe(ACCOUNT_AVATAR);
    for (const n of [2, 3, 4]) expect(within(grid).getByLabelText(`Add photo ${n}`)).toBeTruthy();
    expect(within(grid).queryByLabelText('Add photo 1')).toBeNull();
    expect(within(grid).getByText(/Add at least 2 real photos/)).toBeTruthy(); // only one so far
  });

  it('starts fully empty without an account photo, and fills a cell on upload until there are enough', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    const grid = photos();
    for (const n of [1, 2, 3, 4]) expect(within(grid).getByLabelText(`Add photo ${n}`)).toBeTruthy();
    const file = png('me.png');
    fireEvent.change(within(grid).getByLabelText('Add photo 1'), { target: { files: [file] } });
    await waitFor(() => expect(within(photos()).getByAltText('Photo 1')).toBeTruthy());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(within(photos()).getByText(/Add at least 2/)).toBeTruthy();
    fireEvent.change(within(photos()).getByLabelText('Add photo 2'), { target: { files: [png('work.png')] } });
    await waitFor(() => expect(within(photos()).getByText(/2 of 4/)).toBeTruthy());
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

describe('image validator on the profile image card', () => {
  it('rejects a file that is named like a photo but is not one, and shows why inside the card without uploading', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    const fake = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0])], 'cv.png', { type: 'image/png' });
    fireEvent.change(within(photos()).getByLabelText('Add photo 1'), { target: { files: [fake] } });
    expect((await within(panel()).findByRole('alert')).textContent).toBe('Choose a JPG, PNG, WebP or GIF image.');
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('keeps the good photos from a mixed pick and names the one it refused', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    const fake = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0])], 'cv.png', { type: 'image/png' });
    fireEvent.change(within(photos()).getByLabelText('Add photo 1'), { target: { files: [png('me.png'), fake] } });
    await waitFor(() => expect(within(photos()).getByAltText('Photo 1')).toBeTruthy());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(within(panel()).getByRole('alert').textContent).toMatch(/^cv\.png: Choose a JPG/);
  });

  it('lays the actions out as one pair of buttons, one Save and one line of requirements', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    const card = panel();
    const actions = card.querySelector('[data-image-actions]')!;
    expect(Array.from(actions.querySelectorAll('button')).map((button) => button.textContent)).toEqual(['Create my R3 house style', 'Replace photo']);
    expect(within(card).getAllByRole('button', { name: 'Save' })).toHaveLength(1);
    expect(card.querySelector('[data-image-footer]')!.textContent).toMatch(/at least 600 px.*8 MB/);
    expect(card.textContent).not.toMatch(/Save photos|Save profile image|or drag a photo here/);
  });
});

describe('save on every part of the flow', () => {
  it('has one Save on the profile image card (covering the photos) and one under the step', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    expect(within(panel()).getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(within(screen.getByLabelText('Save this step')).getByRole('button', { name: 'Save progress' })).toBeTruthy();
  });

  it('saves a draft with the photos and the step, never publishing, and says when it saved', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const row = mocks.save.mock.calls[0][0];
    expect(row.user_id).toBe('owner');
    expect(row.status).toBe('draft'); // saving never submits or approves
    expect(row.onboarding_step).toBe(1);
    expect(JSON.parse(row.social_links.photos)).toEqual([ACCOUNT_AVATAR]);
    expect(row.display_name).toBe('Test Guide');
    await waitFor(() => expect(mocks.brands).toHaveBeenCalledTimes(1));
    expect((await within(panel()).findByRole('status')).textContent).toMatch(/^Saved/);
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
    await screen.findByRole('figure', { name: 'Your photos' });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    expect((await within(panel()).findByRole('alert')).textContent).toMatch(/Add the name people should call you/);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('shows a failed save instead of pretending it worked', async () => {
    mocks.save.mockRejectedValue(new Error('Network down'));
    setup();
    await screen.findByDisplayValue('Test Guide');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    expect((await within(panel()).findByRole('alert')).textContent).toBe('Network down');
  });
});

const LIVE_PROFILE = { user_id: 'owner', slug: 'test-guide', display_name: 'Test Guide', status: 'approved', onboarding_step: 5, social_links: {}, avatar_url: null, contact_email: 'guide@example.com' };
const addBrand = async () => { fireEvent.click(await screen.findByRole('button', { name: /add brand/i })); await screen.findByDisplayValue('New brand'); };
// The "Publishing as" chips read as an initial plus the name ("TTest Guide"); the sites filter has a chip with the bare name too.
const openBrand = (name: string) => fireEvent.click(screen.getAllByRole('button').find((button) => button.textContent === `${name[0]}${name}`)!);
const pickFile = (cell: string, name: string) => fireEvent.change(within(photos()).getByLabelText(cell), { target: { files: [png(name)] } });

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
    setup('Renamed Guide', null); // no account photo: the profile keeps a house avatar, which a live page requires
    await waitFor(() => expect(screen.getByDisplayValue('Renamed Guide')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const row = mocks.save.mock.calls[0][0];
    expect(row.slug).toBe('test-guide'); // not renamed to "renamed-guide"
    expect(row.status).toBe('approved'); // a save never un-publishes
  });

  it('a live page will not save a profile image that is not in the R³ house style, and says why', async () => {
    mocks.profile.mockReturnValue(LIVE_PROFILE);
    setup('Test Guide'); // the account photo is a plain photo
    await waitFor(() => expect(screen.getByDisplayValue('Test Guide')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    expect((await screen.findAllByText(/must be in the R³ house style/)).length).toBeGreaterThan(0);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('saving while a business brand is open leaves the profile row alone and keeps the personal brand primary', async () => {
    mocks.profile.mockReturnValue(LIVE_PROFILE);
    setup();
    await screen.findByDisplayValue('Test Guide');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await addBrand();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
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
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }));
    expect((await within(panel()).findByRole('alert')).textContent).toMatch(/Save your personal profile first/);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.brands).not.toHaveBeenCalled();
  });
});
