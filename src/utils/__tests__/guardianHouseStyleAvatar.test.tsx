// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Onboarding } from '../../components/guides/GuidePortal';
import { HOUSE_STYLE_UNAVAILABLE, convertGuardianAvatar, generatedImageFile, houseStyleErrorMessage } from '../guardianImages';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: mocks.invoke } }) }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...await importOriginal<any>(), uploadGuideImage: mocks.upload }));

const OWN_PORTRAIT = 'https://cdn.example/guide-assets/owner/profile-1.png';
const REAL_IMAGE = 'data:image/webp;base64,UklGRg==';
const MOCK_IMAGE = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>')}`;
const httpError = (status: number, body: Record<string, unknown>) => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status, json: async () => body } }) });

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.upload.mockReset();
  mocks.upload.mockResolvedValue('https://cdn.example/guide-assets/owner/profile-2.webp');
  window.history.replaceState({}, '', '/guardians/workspace?step=1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }) as Response));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const setup = (accountAvatarUrl: string | null) => render(<Onboarding userId="owner" accessToken="t" name="Test Guide" email="guide@example.com" accountAvatarUrl={accountAvatarUrl} onDone={() => {}} />);
const toggle = () => screen.getByRole('button', { name: /house style/i });
const open = async (accountAvatarUrl: string | null) => {
  setup(accountAvatarUrl);
  await screen.findByDisplayValue('Test Guide');
  fireEvent.click(toggle());
  return screen.getByRole('region', { name: 'R3 house style profile image' });
};

describe('R3 house style panel', () => {
  it('toggles an inline panel with a large Before and After example and real alt text', async () => {
    setup(null);
    await screen.findByDisplayValue('Test Guide');
    const button = toggle();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'R3 house style profile image' })).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: 'R3 house style profile image' });
    expect(document.getElementById(button.getAttribute('aria-controls')!)!.contains(panel)).toBe(true);
    const images = within(panel).getAllByRole('img') as HTMLImageElement[];
    expect(images.map((image) => image.getAttribute('src'))).toEqual(['/images/guides/house-style/example-before.webp', '/images/guides/house-style/example-after.webp']);
    for (const image of images) expect((image.getAttribute('alt') || '').length).toBeGreaterThan(30); // a real description, not a label
    expect(within(panel).getByText('Before')).toBeTruthy();
    expect(within(panel).getByText('After')).toBeTruthy();
    expect(within(panel).getAllByText('Example').length).toBe(2);
    expect(panel.textContent).toMatch(/black and white/);
    expect(panel.textContent).toMatch(/no retouching/);
    // The pair is two responsive squares that stack on a phone.
    expect(panel.querySelector('div[style*="minmax(200px"]')).toBeTruthy();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'R3 house style profile image' })).toBeNull();
  });

  it('asks for a photo instead of converting a stock avatar, and opens the file picker', async () => {
    const panel = await open(null); // no account photo: the stock Guardian avatar is the portrait
    const picker = screen.getByTestId('photo-input') as HTMLInputElement;
    const opened = vi.spyOn(picker, 'click').mockImplementation(() => {});
    expect(within(panel).queryByRole('button', { name: 'Create my R3 house style' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Upload your photo to create yours' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('treats a stock avatar saved on the account the same way', async () => {
    const panel = await open('/images/guides/avatars/woman.png');
    expect(within(panel).getByRole('button', { name: 'Upload your photo to create yours' })).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Create my R3 house style' })).toBeNull();
  });

  it('converts their own portrait and shows their before and after with the three actions', async () => {
    mocks.invoke.mockResolvedValue({ data: { image: REAL_IMAGE, usd: 0.04, mock: false, size: '1024x1024' }, error: null });
    const panel = await open(OWN_PORTRAIT);
    fireEvent.click(within(panel).getByRole('button', { name: 'Create my R3 house style' }));
    expect(await within(panel).findByRole('button', { name: 'Use this avatar' })).toBeTruthy();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith('guardian-images', { body: { action: 'convert-avatar', image_url: OWN_PORTRAIT, name: 'Test Guide', source: 'house' } });
    const images = within(panel).getAllByRole('img') as HTMLImageElement[];
    // Their pair first, then the house-style example kept beside it as the target to compare against.
    expect(images.map((image) => image.getAttribute('src'))).toEqual([OWN_PORTRAIT, REAL_IMAGE, '/images/guides/house-style/example-before.webp', '/images/guides/house-style/example-after.webp']);
    expect(within(panel).getByText('Original')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(within(panel).getByLabelText('The R3 house style to aim for')).toBeTruthy();
    expect(within(panel).getAllByText('Example').length).toBe(2);
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(within(panel).getByRole('button', { name: 'Create my R3 house style' })).toBeTruthy(); // back to the example view
    expect(within(panel).getAllByText('Example').length).toBe(2);
  });

  it('shows a busy state while the conversion runs', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.invoke.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const panel = await open(OWN_PORTRAIT);
    fireEvent.click(within(panel).getByRole('button', { name: 'Create my R3 house style' }));
    const busy = await within(panel).findByRole('button', { name: /Creating your portrait/ });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    finish({ data: { image: REAL_IMAGE, usd: 0, mock: false, size: '1024x1024' }, error: null });
    expect(await within(panel).findByRole('button', { name: 'Use this avatar' })).toBeTruthy();
  });

  it('maps "Unknown action." to a friendly message inside the panel, as an alert', async () => {
    mocks.invoke.mockResolvedValue(httpError(400, { error: 'Unknown action.' }));
    const panel = await open(OWN_PORTRAIT);
    fireEvent.click(within(panel).getByRole('button', { name: 'Create my R3 house style' }));
    const alert = await within(panel).findByRole('alert');
    expect(alert.textContent).toBe('R3 house style is not available on this server yet. Please try again shortly.');
    expect(panel.textContent).not.toMatch(/Unknown action/);
    expect(screen.queryByText(/Unknown action/)).toBeNull(); // and not in the far-away import line either
    // The button is usable again, so they can retry.
    expect((within(panel).getByRole('button', { name: 'Create my R3 house style' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps other server messages untouched', async () => {
    mocks.invoke.mockResolvedValue(httpError(429, { error: "You've used today's 10 R³ images. Connect your own OpenAI key for more." }));
    const panel = await open(OWN_PORTRAIT);
    fireEvent.click(within(panel).getByRole('button', { name: 'Create my R3 house style' }));
    expect((await within(panel).findByRole('alert')).textContent).toBe("You've used today's 10 R³ images. Connect your own OpenAI key for more.");
  });

  it('labels a test-mode result as a test image and will not let it be saved', async () => {
    mocks.invoke.mockResolvedValue({ data: { image: MOCK_IMAGE, usd: 0, mock: true, size: '1024x1024' }, error: null });
    const panel = await open(OWN_PORTRAIT);
    fireEvent.click(within(panel).getByRole('button', { name: 'Create my R3 house style' }));
    const apply = (await within(panel).findByRole('button', { name: 'Use this avatar' })) as HTMLButtonElement;
    expect(within(panel).getByText('Test image')).toBeTruthy();
    expect(panel.textContent).toMatch(/Live image generation is currently in test mode/);
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect((within(panel).getByRole('button', { name: 'Try again' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lets a real result be applied as the avatar and closes the panel', async () => {
    mocks.invoke.mockResolvedValue({ data: { image: REAL_IMAGE, usd: 0.04, mock: false, size: '1024x1024' }, error: null });
    const panel = await open(OWN_PORTRAIT);
    fireEvent.click(within(panel).getByRole('button', { name: 'Create my R3 house style' }));
    const apply = (await within(panel).findByRole('button', { name: 'Use this avatar' })) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    expect(within(panel).queryByText('Test image')).toBeNull();
    fireEvent.click(apply);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [userId, file] = mocks.upload.mock.calls[0] as [string, File];
    expect(userId).toBe('owner');
    expect(file.type).toBe('image/webp');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'R3 house style profile image' })).toBeNull());
    expect(screen.getByText('R³ house-style avatar applied.')).toBeTruthy();
  });

  it('shows a failed save inside the panel and keeps the result', async () => {
    mocks.invoke.mockResolvedValue({ data: { image: REAL_IMAGE, usd: 0.04, mock: false, size: '1024x1024' }, error: null });
    mocks.upload.mockRejectedValue(new Error('Storage is unavailable.'));
    const panel = await open(OWN_PORTRAIT);
    fireEvent.click(within(panel).getByRole('button', { name: 'Create my R3 house style' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Use this avatar' }));
    expect((await within(panel).findByRole('alert')).textContent).toBe('Storage is unavailable.');
    expect(within(panel).getByRole('button', { name: 'Use this avatar' })).toBeTruthy();
  });
});

describe('guardianImages helpers', () => {
  it('maps a missing or older function to the friendly text and nothing else', () => {
    expect(houseStyleErrorMessage(new Error('Unknown action.'))).toBe(HOUSE_STYLE_UNAVAILABLE);
    expect(houseStyleErrorMessage(new Error('unknown action'))).toBe(HOUSE_STYLE_UNAVAILABLE);
    expect(houseStyleErrorMessage(Object.assign(new Error('Edge Function returned a non-2xx status code'), { status: 404 }))).toBe(HOUSE_STYLE_UNAVAILABLE);
    expect(houseStyleErrorMessage(new Error('Requested function was not found'))).toBe(HOUSE_STYLE_UNAVAILABLE);
    expect(houseStyleErrorMessage(new Error('Connect your OpenAI key first.'))).toBe('Connect your OpenAI key first.');
    expect(houseStyleErrorMessage(new Error('Sign in to create images.'))).toBe('Sign in to create images.');
    expect(HOUSE_STYLE_UNAVAILABLE).not.toMatch(/—/);
  });

  it('maps a 404 from the function even when the body has no message', async () => {
    mocks.invoke.mockResolvedValue(httpError(404, {}));
    await expect(convertGuardianAvatar(OWN_PORTRAIT, 'Test')).rejects.toThrow(HOUSE_STYLE_UNAVAILABLE);
  });

  it('refuses the test-mode SVG before it reaches storage, which is why apply is disabled', async () => {
    const file = generatedImageFile(MOCK_IMAGE);
    expect(file.type).toBe('image/svg+xml');
    const { uploadGuideImage } = await vi.importActual<typeof import('../guidePortal')>('../guidePortal');
    await expect(uploadGuideImage('owner', file)).rejects.toThrow(/Choose a JPG, PNG, WebP/);
  });
});
