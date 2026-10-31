/*
 * ContentStudio — social content for an offer path, in the ROUTINE³ template
 * (Figma "R³ Routine³ • Library", node 12:886): a full-bleed photo fading to cream,
 * then the Text Package at x 91 / y 1271 / w 743 on the 1081×1920 frame:
 *   headline  Italiana 111 / 116
 *   subline   Jeju Myeongjo 52 (Nanum Myeongjo stands in on the web)
 *   CTA       Inter SemiBold 28 / 32, letter-spacing 30%, white box, black border
 * Every post knows its creator, audience, problem, offer and solution, and its CTA
 * points at the offer's mini-site. Rendered on a canvas so the download IS the preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, ExternalLink, Film, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { ensureBrandFont, type BrandKit, type ButtonColours } from '../../utils/brandKit';
import { copyPrompt, imagePrompt } from '../../utils/brandBrief';
import { parseRoutineShareParams, routineShareUrl } from '../../utils/routineShare';
import { postCopy, type CopyKind } from '../../utils/postCopy';
import { AS_IS, compositionBrief, legacyPlacement, placeBackground, type Placement } from '../../utils/postLayout';
import { connectOpenAI, disconnectOpenAI, generateImage, imageStatus, priceLabel, type ImageQuality, type ImageSource, type ImageStatus } from '../../utils/guardianImages';
import { recordStillCanvas, type StillMotion } from '../../utils/videoOverlay';

/** A Guardian brand's look on posts: its typeface for headline and button, CTA colours and logo. */
export interface PostBrand { name: string; font: string; cta: ButtonColours; logo: string | null; kit?: BrandKit | null }

const FIGMA_TEMPLATE = 'https://www.figma.com/design/6HS7WXK5SFoLh41AkzKzMZ/--R%C2%B3---Routine%C2%B3-%E2%80%A2-Libray?node-id=12-886';
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Italiana&family=Inter:wght@400;600;700;800&family=Nanum+Myeongjo&family=Bebas+Neue&family=Fraunces:wght@400&family=Archivo:wght@600;700&display=swap';

type FormatId = 'story' | 'post' | 'square' | 'thumb';
const FORMATS: { id: FormatId; label: string; platforms: string; w: number; h: number }[] = [
  { id: 'story', label: '9:16', platforms: 'TikTok · Reel · Story · Short', w: 1080, h: 1920 },
  { id: 'post', label: '4:5', platforms: 'Instagram post', w: 1080, h: 1350 },
  { id: 'square', label: '1:1', platforms: 'Square post', w: 1080, h: 1080 },
  { id: 'thumb', label: '16:9', platforms: 'YouTube thumbnail', w: 1280, h: 720 },
];

/** Backgrounds from the content library (public/images/content), matched by topic. */
const BACKGROUNDS: { file: string; label: string; match: RegExp }[] = [
  { file: '12-evening-reset', label: 'Evening / sleep', match: /sleep|insomnia|evening|night|bed/i },
  { file: '06-menopause-wellbeing', label: 'Menopause', match: /menopaus|hot flush|perimenopaus/i },
  { file: '16-pregnancy-wellbeing', label: 'Pregnancy', match: /pregnan|prenatal/i },
  { file: '17-new-mother-care', label: 'New mother', match: /postpartum|new mother|newborn/i },
  { file: '04-stress-and-calm', label: 'Stress & calm', match: /stress|anxiety|calm|overwhelm/i },
  { file: '03-energy', label: 'Energy', match: /energy|fatigue|tired/i },
  { file: '07-healthy-weight-habits', label: 'Healthy weight', match: /weight|metabolic/i },
  { file: '08-daily-movement', label: 'Daily movement', match: /movement|fitness|mobility|pain|exercise/i },
  { file: '09-hydration', label: 'Hydration', match: /hydrat|water/i },
  { file: '10-healthy-eating', label: 'Healthy eating', match: /eat|meal|nutrition|digest|gut|food/i },
  { file: '11-morning-routine', label: 'Morning routine', match: /morning|wake/i },
  { file: '13-focus', label: 'Focus', match: /focus|brain fog|concentrat/i },
  { file: '14-teen-wellbeing', label: 'Teen', match: /teen|adolescen/i },
  { file: '15-mens-wellbeing', label: "Men's wellbeing", match: /\bmen\b|male/i },
  { file: '18-young-child-meals', label: 'Young children', match: /child|kid/i },
  { file: '19-family-health', label: 'Family health', match: /famil/i },
  { file: '05-womens-wellbeing', label: "Women's wellbeing", match: /women|female/i },
  { file: '20-body-mind-soul', label: 'Body · mind · soul', match: /.*/ },
];
const bgUrl = (file: string) => `/images/content/${file}.webp`;
/** The background picker's value for the generated image (held in state as a data URL, not a library file). */
const GENERATED = '__generated';
const FIT_COLOUR = { good: '#7FB069', ok: '#E0B354', poor: '#D9695F' } as const;
const FOOD_SUBJECTS = ['Vegetables', 'Leafy greens', 'Tomatoes', 'Mushrooms', 'Berries', 'Citrus', 'Legumes', 'Whole grains', 'Herbs', 'Nuts & seeds'] as const;

/** `days`, `ingredients`, `minutes`: facts the default copy can use (a Protocol's length, a recipe's size). */
export interface StudioOffer { title: string; free: boolean; price?: string; description?: string; days?: number | null; ingredients?: number | null; minutes?: number | null }

/** "Sleep problems" → "sleep"; "Low energy" → "energy". The solution the headline promises. */
function solutionFor(problem: string): string {
  return problem.toLowerCase().replace(/\s*(problems?|issues?|difficult(y|ies))\s*$/, '').replace(/^(low|poor|bad)\s+/, '').trim() || 'wellbeing';
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/); const lines: string[] = []; let line = '';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** The compact R³ app mark used by RoutineMark: a black tile, inset hairline and the R³ monogram. */
function drawR3Mark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.fillStyle = '#111111'; roundRect(ctx, x, y, size, size, size * 0.06); ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.035); ctx.strokeStyle = '#FFFFFF';
  roundRect(ctx, x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76, size * 0.03); ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${size * 0.4}px Archivo, Inter, sans-serif`;
  ctx.fillText('R³', x + size / 2, y + size / 2 + size * 0.02);
  ctx.restore();
}

/**
 * The link a post's QR encodes. A Guardian page becomes the short `HTTPS://ROUTINE3.COM/G/<SLUG>`: upper case
 * fits QR alphanumeric mode (5.5 bits a character instead of 8), so the code drops a version or two and the
 * dots get bigger. The site lower-cases /g/<slug> back to /guardians/<slug>. Anything else is encoded as is.
 */
