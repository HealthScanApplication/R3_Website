// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
const refreshSession = vi.hoisted(() => vi.fn(async () => undefined));
const db = vi.hoisted(() => {
  const upload = vi.fn(async (..._a: unknown[]) => ({ error: null as null | { message: string } }));
  const remove = vi.fn(async (..._a: unknown[]) => ({ error: null }));
  const upsert = vi.fn(async (..._a: unknown[]) => ({ error: null as null | { message: string } }));
  const updateUser = vi.fn(async (..._a: unknown[]) => ({ error: null }));
  const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  const client = {
    storage: { from: vi.fn(() => ({ upload, remove, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/profile-avatars/${p}` } }) })) },
    from: vi.fn(() => ({ upsert, select: () => ({ eq: () => ({ maybeSingle }) }) })),
    auth: { updateUser },
  };
  return { upload, remove, upsert, updateUser, maybeSingle, client };
});

vi.mock('sonner', () => ({ toast }));
// One stable object: the page re-runs its load effect whenever `user` changes identity, so a fresh object per render would loop.
const signedIn = vi.hoisted(() => ({ user: { id: 'u-1', email: 'barbara@routine3.com', user_metadata: {}, created_at: '2026-10-27T00:00:00Z' } }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: signedIn.user, refreshSession }),
}));
vi.mock('../supabase/client', () => ({ getSupabaseClient: () => db.client }));

import { ProfilePage } from '../../components/ProfilePage';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '404 Not Found' }) as Response));
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function openPhotoPopup(container: HTMLElement) {
  const camera = await waitFor(() => { const b = container.querySelector('button[class*="-bottom-2"]'); if (!b) throw new Error('camera button not rendered yet'); return b as HTMLElement; });
  fireEvent.click(camera);
  return screen.getByRole('button', { name: /upload photo/i });
}

describe('Profile page photo and save', () => {
  it('the Upload Photo button opens the file chooser', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const { container } = render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    fireEvent.click(await openPhotoPopup(container));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('a chosen photo is stored in the person\'s own folder and recorded on their account and profile, with no server route', async () => {
    const { container } = render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    await openPhotoPopup(container);
    const input = container.querySelectorAll('input[data-testid="photo-input"]')[1] as HTMLInputElement; // the popup's; the avatar has its own
    const file = new File([new Uint8Array(100)], 'me.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile picture updated successfully!'));
    expect((db.upload.mock.calls[0] as unknown[])[0]).toMatch(/^u-1\/avatar-\d+\.png$/);
    expect(db.updateUser).toHaveBeenCalledWith({ data: { avatar_url: expect.stringContaining('/profile-avatars/u-1/') } });
    expect((db.upsert.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 'u-1', email: 'barbara@routine3.com' });
    expect(refreshSession).toHaveBeenCalled();
    const routes = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(routes.some((u) => /upload-profile-picture|remove-profile-picture|update-user-profile/.test(u))).toBe(false);
  });

  it('a photo dropped on the avatar is uploaded', async () => {
    const { container } = render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    const avatarZone = await waitFor(() => { const el = container.querySelector('[class*="avatar-with-hover-effects"]')?.parentElement?.parentElement; if (!el) throw new Error('avatar not rendered yet'); return el as HTMLElement; });
    const file = new File([new Uint8Array(100)], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.drop(avatarZone, { dataTransfer: { files: [file], types: ['Files'] } });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile picture updated successfully!'));
    expect((db.upload.mock.calls[0] as unknown[])[0]).toMatch(/^u-1\/avatar-\d+\.jpg$/);
  });

  it('a file that is not an image is refused with a message and nothing is uploaded', async () => {
    const { container } = render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    await openPhotoPopup(container);
    const input = container.querySelectorAll('input[data-testid="photo-input"]')[1] as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], 'x.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/JPG, PNG, WebP or GIF/)));
    expect(db.upload).not.toHaveBeenCalled();
  });

  it('Save Preferences writes the person\'s profile row and reports success (it answered 404 before)', async () => {
    render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /save preferences/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Preferences saved and synced successfully!'));
    const row = (db.upsert.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(row).toMatchObject({ id: 'u-1', email: 'barbara@routine3.com' });
    expect(row.preferences).toBeTruthy();
    expect(Object.keys(row)).not.toContain('role');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('when the server refuses, the person is told and what they typed is kept on this device', async () => {
    db.upsert.mockResolvedValueOnce({ error: { message: 'permission denied for table user_profiles' } });
    render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /save preferences/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('permission denied for table user_profiles')));
    expect(localStorage.getItem('healthscan_user_preferences')).toBeTruthy();
  });

  it('an account copy that arrives after the person started typing does not overwrite what they typed', async () => {
    let resolveLoad: (value: unknown) => void = () => undefined;
    db.maybeSingle.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }) as never);
    render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    const name = (await screen.findByLabelText('Full Name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Typed By Me' } });
    resolveLoad({ data: { preferences: { fullName: 'Saved Name', units: 'metric' }, avatar_url: null }, error: null });
    await waitFor(() => expect(db.maybeSingle).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    await waitFor(() => expect(db.upsert).toHaveBeenCalled());
    const saved = ((db.upsert.mock.calls[0] as unknown[])[0] as Record<string, any>).preferences;
    expect(saved.fullName).toBe('Typed By Me'); // the edit survived the late load
    expect(saved.units).toBe('metric');          // a field they did not touch took the account value
    expect(name.value).toBe('Typed By Me');
  });

  it('a photo removed on another device clears the one this device had cached', async () => {
    localStorage.setItem('healthscan_user_preferences', JSON.stringify({ profilePictureUrl: 'https://x.supabase.co/storage/v1/object/public/profile-avatars/u-1/old.png' }));
    let resolveLoad: (value: unknown) => void = () => undefined;
    db.maybeSingle.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }) as never);
    const { container } = render(<ProfilePage user={{}} onNavigateToSettings={() => undefined} />);
    await openPhotoPopup(container);
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeTruthy(); // the cached photo is what the page shows first
    resolveLoad({ data: { preferences: {}, avatar_url: null }, error: null });
    await waitFor(() => expect(screen.queryByRole('button', { name: /remove photo/i })).toBeNull());
  });
});
