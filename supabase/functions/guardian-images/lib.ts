// Pure parts of the `guardian-images` Edge Function: the OpenAI image request we allow, its price, the Guardian's
// own API key encryption and the test-mode placeholder. No Deno or Supabase imports, so vitest can test it directly.
//
// OpenAI offers no OAuth for third-party apps to spend a ChatGPT plan, so "connect your own" means an OpenAI API key
// (platform.openai.com). It is stored AES-GCM encrypted, like the Higgsfield connection, and never leaves the
// function.

export const OPENAI_BASE = 'https://api.openai.com/v1';
// gpt-image-1 was shut down by OpenAI on 2026-10-23 (requests now fail with "The model `gpt-image-1` does not exist"), so the
// default is its successor. Check OpenAI's deprecations page before adding another model here.
export const DEFAULT_MODEL = 'gpt-image-2';
/** The price list below is an estimate for this model family, so only these models are accepted; any other configured model falls back to the default. */
export const SUPPORTED_MODELS = ['gpt-image-2'];
export const pickModel = (configured?: string | null) => (configured && SUPPORTED_MODELS.includes(configured) ? configured : DEFAULT_MODEL);
export const PROMPT_MAX = 4000;

export type Aspect = '9:16' | '4:5' | '1:1' | '16:9';
export const ASPECTS: Aspect[] = ['9:16', '4:5', '1:1', '16:9'];
export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: Quality[] = ['low', 'medium', 'high'];
export type Source = 'house' | 'own';

/** The nearest size gpt-image-2 renders; the post's frame crops it (cover-fit), and the prompt warns of the crop. */
export const SIZE: Record<Aspect, '1024x1536' | '1024x1024' | '1536x1024'> = { '9:16': '1024x1536', '4:5': '1024x1536', '1:1': '1024x1024', '16:9': '1536x1024' };

/** Estimated per-image prices for gpt-image-2 (USD), shown before generating. Square is cheaper than portrait or
 *  landscape. Approximate: OpenAI bills tokens, and these are its own per-image figures. */
export const PRICE_USD: Record<Quality, { square: number; wide: number }> = {
  low: { square: 0.011, wide: 0.016 },
  medium: { square: 0.042, wide: 0.063 },
  high: { square: 0.167, wide: 0.25 },
};
export const priceFor = (aspect: Aspect, quality: Quality) => PRICE_USD[quality][SIZE[aspect] === '1024x1024' ? 'square' : 'wide'];

export interface GenerateInput { prompt?: unknown; aspect_ratio?: unknown; quality?: unknown; source?: unknown }
export interface AvatarInput { image_url?: unknown; name?: unknown; source?: unknown }
export type Shaped =
  | { ok: true; source: Source; aspect: Aspect; quality: Quality; usd: number; body: { model: string; prompt: string; size: string; quality: Quality; n: 1; output_format: 'webp'; moderation: 'auto' } }
  | { ok: false; error: string };

/** Validate the browser's request and turn it into the OpenAI images body. Never trusts the client. */
export function shapeImageRequest(input: GenerateInput, model: string = DEFAULT_MODEL): Shaped {
  const prompt = String(input.prompt ?? '').replace(/[ \t]+/g, ' ').trim();
  if (prompt.length < 10) return { ok: false, error: 'Describe the image in a sentence or two.' };
  if (prompt.length > PROMPT_MAX) return { ok: false, error: `Keep the prompt under ${PROMPT_MAX} characters.` };
  const aspect = input.aspect_ratio as Aspect;
  if (!ASPECTS.includes(aspect)) return { ok: false, error: 'Choose 9:16, 4:5, 1:1 or 16:9.' };
  const quality = (QUALITIES.includes(input.quality as Quality) ? input.quality : 'medium') as Quality;
  const source = input.source === 'own' ? 'own' : input.source === 'house' ? 'house' : null;
  if (!source) return { ok: false, error: 'Choose R³ images or your own OpenAI key.' };
  return { ok: true, source, aspect, quality, usd: priceFor(aspect, quality), body: { model, prompt, size: SIZE[aspect], quality, n: 1, output_format: 'webp', moderation: 'auto' } };
}

/**
 * As-Tro plates sent beside the Guardian's photo as style references (the prompt below was written for ChatGPT with "the
 * attached AS-TRO reference images"). They teach the engraved fine-art look only; the prompt forbids copying their faces.
 * Only 384 px plates exist on as-tro.com. A reference that cannot be fetched is skipped, never fatal.
 */
export const AVATAR_STYLE_REFERENCES = [
  'https://www.as-tro.com/assets/plates/384/people/abraham.webp',
  'https://www.as-tro.com/assets/plates/384/people/james-son-of-alphaeus.webp',
  'https://www.as-tro.com/assets/plates/384/people/teresa-of-avila.webp',
];

/** True when OpenAI's 400 is about the `background` parameter, so the request can be retried without transparency. */
export const rejectedBackground = (status: number, body: any): boolean => status === 400 && /background|transparen/i.test(String(body?.error?.message || ''));