/** "@john-ferreira" for a Guardian page link, else null. */
export function guardianHandle(siteUrl: string): string | null {
  const slug = siteUrl.match(/\/guardians\/([a-z0-9-]+)$/)?.[1];
  return slug ? `@${slug}` : null;
}
export function qrLink(siteUrl: string): string {
  const slug = siteUrl.match(/^(?:https:\/\/routine3\.com)?\/guardians\/([a-z0-9-]+)$/)?.[1];
  if (slug) return `HTTPS://ROUTINE3.COM/G/${slug.toUpperCase()}`;
  const absolute = siteUrl.startsWith('http') ? siteUrl : `https://routine3.com${siteUrl}`;
  // A routine share link (/routine/<token>, utils/routineShare.ts) is encoded as the canonical lower-case https link:
  // it opens in R³ as a universal link, whose path match is case-sensitive, so it is not upper-cased like /g/<slug>.
  // The QR says where an open came from (utm_medium=qr) and keeps the campaign; the source is left out to keep the code
  // coarse, and the database fills in guardian-<slug> from the token.
  const routine = parseRoutineShareParams(absolute);
  return routine ? routineShareUrl(routine.token, { medium: 'qr', campaign: routine.campaign }) : absolute;
}

/**
 * Apple-style QR on a rounded card (black on white, or inverted): round dots, rounded-square finder eyes and a
 * blank centre holding a white R³ on a black tile. Small and medium centres (22% / 30% of the width, ≤ 9.5% of
 * the area) sit inside error correction Q (25% of codewords); Q keeps the grid coarser than H, so it still reads
 * when the post is shown small. Large (36%) switches to H (30%). The card keeps the standard 4-module quiet zone.
 * From version 7 an alignment pattern sits in the centre, so the mark is only drawn below version 7
 * (versions 2–6 have their one alignment pattern near a corner).
 */
export type QrLogoSize = 'small' | 'medium' | 'large';
export interface QrStyle { invert?: boolean; logo?: QrLogoSize; size?: QrLogoSize }
/** Share of the code's width kept clear for the R³ mark. Large switches to error correction H (30%). */
const QR_LOGO: Record<QrLogoSize, number> = { small: 0.22, medium: 0.3, large: 0.36 };
/**
 * The code to draw for a link and a chosen mark size. A link long enough to push the H code (the large mark) to version 7 or
 * more, such as a routine share link with its utm_medium, could not carry the mark at all; it gets the medium mark on Q instead.
 */
export function qrPlan(text: string, logo: QrLogoSize = 'large') {
  let size: QrLogoSize = logo;
  let qr = QRCode.create(text, { errorCorrectionLevel: size === 'large' ? 'H' : 'Q' });
  if (size === 'large' && qr.version >= 7) { size = 'medium'; qr = QRCode.create(text, { errorCorrectionLevel: 'Q' }); }
  return { logo: size, qr, mark: qr.version < 7 };
}
export function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, style: QrStyle = {}) {
  const invert = style.invert ?? true;
  const fg = invert ? '#FFFFFF' : '#111111', paper = invert ? '#111111' : '#FFFFFF';
  const { logo: logoSize, qr, mark } = qrPlan(text, style.logo);
  const n = qr.modules.size;
  const cell = size / (n + 8), pad = cell * 4;
  ctx.save();
  ctx.shadowColor = 'rgba(17,17,17,0.18)'; ctx.shadowBlur = size * 0.06; ctx.shadowOffsetY = size * 0.015;
  ctx.fillStyle = paper; roundRect(ctx, x, y, size, size, size * 0.12); ctx.fill();
  ctx.restore();
  const ox = x + pad, oy = y + pad;
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const logo = Math.round(n * QR_LOGO[logoSize]) | 1, lo = (n - logo) / 2; // centre square kept clear for the mark
  const inLogo = (r: number, c: number) => mark && r + 1 > lo && r < lo + logo && c + 1 > lo && c < lo + logo;
  ctx.fillStyle = fg;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.modules.get(r, c) || finder(r, c) || inLogo(r, c)) continue;
    ctx.beginPath(); ctx.arc(ox + (c + 0.5) * cell, oy + (r + 0.5) * cell, cell * 0.47, 0, Math.PI * 2); ctx.fill();
  }
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const fx = ox + c * cell, fy = oy + r * cell;
    ctx.lineWidth = cell; ctx.strokeStyle = fg; ctx.fillStyle = fg;
    roundRect(ctx, fx + cell / 2, fy + cell / 2, cell * 6, cell * 6, cell * 2); ctx.stroke();
    roundRect(ctx, fx + cell * 2, fy + cell * 2, cell * 3, cell * 3, cell * 1.1); ctx.fill();
  }
  if (!mark) return;
  const m = logo * cell, mx = ox + lo * cell, my = oy + lo * cell;
  // The R³ mark in the app logo's style (RoutineMark): Archivo Bold, white on a black tile with a hairline outline.
  // Half a module inside the clear square so the code's edge stays crisp.
  const inset = cell * 0.5, t = m - inset * 2, tx = mx + inset, ty = my + inset;
  drawR3Mark(ctx, tx, ty, t);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

const loadImage = (src: string, cors = false) => new Promise<HTMLImageElement | null>((resolve) => {
  const img = new Image(); if (cors) img.crossOrigin = 'anonymous'; // CORS so the canvas can still be downloaded
  img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
});

/**
 * Six text styles in the ROUTINE³ look. Sizes are on the 1081-wide frame. `fade` washes the photo behind the
 * text so it stays legible; `panel` sits the text on a white card; `highlight` puts each line on its own strip.
 * A brand look swaps its own typeface in for the headline.
 */
