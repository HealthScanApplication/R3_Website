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

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke('guardian-images', { body });
  if (error) {
    let message = error.message;
    try { const detail = await (error as any).context?.json?.(); if (detail?.error) message = detail.error; } catch { /* keep default */ }
    throw new Error(message || 'Image request failed.');
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const imageStatus = () => call<ImageStatus>({ action: 'status' });
export const connectOpenAI = (key: string) => call<{ connected: true; key_hint: string }>({ action: 'connect', key });
export const disconnectOpenAI = () => call<{ connected: false }>({ action: 'disconnect' });
export const generateImage = (prompt: string, aspect: ImageAspect, quality: ImageQuality, source: ImageSource) => call<GeneratedImage>({ action: 'generate', prompt, aspect_ratio: aspect, quality, source });
export const convertGuardianAvatar = (imageUrl: string, name: string, source: ImageSource = 'house') => call<GeneratedImage>({ action: 'convert-avatar', image_url: imageUrl, name, source });

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
