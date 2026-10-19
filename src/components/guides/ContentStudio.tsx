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
import { Copy, Download, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import { ensureBrandFont, type BrandKit, type ButtonColours } from '../../utils/brandKit';
import { copyPrompt, imagePrompt } from '../../utils/brandBrief';

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

export interface StudioOffer { title: string; free: boolean; price?: string; description?: string }

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
  return siteUrl.startsWith('http') ? siteUrl : `https://routine3.com${siteUrl}`;
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
export function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, style: QrStyle = {}) {
  const logoSize = style.logo || 'large';
  const invert = style.invert ?? true;
  const fg = invert ? '#FFFFFF' : '#111111', paper = invert ? '#111111' : '#FFFFFF';
  const qr = QRCode.create(text, { errorCorrectionLevel: logoSize === 'large' ? 'H' : 'Q' });
  const n = qr.modules.size;
  const cell = size / (n + 8), pad = cell * 4;
  const mark = qr.version < 7;
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
  ctx.fillStyle = '#111111'; roundRect(ctx, tx, ty, t, t, t * 0.06); ctx.fill();
  ctx.lineWidth = Math.max(1, t * 0.035); ctx.strokeStyle = '#FFFFFF';
  roundRect(ctx, tx + t * 0.12, ty + t * 0.12, t * 0.76, t * 0.76, t * 0.03); ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${t * 0.4}px Archivo, Inter, sans-serif`; ctx.fillText('R³', mx + m / 2, my + m / 2 + t * 0.02);
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

export interface PostCopy { headline: string; subline: string; cta: string; credit: string; qr?: string; brand?: PostBrand | null; style?: TextStyleId; position?: TextPosition; qrStyle?: QrStyle; avatar?: string | null }

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
  // The library photos put the subject in the top ~60% and fade to cream below. Bottom text uses them as they are.
  // Top text moves the photo down under a band of the style's colour; right-hand text mirrors it, so the subject
  // sits away from the text either way.
  const band = `rgb(${st.fade || '239,230,219'})`;
  const shift = loaded?.naturalWidth && top && fmt.id !== 'thumb' ? h * (fmt.id === 'story' ? 0.38 : 0.3) : 0;
  if (loaded?.naturalWidth) {
    const scale = Math.max(w / loaded.naturalWidth, h / loaded.naturalHeight);
    const dw = loaded.naturalWidth * scale, dh = loaded.naturalHeight * scale;
    ctx.save();
    if (alignRight) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(loaded, (w - dw) / 2, shift || (fmt.id === 'story' ? 0 : -dh * 0.06), dw, dh);
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
  // The button leads with a ROUTINE³ segment, like the app logo's lockup, then a hairline and the call to action.
  const PREFIX = 'ROUTINE³', prefixSize = 24 * s, prefixTrack = prefixSize * 0.13;
  ctx.font = `700 ${prefixSize}px Archivo, Inter, sans-serif`;
  const prefixTextW = [...PREFIX].reduce((sum, ch) => sum + ctx.measureText(ch).width + prefixTrack, -prefixTrack);
  // The QR sits in the corner diagonally opposite the text, so the text keeps its full width. Small (180) is the
  // least that still decoded with the post scaled to a phone's width (390 px); medium still reads at 270 px.
  const qrBase = { small: 180, medium: 250, large: 320 }[copy.qrStyle?.size || 'small'];
  const qrSize = copy.qr ? qrBase * (fmt.id === 'thumb' ? 0.8 : 1) * s : 0;
  const prefixW = prefixTextW + 52 * s;
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
  // The creator credit (photo + "Guidance by …") opens the text package, above the headline.
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
    // The creator's profile photo leads the credit as a circle inside the tag; without one, their initial.
    const cx0 = alignRight ? anchor - creditW : anchor, fx = cx0 + 5 * s, fy = y + 5 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillRect(cx0, y, creditW, 44 * s);
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
    ctx.textAlign = 'left'; ctx.font = `600 ${20 * s}px Inter`; ctx.fillStyle = '#111111';
    ctx.fillText(creditText, fx + creditLead, y + 29 * s);
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
  ctx.font = `700 ${prefixSize}px Archivo, Inter, sans-serif`;
  let px = bx + 26 * s;
  for (const ch of PREFIX) { ctx.fillText(ch, px, y + boxH / 2 + prefixSize * 0.36); px += ctx.measureText(ch).width + prefixTrack; }
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
export function StyleThumb({ styleId, bg, headline, subline, cta, credit, brand, position, fontsReady }: { styleId: TextStyleId; bg: string; headline: string; subline: string; cta: string; credit: string; brand: PostBrand | null; position: TextPosition; fontsReady: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stale = false;
    if (ref.current) drawPost(ref.current, { id: 'story', w: 270, h: 480 }, bg, { headline, subline, cta, credit, brand, style: styleId, position }, () => stale).catch(() => {});
    return () => { stale = true; };
  }, [styleId, bg, headline, subline, cta, credit, brand, position, fontsReady]);
  return <canvas ref={ref} aria-hidden="true" style={{ width: '100%', aspectRatio: '9 / 16', display: 'block', background: '#1B1C18' }} />;
}

export function ContentStudio({ creator, avatar = null, audience, problem, offers, siteUrl, heading = 'Create posts for this offer path', brand = null }: { creator: string; avatar?: string | null; audience: string; problem: string; offers: StudioOffer[]; siteUrl: string; heading?: string; brand?: PostBrand | null }) {
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
  useEffect(() => {
    setHeadline(`Build a routine for ${solution}`);
    setSubline(offer.description ? offer.description.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '') : `Simple daily actions for ${audience.toLowerCase()}`);
    setCta(offer.free ? 'Get routine' : 'Start the Protocol');
  }, [offerIndex, solution, audience]);
  const fmt = FORMATS.find((f) => f.id === fmtId)!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const background = bg || autoBg;
  // TikTok-style handle: routine3.com/@<slug> opens the Guardian's page.
  const handle = guardianHandle(siteUrl);
  const credit = creator ? `Guidance by ${creator}${handle ? ` · ${handle}` : ''}` : '';
  const fullUrl = siteUrl.startsWith('http') ? siteUrl : `https://routine3.com${siteUrl}`;
  const qrUrl = qrLink(siteUrl);
  useEffect(() => {
    let stale = false; // a newer run (or unmount) supersedes this one
    if (canvasRef.current) drawPost(canvasRef.current, fmt, bgUrl(background), { headline, subline, cta, credit, qr: qrUrl, brand, style: textStyle, position, qrStyle: { invert: qrInvert, logo: qrLogo, size: qrSizeId }, avatar }, () => stale);
    return () => { stale = true; };
  }, [fmt, background, headline, subline, cta, credit, qrUrl, fontsReady, brand, textStyle, position, qrInvert, qrLogo, qrSizeId, avatar]);
  const tag = solution.replace(/\s+/g, '');
  const captions: Record<string, string> = {
    TikTok: `${problem}? Here's a simple routine for ${solution} for ${audience.toLowerCase()}. ${offer.free ? 'Free' : 'Start'} "${offer.title}" by ${creator}. Link in bio. #${tag} #routine #wellbeing`,
    Instagram: `${headline}.\n\nFor ${audience.toLowerCase()} dealing with ${problem.toLowerCase()}: ${subline.toLowerCase()}.\n\n${offer.title} — guidance by ${creator}. ${cta} at the link in bio.\n\n#${tag} #routine3 #healthyhabits`,
    YouTube: `${headline} | ${offer.title}\n\n${creator} shares a practical routine for ${audience.toLowerCase()} with ${problem.toLowerCase()}.\n\n${cta}: ${fullUrl}`,
  };
  const download = () => { const url = canvasRef.current?.toDataURL('image/png'); if (!url) return; const a = document.createElement('a'); a.href = url; a.download = `${tag}-${fmt.id}-${fmt.w}x${fmt.h}.png`; a.click(); };
  // Ready-to-paste prompts for image/video and copy tools, in the selected brand's voice and visual language.
  const promptCtx = { brandName: brand?.name || creator, kit: brand?.kit || null, audience, focus: problem, offer: offer.title, format: `${fmt.label} (${fmt.platforms.split(' · ')[0]})`, headline, cta };
  const prompts: Record<string, string> = { 'Image & video': imagePrompt(promptCtx), Copy: copyPrompt(promptCtx) };
  const copy = (key: string) => { navigator.clipboard?.writeText(({ ...captions, ...prompts })[key]).then(() => { setCopied(key); window.setTimeout(() => setCopied(''), 1600); }); };
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
      {[['Creator', creator], ['Audience', audience], ['Problem', problem], ['Offer', offer.title], ['Solution', `A routine for ${solution}`], ['CTA', fullUrl.replace(/^https?:\/\//, '')]].map(([k, v]) => <span key={k} style={{ border: `1px solid ${line}`, padding: '6px 9px', color: ink, fontSize: 10 }}><strong style={{ color: acid, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', marginRight: 6 }}>{k}</strong>{v}</span>)}
    </div>
    <div className="g-split">
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        {offers.length > 1 && <label><span style={lab}>Offer</span><select value={offerIndex} onChange={(e) => setOfferIndex(Number(e.target.value))} style={field}>{offers.map((o, i) => <option key={i} value={i}>{String(i + 1).padStart(2, '0')} · {o.title} · {o.free ? 'Free' : o.price}</option>)}</select></label>}
        <div><span style={lab}>Format</span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>{FORMATS.map((f) => <button key={f.id} type="button" aria-pressed={fmtId === f.id} onClick={() => setFmtId(f.id)} style={{ minHeight: 44, border: `1px solid ${fmtId === f.id ? acid : line}`, background: fmtId === f.id ? '#20251B' : 'transparent', color: ink, textAlign: 'left', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}><RatioGlyph ratio={f.label} on={fmtId === f.id} /><span><strong style={{ display: 'block', fontSize: 12 }}>{f.label}</strong><span style={{ display: 'block', color: muted, fontSize: 9.5 }}>{f.platforms}</span></span></button>)}</div></div>
        <div><span style={lab}>Text style</span><div role="group" aria-label="Text style" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{TEXT_STYLES.map((t) => <button key={t.id} type="button" aria-pressed={textStyle === t.id} aria-label={`${t.label} text style`} onClick={() => setTextStyle(t.id)} style={{ border: `1px solid ${textStyle === t.id ? acid : line}`, outline: textStyle === t.id ? `1px solid ${acid}` : 'none', background: '#090A08', padding: 4, cursor: 'pointer', display: 'grid', gap: 4 }}>
          <StyleThumb styleId={t.id} bg={bgUrl(background)} headline={headline} subline={subline} cta={cta} credit={credit} brand={brand} position={position} fontsReady={fontsReady} />
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
        <div><span style={lab}>Background {bg ? '' : '· auto'}</span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5 }}>{BACKGROUNDS.map((b) => <button key={b.file} type="button" title={b.label} aria-pressed={background === b.file} onClick={() => setBg(b.file)} style={{ position: 'relative', overflow: 'hidden', aspectRatio: '9 / 16', padding: 0, border: `2px solid ${background === b.file ? acid : 'transparent'}`, background: '#EFE6DB', cursor: 'pointer' }}>
          {/* Previewed as it will be placed for the chosen text position (moved down for top text, mirrored for right). */}
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: position.startsWith('top') ? '38%' : 0, height: '100%', background: `url(${bgUrl(b.file)}) top/cover`, transform: position.endsWith('right') ? 'scaleX(-1)' : undefined }} />
          {position.startsWith('top') && <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '54%', background: 'linear-gradient(#EFE6DB 70%, rgba(239,230,219,0))' }} />}
        </button>)}</div></div>
        <button type="button" onClick={download} style={{ height: 42, border: `1px solid ${ink}`, background: ink, color: '#090A08', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}><Download size={14} /> Download {fmt.w}×{fmt.h} PNG</button>
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