export type TextStyleId = 'editorial' | 'night' | 'bold' | 'classic' | 'card' | 'caption';
export const TEXT_STYLES: { id: TextStyleId; label: string; head: { font: string; weight: number; size: number; line: number; upper?: boolean }; sub: { font: string; weight: number; size: number; line: number }; ink: string; fade: string | null; panel?: boolean; highlight?: boolean; maxW: number }[] = [
  { id: 'editorial', label: 'Editorial', head: { font: 'Italiana', weight: 400, size: 111, line: 116 }, sub: { font: '"Nanum Myeongjo", serif', weight: 400, size: 52, line: 66 }, ink: '#111111', fade: '239,230,219', maxW: 743 },
  { id: 'night', label: 'Night', head: { font: 'Italiana', weight: 400, size: 111, line: 116 }, sub: { font: '"Nanum Myeongjo", serif', weight: 400, size: 52, line: 66 }, ink: '#F5F2EA', fade: '17,18,15', maxW: 743 },
  { id: 'bold', label: 'Bold', head: { font: '"Bebas Neue"', weight: 400, size: 150, line: 140, upper: true }, sub: { font: 'Inter', weight: 600, size: 40, line: 54 }, ink: '#111111', fade: '239,230,219', maxW: 780 },
  { id: 'classic', label: 'Classic', head: { font: 'Fraunces', weight: 400, size: 96, line: 106 }, sub: { font: 'Inter', weight: 400, size: 40, line: 54 }, ink: '#111111', fade: '239,230,219', maxW: 760 },
  { id: 'card', label: 'Card', head: { font: 'Inter', weight: 700, size: 76, line: 86 }, sub: { font: 'Inter', weight: 400, size: 38, line: 52 }, ink: '#111111', fade: null, panel: true, maxW: 700 },
  { id: 'caption', label: 'Caption', head: { font: 'Inter', weight: 800, size: 68, line: 92 }, sub: { font: 'Inter', weight: 600, size: 36, line: 58 }, ink: '#111111', fade: null, highlight: true, maxW: 760 },
];
export type TextPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export const TEXT_POSITIONS: { id: TextPosition; label: string }[] = [
  { id: 'bottom-left', label: 'Bottom left' }, { id: 'bottom-right', label: 'Bottom right' }, { id: 'top-left', label: 'Top left' }, { id: 'top-right', label: 'Top right' },
];

export interface PostCopy { headline: string; subline: string; cta: string; credit: string; qr?: string; brand?: PostBrand | null; style?: TextStyleId; position?: TextPosition; qrStyle?: QrStyle; avatar?: string | null; placement?: Placement }

/**
 * Everything is loaded first (fonts, background, logo); a run that `isStale()` by then stops before touching the
 * canvas, so a slower earlier run can never paint over a newer one. The drawing itself is synchronous.
 * With no background (`bg` empty) the canvas stays transparent apart from the text layer, so it can sit over video.
 */