export function avatarPrompt(name?: unknown): string {
  const person = String(name || 'the person').replace(/[\r\n]+/g, ' ').trim().slice(0, 100) || 'the person';
  return `Create an image of ${person} in the exact visual house style of the attached AS-TRO reference images. The FIRST attached image is a photograph of ${person}: portray this very person from it. Preserve the person's identity, facial structure, age, expression, hair and distinguishing features exactly, so they are clearly recognisable. The other attached images are AS-TRO style references only: match their style, never their faces, clothing or poses.
STYLE
Timeless esoteric fine-art illustration, classical engraved portraiture blended with delicate painterly realism. Inspired by antique astronomical manuscripts, Renaissance illustrations, alchemical drawings and museum-quality historical artwork. Match the references in colour palette, contrast, illustration technique, texture, lighting, linework and overall artistic character.
COMPOSITION
One central subject, visually dominant, head and shoulders. Balanced, elegant, historically appropriate composition. Detailed subject with subtle, natural shading and fine textures. Preserve a consistent illustration style across all AS-TRO images. No unnecessary decorative elements. Square composition with generous circle-safe space around the head and shoulders, so a circular crop never cuts the subject.
TRANSPARENCY - CRITICAL
Generate on a fully transparent alpha background (RGBA). No solid background colour, white canvas or rectangular backdrop. No environment, scenery, gradient or background texture. The subject must be cleanly isolated, with soft, naturally feathered edges where appropriate. No artificial halo, glow, drop shadow or background vignette. Transparency must be genuine, not a simulated checkerboard pattern.
RENDERING
Sophisticated historical fine art, intricate detailing, muted natural colours, subtle antique texture applied only to the subject, realistic proportions, delicate chiaroscuro lighting.
AVOID
Cartoon, anime, modern 3D, photorealistic stock photography, neon colours, excessive gold, fantasy effects, generic mystical backgrounds, typography, logos, borders, frames or watermarks. Do not beautify, de-age, change ethnicity or add accessories.
OUTPUT
One isolated illustration, centred, with the subject entirely within the canvas and comfortable margins.`;
}

export function shapeAvatarRequest(input: AvatarInput) {
  const imageUrl = String(input.image_url || '').trim();
  if (!imageUrl || (!imageUrl.startsWith('https://') && !imageUrl.startsWith('data:image/'))) return { ok: false as const, error: 'Upload or choose a portrait first.' };
  if (imageUrl.startsWith('data:image/') && imageUrl.length > 11_000_000) return { ok: false as const, error: 'Choose an image smaller than 8 MB.' };
  const source = input.source === 'own' ? 'own' : input.source === 'house' ? 'house' : null;
  if (!source) return { ok: false as const, error: 'Choose R³ images or your own OpenAI key.' };
  return { ok: true as const, imageUrl, source, quality: 'medium' as const, aspect: '1:1' as const, usd: PRICE_USD.medium.square, prompt: avatarPrompt(input.name), size: SIZE['1:1'] };
}

/** OpenAI secret keys: `sk-` then a long token (`sk-proj-…`, `sk-svcacct-…`, legacy `sk-…`). */
export const looksLikeOpenAIKey = (k: string) => /^sk-[A-Za-z0-9_-]{20,}$/.test(k.trim());
export const keyHint = (k: string) => `sk-…${k.trim().slice(-4)}`;

/** OpenAI's error body → a sentence a Guardian can act on (never echoes the key). */
export function friendlyOpenAIError(status: number, body: any): string {
  const code = body?.error?.code || body?.error?.type || '';
  if (status === 401) return 'OpenAI did not accept this API key.';
  if (status === 429) return code === 'insufficient_quota' ? 'This OpenAI account has no credit left.' : 'OpenAI is rate-limiting this account; try again in a minute.';
  if (code === 'moderation_blocked' || /safety/i.test(body?.error?.message || '')) return 'OpenAI declined this prompt. Try describing the scene differently.';
  if (status === 403) return 'This OpenAI organisation is not verified for image generation yet.';
  // A 400 means OpenAI rejected the request itself (bad size, format or parameter). Say why, so it can be fixed rather than guessed at.
  const detail = status === 400 ? safeDetail(body?.error?.message) : '';
  return detail ? `Image generation failed (${status}): ${detail}` : `Image generation failed (${status}).`;
}

/** OpenAI's own message, shortened and with anything shaped like a secret key removed, for 400 responses only. */
export function safeDetail(message: unknown): string {
  if (typeof message !== 'string') return '';
  return message.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[key]').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/* ── encryption (AES-GCM, key bound to the user id) ── */
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function aesKey(secretB64: string): Promise<CryptoKey> {
  const raw = unb64(secretB64);
  if (raw.length !== 32) throw new Error('GUARDIAN_IMAGES_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptKey(apiKey: string, userId: string, secretB64: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(userId) }, await aesKey(secretB64), new TextEncoder().encode(apiKey.trim()));
  return { ciphertext: b64(new Uint8Array(out)), iv: b64(iv) };
}
export async function decryptKey(row: { credentials_ciphertext: string; credentials_iv: string }, userId: string, secretB64: string): Promise<string> {
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.credentials_iv), additionalData: new TextEncoder().encode(userId) }, await aesKey(secretB64), unb64(row.credentials_ciphertext));
  return new TextDecoder().decode(out);
}

/** Test mode: a soft gradient placeholder at the requested size, so the whole flow runs without spending credit. */
export function mockImage(aspect: Aspect): string {
  const [w, h] = SIZE[aspect].split('x').map(Number);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C9B79C"/><stop offset="1" stop-color="#EFE6DB"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="50%" text-anchor="middle" font-family="Inter, sans-serif" font-size="${Math.round(w / 18)}" fill="#6B5E4B">Test image · ${aspect}</text></svg>`;
  return `data:image/svg+xml;base64,${b64(new TextEncoder().encode(svg))}`;
}
