/*
 * Browser side of generated post backgrounds: thin calls to the `guardian-images` Edge Function (which holds R³'s
 * key and any Guardian's own OpenAI key). The browser never sees a key.
 */
import { getSupabaseClient } from './supabase/client';

export type ImageAspect = '9:16' | '4:5' | '1:1' | '16:9';
export type ImageQuality = 'low' | 'medium' | 'high';
export type ImageSource = 'house' | 'own';
export interface ImageStatus { live: boolean; house: boolean; house_left: number; house_per_day: number; own: { connected: boolean; key_hint: string | null; connected_at: string | null; available: boolean }; model: string; prices: Record<ImageQuality, { square: number; wide: number }> }
export interface GeneratedImage { image: string; usd: number; mock: boolean; size: string }

/** An error from the function, with the HTTP status when there was one, so a caller can tell "not deployed" from a refusal. */
export class GuardianImageError extends Error {
  status?: number;
  constructor(message: string, status?: number) { super(message); this.name = 'GuardianImageError'; this.status = status; }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke('guardian-images', { body });
  if (error) {
    let message = error.message;
    const status: number | undefined = (error as any).context?.status;
    try { const detail = await (error as any).context?.json?.(); if (detail?.error) message = detail.error; else if (detail?.message) message = detail.message; } catch { /* keep default */ }
    throw new GuardianImageError(message || 'Image request failed.', status);
  }
  if ((data as any)?.error) throw new GuardianImageError((data as any).error);
  return data as T;
}

export const HOUSE_STYLE_UNAVAILABLE = 'R3 house style is not available on this server yet. Please try again shortly.';

/**
 * The text shown for a failed house-style request. A server that does not know the action (an older deployed function
 * answers "Unknown action."), a missing function (404) or a function that is not deployed would otherwise surface as a
 * cryptic line; those become one friendly message. Every other message (quota, connect your key, sign in) is kept as the
 * server wrote it.
 */
export function houseStyleErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const status = error instanceof GuardianImageError ? error.status : (error as any)?.status;
  if (status === 404 || /^\s*unknown action\.?\s*$/i.test(message) || /function (?:was )?not found|not deployed/i.test(message)) return HOUSE_STYLE_UNAVAILABLE;
  return message || 'Could not convert that portrait.';
}

export const imageStatus = () => call<ImageStatus>({ action: 'status' });
export const connectOpenAI = (key: string) => call<{ connected: true; key_hint: string }>({ action: 'connect', key });
export const disconnectOpenAI = () => call<{ connected: false }>({ action: 'disconnect' });
export const generateImage = (prompt: string, aspect: ImageAspect, quality: ImageQuality, source: ImageSource) => call<GeneratedImage>({ action: 'generate', prompt, aspect_ratio: aspect, quality, source });
export async function convertGuardianAvatar(imageUrl: string, name: string, source: ImageSource = 'house'): Promise<GeneratedImage> {
  try { return await call<GeneratedImage>({ action: 'convert-avatar', image_url: imageUrl, name, source }); }
  catch (error) { throw new GuardianImageError(houseStyleErrorMessage(error), error instanceof GuardianImageError ? error.status : undefined); }
}

export function generatedImageFile(dataUrl: string, filename = 'guardian-avatar.webp'): File {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error('The generated avatar could not be prepared for upload.');
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return new File([bytes], filename, { type: match[1] || 'image/webp' });
}

/** The per-image price shown on the button, from the function's price list (square is cheaper). */
export function priceLabel(prices: ImageStatus['prices'] | undefined, aspect: ImageAspect, quality: ImageQuality): string {
  const p = prices?.[quality];
  if (!p) return '';
  const usd = aspect === '1:1' ? p.square : p.wide;
  return `≈ $${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`;
}

/* ── choosing who pays, and keeping what comes back ── */
const WHERE_TO_CONNECT = 'In the Content builder, open Background → Generate image, choose “My OpenAI account” and paste an API key from platform.openai.com → API keys.';

export type ImageProviderChoice =
  | { ok: true; source: ImageSource; /** Shown under the button: who is billed, or that this is the free test mode. */ note: string; /** Test mode: the image is a placeholder and nothing is spent. */ test: boolean }
  | { ok: false; reason: 'not_connected' | 'allowance_used' | 'not_available'; message: string };

/**
 * Which route a one-off image (a product or offer cover) goes through, from the function's `status`: the Guardian's own
 * OpenAI account when they have connected one, else R³'s daily allowance, else a polite refusal that says how to connect.
 * The same two routes the Content builder offers, so nothing here needs a second pipeline.
 */
export function chooseImageProvider(status: ImageStatus): ImageProviderChoice {
  const test = !status.live;
  const testNote = 'Test mode: a free placeholder image, nothing is spent.';
  if (status.own.connected) return { ok: true, source: 'own', test, note: test ? testNote : `Billed to your OpenAI account${status.own.key_hint ? ` (${status.own.key_hint})` : ''}.` };
  if (status.house && (test || status.house_left > 0)) return { ok: true, source: 'house', test, note: test ? testNote : `Uses R³ images · ${status.house_left} left today.` };
  if (!status.own.available) return { ok: false, reason: 'not_available', message: 'Image generation is not switched on for your account yet. Please try again later, or upload an image yourself.' };
  if (status.house) return { ok: false, reason: 'allowance_used', message: `You have used today’s R³ images. Connect your own OpenAI account to carry on. ${WHERE_TO_CONNECT}` };
  return { ok: false, reason: 'not_connected', message: `No image provider is connected yet. Connect your own OpenAI account to make images with AI. ${WHERE_TO_CONNECT}` };
}

const EXTENSION: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

/** A generated image (a `data:` URL from the function) as a file the storage upload takes. The free test placeholder is an SVG and is refused. */
export function dataUrlToFile(dataUrl: string, baseName: string): File {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error('That image could not be read.');
  const type = match[1].toLowerCase();
  if (type === 'image/svg+xml') throw new Error('This is a free test image, not a real one, so it cannot be saved as a cover.');
  const extension = EXTENSION[type];
  if (!extension) throw new Error('That image could not be read.');
  const binary = atob(match[2].replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new File([bytes], `${baseName}.${extension}`, { type });
}
