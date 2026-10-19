/*
 * A brand's look: typeface (Google Fonts), background (image or looping video) and CTA colours, either two
 * brand colours or monochrome. Stored as flat keys in the brand's `social_links` JSON, the same way the
 * profile keeps its site theme, so no schema change is needed. Each Guardian brand has its own kit.
 */
export type CtaMode = 'colour' | 'mono';
export type MonoStyle = 'black_on_white' | 'white_on_black';
/** voice / visual / words / avoid: the brand brief that steers AI copy, image and video prompts. */
export interface BrandKit { font: string; background: string; backgroundType: 'image' | 'video' | ''; ctaMode: CtaMode; primary: string; secondary: string; mono: MonoStyle; voice: string; visual: string; words: string; avoid: string }

/** Curated Google Fonts: a few clean sans, editorial serifs and display faces that hold up on posts and sites. */
export const BRAND_FONTS: Array<{ family: string; kind: 'Sans' | 'Serif' | 'Display' }> = [
  { family: 'Inter', kind: 'Sans' }, { family: 'DM Sans', kind: 'Sans' }, { family: 'Poppins', kind: 'Sans' }, { family: 'Montserrat', kind: 'Sans' },
  { family: 'Manrope', kind: 'Sans' }, { family: 'Work Sans', kind: 'Sans' }, { family: 'Archivo', kind: 'Sans' }, { family: 'Space Grotesk', kind: 'Sans' },
  { family: 'Playfair Display', kind: 'Serif' }, { family: 'Cormorant Garamond', kind: 'Serif' }, { family: 'Fraunces', kind: 'Serif' }, { family: 'Lora', kind: 'Serif' },
  { family: 'Libre Baskerville', kind: 'Serif' }, { family: 'DM Serif Display', kind: 'Serif' }, { family: 'Italiana', kind: 'Display' }, { family: 'Bebas Neue', kind: 'Display' },
];

export const defaultBrandKit = (): BrandKit => ({ font: 'Inter', background: '', backgroundType: '', ctaMode: 'mono', primary: '#111111', secondary: '#F5F2EA', mono: 'black_on_white', voice: '', visual: '', words: '', avoid: '' });

const HEX = /^#[0-9a-f]{6}$/i;
const text = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const fontOk = (f: unknown): f is string => typeof f === 'string' && BRAND_FONTS.some((x) => x.family === f);

/** Read a brand kit from a brand's social_links, falling back to defaults for anything missing or invalid. */
export function brandKitOf(links?: Record<string, string> | null): BrandKit {
  const d = defaultBrandKit(), l = links || {};
  const bg = typeof l.brand_bg === 'string' && /^https:\/\//.test(l.brand_bg) ? l.brand_bg : '';
  return {
    font: fontOk(l.brand_font) ? l.brand_font : d.font,
    background: bg,
    backgroundType: bg && (l.brand_bg_type === 'image' || l.brand_bg_type === 'video') ? l.brand_bg_type : '',
    ctaMode: l.brand_cta_mode === 'colour' ? 'colour' : 'mono',
    primary: HEX.test(l.brand_primary || '') ? l.brand_primary.toUpperCase() : d.primary,
    secondary: HEX.test(l.brand_secondary || '') ? l.brand_secondary.toUpperCase() : d.secondary,
    mono: l.brand_mono === 'white_on_black' ? 'white_on_black' : 'black_on_white',
    voice: text(l.brand_voice), visual: text(l.brand_visual), words: text(l.brand_words), avoid: text(l.brand_avoid),
  };
}

/** The flat keys that store a kit inside social_links. */
export const brandKitLinks = (k: BrandKit): Record<string, string> => ({
  brand_font: k.font, brand_bg: k.background, brand_bg_type: k.background ? k.backgroundType : '', brand_cta_mode: k.ctaMode,
  brand_primary: k.primary, brand_secondary: k.secondary, brand_mono: k.mono,
  brand_voice: k.voice, brand_visual: k.visual, brand_words: k.words, brand_avoid: k.avoid,
});

/** Black or white, whichever reads better on this colour (WCAG relative luminance). */
export function readableOn(hex: string): '#111111' | '#FFFFFF' {
  if (!HEX.test(hex)) return '#111111';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const INK = 0.0056; // relative luminance of #111111
  return (lum + 0.05) / (INK + 0.05) >= 1.05 / (lum + 0.05) ? '#111111' : '#FFFFFF'; // higher contrast wins
}

export interface ButtonColours { background: string; color: string; border: string }
/** Primary and secondary CTA button colours for a kit. */
export function ctaColours(k: BrandKit): { primary: ButtonColours; secondary: ButtonColours } {
  if (k.ctaMode === 'mono') {
    const dark = k.mono === 'black_on_white';
    const ink = dark ? '#111111' : '#FFFFFF', paper = dark ? '#FFFFFF' : '#111111';
    return { primary: { background: ink, color: paper, border: ink }, secondary: { background: paper, color: ink, border: ink } };
  }
  return {
    primary: { background: k.primary, color: readableOn(k.primary), border: k.primary },
    secondary: { background: k.secondary, color: readableOn(k.secondary), border: k.primary },
  };
}

/** Google Fonts stylesheet for one family (regular to bold). */
export const googleFontHref = (family: string) => `https://fonts.googleapis.com/css2?family=${family.trim().replace(/ /g, '+')}:wght@400;600;700&display=swap`;
/**
 * Load a brand font's stylesheet once per page. Resolves when the stylesheet (and so its @font-face rules) has
 * loaded, or failed, so callers can then await `document.fonts.load` for the family. No-op outside the browser.
 */
const fontLoads = new Map<string, Promise<void>>();
export function ensureBrandFont(family: string): Promise<void> {
  if (typeof document === 'undefined' || !fontOk(family)) return Promise.resolve();
  const href = googleFontHref(family);
  const pending = fontLoads.get(href);
  if (pending) return pending;
  const load = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    if (existing?.sheet) { resolve(); return; }
    const link = existing || Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true }); // fallback font, never a hang
    if (!existing) document.head.appendChild(link);
  });
  fontLoads.set(href, load);
  return load;
}
