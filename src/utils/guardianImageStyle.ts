/*
 * The look of a Guardian's product and offer images, and the prompt that asks for it.
 *
 * The house look is the pencil portrait used for partner Guardians' profile photos: a monochrome graphite pencil sketch on a clean white page, fine
 * hatching and soft shading, a bust with a softly rounded lower edge. A Guardian who has written a "Visual language"
 * in their brand kit (Site builder, Brand) gets that instead, and the house look only fills the gap when the field is
 * empty. Either way the style is shown to the person and can be edited before anything is generated.
 */
import { brandKitOf } from './brandKit';
import type { GuideBrand } from './guidePortal';

/** The Edge Function refuses anything longer (supabase/functions/guardian-images/lib.ts PROMPT_MAX); a test keeps the two equal. */
export const IMAGE_PROMPT_MAX = 4000;

/** Under 600 characters, so it also fits the brand kit's own Visual language field if a Guardian wants to keep it. */
export const HOUSE_IMAGE_STYLE =
  'Monochrome graphite pencil sketch on a clean white background: fine hatching and soft shading, greyscale only, drawn with a light, confident hand. ' +
  'Warm and human, never photographic and never cartoonish. ' +
  'One subject, centred, with generous white space; a person is drawn as a bust (head and shoulders) with a softly rounded lower edge.';

const STYLE_MAX = 1200;
const TITLE_MAX = 120;
const ABOUT_MAX = 400;

export type ImageStyleSource = 'brand' | 'house';

/** The brand kit's visual language when it has one, otherwise the house pencil style. */
export function resolveImageStyle(visualLanguage?: string | null): { text: string; source: ImageStyleSource } {
  const brand = (visualLanguage ?? '').trim();
  return brand ? { text: brand, source: 'brand' } : { text: HOUSE_IMAGE_STYLE, source: 'house' };
}

/**
 * The Visual language of the brand the Guardian's products belong to: the primary brand, else their personal one, else
 * the first they have (the same pick the Content builder makes). Empty when there is none, so the house style applies.
 */
export function visualLanguageOf(brands: Pick<GuideBrand, 'kind' | 'is_primary' | 'social_links'>[] | null | undefined): string {
  const list = brands ?? [];
  const brand = list.find((b) => b.is_primary) || list.find((b) => b.kind === 'personal') || list[0];
  return brand ? brandKitOf(brand.social_links).visual : '';
}

/** What an offer is, so the picture is about the right kind of thing. Unknown kinds are simply left out. */
const KIND_NOUN: Record<string, string> = {
  product: 'a wellness product',
  ebook: 'a guide book',
  lead_magnet: 'a free guide',
  recipe_book: 'a recipe book',
  routine: 'a daily routine',
  routine_guidance: 'a daily routine',
  one_to_one_call: 'a personal coaching session',
  group_call: 'a group coaching session',
  in_person: 'an in-person session',
  festival: 'a wellness event',
  journey: 'a guided journey',
  team_program: 'a team programme',
  program: 'a guided programme',
};

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const clip = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.replace(/\s+\S*$/, '') || cut}…`;
};

export interface ImagePromptInput {
  title: string;
  description?: string | null;
  /** The offer's kind (guide_offers.kind), or "product" for a shop product. */
  kind?: string | null;
  /** The style to draw in, as the person left it in the editor. Empty means the house pencil style. */
  style?: string | null;
}

/** The prompt sent to the `guardian-images` Edge Function: the subject, then the style, then what must stay out. */
export function buildImagePrompt({ title, description, kind, style }: ImagePromptInput): string {
  const name = clip(squash((title || '').replace(/["“”]/g, '')), TITLE_MAX) || 'this offer';
  const noun = kind ? KIND_NOUN[kind] : undefined;
  // An offer's description ends with a "Delivery: …" note the shop card hides too; markup from a Shopify import is dropped.
  const about = clip(squash((description || '').replace(/<[^>]*>/g, ' ')).replace(/\s*Delivery:.*$/i, '').trim(), ABOUT_MAX);
  const look = clip(squash(style || ''), STYLE_MAX) || HOUSE_IMAGE_STYLE;
  return [
    `A cover image for "${name}"${noun ? `, ${noun}` : ''}.`,
    about && `About it: ${about}`,
    `Style: ${look}`,
    'No text, lettering, logos, labels or watermarks anywhere in the image.',
  ].filter(Boolean).join('\n');
}
