import { getSupabaseClient } from './supabase/client';
import { projectId, publicAnonKey } from './supabase/info';
import { LIBRARY_AUDIO_MIME_TYPES, type GuideLibraryKind, type GuideLibraryMetadata } from './guideLibrarySources';

export type GuideStatus = 'draft' | 'submitted' | 'approved' | 'paused';

export interface GuideProfile {
  user_id: string;
  slug: string;
  display_name: string;
  headline: string;
  bio: string;
  avatar_url: string | null;
  contact_email: string;
  whatsapp_phone: string;
  social_links: Record<string, string>;
  specialties: string[];
  status: GuideStatus;
  commission_percent: number;
  onboarding_step: number;
}

export interface GuideLead {
  id: string;
  guide_id: string;
  name: string;
  email: string;
  goal: string | null;
  stage: 'new' | 'contacted' | 'client' | 'closed';
  created_at: string;
}

export interface GuideOffer {
  id: string;
  guide_id: string;
  kind: 'lead_magnet' | 'ebook' | 'recipe_book' | 'routine' | 'routine_guidance' | 'one_to_one_call' | 'group_call' | 'community' | 'in_person' | 'journey' | 'festival' | 'team_program' | 'product' | 'program';
  title: string;
  description: string | null;
  cover_url?: string | null;
  price_cents: number;
  currency: string;
  affiliate_url: string | null;
  access_model: 'free' | 'paid';
  file_path: string | null;
  booking_url: string | null;
  status: 'draft' | 'published';
}

