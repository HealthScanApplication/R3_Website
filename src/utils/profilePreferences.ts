import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A signed-in person's Profile page preferences, kept on their own `user_profiles` row (the `preferences` column).
 *
 * This replaces a call to a server route that was not in the deployed function (every Save answered 404). It runs under the
 * person's own session, so the row-level policy ("Users can access their own profile": id = auth.uid()) decides what may be
 * written, and nothing here sends a user id for a server to trust. `role` is never written: an upsert that names only the
 * columns below leaves a stored role as it is.
 */
export type StoredPreferences = Record<string, unknown>;

export async function saveProfilePreferences(
  client: SupabaseClient,
  user: { id: string; email?: string | null },
  preferences: StoredPreferences,
): Promise<void> {
  if (!user.email) throw new Error('Your account has no email address to save a profile against.');
  const { profilePictureUrl: _photo, ...rest } = preferences; // the photo lives in avatar_url, written when it changes
  const fullName = typeof rest.fullName === 'string' && rest.fullName.trim() ? rest.fullName.trim() : null;
  const { error } = await client.from('user_profiles').upsert(
    { id: user.id, email: user.email, full_name: fullName, preferences: { ...rest, lastSyncedAt: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message || 'The server did not accept the preferences.');
}

/**
 * The saved preferences, or null when there is no profile row yet or it cannot be read (the page then keeps its local copy).
 * When the row exists its photo is always stated: `profilePictureUrl` is '' when the photo was removed, so a device that still
 * holds the old URL clears it instead of keeping a deleted file.
 */
export async function loadProfilePreferences(client: SupabaseClient, userId: string): Promise<StoredPreferences | null> {
  const { data, error } = await client.from('user_profiles').select('preferences, avatar_url').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const preferences = (data.preferences && typeof data.preferences === 'object' ? data.preferences : {}) as StoredPreferences;
  return { ...preferences, profilePictureUrl: data.avatar_url ?? '' };
}