export async function drawPost(canvas: HTMLCanvasElement, fmt: { id: FormatId; w: number; h: number }, bg: string, copy: PostCopy, isStale: () => boolean = () => false) {
  const { w, h } = fmt;
  const brand = copy.brand || null;
  const st = TEXT_STYLES.find((t) => t.id === copy.style) || TEXT_STYLES[0];
  const position = copy.position || 'bottom-left';
  const top = position.startsWith('top'), alignRight = position.endsWith('right');
  const headFont = brand ? `"${brand.font}"` : st.head.font, ctaFont = brand ? `"${brand.font}"` : 'Inter';
  if (brand) await ensureBrandFont(brand.font); // the @font-face must exist before document.fonts.load can find it
  await Promise.all([document.fonts.load('700 24px Archivo'), document.fonts.load(`${st.head.weight} ${st.head.size}px ${headFont}`), document.fonts.load(`${st.sub.weight} ${st.sub.size}px ${st.sub.font}`), document.fonts.load(`600 28px ${ctaFont}`), document.fonts.load('600 20px Inter')]).catch(() => {});
  const [loaded, logo, avatar] = await Promise.all([bg ? loadImage(bg) : Promise.resolve(null), brand?.logo ? loadImage(brand.logo, true) : Promise.resolve(null), copy.avatar ? loadImage(copy.avatar, true) : Promise.resolve(null)]);
  if (isStale()) return;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  if (bg) { ctx.fillStyle = '#EFE6DB'; ctx.fillRect(0, 0, w, h); }
  // The library photos put the subject in the top ~60% and fade to cream below. `placement` (postLayout.placeBackground,
  // from each photo's safe-zone metadata) mirrors the photo and/or moves it down under a band of the style's colour
  // so the subject sits clear of the text; without one, the old rules (mirror for right text, move down for top).
  const place = copy.placement || legacyPlacement(fmt.id, position);
  const band = `rgb(${st.fade || '239,230,219'})`;
  const shift = loaded?.naturalWidth ? h * place.shift : 0;
  if (loaded?.naturalWidth) {
    const scale = Math.max(w / loaded.naturalWidth, h / loaded.naturalHeight);
    const dw = loaded.naturalWidth * scale, dh = loaded.naturalHeight * scale;
    ctx.save();
    if (place.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(loaded, (w - dw) / 2, shift || (place.nudge ? -dh * 0.06 : 0), dw, dh);
    ctx.restore();
    if (shift) {
      ctx.fillStyle = band; ctx.fillRect(0, 0, w, shift);
      const g = ctx.createLinearGradient(0, shift, 0, shift + h * 0.16);
      g.addColorStop(0, band); g.addColorStop(1, `rgba(${st.fade || '239,230,219'},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, shift, w, h * 0.16);
    }
  }
  const s = fmt.id === 'thumb' ? h / 1080 : w / 1081;
  // A wash on the text's side. At 9:16 the photos already fade to cream (or sit under the band), so cream needs none.
  if (st.fade && !(fmt.id === 'story' && st.fade === '239,230,219' && bg)) {
    const c = (a: number) => `rgba(${st.fade},${a})`;
    const g = fmt.id === 'thumb'
      ? (alignRight ? ctx.createLinearGradient(w, 0, w * 0.38, 0) : ctx.createLinearGradient(0, 0, w * 0.62, 0))
      : (top ? ctx.createLinearGradient(0, h * 0.65, 0, 0) : ctx.createLinearGradient(0, h * 0.35, 0, h));
    if (fmt.id === 'thumb') { g.addColorStop(0, c(0.96)); g.addColorStop(0.75, c(0.75)); g.addColorStop(1, c(0)); }
    else { g.addColorStop(0, c(0)); g.addColorStop(0.45, c(0.92)); g.addColorStop(1, c(1)); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  const margin = 91 * s, anchor = alignRight ? w - margin : margin;
  // CTA box size first, for the card panel width.
  ctx.font = `600 ${28 * s}px ${ctaFont}`;
  const label = copy.cta.toUpperCase();
  const tracking = 28 * s * 0.3;
  const textW = [...label].reduce((sum, ch) => sum + ctx.measureText(ch).width + tracking, -tracking);
  // The button leads with the actual compact R³ app mark, then a hairline and the call to action.
  const markSize = 52 * s;
  // The QR sits in the corner diagonally opposite the text, so the text keeps its full width. Small (180) is the
  // least that still decoded with the post scaled to a phone's width (390 px); medium still reads at 270 px.
  const qrBase = { small: 180, medium: 250, large: 320 }[copy.qrStyle?.size || 'small'];
  const qrSize = copy.qr ? qrBase * (fmt.id === 'thumb' ? 0.8 : 1) * s : 0;
  const prefixW = 94 * s;
  const boxW = prefixW + textW + 64 * s, boxH = 95 * s;
  const maxW = (fmt.id === 'thumb' ? 640 : st.maxW) * s;
  const headFontCss = `${st.head.weight} ${st.head.size * s}px ${headFont}`, subFontCss = `${st.sub.weight} ${st.sub.size * s}px ${st.sub.font}`;
  ctx.font = headFontCss;
  const head = wrap(ctx, st.head.upper ? copy.headline.toUpperCase() : copy.headline, maxW);
  const headW = Math.max(0, ...head.map((l) => ctx.measureText(l).width));
  ctx.font = subFontCss;
  const sub = copy.subline ? wrap(ctx, copy.subline, maxW) : [];
  const subW = Math.max(0, ...sub.map((l) => ctx.measureText(l).width));
  const hl = st.head.line * s, sl = st.sub.line * s;
  // The creator's circular profile and R3 @route open the text package, above the headline.
  const creditText = copy.credit.toUpperCase(), face = 34 * s, creditLead = face + 10 * s;
  ctx.font = `600 ${20 * s}px Inter`;
  const creditW = copy.credit ? ctx.measureText(creditText).width + 14 * s + 5 * s + creditLead : 0;
  const creditH = copy.credit ? 44 * s + 26 * s : 0;
  const blockH = creditH + head.length * hl + 30 * s + sub.length * sl + 52 * s + boxH;
  // Bottom: 9:16 keeps the Figma position (y 1271) unless long copy would push the CTA off the frame. Top: clear of
  // the app bars on stories. The brand logo moves to the opposite edge from the text.
  const edge = fmt.id === 'thumb' ? 60 * s : 93 * s;
  let y = top ? (fmt.id === 'story' ? 220 * s : edge) : fmt.id === 'story' ? Math.min(1271 * s, h - edge - blockH) : h - edge - blockH;
  if (st.panel) {
    const pad = 48 * s, pw = Math.max(headW, subW, boxW, creditW) + pad * 2;
    ctx.save(); ctx.shadowColor = 'rgba(17,17,17,0.22)'; ctx.shadowBlur = 30 * s; ctx.shadowOffsetY = 8 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; roundRect(ctx, alignRight ? anchor + pad - pw : anchor - pad, y - pad, pw, blockH + pad * 2, 18 * s); ctx.fill();
    ctx.restore();
  }
  const strip = (lineW: number, top0: number, lineH: number) => { const px = 16 * s; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(alignRight ? anchor - lineW - px : anchor - px, top0 + lineH * 0.1, lineW + px * 2, lineH * 0.86); };
  ctx.textBaseline = 'alphabetic';
  if (copy.credit) {
    // Keep the attribution directly on the image: no label background, just the circular profile and @route.
    const cx0 = alignRight ? anchor - creditW : anchor, fx = cx0 + 5 * s, fy = y + 5 * s;
    ctx.save(); ctx.beginPath(); ctx.arc(fx + face / 2, fy + face / 2, face / 2, 0, Math.PI * 2); ctx.clip();
    if (avatar?.naturalWidth) {
      const k = Math.max(face / avatar.naturalWidth, face / avatar.naturalHeight);
      ctx.drawImage(avatar, fx + (face - avatar.naturalWidth * k) / 2, fy + (face - avatar.naturalHeight * k) / 2, avatar.naturalWidth * k, avatar.naturalHeight * k);
    } else {
      ctx.fillStyle = '#111111'; ctx.fillRect(fx, fy, face, face);
      ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = `700 ${17 * s}px Archivo, Inter, sans-serif`;
      ctx.fillText((creditText.split(' BY ').pop() || creditText).trim().charAt(0), fx + face / 2, fy + face / 2 + 6 * s);
    }
    ctx.restore();
    ctx.save();
    ctx.shadowColor = st.ink === '#F5F2EA' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.65)';
    ctx.shadowBlur = 5 * s;
    ctx.textAlign = 'left'; ctx.font = `700 ${20 * s}px Inter`; ctx.fillStyle = st.ink;
    ctx.fillText(creditText, fx + creditLead, y + 29 * s);
    ctx.restore();
    y += creditH;
  }
  ctx.font = headFontCss;
  for (const line of head) {
    if (st.highlight) strip(ctx.measureText(line).width, y, hl);
    ctx.fillStyle = st.ink; ctx.textAlign = alignRight ? 'right' : 'left'; ctx.fillText(line, anchor, y + hl * 0.81);
    y += hl;
  }
  y += 30 * s;
  ctx.font = subFontCss;
  for (const line of sub) {
    if (st.highlight) strip(ctx.measureText(line).width, y, sl);
    ctx.fillStyle = st.ink; ctx.textAlign = alignRight ? 'right' : 'left'; ctx.fillText(line, anchor, y + sl * 0.79);
    y += sl;
  }
  y += 52 * s;
  ctx.textAlign = 'left';
  // CTA box: Inter SemiBold 28 / 30% tracking, 2px black border on white; a brand swaps in its font and CTA colours.
  ctx.font = `600 ${28 * s}px ${ctaFont}`;
  const btn = brand?.cta || { background: '#FFFFFF', color: '#111111', border: '#111111' };
  const bx = alignRight ? anchor - boxW : anchor;
  ctx.fillStyle = btn.background; ctx.fillRect(bx, y, boxW, boxH);
  ctx.lineWidth = 2 * s; ctx.strokeStyle = btn.border; ctx.strokeRect(bx, y, boxW, boxH);
  ctx.fillStyle = btn.color;
  drawR3Mark(ctx, bx + (prefixW - markSize) / 2, y + (boxH - markSize) / 2, markSize);
  ctx.fillRect(bx + prefixW - s, y, 2 * s, boxH);
  ctx.font = `600 ${28 * s}px ${ctaFont}`;
  let cx = bx + prefixW + 32 * s;
  for (const ch of label) { ctx.fillText(ch, cx, y + boxH / 2 + 10 * s); cx += ctx.measureText(ch).width + tracking; }
  // QR in the opposite corner; the brand logo sits on the opposite edge on the text's side.
  const qrEdge = fmt.id === 'thumb' ? 50 * s : 60 * s;
  if (copy.qr && qrSize) drawQr(ctx, copy.qr, alignRight ? margin : w - margin - qrSize, top ? h - qrEdge - qrSize : qrEdge, qrSize, copy.qrStyle);
  const markTop = top ? h - 70 * s - 44 * s : 70 * s;
  const mx = alignRight ? w - margin : margin;
  // CORS-enabled so the canvas can still be downloaded; skipped if it fails.
  if (logo?.naturalWidth) {
    const lh = 44 * s, lw = Math.min(200 * s, lh * logo.naturalWidth / logo.naturalHeight), pad = 8 * s;
    const tw = lw + pad * 2, lx = alignRight ? mx - tw : mx, ly = markTop + 22 * s - (lh + pad * 2) / 2;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(lx, ly, tw, lh + pad * 2);
    ctx.drawImage(logo, lx + pad, ly + pad, lw, lh);
  }
}

/** A format's shape: a box at its real proportions, fitted inside 26 × 26. */
export function RatioGlyph({ ratio, on }: { ratio: string; on: boolean }) {
  const [a, b] = ratio.split(':').map(Number);
  const w = a >= b ? 26 : Math.round(26 * a / b), h = b >= a ? 26 : Math.round(26 * b / a);
  return <span aria-hidden="true" style={{ width: 26, height: 26, flex: '0 0 26px', display: 'grid', placeItems: 'center' }}><span style={{ width: w, height: h, border: `1.5px solid ${on ? '#C7D8A3' : 'rgba(245,242,234,0.55)'}`, borderRadius: 2, background: on ? 'rgba(199,216,163,.16)' : 'transparent' }} /></span>;
}

/** A text-style button's preview: the actual post, drawn small in that style (no QR, so it stays light). */
export function StyleThumb({ styleId, bg, headline, subline, cta, credit, brand, position, fontsReady, placement }: { styleId: TextStyleId; bg: string; headline: string; subline: string; cta: string; credit: string; brand: PostBrand | null; position: TextPosition; fontsReady: number; placement?: Placement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stale = false;
    if (ref.current) drawPost(ref.current, { id: 'story', w: 270, h: 480 }, bg, { headline, subline, cta, credit, brand, style: styleId, position, placement }, () => stale).catch(() => {});
    return () => { stale = true; };
  }, [styleId, bg, headline, subline, cta, credit, brand, position, fontsReady, placement]);
  return <canvas ref={ref} aria-hidden="true" style={{ width: '100%', aspectRatio: '9 / 16', display: 'block', background: '#1B1C18' }} />;
}

export function ContentStudio({ creator, avatar = null, audience, problem, offers, siteUrl, pageUrl, heading = 'Create posts for this offer path', brand = null, kind = 'offer' }: { kind?: CopyKind; creator: string; avatar?: string | null; audience: string; problem: string; offers: StudioOffer[]; siteUrl: string; /** The Guardian's page, when siteUrl points elsewhere (a routine link): keeps the @handle on the post. */ pageUrl?: string; heading?: string; brand?: PostBrand | null }) {
  // Template fonts load from Google Fonts; redraw once they are registered, or the first frame uses a fallback.
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    const ready = () => Promise.all([document.fonts.load('111px Italiana'), document.fonts.load('52px "Nanum Myeongjo"'), document.fonts.load('600 28px Inter')]).catch(() => {}).then(() => setFontsReady((n) => n + 1));
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${FONT_HREF}"]`);
    if (existing) { ready(); return; }
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONT_HREF; link.onload = ready; document.head.appendChild(link);
  }, []);
  const [offerIndex, setOfferIndex] = useState(0);
  const offer = offers[Math.min(offerIndex, offers.length - 1)] || { title: 'Your offer', free: true };
  const solution = solutionFor(problem);
  const autoBg = useMemo(() => BACKGROUNDS.find((b) => b.match.test(`${problem} ${audience} ${offer.title}`))!.file, [problem, audience, offer.title]);
  const [bg, setBg] = useState<string | null>(null);
  const [fmtId, setFmtId] = useState<FormatId>('story');
  const [headline, setHeadline] = useState('');
  const [subline, setSubline] = useState('');
  const [cta, setCta] = useState('');
  const [textStyle, setTextStyle] = useState<TextStyleId>('editorial');
  const [position, setPosition] = useState<TextPosition>('bottom-left');
  const [qrInvert, setQrInvert] = useState(true);
  const [qrLogo, setQrLogo] = useState<QrLogoSize>('large');
  const [qrSizeId, setQrSizeId] = useState<QrLogoSize>('small');
  const [copied, setCopied] = useState('');
  const [foods, setFoods] = useState<string[]>(['Vegetables']);
  const [stillMotion, setStillMotion] = useState<StillMotion>('drift');
  const [recording, setRecording] = useState<number | null>(null);
  const [generated, setGenerated] = useState<{ url: string; fmt: FormatId; position: TextPosition; mock: boolean } | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  useEffect(() => {
    // Short, specific defaults (≤5-word headline, ≤8-word subline) from the audience, problem and offer; editable.
    const c = postCopy({ audience, problem, solution: `A routine for ${solution}`, offer, kind });
    setHeadline(c.headline); setSubline(c.subline); setCta(c.cta);
  }, [offerIndex, solution, audience, problem, kind, offer.title, offer.description]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = FORMATS.find((f) => f.id === fmtId)!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const background = bg || autoBg;
  // TikTok-style handle: routine3.com/@<slug> opens the Guardian's page.
  const handle = guardianHandle(pageUrl ?? siteUrl);
  const credit = creator ? (handle || `@${creator.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`) : '';
  const isGenerated = background === GENERATED && !!generated;
  const bgSrc = isGenerated ? generated!.url : bgUrl(background === GENERATED ? autoBg : background);
  // Library photos are mirrored / moved by their safe-zone metadata; a generated image was composed for its layout.
  const placement = useMemo(() => isGenerated ? AS_IS : placeBackground(background === GENERATED ? autoBg : background, fmtId, position), [isGenerated, background, autoBg, fmtId, position]);
  const storyPlacement = useMemo(() => isGenerated ? AS_IS : placeBackground(background === GENERATED ? autoBg : background, 'story', position), [isGenerated, background, autoBg, position]);
  const fullUrl = siteUrl.startsWith('http') ? siteUrl : `https://routine3.com${siteUrl}`;
  const qrUrl = qrLink(siteUrl);
  useEffect(() => {
    let stale = false; // a newer run (or unmount) supersedes this one
    if (canvasRef.current) drawPost(canvasRef.current, fmt, bgSrc, { headline, subline, cta, credit, qr: qrUrl, brand, style: textStyle, position, qrStyle: { invert: qrInvert, logo: qrLogo, size: qrSizeId }, avatar, placement }, () => stale);
    return () => { stale = true; };
  }, [fmt, bgSrc, placement, headline, subline, cta, credit, qrUrl, fontsReady, brand, textStyle, position, qrInvert, qrLogo, qrSizeId, avatar]);
  const tag = solution.replace(/\s+/g, '');
  const captions: Record<string, string> = {
    TikTok: `${problem}? Here's a simple routine for ${solution} for ${audience.toLowerCase()}. ${offer.free ? 'Free' : 'Start'} "${offer.title}" by ${creator}. Link in bio. #${tag} #routine #wellbeing`,
    Instagram: `${headline}.\n\nFor ${audience.toLowerCase()} dealing with ${problem.toLowerCase()}: ${subline.toLowerCase()}.\n\n${offer.title} — guidance by ${creator}. ${cta} at the link in bio.\n\n#${tag} #routine3 #healthyhabits`,
    YouTube: `${headline} | ${offer.title}\n\n${creator} shares a practical routine for ${audience.toLowerCase()} with ${problem.toLowerCase()}.\n\n${cta}: ${fullUrl}`,
  };
  const download = () => { const url = canvasRef.current?.toDataURL('image/png'); if (!url) return; const a = document.createElement('a'); a.href = url; a.download = `${tag}-${fmt.id}-${fmt.w}x${fmt.h}.png`; a.click(); };
  // Ready-to-paste prompts for image/video and copy tools, in the selected brand's voice and visual language.
  const foodDirection = foods.length ? ` Feature ${foods.join(', ').toLowerCase()} as the food subjects.` : '';
  const promptCtx = { brandName: brand?.name || creator, kit: brand?.kit || null, audience, focus: `${problem}.${foodDirection}`, offer: offer.title, format: `${fmt.label} (${fmt.platforms.split(' · ')[0]})`, headline, cta, layout: compositionBrief(fmt.id, position) };
  const prompts: Record<string, string> = { 'Image & video': imagePrompt(promptCtx), Copy: copyPrompt(promptCtx) };
  const copy = (key: string) => { navigator.clipboard?.writeText(({ ...captions, ...prompts })[key]).then(() => { setCopied(key); window.setTimeout(() => setCopied(''), 1600); }); };
  const animateStill = async () => {
    if (!canvasRef.current) return;
    setRecording(0);
    try {
      const { blob, ext } = await recordStillCanvas(canvasRef.current, 6, stillMotion, setRecording);
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${tag}-${fmt.id}-motion.${ext}`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally { setRecording(null); }
  };
  const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3';
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 38, border: `1px solid ${line}`, background: '#090A08', color: ink, padding: '0 10px', fontSize: 13, borderRadius: 2 };
  const lab: React.CSSProperties = { display: 'block', color: muted, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 5px' };
  return <section aria-label="Content studio" style={{ borderTop: `1px solid ${line}`, padding: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <span><span style={{ ...lab, color: acid, marginBottom: 6 }}>Content</span><strong style={{ color: ink, fontSize: 20, fontWeight: 400, fontFamily: '"CanelaText", Georgia, serif' }}>{heading}</strong></span>
      <a href={FIGMA_TEMPLATE} target="_blank" rel="noopener noreferrer" style={{ color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Figma template <ExternalLink size={12} /></a>
    </div>
    {/* The brief every post is built from. */}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
      {[['Creator', creator], ['Audience', audience], ['Problem', problem], ['Offer', offer.title], ['Solution', `A routine for ${solution}`], ['CTA', fullUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '')]].map(([k, v]) => <span key={k} style={{ border: `1px solid ${line}`, padding: '6px 9px', color: ink, fontSize: 10 }}><strong style={{ color: acid, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', marginRight: 6 }}>{k}</strong>{v}</span>)}
    </div>
    <div className="g-split">
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        {offers.length > 1 && <label><span style={lab}>Offer</span><select value={offerIndex} onChange={(e) => setOfferIndex(Number(e.target.value))} style={field}>{offers.map((o, i) => <option key={i} value={i}>{String(i + 1).padStart(2, '0')} · {o.title} · {o.free ? 'Free' : o.price}</option>)}</select></label>}
        <div><span style={lab}>Format</span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>{FORMATS.map((f) => <button key={f.id} type="button" aria-pressed={fmtId === f.id} onClick={() => setFmtId(f.id)} style={{ minHeight: 44, border: `1px solid ${fmtId === f.id ? acid : line}`, background: fmtId === f.id ? '#20251B' : 'transparent', color: ink, textAlign: 'left', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}><RatioGlyph ratio={f.label} on={fmtId === f.id} /><span><strong style={{ display: 'block', fontSize: 12 }}>{f.label}</strong><span style={{ display: 'block', color: muted, fontSize: 9.5 }}>{f.platforms}</span></span></button>)}</div></div>
        <div><span style={lab}>Text style</span><div role="group" aria-label="Text style" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{TEXT_STYLES.map((t) => <button key={t.id} type="button" aria-pressed={textStyle === t.id} aria-label={`${t.label} text style`} onClick={() => setTextStyle(t.id)} style={{ border: `1px solid ${textStyle === t.id ? acid : line}`, outline: textStyle === t.id ? `1px solid ${acid}` : 'none', background: '#090A08', padding: 4, cursor: 'pointer', display: 'grid', gap: 4 }}>
          <StyleThumb styleId={t.id} bg={bgSrc} headline={headline} subline={subline} cta={cta} credit={credit} brand={brand} position={position} fontsReady={fontsReady} placement={storyPlacement} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: textStyle === t.id ? acid : muted, padding: '1px 0 2px' }}>{t.label}</span></button>)}</div></div>
        <label><span style={lab}>Text position</span><select value={position} onChange={(e) => setPosition(e.target.value as TextPosition)} style={field}>{TEXT_POSITIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <label><span style={lab}>QR colours</span><select value={qrInvert ? 'invert' : 'normal'} onChange={(e) => setQrInvert(e.target.value === 'invert')} style={field}><option value="normal">Black on white</option><option value="invert">White on black</option></select></label>
          <div><span style={lab}>QR size</span><div role="group" aria-label="QR size" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>{(['small', 'medium', 'large'] as const).map((k) => <button key={k} type="button" aria-pressed={qrSizeId === k} onClick={() => setQrSizeId(k)} style={{ height: 38, border: `1px solid ${qrSizeId === k ? acid : line}`, background: qrSizeId === k ? '#20251B' : 'transparent', color: ink, fontSize: 11, cursor: 'pointer' }}>{k === 'small' ? 'S' : k === 'medium' ? 'M' : 'L'}</button>)}</div></div>
          <div><span style={lab}>R³ in QR</span><div role="group" aria-label="R³ logo size" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>{(['small', 'medium', 'large'] as const).map((k) => <button key={k} type="button" aria-pressed={qrLogo === k} onClick={() => setQrLogo(k)} style={{ height: 38, border: `1px solid ${qrLogo === k ? acid : line}`, background: qrLogo === k ? '#20251B' : 'transparent', color: ink, fontSize: 11, cursor: 'pointer' }}>{k === 'small' ? 'S' : k === 'medium' ? 'M' : 'L'}</button>)}</div></div>
        </div>
        <label><span style={lab}>Headline</span><input value={headline} onChange={(e) => setHeadline(e.target.value)} style={field} /></label>
        <label><span style={lab}>Subline</span><input value={subline} onChange={(e) => setSubline(e.target.value)} style={field} /></label>
        <label><span style={lab}>Button</span><input value={cta} onChange={(e) => setCta(e.target.value)} style={field} /></label>
        <div><span style={lab}>Food subjects · choose 1–6 <span style={{ color: acid }}>· vegetables suggested</span></span><div role="group" aria-label="Food subjects" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{FOOD_SUBJECTS.map((food) => { const on = foods.includes(food); return <button key={food} type="button" aria-pressed={on} onClick={() => setFoods((current) => on ? (current.length > 1 ? current.filter((item) => item !== food) : current) : current.length < 6 ? [...current, food] : current)} style={{ border: `1px solid ${on ? acid : line}`, background: on ? '#20251B' : 'transparent', color: on ? acid : ink, padding: '6px 9px', fontSize: 10, cursor: 'pointer' }}>{food}</button>; })}</div><span style={{ display: 'block', color: muted, fontSize: 9.5, marginTop: 5 }}>{foods.length}/6 selected. These guide suggested image and video prompts.</span></div>
        <div><span style={lab}>Background {bg ? '' : '· auto'}<span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, marginLeft: 6 }}>· dot = how clear the subject sits of the text</span></span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5 }}>{BACKGROUNDS.map((b) => {
          // Previewed as it will be placed for the chosen format and text position (mirrored and/or moved down).
          const p = placeBackground(b.file, fmtId, position);
          return <button key={b.file} type="button" title={`${b.label} · ${p.fit} fit for ${position.replace('-', ' ')} text`} aria-pressed={background === b.file} onClick={() => setBg(b.file)} style={{ position: 'relative', overflow: 'hidden', aspectRatio: '9 / 16', padding: 0, border: `2px solid ${background === b.file ? acid : 'transparent'}`, background: '#EFE6DB', cursor: 'pointer' }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: `${p.shift * 100}%`, height: '100%', background: `url(${bgUrl(b.file)}) top/cover`, transform: p.mirror ? 'scaleX(-1)' : undefined }} />
            {p.shift > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${p.shift * 140}%`, background: 'linear-gradient(#EFE6DB 70%, rgba(239,230,219,0))' }} />}
            <span aria-label={`${p.fit} fit`} style={{ position: 'absolute', right: 3, bottom: 3, width: 7, height: 7, borderRadius: 4, background: FIT_COLOUR[p.fit], boxShadow: '0 0 0 1px rgba(0,0,0,.35)' }} />
          </button>;
        })}
          <button type="button" aria-pressed={background === GENERATED} aria-expanded={genOpen} onClick={() => { setGenOpen((o) => !o); if (generated) setBg(GENERATED); }} title="Generate an image composed for this layout" style={{ position: 'relative', overflow: 'hidden', aspectRatio: '9 / 16', padding: 2, border: `2px solid ${background === GENERATED ? acid : line}`, background: generated ? `url(${generated.url}) center/cover` : '#20251B', color: ink, fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>{generated ? '' : <span>+ Generate image</span>}</button>
        </div></div>
        {genOpen && <ImageGenerator ink={ink} muted={muted} line={line} acid={acid} field={field} lab={lab} aspect={fmt.label as '9:16' | '4:5' | '1:1' | '16:9'} defaultPrompt={imagePrompt(promptCtx)}
          madeFor={generated && (generated.fmt !== fmtId || generated.position !== position) ? `${FORMATS.find((f) => f.id === generated.fmt)!.label}, ${generated.position.replace('-', ' ')} text` : null}
          onImage={(url, mock) => { setGenerated({ url, fmt: fmtId, position, mock }); setBg(GENERATED); }} />}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 7 }}><button type="button" onClick={download} style={{ height: 42, border: `1px solid ${ink}`, background: ink, color: '#090A08', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}><Download size={14} /> Still PNG</button><button type="button" disabled={recording !== null} onClick={animateStill} style={{ height: 42, border: `1px solid ${acid}`, background: 'transparent', color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: recording === null ? 'pointer' : 'wait' }}>{recording !== null ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}{recording !== null ? `Recording ${Math.round(recording * 100)}%` : 'Record animated still'}</button></div>
        <label><span style={lab}>Still-image animation</span><select value={stillMotion} onChange={(event) => setStillMotion(event.target.value as StillMotion)} style={field}><option value="drift">Slow horizontal drift</option><option value="zoom">Slow cinematic zoom</option><option value="orbit">Moving graphic glow</option></select></label>
        <div style={{ display: 'grid', gap: 8 }}>{Object.keys(captions).map((k) => <div key={k} style={{ border: `1px solid ${line}`, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={{ ...lab, margin: 0, color: acid }}>{k} caption</span><button type="button" onClick={() => copy(k)} style={{ border: 0, background: 'transparent', color: muted, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><Copy size={12} />{copied === k ? 'Copied' : 'Copy'}</button></div>
          <p style={{ margin: 0, color: ink, fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{captions[k]}</p>
        </div>)}</div>
        <div aria-label="Prompts for AI tools" style={{ display: 'grid', gap: 8 }}>
          <span style={{ ...lab, margin: '6px 0 0' }}>Prompts for AI tools{brand?.kit && (brand.kit.voice || brand.kit.visual) ? ` · ${brand.name} voice & visuals` : brand ? ` · add ${brand.name}'s voice in the Site builder` : ''}</span>
          {Object.keys(prompts).map((k) => <div key={k} style={{ border: `1px dashed ${line}`, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={{ ...lab, margin: 0, color: acid }}>{k} prompt</span><button type="button" onClick={() => copy(k)} style={{ border: 0, background: 'transparent', color: muted, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><Copy size={12} />{copied === k ? 'Copied' : 'Copy'}</button></div>
            <p style={{ margin: 0, color: muted, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{prompts[k]}</p>
          </div>)}
        </div>
      </div>
      <div className="g-sticky" style={{ display: 'grid', placeItems: 'center' }}>
        <canvas ref={canvasRef} aria-label={`${fmt.platforms} preview`} style={{ width: fmt.w >= fmt.h ? '100%' : `${Math.round(640 * fmt.w / fmt.h)}px`, maxWidth: '100%', aspectRatio: `${fmt.w} / ${fmt.h}`, height: 'auto', boxShadow: '0 14px 36px rgba(0,0,0,.4)' }} />
      </div>
    </div>
  </section>;
}

/**
 * "Generate image" in the Background picker: a background composed for this post's layout (the prompt carries the
 * text and QR zones from postLayout.compositionBrief). Paid either by R³ (a daily allowance) or by the Guardian's own
 * OpenAI key. Nothing is spent until the button showing the price is pressed; test mode costs nothing.
 */
function ImageGenerator({ aspect, defaultPrompt, madeFor, onImage, ink, muted, line, acid, field, lab }: { aspect: '9:16' | '4:5' | '1:1' | '16:9'; defaultPrompt: string; madeFor: string | null; onImage: (url: string, mock: boolean) => void; ink: string; muted: string; line: string; acid: string; field: React.CSSProperties; lab: React.CSSProperties }) {
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<ImageSource>('house');
  const [quality, setQuality] = useState<ImageQuality>('medium');
  const [key, setKey] = useState('');
  const [edited, setEdited] = useState<string | null>(null); // null = follow the layout as it changes
  const prompt = edited ?? defaultPrompt;
  useEffect(() => { imageStatus().then((s) => { setStatus(s); if (!s.house && s.own.connected) setSource('own'); }).catch((e) => setError(e.message)); }, []);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const connect = () => run(async () => { const r = await connectOpenAI(key); setKey(''); setStatus((s) => s && { ...s, own: { ...s.own, connected: true, key_hint: r.key_hint } }); setSource('own'); });
  const disconnect = () => run(async () => { await disconnectOpenAI(); setStatus((s) => s && { ...s, own: { ...s.own, connected: false, key_hint: null } }); setSource('house'); });
  const generate = () => run(async () => {
    const r = await generateImage(prompt, aspect, quality, source);
    onImage(r.image, r.mock);
    if (source === 'house' && !r.mock) setStatus((s) => s && { ...s, house_left: Math.max(0, s.house_left - 1) });
  });
  const ready = source === 'own' ? !!status?.own.connected : !!status?.house && (status.house_left > 0 || !status.live);
  const price = priceLabel(status?.prices, aspect, quality);
  const small: React.CSSProperties = { border: 0, background: 'transparent', color: muted, fontSize: 10, textDecoration: 'underline', cursor: 'pointer', padding: 0 };
  return <div aria-label="Generate image" style={{ border: `1px dashed ${line}`, padding: 10, display: 'grid', gap: 8 }}>
    <span style={{ ...lab, margin: 0, color: acid }}>Generate image · {aspect}{status && !status.live ? ' · test mode (free placeholder)' : ''}</span>
    {madeFor && <span style={{ color: muted, fontSize: 10.5 }}>The current image was made for {madeFor}; generate again to fit this layout.</span>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <label><span style={lab}>Made with</span><select value={source} onChange={(e) => setSource(e.target.value as ImageSource)} style={field}>
        <option value="house" disabled={status ? !status.house : false}>R³ images{status?.house ? ` · ${status.live ? status.house_left : status.house_per_day} left today` : ''}</option>
        <option value="own">My OpenAI account{status?.own.key_hint ? ` · ${status.own.key_hint}` : ''}</option>
      </select></label>
      <label><span style={lab}>Quality</span><select value={quality} onChange={(e) => setQuality(e.target.value as ImageQuality)} style={field}>
        {(['low', 'medium', 'high'] as const).map((q) => <option key={q} value={q}>{q[0].toUpperCase() + q.slice(1)} {priceLabel(status?.prices, aspect, q)}</option>)}
      </select></label>
    </div>
    {source === 'own' && (status?.own.connected
      ? <span style={{ color: muted, fontSize: 10.5 }}>Billed to your OpenAI account ({status.own.key_hint}). <button type="button" onClick={disconnect} disabled={busy} style={small}>Disconnect</button></span>
      : status?.own.available === false ? <span style={{ color: muted, fontSize: 10.5 }}>Connecting your own key isn’t switched on yet.</span>
      : <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
          <input type="password" autoComplete="off" placeholder="OpenAI API key (sk-…)" value={key} onChange={(e) => setKey(e.target.value)} style={field} aria-label="OpenAI API key" />
          <button type="button" onClick={connect} disabled={busy || !key.trim()} style={{ ...field, width: 'auto', cursor: 'pointer' }}>Connect</button>
          <span style={{ gridColumn: '1 / -1', color: muted, fontSize: 10 }}>OpenAI doesn’t offer sign-in for other apps, so use an API key from platform.openai.com → API keys. It’s stored encrypted and only used for your images.</span>
        </div>)}
    <label><span style={lab}>Prompt · keeps the text and QR areas clear{edited !== null ? <> · <button type="button" onClick={() => setEdited(null)} style={small}>reset to layout</button></> : ''}</span>
      <textarea value={prompt} onChange={(e) => setEdited(e.target.value)} rows={6} style={{ ...field, height: 'auto', padding: 8, fontSize: 11, lineHeight: 1.45, resize: 'vertical' }} /></label>
    <button type="button" onClick={generate} disabled={busy || !ready || !status} style={{ height: 40, border: `1px solid ${acid}`, background: ready ? acid : 'transparent', color: ready ? '#090A08' : muted, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', cursor: ready && !busy ? 'pointer' : 'default' }}>
      {busy ? 'Working…' : !status ? 'Loading…' : !status.live ? 'Generate test image · free' : `Generate image · ${price}${source === 'own' ? ' on your OpenAI account' : ''}`}
    </button>
    {error && <span role="alert" style={{ color: '#E8A39B', fontSize: 11 }}>{error}</span>}
    <span style={{ color: ink, opacity: 0.5, fontSize: 9.5 }}>Prices are OpenAI’s published per-image figures for {status?.model || 'gpt-image-1'}.</span>
  </div>;
}
