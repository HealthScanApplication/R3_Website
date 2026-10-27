import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A signed-in person's profile photo.
 *
 * The photo goes straight from the browser to storage under the person's own session: the `profile-avatars` bucket lets a
 * signed-in user write only under a folder named after their own id, and anyone may read. There is no server route in
 * between, and nothing here trusts a user id sent in a request body. The public URL is then written to
 * `user_profiles.avatar_url` and to the account's `avatar_url` metadata, which is where the Profile page and the Guardian
 * portal both read it.
 */
export const PROFILE_PHOTO_BUCKET = 'profile-avatars';
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export const PROFILE_PHOTO_ACCEPT = Object.keys(EXTENSIONS).join(',');

/** A message for the person when the file cannot be used, or null when it can. */
export function validateProfilePhoto(file: { type: string; size: number }): string | null {
  if (!EXTENSIONS[file.type]) return 'Choose a JPG, PNG, WebP or GIF image.';
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return 'The image must be smaller than 5 MB.';
  return null;
}

/** The storage path a photo is written to: the person's own folder first, which is what the bucket's policy checks. */
export function profilePhotoPath(userId: string, file: { type: string }, now = Date.now()): string {
  return `${userId}/avatar-${now}.${EXTENSIONS[file.type] ?? 'jpg'}`;
}

/** Uploads the photo and returns its public URL. Throws a readable error. */
export async function uploadProfilePhoto(client: SupabaseClient, userId: string, file: File): Promise<string> {
  const problem = validateProfilePhoto(file);
  if (problem) throw new Error(problem);
  const path = profilePhotoPath(userId, file);
  const { error } = await client.storage.from(PROFILE_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message || 'The photo could not be uploaded.');
  return client.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Records the photo (or its removal, with null) on the account and on the person's profile row. */
export async function saveProfilePhotoUrl(client: SupabaseClient, user: { id: string; email?: string | null }, url: string | null): Promise<void> {
  const { error: accountError } = await client.auth.updateUser({ data: { avatar_url: url } });
  if (accountError) throw new Error(accountError.message || 'The photo could not be saved to your account.');
  if (!user.email) return;
  // `role` is deliberately absent: an upsert that names only these columns leaves a stored role untouched.
  const { error } = await client.from('user_profiles').upsert({ id: user.id, email: user.email, avatar_url: url, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw new Error(error.message || 'The photo could not be saved to your profile.');
}

/** Deletes a stored photo when it is one of this person's own in the bucket. Best effort: a leftover file is harmless. */
export async function removeStoredProfilePhoto(client: SupabaseClient, userId: string, url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marker = `/${PROFILE_PHOTO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return;
  const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
  if (!path.startsWith(`${userId}/`)) return;
  await client.storage.from(PROFILE_PHOTO_BUCKET).remove([path]).catch(() => undefined);
}
