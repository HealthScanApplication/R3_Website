/*
 * Where things sit on a Content builder post, so backgrounds can keep out of the way. The zones mirror drawPost in
 * src/components/guides/ContentStudio.tsx: the text package (credit, headline, subline, button) on one side, the QR
 * in the diagonally opposite corner. All rects are fractions of the frame (0–1), so they hold for every size.
 *
 * Two uses:
 *  - compositionBrief(): words for an image model ("subject in the upper right, calm empty space lower left…").
 *  - placeBackground(): for a library photo with known subject box (src/data/contentImageZones.json), whether to
 *    mirror it and/or move it down so the subject lands clear of the text and QR.
 */
import zonesJson from '../data/contentImageZones.json';

export type PostFormat = 'story' | 'post' | 'square' | 'thumb';
export type PostPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface Rect { x: number; y: number; w: number; h: number }
export interface ImageZones { w: number; h: number; label: string; subject: Rect; photo: Rect; grid: number[]; luma: number[] }

export const IMAGE_ZONES = zonesJson as Record<string, ImageZones>;
export const FORMAT_PX: Record<PostFormat, { w: number; h: number; ratio: string }> = {
  story: { w: 1080, h: 1920, ratio: '9:16' }, post: { w: 1080, h: 1350, ratio: '4:5' }, square: { w: 1080, h: 1080, ratio: '1:1' }, thumb: { w: 1280, h: 720, ratio: '16:9' },
};

// The text package's vertical band for each format (top and bottom placement), from drawPost's anchors with a
// typical two-line headline: 9:16 starts at y 1271 (bottom) or 220 (top); the rest sit 93 px off the edge.
const TEXT_BAND: Record<PostFormat, { top: [number, number]; bottom: [number, number] }> = {
  story: { top: [0.1, 0.5], bottom: [0.58, 0.97] },
  post: { top: [0.06, 0.48], bottom: [0.52, 0.94] },
  square: { top: [0.06, 0.56], bottom: [0.44, 0.94] },
  thumb: { top: [0.06, 0.6], bottom: [0.4, 0.94] },
};
const QR_PX = { small: 180, medium: 250, large: 320 };

const clip = (r: Rect): Rect => {
  const x = Math.max(0, r.x), y = Math.max(0, r.y);
  return { x, y, w: Math.max(0, Math.min(1, r.x + r.w) - x), h: Math.max(0, Math.min(1, r.y + r.h) - y) };
};

/** The text package and QR zones for a format and text position. */
export function layoutZones(fmt: PostFormat, position: PostPosition, qr: keyof typeof QR_PX | null = 'small'): { text: Rect; qr: Rect | null } {
  const top = position.startsWith('top'), right = position.endsWith('right');
  const { w, h } = FORMAT_PX[fmt];
  const textW = fmt === 'thumb' ? 0.45 : 0.8; // margin + the style's max width (743–780 of 1081; 640 on 16:9)
  const [y0, y1] = TEXT_BAND[fmt][top ? 'top' : 'bottom'];
  const text = { x: right ? 1 - textW : 0, y: y0, w: textW, h: y1 - y0 };
  if (!qr) return { text, qr: null };
  const s = fmt === 'thumb' ? h / 1080 : w / 1081;
  const side = QR_PX[qr] * (fmt === 'thumb' ? 0.8 : 1) * s, margin = 91 * s, edge = (fmt === 'thumb' ? 50 : 60) * s;
  const pad = 20 * s; // a little breathing room round the card
  const qx = right ? margin : w - margin - side, qy = top ? h - edge - side : edge;
  return { text, qr: clip({ x: (qx - pad) / w, y: (qy - pad) / h, w: (side + pad * 2) / w, h: (side + pad * 2) / h }) };
}

/** How much of `a` is covered by `b` (0–1). */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w <= 0 || h <= 0 || a.w * a.h === 0 ? 0 : (w * h) / (a.w * a.h);
}

/* ── composition brief for image models ── */
const vName = (y: number) => (y < 0.4 ? 'upper' : y > 0.6 ? 'lower' : 'middle');
const hName = (x: number) => (x < 0.4 ? 'left' : x > 0.6 ? 'right' : 'centre');
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Plain-language layout for the image model: where the subject should go, which area must stay calm and empty
 * for the text package, and which corner stays plain for the QR. The subject goes in the space the text leaves.
 */
