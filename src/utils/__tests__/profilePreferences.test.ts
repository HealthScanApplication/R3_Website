import { describe, expect, it, vi } from 'vitest';
import { loadProfilePreferences, saveProfilePreferences } from '../profilePreferences';

function client(result: { error?: { message: string } | null; data?: unknown } = {}) {
  const upsert = vi.fn(async () => ({ error: result.error ?? null }));
  const maybeSingle = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ upsert, select }));
  return { c: { from } as any, upsert, from, select, eq };
}

describe('saving the Profile page preferences', () => {
  const prefs = { fullName: ' Barbara O\'Neill ', allergies: ['nuts'], units: 'metric', profilePictureUrl: 'https://x/y.png' };
  it('upserts the person\'s own row with their preferences, a trimmed name and no photo or role', async () => {
    const { c, upsert, from } = client();
    await saveProfilePreferences(c, { id: 'u-1', email: 'barbara@routine3.com' }, prefs);
    expect(from).toHaveBeenCalledWith('user_profiles');
    const [row, options] = upsert.mock.calls[0] as unknown as [Record<string, any>, { onConflict: string }];
    expect(row).toMatchObject({ id: 'u-1', email: 'barbara@routine3.com', full_name: 'Barbara O\'Neill' });
    expect(row.preferences).toMatchObject({ allergies: ['nuts'], units: 'metric' });
    expect(row.preferences.profilePictureUrl).toBeUndefined();
    expect(typeof row.preferences.lastSyncedAt).toBe('string');
    expect(Object.keys(row)).not.toContain('role');
    expect(options).toEqual({ onConflict: 'id' });
  });
  it('leaves the name empty rather than saving blanks', async () => {
    const { c, upsert } = client();
    await saveProfilePreferences(c, { id: 'u-1', email: 'a@b.co' }, { fullName: '   ' });
    expect((upsert.mock.calls[0] as unknown as [Record<string, unknown>])[0].full_name).toBeNull();
  });
  it('reports the server\'s refusal', async () => {
    const { c } = client({ error: { message: 'permission denied for table user_profiles' } });
    await expect(saveProfilePreferences(c, { id: 'u-1', email: 'a@b.co' }, {})).rejects.toThrow('permission denied for table user_profiles');
  });
  it('needs an email, because the profile row requires one', async () => {
    const { c, upsert } = client();
    await expect(saveProfilePreferences(c, { id: 'u-1', email: null }, {})).rejects.toThrow(/email/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('loading the saved preferences', () => {
  it('returns the stored preferences with the stored photo', async () => {
    const { c, eq } = client({ data: { preferences: { units: 'metric' }, avatar_url: 'https://x/y.png' } });
    expect(await loadProfilePreferences(c, 'u-1')).toEqual({ units: 'metric', profilePictureUrl: 'https://x/y.png' });
    expect(eq).toHaveBeenCalledWith('id', 'u-1');
  });
  it('returns null when nothing is stored, or the read fails, so the page keeps its local copy', async () => {
    expect(await loadProfilePreferences(client({ data: { preferences: {}, avatar_url: null } }).c, 'u-1')).toBeNull();
    expect(await loadProfilePreferences(client().c, 'u-1')).toBeNull();
    expect(await loadProfilePreferences(client({ error: { message: 'boom' } }).c, 'u-1')).toBeNull();
  });
});
