import { describe, expect, it, vi } from 'vitest';
import { PROFILE_PHOTO_BUCKET, profilePhotoPath, removeStoredProfilePhoto, saveProfilePhotoUrl, uploadProfilePhoto, validateProfilePhoto } from '../profilePhoto';

const file = (type: string, size = 1000, name = 'p') => new File([new Uint8Array(size)], name, { type });

function fakeClient(over: { uploadError?: string; upsertError?: string; updateUserError?: string } = {}) {
  const upload = vi.fn(async () => ({ error: over.uploadError ? { message: over.uploadError } : null }));
  const remove = vi.fn(async () => ({ error: null }));
  const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${PROFILE_PHOTO_BUCKET}/${path}` } }));
  const storageFrom = vi.fn(() => ({ upload, remove, getPublicUrl }));
  const upsert = vi.fn(async () => ({ error: over.upsertError ? { message: over.upsertError } : null }));
  const from = vi.fn(() => ({ upsert }));
  const updateUser = vi.fn(async () => ({ error: over.updateUserError ? { message: over.updateUserError } : null }));
  return { client: { storage: { from: storageFrom }, from, auth: { updateUser } } as any, upload, remove, upsert, from, updateUser, storageFrom };
}

describe('profile photo rules', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])('accepts %s', (type) => expect(validateProfilePhoto(file(type))).toBeNull());
  it.each(['application/pdf', 'video/mp4', 'image/svg+xml', ''])('refuses %s with a readable message', (type) => expect(validateProfilePhoto(file(type))).toMatch(/JPG, PNG, WebP or GIF/));
  it('refuses an image over 5 MB and accepts exactly 5 MB', () => {
    expect(validateProfilePhoto({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/smaller than 5 MB/);
    expect(validateProfilePhoto({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
  });
  it('writes under the person\'s own folder first, which is what the bucket policy checks', () => {
    expect(profilePhotoPath('u-1', { type: 'image/png' }, 5)).toBe('u-1/avatar-5.png');
    expect(profilePhotoPath('u-1', { type: 'image/gif' }, 5)).toBe('u-1/avatar-5.gif');
  });
});

describe('uploading a profile photo', () => {
  it('uploads to profile-avatars in the user\'s own folder and returns the public URL', async () => {
    const { client, upload, storageFrom } = fakeClient();
    const url = await uploadProfilePhoto(client, 'u-1', file('image/png'));
    expect(storageFrom).toHaveBeenCalledWith('profile-avatars');
    const [path, , options] = upload.mock.calls[0] as unknown as [string, File, { upsert: boolean; contentType: string }];
    expect(path.startsWith('u-1/avatar-')).toBe(true);
    expect(options).toMatchObject({ contentType: 'image/png', upsert: false });
    expect(url).toContain(`/profile-avatars/${path}`);
  });
  it('refuses a bad file before touching storage', async () => {
    const { client, upload } = fakeClient();
    await expect(uploadProfilePhoto(client, 'u-1', file('application/pdf'))).rejects.toThrow(/JPG, PNG, WebP or GIF/);
    expect(upload).not.toHaveBeenCalled();
  });
  it('turns a storage error into a readable one', async () => {
    const { client } = fakeClient({ uploadError: 'new row violates row-level security policy' });
    await expect(uploadProfilePhoto(client, 'u-1', file('image/png'))).rejects.toThrow('new row violates row-level security policy');
  });
});

describe('recording the photo', () => {
  it('writes the account metadata and the profile row, and never names role', async () => {
    const { client, updateUser, upsert, from } = fakeClient();
    await saveProfilePhotoUrl(client, { id: 'u-1', email: 'a@b.co' }, 'https://x/y.png');
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar_url: 'https://x/y.png' } });
    expect(from).toHaveBeenCalledWith('user_profiles');
    const row = (upsert.mock.calls[0] as unknown as [Record<string, unknown>, { onConflict: string }])[0];
    expect(row).toMatchObject({ id: 'u-1', email: 'a@b.co', avatar_url: 'https://x/y.png' });
    expect(Object.keys(row)).not.toContain('role');
    expect((upsert.mock.calls[0] as unknown as [unknown, { onConflict: string }])[1]).toEqual({ onConflict: 'id' });
  });
  it('clears the photo with null', async () => {
    const { client, updateUser, upsert } = fakeClient();
    await saveProfilePhotoUrl(client, { id: 'u-1', email: 'a@b.co' }, null);
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar_url: null } });
    expect((upsert.mock.calls[0] as unknown as [Record<string, unknown>])[0].avatar_url).toBeNull();
  });
  it('surfaces a failed profile write', async () => {
    const { client } = fakeClient({ upsertError: 'permission denied' });
    await expect(saveProfilePhotoUrl(client, { id: 'u-1', email: 'a@b.co' }, 'https://x/y.png')).rejects.toThrow('permission denied');
  });
});

describe('removing a stored photo', () => {
  const own = `https://x.supabase.co/storage/v1/object/public/profile-avatars/u-1/avatar-9.png?t=1`;
  it('deletes the person\'s own file', async () => {
    const { client, remove } = fakeClient();
    await removeStoredProfilePhoto(client, 'u-1', own);
    expect(remove).toHaveBeenCalledWith(['u-1/avatar-9.png']);
  });
  it('never deletes someone else\'s file, another bucket\'s file, or a URL from elsewhere', async () => {
    const { client, remove } = fakeClient();
    await removeStoredProfilePhoto(client, 'u-2', own);
    await removeStoredProfilePhoto(client, 'u-1', 'https://x.supabase.co/storage/v1/object/public/guide-assets/u-1/profile-1.png');
    await removeStoredProfilePhoto(client, 'u-1', 'https://example.com/me.png');
    await removeStoredProfilePhoto(client, 'u-1', null);
    expect(remove).not.toHaveBeenCalled();
  });
});