export function compositionBrief(fmt: PostFormat, position: PostPosition, qr: boolean = true): string {
  const { text, qr: q } = layoutZones(fmt, position, qr ? 'small' : null);
  const top = position.startsWith('top'), right = position.endsWith('right');
  const textArea = `${top ? 'upper' : 'lower'} ${right ? 'right' : 'left'}`;
  let subject: string;
  if (fmt === 'thumb') subject = `the ${right ? 'left' : 'right'} half of the frame, ${right ? 'left' : 'right'} of centre`;
  else {
    const free = top ? [text.y + text.h, 1] : [0, text.y];
    subject = `the ${top ? 'lower' : 'upper'} ${pct(free[1] - free[0])} of the frame, ${vName((free[0] + free[1]) / 2) === 'middle' ? 'centred' : `leaning ${right ? 'left' : 'right'}`}`;
  }
  const lines = [
    `Composition for a ${FORMAT_PX[fmt].ratio} frame: place the main subject in ${subject}.`,
    `Keep the ${textArea} (about ${pct(text.w)} of the width and ${pct(text.h)} of the height) calm and uncluttered (plain wall, floor, sky or soft out-of-focus light, low contrast) so a headline and button can sit on it.`,
  ];
  if (q) lines.push(`Keep the ${vName(q.y + q.h / 2)} ${hName(q.x + q.w / 2)} corner plain too, for a small QR code.`);
  lines.push(fmt === 'thumb' ? 'Leave the top and bottom edges simple; the image may be cropped slightly.' : 'Keep anything important away from the left and right edges; the image may be cropped slightly.');
  return lines.join(' ');
}

/* ── placing library photos ── */
/** How drawPost lays a photo: mirrored, moved down by `shift` (fraction of the frame, a band fills above), or
 *  `nudge`d up 6% (non-9:16 frames, so the subject isn't cut off at the top). */
export interface Placement { mirror: boolean; shift: number; nudge: boolean }

/** The rules before safe-zone metadata: mirror for right-hand text, move down for top text (not on 16:9). */
export function legacyPlacement(fmt: PostFormat, position: PostPosition): Placement {
  const shift = position.startsWith('top') && fmt !== 'thumb' ? (fmt === 'story' ? 0.38 : 0.3) : 0;
  return { mirror: position.endsWith('right'), shift, nudge: !shift && fmt !== 'story' };
}

/** A generated image is composed for its layout already: draw it as it is. */
export const AS_IS: Placement = { mirror: false, shift: 0, nudge: false };

/** Where a rect of the source image lands on the frame (cover-fit, centred, as drawPost draws it), before
 *  clipping to the frame. */
export function onFrameRaw(r: Rect, img: { w: number; h: number }, fmt: PostFormat, p: Placement): Rect {
  const { w, h } = FORMAT_PX[fmt];
  const scale = Math.max(w / img.w, h / img.h), dw = img.w * scale, dh = img.h * scale;
  const x0 = (w - dw) / 2, y0 = p.shift ? p.shift * h : p.nudge ? -dh * 0.06 : 0;
  const rw = (r.w * dw) / w, x = (x0 + r.x * dw) / w;
  return { x: p.mirror ? 1 - x - rw : x, y: (y0 + r.y * dh) / h, w: rw, h: (r.h * dh) / h };
}
export const onFrame = (r: Rect, img: { w: number; h: number }, fmt: PostFormat, p: Placement): Rect => clip(onFrameRaw(r, img, fmt, p));

export interface PlacedBackground extends Placement { clash: number; fit: 'good' | 'ok' | 'poor' }

/**
 * The placement that keeps the photo's subject clearest of the text package (and, at half weight, the QR).
 * Tries as-is / mirrored, and moved down for top text; mirroring and moving cost a hair, so an untouched photo
 * wins a tie, and a placement that pushes most of the subject off the frame loses. `clash` is the share of the
 * visible subject under the text zone (+ half the QR's share). Unknown images keep the old rules.
 */
export function placeBackground(file: string, fmt: PostFormat, position: PostPosition, zones: Record<string, ImageZones> = IMAGE_ZONES): PlacedBackground {
  const meta = zones[file];
  const legacy = legacyPlacement(fmt, position);
  if (!meta) return { ...legacy, clash: 0, fit: 'ok' };
  const { text, qr } = layoutZones(fmt, position);
  const options: Placement[] = [];
  for (const mirror of [false, true]) for (const shift of legacy.shift ? [0, legacy.shift] : [0]) options.push({ mirror, shift, nudge: !shift && fmt !== 'story' });
  let best: { p: Placement; clash: number; score: number } | null = null;
  for (const p of options) {
    const raw = onFrameRaw(meta.subject, meta, fmt, p), subject = clip(raw);
    const visible = (subject.w * subject.h) / Math.max(1e-6, raw.w * raw.h);
    const clash = overlap(subject, text) + (qr ? overlap(subject, qr) * 0.5 : 0);
    const score = clash + (p.mirror ? 0.01 : 0) + (p.shift ? 0.02 : 0) + (visible < 0.5 ? 1 : 0);
    if (!best || score < best.score) best = { p, clash, score };
  }
  const clash = Math.round(best!.clash * 100) / 100;
  return { ...best!.p, clash, fit: clash < 0.15 ? 'good' : clash < 0.35 ? 'ok' : 'poor' };
}
