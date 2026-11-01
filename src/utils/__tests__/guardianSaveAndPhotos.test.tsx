// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';

const mocks = vi.hoisted(() => ({ save: vi.fn(), brands: vi.fn(), upload: vi.fn(), profile: vi.fn(), imported: vi.fn(), mono: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({
  ...await importOriginal<any>(),
  getGuideProfile: async () => mocks.profile(),
  listGuideBrands: async () => [],
  saveGuideProfile: mocks.save,
  replaceGuideBrands: mocks.brands,
  uploadGuideImage: mocks.upload,
  importGuideProfile: mocks.imported,
}));
// jsdom has no canvas, so the logo shape is faked; the real work is covered in brandLogo.test.ts.
vi.mock('../brandLogo', async (importOriginal) => ({ ...await importOriginal<any>(), createMonoLogo: mocks.mono }));

const ACCOUNT_AVATAR = 'https://lh3.example/account-photo.jpg';
const UPLOADED = 'https://cdn.example/guide-assets/owner/photo-2.webp';

beforeEach(() => {
  mocks.save.mockReset(); mocks.brands.mockReset(); mocks.upload.mockReset(); mocks.profile.mockReset(); mocks.profile.mockReturnValue(null); mocks.imported.mockReset(); mocks.mono.mockReset(); mocks.mono.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
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

const IMPORTED = (extra: object = {}) => ({ name: 'Brand', headline: '', bio: '', avatarUrl: null, sources: [], images: [], logos: [], relatedProfiles: [], topics: [], ...extra });
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const serveImage = (url: string) => vi.stubGlobal('fetch', vi.fn(async (input: any) => (String(input) === url
  ? ({ ok: true, status: 200, blob: async () => new Blob([PNG_BYTES], { type: 'image/png' }) } as Response)
  : ({ ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response))));
const pullIn = async (label: string, link: string) => {
  fireEvent.change(within(panel()).getByLabelText(label), { target: { value: link } });
  fireEvent.click(within(panel()).getByRole('button', { name: 'Pull in' }));
};

describe('pull in from a link', () => {
  it('finds the images on a page and adds the one they choose to their photos', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    mocks.imported.mockResolvedValue(IMPORTED({ images: [{ url: 'https://site.example/me.jpg', sourceUrl: 'https://site.example', kind: 'avatar' }] }));
    serveImage('https://site.example/me.jpg');
    await pullIn('Pull in a photo from a link', 'site.example');
    expect(mocks.imported).toHaveBeenCalledWith(['https://site.example'], 't'); // the missing https:// is added
    const found = await within(panel()).findByRole('list', { name: 'Images found' });
    fireEvent.click(within(found).getByRole('button', { name: 'Add to photos' }));
    await waitFor(() => expect(within(photos()).getByAltText('Photo 1')).toBeTruthy());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it('says what to do when the site does not let its pictures be copied', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    mocks.imported.mockResolvedValue(IMPORTED({ images: [{ url: 'https://site.example/me.jpg', sourceUrl: 'https://site.example', kind: 'avatar' }] }));
    vi.stubGlobal('fetch', vi.fn(async (input: any) => { if (String(input) === 'https://site.example/me.jpg') throw new TypeError('Failed to fetch'); return { ok: true, status: 200, json: async () => [], text: async () => '[]' } as Response; }));
    await pullIn('Pull in a photo from a link', 'https://site.example');
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Add to photos' }));
    expect((await within(panel()).findByText(/does not let us copy its images/))).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('reports a link with nothing on it', async () => {
    setup('Test Guide', null);
    await screen.findByDisplayValue('Test Guide');
    mocks.imported.mockResolvedValue(IMPORTED());
    await pullIn('Pull in a photo from a link', 'https://empty.example');
    expect(await within(panel()).findByText(/No images were found/)).toBeTruthy();
  });
});

describe('a company brand uses a black-on-transparent logo instead of a portrait', () => {
  it('shows the logo version of the card: its own heading, actions and no portrait house style', async () => {
    setup();
    await screen.findByDisplayValue('Test Guide');
    await addBrand();
    const card = panel();
    expect(within(card).getByText(/Logo · black on transparent required/)).toBeTruthy();
    expect(Array.from(card.querySelector('[data-image-actions]')!.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Make logo black on transparent', 'Upload logo']);
    expect(within(card).queryByText(/Create my R3 house style/)).toBeNull();
    expect(within(card).getByLabelText('Pull in your logo from your website')).toBeTruthy();
    expect(card.querySelector('[data-logo-tiles]')).not.toBeNull();
  });

  it('pulls the logo from their website, makes it black on transparent, counts it as done and shows it white on the dark card', async () => {
    mocks.upload.mockResolvedValue('https://cdn.example/guide-assets/owner/logo-mono-1730000000000.png');
    setup();
    await screen.findByDisplayValue('Test Guide');
    await addBrand();
    mocks.imported.mockResolvedValue(IMPORTED({ logos: [{ url: 'https://brand.example/logo.png', sourceUrl: 'https://brand.example', kind: 'logo' }] }));
    serveImage('https://brand.example/logo.png');
    await pullIn('Pull in your logo from your website', 'https://brand.example');
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Use as logo' }));
    await waitFor(() => expect(within(panel()).getByText(/Logo · black on transparent done/)).toBeTruthy());
    expect(mocks.mono).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][2]).toBe('logo-mono'); // named so the page knows to invert it
    const dark = within(panel()).getByAltText('Your logo on a dark page') as HTMLImageElement;
    expect(dark.style.filter).toBe('invert(1)');
    expect((within(panel()).getByAltText('Your logo on a light page') as HTMLImageElement).style.filter).toBe('');
  });

  it('turns an uploaded logo file straight into the black-on-transparent version, accepting a small one', async () => {
    mocks.upload.mockResolvedValue('https://cdn.example/guide-assets/owner/logo-mono-1730000000001.png');
    setup();
    await screen.findByDisplayValue('Test Guide');
    await addBrand();
    const input = document.querySelector('[data-testid="photo-input"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png('logo.png')] } });
    await waitFor(() => expect(within(panel()).getByText(/Logo · black on transparent done/)).toBeTruthy());
    expect(mocks.mono).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1); // only the finished logo is stored, not the raw file too
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
