/*
 * The brand brief: how a Guardian brand sounds (voice, words to use / avoid) and looks (visual language). Drafted by
 * AI from the brand's own details, or offline from the same details when AI is unavailable, and folded into
 * ready-to-paste prompts for image, video and copy tools.
 */
import { projectId } from './supabase/info';
import { BRAND_FONTS, type BrandKit } from './brandKit';

export interface BrandBrief { voice: string; visual: string; words: string; avoid: string }
export interface BrandFacts { name: string; about: string; tags: string[]; audience?: string }

const list = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const hexName = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b), min = Math.min(r, g, b), light = (max + min) / 2;
  if (max - min < 24) return light > 200 ? 'off-white' : light < 60 ? 'near-black' : 'warm grey';
  const hue = r === max ? ((g - b) / (max - min) + 6) % 6 : g === max ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  const names = ['red', 'amber', 'olive', 'green', 'teal', 'blue', 'indigo', 'plum'];
  const name = names[Math.round(hue / 6 * 8) % 8];
  return `${light < 90 ? 'deep ' : light > 180 ? 'soft ' : ''}${name}`;
};

/** A first draft from the brand's own details, so the brief never starts blank (and works without AI). */
export function draftBrandBrief(facts: BrandFacts, kit: BrandKit): BrandBrief {
  const kind = BRAND_FONTS.find((f) => f.family === kit.font)?.kind || 'Sans';
  const feel = kind === 'Serif' ? 'warm, considered and editorial' : kind === 'Display' ? 'confident, bold and memorable' : 'clear, modern and friendly';
  const topics = facts.tags.slice(0, 3);
  const palette = kit.ctaMode === 'mono'
    ? (kit.mono === 'black_on_white' ? 'monochrome: black type and accents on white and paper tones' : 'monochrome: white type on deep black')
    : `${hexName(kit.primary)} as the lead colour with ${hexName(kit.secondary)} accents`;
  return {
    voice: `${facts.name || 'This brand'} sounds ${feel}: practical guidance from someone who has done the work${topics.length ? ` in ${list(topics.map((t) => t.toLowerCase()))}` : ''}. Short sentences, plain English, encouraging rather than clinical${facts.audience ? `, speaking directly to ${facts.audience.toLowerCase()}` : ''}.`,
    visual: `Natural light, real people in real homes and daily routines; calm, uncluttered compositions with space for text. Colour: ${palette}. Typography in ${kit.font}. Authentic and unposed, never stock-photo glossy.`,
    words: ['routine', 'simple', 'daily', 'feel', ...topics.map((t) => t.toLowerCase())].slice(0, 8).join(', '),
    avoid: 'cure, miracle, detox, guaranteed, hacks, shaming or fear-based language',
  };
}

/** Ask the AI route for a brief; throws when AI is unavailable so the caller can fall back to the draft. */
export async function generateBrandBrief(accessToken: string, facts: BrandFacts, kit: BrandKit): Promise<BrandBrief> {
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/guides/brand-brief`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...facts, font: kit.font, ctaMode: kit.ctaMode, primary: kit.primary, secondary: kit.secondary, mono: kit.mono, current: { voice: kit.voice, visual: kit.visual, words: kit.words, avoid: kit.avoid } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.brief) throw new Error(body?.error || `Brand brief failed (${res.status})`);
  const b = body.brief;
  const clean = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 600) : '');
  return { voice: clean(b.voice), visual: clean(b.visual), words: clean(b.words), avoid: clean(b.avoid) };
}

/* ── prompts for content tools ── */
export interface PromptContext { brandName?: string; kit?: BrandKit | null; audience: string; focus: string; offer?: string; format: string; headline?: string; cta?: string }
const brandLines = (c: PromptContext) => {
  const k = c.kit;
  if (!k) return [];
  return [
    k.visual && `Visual language: ${k.visual}`,
    k.voice && `Brand voice: ${k.voice}`,
    k.words && `Words to use: ${k.words}`,
    k.avoid && `Avoid: ${k.avoid}`,
  ].filter(Boolean) as string[];
};
/** For image and video generators (Midjourney, Higgsfield…): the scene, audience and the brand's look. */
export function imagePrompt(c: PromptContext): string {
  const k = c.kit;
  return [
    `A ${c.format} social image for ${c.brandName || 'a wellness guide'}${c.offer ? ` promoting "${c.offer}"` : ''}.`,
    `Scene: ${c.audience.toLowerCase() === 'everyone' ? 'an adult' : c.audience} in a calm, real moment of their daily routine that relates to ${c.focus.toLowerCase()}.`,
    `Leave clean space in the lower third for a headline and button.`,
    ...brandLines({ ...c, kit: k ? { ...k, voice: '', words: '' } : k }),
    k && (k.ctaMode === 'mono' ? `Palette: ${k.mono === 'black_on_white' ? 'black on white' : 'white on black'}, natural tones.` : `Palette accents: ${k.primary} and ${k.secondary}.`),
    'No text, logos or watermarks in the image.',
  ].filter(Boolean).join('\n');
}
/** For copy assistants (ChatGPT, Claude…): what to write, for whom, in the brand's voice. */
export function copyPrompt(c: PromptContext): string {
  return [
    `Write a short social post${c.offer ? ` for "${c.offer}"` : ''} by ${c.brandName || 'a wellness guide'}.`,
    `Audience: ${c.audience}. Focus: ${c.focus}.`,
    c.headline && `On-image headline: "${c.headline}".`,
    c.cta && `Call to action: "${c.cta}".`,
    ...brandLines({ ...c, kit: c.kit ? { ...c.kit, visual: '' } : null }),
    'Give a hook line, two short sentences of value, and the call to action. No medical claims.',
  ].filter(Boolean).join('\n');
}