export interface GuideCommunityChannel {
  id: string;
  offer_id: string;
  guide_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export interface GuideCommunityMessage {
  id: string;
  channel_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface GuideRecipe {
  id: string;
  guide_id: string;
  title: string;
  description: string | null;
  meal_slot: string | null;
  ingredients: unknown[];
  instructions: unknown[];
  status: 'draft' | 'submitted' | 'published';
  image_url?: string | null;
  servings?: number | null;
  prep_time?: number | null;
  cook_time?: number | null;
  nutrition_per_serving?: Record<string, unknown> | null;
  nutrition_total?: Record<string, unknown> | null;
  offer_ids?: string[];
  catalog_recipe_id?: string | null;
  parent_protocol_id?: string | null;
}

export interface GuideValueRamp {
  id: string;
  guide_id: string;
  name: string;
  slug: string;
  audience: string;
  problem: string;
  offer_ids: string[];
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
}

export interface GuideBrand {
  id?: string;
  guide_id: string;
  name: string;
  kind: 'personal' | 'business';
  logo_url: string | null;
  contact_email: string;
  whatsapp_phone: string;
  website_url: string;
  social_links: Record<string, string>;
  language: string;
  pricing_region: string;
  currency: string;
  is_primary: boolean;
}

export type { GuideLibraryKind, GuideLibraryMetadata };

export interface GuideLibraryFolder {
  id: string;
  guide_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GuideLibraryItem {
  id: string;
  guide_id: string;
  folder_id: string | null;
  kind: GuideLibraryKind;
  title: string;
  source_url: string | null;
  file_path: string | null;
  transcript: string | null;
  /** Book, podcast, paper and audio details; empty for older kinds. */
  metadata?: GuideLibraryMetadata | null;
  created_at: string;
  updated_at: string;
}

export interface ImportedGuideProfile {
  name: string;
  headline: string;
  bio: string;
  avatarUrl: string | null;
  sources: { url: string; site: string }[];
  images: { url: string; sourceUrl: string; kind: 'avatar' | 'page' }[];
  relatedProfiles: { url: string; label: string; platform: string }[];
  topics: string[];
}

export async function uploadGuideImage(userId: string, file: File): Promise<string> {
  const isGif = file.type === 'image/gif';
  const isImage = isGif || /^image\/(?:jpeg|png|webp)$/.test(file.type);
  const isVideo = /^video\/(?:mp4|webm)$/.test(file.type);
  if (!isImage && !isVideo) throw new Error('Choose a JPG, PNG, WebP, GIF, MP4, or WebM file.');
  // Animated GIFs run larger than stills; videos and GIFs share the bucket's 25 MB ceiling.
  const sizeLimit = isVideo ? 25 : isGif ? 15 : 8;
  if (file.size > sizeLimit * 1024 * 1024) throw new Error(`${isVideo ? 'Video' : isGif ? 'GIF' : 'Image'} must be smaller than ${sizeLimit} MB.`);
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : isGif ? 'gif' : file.type === 'video/mp4' ? 'mp4' : file.type === 'video/webm' ? 'webm' : 'jpg';
  const path = `${userId}/profile-${Date.now()}.${extension}`;
  const { error } = await db().storage.from('guide-assets').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return db().storage.from('guide-assets').getPublicUrl(path).data.publicUrl;
}

export async function uploadGuideFile(userId: string, file: File): Promise<string> {
  const allowed = ['application/pdf', 'application/epub+zip', 'application/zip'];
  if (!allowed.includes(file.type)) throw new Error('Choose a PDF, EPUB, or ZIP file.');
  if (file.size > 50 * 1024 * 1024) throw new Error('File must be smaller than 50 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const path = `${userId}/offer-${Date.now()}.${extension}`;
  const { error } = await db().storage.from('guide-files').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadGuideLibraryAudio(userId: string, file: File): Promise<string> {
  if (!LIBRARY_AUDIO_MIME_TYPES.includes(file.type)) throw new Error('Choose an MP3, M4A, WAV, AAC, OGG or WebM audio file.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Audio must be smaller than 50 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
  const path = `${userId}/library-${Date.now()}.${extension}`;
  const { error } = await db().storage.from('guide-files').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

const db = () => getSupabaseClient();

export async function importGuideProfile(urls: string[], accessToken: string): Promise<ImportedGuideProfile> {
  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/guides/import-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publicAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ urls }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not import that public profile');
  return payload.profile as ImportedGuideProfile;
}

export async function getGuideProfile(userId: string): Promise<GuideProfile | null> {
  const { data, error } = await db().from('guide_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as GuideProfile | null;
}

export async function getGuideProfileBySlug(slug: string): Promise<GuideProfile | null> {
  const { data, error } = await db().from('guide_profiles').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data as GuideProfile | null;
}

export async function listPublicGuideProfiles(): Promise<GuideProfile[]> {
  const { data, error } = await db().from('guide_profiles')
    .select('user_id,slug,display_name,headline,bio,avatar_url,contact_email,whatsapp_phone,social_links,specialties,status,commission_percent,onboarding_step')
    .eq('status', 'approved')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return (data || []) as GuideProfile[];
}

export interface GuardianSuggestion {
  guardian_type: string;
  name: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
  note?: string;
  suggester_email?: string;
}

/** Public "suggest a Guardian" submission (anon insert-only, see guardian_suggestions migration). */
export async function submitGuardianSuggestion(suggestion: GuardianSuggestion): Promise<void> {
  const clean = Object.fromEntries(Object.entries(suggestion).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]));
  const { error } = await db().from('guardian_suggestions').insert(clean);
  if (error) throw error;
}

export async function saveGuideProfile(profile: Partial<GuideProfile> & { user_id: string }): Promise<GuideProfile> {
  const { data, error } = await db().from('guide_profiles').upsert(profile, { onConflict: 'user_id' }).select().single();
  if (error) throw error;
  return data as GuideProfile;
}

export async function listGuideLeads(userId: string): Promise<GuideLead[]> {
  const { data, error } = await db().from('guide_leads').select('*').eq('guide_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GuideLead[];
}

export async function createGuideLead(guideId: string, lead: Pick<GuideLead, 'name' | 'email' | 'goal'>): Promise<GuideLead> {
  const { data, error } = await db().from('guide_leads').insert({ guide_id: guideId, ...lead }).select().single();
  if (error) throw error;
  return data as GuideLead;
}

export async function updateGuideLead(guideId: string, id: string, lead: Partial<Pick<GuideLead, 'name' | 'email' | 'goal' | 'stage'>>): Promise<GuideLead> {
  const { data, error } = await db().from('guide_leads').update(lead).eq('id', id).eq('guide_id', guideId).select().single();
  if (error) throw error;
  return data as GuideLead;
}

export async function deleteGuideLead(guideId: string, id: string): Promise<void> {
  const { error } = await db().from('guide_leads').delete().eq('id', id).eq('guide_id', guideId);
  if (error) throw error;
}

/** Public opt-in from a Guardian mini-site. Insert-only: visitors cannot read leads back. */
export async function submitGuardianOptIn(guideId: string, lead: { name: string; email: string; goal: string | null; marketingConsent: boolean; consentText: string; sourceOfferId?: string | null; valueRampId?: string | null }): Promise<void> {
  const { error } = await db().from('guide_leads').insert({
    guide_id: guideId,
    name: lead.name.trim(),
    email: lead.email.trim().toLowerCase(),
    goal: lead.goal,
    marketing_consent: lead.marketingConsent,
    consent_text: lead.marketingConsent ? lead.consentText : null,
    consent_at: lead.marketingConsent ? new Date().toISOString() : null,
    source_offer_id: lead.sourceOfferId || null,
    value_ramp_id: lead.valueRampId || null,
  });
  if (error) throw error;
}

/**
 * Whose routine is each protocol? The app creates a personal "Your Routine" per family profile
 * (user_active_protocol.profile_id → family_profiles; null profile = the account's main user).
 * Returns protocol id → that person's name and avatar, so routines can be labelled by owner.
 */
/** Whose routine it is: their name, their own photo if the app saved one a browser can load, and what the default avatar is chosen from (age, gender, relation). */
export interface RoutineOwner { name: string; avatarUrl: string | null; relation: string | null; gender?: string | null; age?: number | null }
export async function listRoutineOwners(userId: string, mainName: string, mainAvatar?: string | null): Promise<Map<string, RoutineOwner>> {
  const owners = new Map<string, RoutineOwner>();
  // Avatars saved by the app can be device paths (file:///var/mobile/...); only web URLs load here.
  const webUrl = (url?: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
  const profilesWith = (columns: string) => db().from('family_profiles').select(columns).eq('owner_id', userId);
  const [{ data: active }, withFacts] = await Promise.all([
    db().from('user_active_protocol').select('protocol_id,profile_id').eq('user_id', userId),
    profilesWith('id,name,avatar_url,is_main_user,relation,age,gender'),
  ]);
  // A database without the age and gender columns still names everyone, it just cannot say who is a child.
  const { data: profiles } = withFacts.error ? await profilesWith('id,name,avatar_url,is_main_user,relation') : withFacts;
  const byId = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
  const main = (profiles || []).find((profile: any) => profile.is_main_user);
  for (const row of (active || []) as { protocol_id: string; profile_id: string | null }[]) {
    const profile: any = row.profile_id ? byId.get(row.profile_id) : main;
    owners.set(row.protocol_id, { name: profile?.name || mainName, avatarUrl: webUrl(profile?.avatar_url) || (row.profile_id ? null : webUrl(mainAvatar)), relation: row.profile_id ? (profile?.is_main_user ? 'self' : profile?.relation || 'family') : 'self', gender: profile?.gender ?? null, age: typeof profile?.age === 'number' ? profile.age : null });
  }
  return owners;
}

export async function listGuideOffers(userId: string): Promise<GuideOffer[]> {
  const { data, error } = await db().from('guide_offers').select('*').eq('guide_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GuideOffer[];
}

export async function createGuideOffer(guideId: string, offer: Pick<GuideOffer, 'kind' | 'title' | 'description' | 'price_cents' | 'affiliate_url' | 'access_model' | 'file_path' | 'booking_url'> & Partial<Pick<GuideOffer, 'currency' | 'status'>>): Promise<GuideOffer> {
  const { data, error } = await db().from('guide_offers').insert({ guide_id: guideId, ...offer }).select().single();
  if (error) throw error;
  return data as GuideOffer;
}

export async function getOfferCommunityChannel(guideId: string, offerId: string): Promise<GuideCommunityChannel | null> {
  const { data, error } = await db().from('guide_community_channels').select('*').eq('guide_id', guideId).eq('offer_id', offerId).maybeSingle();
  if (error) throw error;
  return data as GuideCommunityChannel | null;
}

export async function saveOfferCommunityChannel(guideId: string, offerId: string, input: { name: string; slug: string; description?: string | null }): Promise<GuideCommunityChannel> {
  const row = { guide_id: guideId, offer_id: offerId, name: input.name.trim(), slug: input.slug.trim(), description: input.description?.trim() || null };
  const { data, error } = await db().from('guide_community_channels').upsert(row, { onConflict: 'offer_id' }).select().single();
  if (error) throw error;
  return data as GuideCommunityChannel;
}

export async function getCommunityChannelByRoute(guardianSlug: string, channelSlug: string): Promise<GuideCommunityChannel | null> {
  const { data: guide, error: guideError } = await db().from('guide_profiles').select('user_id').eq('slug', guardianSlug).eq('status', 'approved').maybeSingle();
  if (guideError) throw guideError;
  if (!guide) return null;
  const { data, error } = await db().from('guide_community_channels').select('*').eq('guide_id', guide.user_id).eq('slug', channelSlug).maybeSingle();
  if (error) throw error;
  return data as GuideCommunityChannel | null;
}

export async function joinGuideCommunity(channelId: string, userId: string): Promise<void> {
  const { error } = await db().from('guide_community_members').upsert({ channel_id: channelId, user_id: userId }, { onConflict: 'channel_id,user_id' });
  if (error) throw error;
}

export async function isGuideCommunityMember(channelId: string, userId: string): Promise<boolean> {
  const { data, error } = await db().from('guide_community_members').select('channel_id').eq('channel_id', channelId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listGuideCommunityMessages(channelId: string): Promise<GuideCommunityMessage[]> {
  const { data, error } = await db().from('guide_community_messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return (data || []) as GuideCommunityMessage[];
}

export async function postGuideCommunityMessage(channelId: string, userId: string, authorName: string, body: string): Promise<GuideCommunityMessage> {
  const { data, error } = await db().from('guide_community_messages').insert({ channel_id: channelId, user_id: userId, author_name: authorName.trim().slice(0, 80) || 'Member', body: body.trim() }).select().single();
  if (error) throw error;
  return data as GuideCommunityMessage;
}

type GuideOfferInput = Pick<GuideOffer, 'kind' | 'title' | 'description' | 'price_cents' | 'affiliate_url' | 'access_model' | 'file_path' | 'booking_url'> & Partial<Pick<GuideOffer, 'currency' | 'status'>>;

/** Update the given offer when an id is passed, otherwise create it. Lets republishing reuse offers. */
export async function upsertGuideOffer(guideId: string, offer: GuideOfferInput, existingId?: string | null): Promise<GuideOffer> {
  if (!existingId) return createGuideOffer(guideId, offer);
  const { data, error } = await db().from('guide_offers').update(offer).eq('id', existingId).eq('guide_id', guideId).select().single();
  if (error) throw error;
  return data as GuideOffer;
}

export async function deleteGuideOffer(guideId: string, id: string): Promise<void> {
  const { error } = await db().from('guide_offers').delete().eq('id', id).eq('guide_id', guideId);
  if (error) throw error;
}

/** Create or update an offer path by slug, with its offers in funnel order. */
export async function upsertGuideValueRamp(guideId: string, ramp: Pick<GuideValueRamp, 'name' | 'slug' | 'audience' | 'problem' | 'offer_ids' | 'status'>): Promise<GuideValueRamp> {
  const { data, error } = await db().from('guide_value_ramps').upsert({ guide_id: guideId, ...ramp }, { onConflict: 'guide_id,slug' }).select().single();
  if (error) throw error;
  return data as GuideValueRamp;
}

export async function listGuideValueRamps(userId: string): Promise<GuideValueRamp[]> {
  const { data, error } = await db().from('guide_value_ramps').select('*').eq('guide_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GuideValueRamp[];
}

export async function createGuideValueRamp(guideId: string, ramp: Pick<GuideValueRamp, 'name' | 'slug' | 'audience' | 'problem'>): Promise<GuideValueRamp> {
  const { data, error } = await db().from('guide_value_ramps').insert({ guide_id: guideId, ...ramp }).select().single();
  if (error) throw error;
  return data as GuideValueRamp;
}

export async function updateGuideValueRamp(guideId: string, id: string, ramp: Partial<Pick<GuideValueRamp, 'name' | 'audience' | 'problem' | 'offer_ids' | 'status'>>): Promise<GuideValueRamp> {
  const { data, error } = await db().from('guide_value_ramps').update(ramp).eq('id', id).eq('guide_id', guideId).select().single();
  if (error) throw error;
  return data as GuideValueRamp;
}

export async function deleteGuideValueRamp(guideId: string, id: string): Promise<void> {
  const { error } = await db().from('guide_value_ramps').delete().eq('id', id).eq('guide_id', guideId);
  if (error) throw error;
}

/** The Guardian's saved brands (personal first, then business brands), each with its own brand kit in social_links. */
export async function listGuideBrands(guideId: string): Promise<GuideBrand[]> {
  const { data, error } = await db().from('guide_brands').select('*').eq('guide_id', guideId);
  if (error) throw error;
  return ((data || []) as GuideBrand[]).sort((a, b) => Number(b.kind === 'personal') - Number(a.kind === 'personal') || a.name.localeCompare(b.name));
}

export async function replaceGuideBrands(guideId: string, brands: Omit<GuideBrand, 'id' | 'guide_id'>[]): Promise<GuideBrand[]> {
  const { error: deleteError } = await db().from('guide_brands').delete().eq('guide_id', guideId);
  if (deleteError) throw deleteError;
  const { data, error } = await db().from('guide_brands').insert(brands.map((brand) => ({ ...brand, guide_id: guideId }))).select();
  if (error) throw error;
  return (data || []) as GuideBrand[];
}

export async function listGuideRecipes(userId: string): Promise<GuideRecipe[]> {
  const { data, error } = await db().from('guide_recipes').select('*').eq('guide_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GuideRecipe[];
}

export async function createGuideRecipe(guideId: string, recipe: Pick<GuideRecipe, 'title' | 'description' | 'meal_slot'>): Promise<GuideRecipe> {
  const { data, error } = await db().from('guide_recipes').insert({ guide_id: guideId, ...recipe }).select().single();
  if (error) throw error;
  return data as GuideRecipe;
}

const RECIPE_NUTRITION_COLUMNS = ['servings', 'prep_time', 'cook_time', 'nutrition_per_serving', 'nutrition_total', 'offer_ids'] as const;

/** Save a full AI-built recipe. If the nutrition columns migration is not applied yet, saves the core fields only. */
export async function saveGuideRecipeDraft(guideId: string, recipe: Omit<GuideRecipe, 'id' | 'guide_id' | 'status'> & { status?: GuideRecipe['status'] }, id?: string): Promise<{ recipe: GuideRecipe; savedNutrition: boolean }> {
  const write = (row: Record<string, unknown>) => id ? db().from('guide_recipes').update(row).eq('id', id).select().single() : db().from('guide_recipes').insert({ guide_id: guideId, status: 'draft', ...row }).select().single();
  // The retried write can come back as a one-row array rather than an object; normalise both.
  const one = (data: unknown) => (Array.isArray(data) ? data[0] : data) as GuideRecipe;
  const { data, error } = await write(recipe);
  if (!error) return { recipe: one(data), savedNutrition: true };
  if (!/column|schema cache/i.test(error.message)) throw error;
  const core = Object.fromEntries(Object.entries(recipe).filter(([key]) => !(RECIPE_NUTRITION_COLUMNS as readonly string[]).includes(key)));
  const retry = await write(core);
  if (retry.error) throw retry.error;
  return { recipe: one(retry.data), savedNutrition: false };
}

export async function updateGuideRecipe(id: string, recipe: Partial<Pick<GuideRecipe, 'title' | 'description' | 'meal_slot' | 'ingredients' | 'instructions' | 'status'>>): Promise<GuideRecipe> {
  const { data, error } = await db().from('guide_recipes').update(recipe).eq('id', id).select().single();
  if (error) throw error;
  return data as GuideRecipe;
}

export async function deleteGuideRecipe(guideId: string, id: string): Promise<void> {
  const { error } = await db().from('guide_recipes').delete().eq('id', id).eq('guide_id', guideId);
  if (error) throw error;
}

export async function listGuideLibraryFolders(guideId: string): Promise<GuideLibraryFolder[]> {
  const { data, error } = await db().from('guide_library_folders').select('*').eq('guide_id', guideId).order('name');
  if (error) throw error;
  return (data || []) as GuideLibraryFolder[];
}

export async function createGuideLibraryFolder(guideId: string, name: string): Promise<GuideLibraryFolder> {
  const { data, error } = await db().from('guide_library_folders').insert({ guide_id: guideId, name }).select().single();
  if (error) throw error;
  return data as GuideLibraryFolder;
}

export async function updateGuideLibraryFolder(guideId: string, id: string, name: string): Promise<GuideLibraryFolder> {
  const { data, error } = await db().from('guide_library_folders').update({ name }).eq('id', id).eq('guide_id', guideId).select().single();
  if (error) throw error;
  return data as GuideLibraryFolder;
}

export async function deleteGuideLibraryFolder(guideId: string, id: string): Promise<void> {
  const { error } = await db().from('guide_library_folders').delete().eq('id', id).eq('guide_id', guideId);
  if (error) throw error;
}

export async function listGuideLibraryItems(guideId: string): Promise<GuideLibraryItem[]> {
  const { data, error } = await db().from('guide_library_items').select('*').eq('guide_id', guideId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GuideLibraryItem[];
}

export async function createGuideLibraryItem(guideId: string, item: Pick<GuideLibraryItem, 'folder_id' | 'kind' | 'title' | 'source_url' | 'file_path' | 'transcript' | 'metadata'>): Promise<GuideLibraryItem> {
  // Older kinds leave metadata out so they keep saving before the metadata column exists.
  const { metadata, ...row } = item;
  const { data, error } = await db().from('guide_library_items').insert({ guide_id: guideId, ...row, ...(metadata && Object.keys(metadata).length ? { metadata } : {}) }).select().single();
  if (error) throw error;
  return data as GuideLibraryItem;
}

export async function updateGuideLibraryItem(guideId: string, id: string, item: Partial<Pick<GuideLibraryItem, 'folder_id' | 'title' | 'source_url' | 'transcript' | 'metadata'>>): Promise<GuideLibraryItem> {
  const { data, error } = await db().from('guide_library_items').update(item).eq('id', id).eq('guide_id', guideId).select().single();
  if (error) throw error;
  return data as GuideLibraryItem;
}

export async function deleteGuideLibraryItem(id: string): Promise<void> {
  const { error } = await db().from('guide_library_items').delete().eq('id', id);
  if (error) throw error;
}

export async function getGuideFileDownloadUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from('guide-files').createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export type GuardianReview = { id: string; guide_id: string; reviewer_name: string; rating: number; body: string; status: 'published' | 'hidden'; created_at: string };
export type GuardianReviewRequest = { token: string; guide_id: string; customer_email: string | null; customer_name: string | null; discount_code: string; used_at: string | null; created_at: string };

export async function listGuardianReviews(guideId: string): Promise<GuardianReview[]> {
  const { data, error } = await db().from('guardian_reviews').select('*').eq('guide_id', guideId).order('created_at', { ascending: false }).limit(40);
  if (error) throw error;
  return (data || []) as GuardianReview[];
}

export async function setGuardianReviewStatus(id: string, status: GuardianReview['status']): Promise<void> {
  const { error } = await db().from('guardian_reviews').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function listGuardianReviewRequests(guideId: string): Promise<GuardianReviewRequest[]> {
  const { data, error } = await db().from('guardian_review_requests').select('*').eq('guide_id', guideId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GuardianReviewRequest[];
}

export async function createGuardianReviewRequest(guideId: string, request: { customer_email?: string; customer_name?: string; discount_code: string }): Promise<GuardianReviewRequest> {
  const { data, error } = await db().from('guardian_review_requests').insert({ guide_id: guideId, customer_email: request.customer_email?.trim() || null, customer_name: request.customer_name?.trim() || null, discount_code: request.discount_code }).select().single();
  if (error) throw error;
  return data as GuardianReviewRequest;
}

/** Submits a review through a one-time link; resolves to the thank-you discount code. */
export async function submitGuardianReview(token: string, review: { name: string; rating: number; body: string }): Promise<string> {
  const { data, error } = await db().rpc('submit_guardian_review', { p_token: token, p_name: review.name, p_rating: review.rating, p_body: review.body });
  if (error) throw error;
  return String(data || '');
}

// Real payments (platform Stripe account) through the guardian-payments edge function.
export type PaymentIntentResult = { purchase_id: string; client_secret: string | null; amount_cents: number; currency?: string; status?: 'paid' | 'pending' | 'failed' | 'requires_action'; discount_code?: string | null };
async function callPayments<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke('guardian-payments', { body });
  if (error) {
    let message = error.message;
    try { const detail = await (error as any).context?.json?.(); if (detail?.error) message = detail.error; } catch { /* keep default */ }
    throw new Error(message || 'Payment failed.');
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}
export const createOfferPayment = (offerId: string, email: string, name?: string) => callPayments<PaymentIntentResult>({ action: 'intent', offer_id: offerId, email, name });
export const confirmOfferPayment = (purchaseId: string) => callPayments<{ status: PaymentIntentResult['status']; discount_ends_at?: number }>({ action: 'confirm', purchase_id: purchaseId });
export const buyUpsellOneClick = (previousPurchaseId: string, offerId: string, expectedAmountCents?: number) => callPayments<PaymentIntentResult>({ action: 'upsell', previous_purchase_id: previousPurchaseId, offer_id: offerId, expected_amount_cents: expectedAmountCents });
export const recoverUpsellPayment = (previousPurchaseId: string, offerId: string) => callPayments<PaymentIntentResult>({ action: 'upsell', previous_purchase_id: previousPurchaseId, offer_id: offerId, lookup_only: true });

/** Short-lived download link for a free offer's uploaded file, after the visitor has opted in. */
export async function getFreeOfferDownload(offerId: string, email: string): Promise<string> {
  const { data, error } = await db().functions.invoke('guardian-files', { body: { offer_id: offerId, email } });
  if (error) {
    let message = 'Could not prepare the download.';
    try { const detail = await (error as any).context?.json?.(); if (detail?.error) message = detail.error; } catch { /* keep default */ }
    throw new Error(message);
  }
  if (!(data as any)?.url) throw new Error((data as any)?.error || 'Could not prepare the download.');
  return (data as any).url as string;
}

// ---- Guardian site review (guardian-review edge function) and admin lists ----
async function callReview<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke('guardian-review', { body });
  if (error) {
    let message = error.message;
    try { const detail = await (error as any).context?.json?.(); if (detail?.error) message = detail.error; } catch { /* keep default */ }
    throw new Error(message || 'Review request failed.');
  }
  return data as T;
}
export type ReviewEmailResult = { sent: boolean; reason: string | null };
export const requestGuardianReview = () => callReview<{ status: string; email: ReviewEmailResult }>({ action: 'request' });
export const decideGuardianSite = (userId: string, status: 'approved' | 'paused', note?: string) => callReview<{ status: string; email: ReviewEmailResult }>({ action: 'decide', user_id: userId, status, note });

export type AdminGuideProfile = GuideProfile & { review_requested_at?: string | null; reviewed_at?: string | null; updated_at?: string | null };
export async function listAllGuideProfiles(): Promise<AdminGuideProfile[]> {
  const { data, error } = await db().from('guide_profiles').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as AdminGuideProfile[];
}
export type GuardianSuggestionRow = GuardianSuggestion & { id: string; status: 'new' | 'contacted' | 'invited' | 'dismissed'; created_at: string };
export async function listGuardianSuggestions(): Promise<GuardianSuggestionRow[]> {
  const { data, error } = await db().from('guardian_suggestions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GuardianSuggestionRow[];
}
export async function setGuardianSuggestionStatus(id: string, status: GuardianSuggestionRow['status']): Promise<void> {
  const { error } = await db().from('guardian_suggestions').update({ status }).eq('id', id);
  if (error) throw error;
}
/** Published offers from approved Guardians, for the directory's offerings section. */
export async function listPublicGuardianOffers(): Promise<GuideOffer[]> {
  const { data, error } = await db().from('guide_offers').select('id,guide_id,kind,title,description,price_cents,currency,access_model,booking_url,affiliate_url,file_path,cover_url,status').eq('status', 'published').order('price_cents', { ascending: true }).limit(60);
  if (error) throw error;
  return (data || []) as GuideOffer[];
}

/** Average rating + count of published reviews per Guardian (for offer cards). */
export async function listReviewSummaries(): Promise<Record<string, { rating: number; reviewCount: number }>> {
  const { data, error } = await db().from('guardian_reviews').select('guide_id,rating').eq('status', 'published').limit(2000);
  if (error) throw error;
  const out: Record<string, { rating: number; reviewCount: number }> = {};
  (data || []).forEach((row: any) => { const cur = out[row.guide_id] || { rating: 0, reviewCount: 0 }; cur.rating = (cur.rating * cur.reviewCount + row.rating) / (cur.reviewCount + 1); cur.reviewCount += 1; out[row.guide_id] = cur; });
  return out;
}

/** Protocols built for one named person (builder_kind 'personal'), keyed by protocol id. Empty where the builder columns don't exist yet. */
export async function listPersonalProtocolPeople(userId: string): Promise<Map<string, { name: string; imageUrl: string | null }>> {
  const { data, error } = await db().from('protocols').select('id,builder_kind,builder_config').eq('user_id', userId).eq('builder_kind', 'personal');
  if (error) return new Map();
  return new Map((data || []).map((row: any) => {
    const person = row.builder_config?.person || {};
    return [row.id as string, { name: String(person.name || 'Personal'), imageUrl: person.image_url || person.avatar_url || null }];
  }));
}

/** A Guardian's own Shopify product (guide_products). Sold on the Guardian's checkout; see docs/guardian-shopify-commerce.md. */
export interface GuideProduct {
  id: string;
  guide_id: string;
  shop_domain: string;
  myshopify_domain: string | null;
  product_handle: string;
  variant_id: string | null;
  variant_title: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  price_cents: number | null;
  currency: string;
  discount_code: string | null;
  commission_percent: number | null;
  status: 'draft' | 'published';
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Protocols the product is shown on. */
  protocol_ids: string[];
  /** Matching catalog product, used by Protocol steps. */
  catalog_product_id?: string | null;
  /** Store, variant and price overrides for each sales region. */
  regional_storefronts?: Record<string, Partial<Pick<GuideProduct, 'shop_domain' | 'product_handle' | 'variant_id' | 'currency' | 'price_cents'>>>;
}

export type GuideProductInput = Omit<GuideProduct, 'id' | 'guide_id' | 'commission_percent' | 'created_at' | 'updated_at' | 'protocol_ids' | 'catalog_product_id' | 'regional_storefronts'>;

// A missing table answers 404 with an empty body, so keep the status for the UI's message.
function productsError(error: any, status: number): Error & { code?: string; status?: number } {
  return Object.assign(new Error(error?.message || (status === 404 ? 'guide_products is not available yet' : `Products request failed (${status})`)), { code: error?.code || (status === 404 ? 'PGRST205' : undefined), status });
}

function withProtocolIds(row: any): GuideProduct {
  const { guide_product_protocols: links, ...product } = row;
  return { ...product, protocol_ids: ((links || []) as { protocol_id: string; position: number }[]).sort((a, b) => a.position - b.position).map((link) => link.protocol_id) } as GuideProduct;
}

export async function listGuideProducts(guideId: string): Promise<GuideProduct[]> {
  const { data, error, status } = await db().from('guide_products').select('*, guide_product_protocols(protocol_id, position)').eq('guide_id', guideId).order('sort_order').order('created_at', { ascending: false });
  if (error) throw productsError(error, status);
  return (data || []).map(withProtocolIds);
}

/** Published products for a Guardian's public site. RLS also requires the Guardian to be approved. */
export async function listPublicGuideProducts(guideId: string): Promise<GuideProduct[]> {
  const { data, error, status } = await db().from('guide_products').select('*, guide_product_protocols(protocol_id, position)').eq('guide_id', guideId).eq('status', 'published').order('sort_order').limit(60);
  if (error) throw productsError(error, status);
  return (data || []).map(withProtocolIds);
}

export async function saveGuideProduct(guideId: string, product: GuideProductInput & { id?: string }, protocolIds: string[]): Promise<GuideProduct> {
  const { id, ...row } = product;
  const query = id
    ? db().from('guide_products').update(row).eq('id', id).eq('guide_id', guideId)
    : db().from('guide_products').insert({ guide_id: guideId, ...row });
  const { data, error, status } = await query.select().single();
  if (error) throw productsError(error, status);
  // Replace the Protocol links so their order follows the Guardian's selection.
  const { error: clearError, status: clearStatus } = await db().from('guide_product_protocols').delete().eq('product_id', data.id);
  if (clearError) throw productsError(clearError, clearStatus);
  if (protocolIds.length) {
    const { error: linkError, status: linkStatus } = await db().from('guide_product_protocols').insert(protocolIds.map((protocol_id, position) => ({ product_id: data.id, protocol_id, position })));
    if (linkError) throw productsError(linkError, linkStatus);
  }
  return { ...(data as Omit<GuideProduct, 'protocol_ids'>), protocol_ids: protocolIds };
}

export async function deleteGuideProduct(id: string): Promise<void> {
  const { error, status } = await db().from('guide_products').delete().eq('id', id);
  if (error) throw productsError(error, status);
}
