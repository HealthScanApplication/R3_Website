/**
 * The creator credit that opens a post's text package: a black pill, the Guardian's picture on the left, then "From @handle".
 *
 * Why it looks like this: the credit used to be a white strip with a tiny 34 px picture and read "Guidance by BARBARA O'NEILL ·
 * @BARBARA-ONEILL", which said the same person twice. The handle already names her, so the line is now "From @handle" (the name
 * is spoken only when there is no handle to say it for her), the picture is more than twice the size, and the pill is black so it reads
 * the same on a cream wash, a white card, a photo or a video. The picture sits on a light tile inside the circle, which keeps a
 * transparent portrait or a dark logo readable against the black. Drawn on the post canvas, so the download is what you see.
 */

const PILL = 'rgba(11,12,9,0.94)';
const TILE = '#F5F2EA';
const INK = '#0B0C09';
const LEAD = 'rgba(245,242,234,0.74)';
const SANS = 'Inter, sans-serif';
const LEADS = ['From', 'Guidance by'];

/** "From @handle" for a Guardian with a page handle, else "Guidance by Name"; empty when there is no creator to credit. */
export function creatorCredit(creator: string | null | undefined, handle: string | null | undefined): string {
  const name = (creator || '').trim();
  if (!name) return '';
  const at = (handle || '').trim();
  return at ? `From ${at}` : `Guidance by ${name}`;
}

/** The credit split into its quiet lead ("From") and the name or handle that follows it; a credit without a known lead is all name. */
export function splitCredit(credit: string): { lead: string; name: string } {
  const text = credit.trim();
  const lead = LEADS.find((l) => text.toLowerCase().startsWith(`${l.toLowerCase()} `));
  return lead ? { lead: text.slice(0, lead.length), name: text.slice(lead.length).trim() } : { lead: '', name: text };
}

/** The letter shown in the circle when the Guardian has no picture: the first of the handle or name, not of "From". */
export const creditInitial = (credit: string): string => splitCredit(credit).name.replace(/^@+/, '').charAt(0).toUpperCase();

export interface CreditLayout { lead: string; name: string; size: number; leadW: number; w: number; h: number; face: number; pad: number; gap: number }

/**
 * The pill's size at scale `s` (1 = the 1081-wide frame), or null with no credit. The text shrinks, down to a floor, rather than
 * run wider than `maxW`, so a long handle cannot push the pill out of the text column.
 */
export function measureCredit(ctx: CanvasRenderingContext2D, credit: string, s: number, maxW = Infinity): CreditLayout | null {
  if (!credit.trim()) return null;
  const { lead, name } = splitCredit(credit);
  const face = 76 * s, pad = 6 * s, gap = 18 * s, tail = 32 * s;
  const fixed = pad + face + gap + tail;
  const widths = (size: number) => {
    ctx.font = `500 ${size}px ${SANS}`; const leadW = lead ? ctx.measureText(`${lead} `).width : 0;
    ctx.font = `700 ${size}px ${SANS}`; const nameW = ctx.measureText(name).width;
    return { leadW, nameW };
  };
  let size = 28 * s;
  let { leadW, nameW } = widths(size);
  if (fixed + leadW + nameW > maxW && leadW + nameW > 0) {
    size = Math.max(16 * s, size * Math.max(0, maxW - fixed) / (leadW + nameW));
    ({ leadW, nameW } = widths(size));
  }
  return { lead, name, size, leadW, w: fixed + leadW + nameW, h: face + pad * 2, face, pad, gap };
}

/** A loaded picture and how to fit it in the circle: a portrait fills it, a logo sits inside it with room round it. */
export interface CreditPicture { image: { naturalWidth: number; naturalHeight: number } & CanvasImageSource; fit: 'cover' | 'contain' }

function pillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
}

/** Draws the pill with its top-left corner at (x, y), at the size `measureCredit` returned. */
export function drawCredit(ctx: CanvasRenderingContext2D, credit: string, layout: CreditLayout, x: number, y: number, picture: CreditPicture | null) {
  const { face, pad, h, w, size, lead, name, leadW, gap } = layout;
  const cx = x + pad + face / 2, cy = y + h / 2;
  ctx.save();
  pillPath(ctx, x, y, w, h); ctx.fillStyle = PILL; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, face / 2, 0, Math.PI * 2); ctx.fillStyle = TILE; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, face / 2, 0, Math.PI * 2); ctx.clip();
  if (picture?.image.naturalWidth) {
    const { image, fit } = picture;
    const box = fit === 'contain' ? face * 0.68 : face;
    const k = fit === 'cover' ? Math.max(box / image.naturalWidth, box / image.naturalHeight) : Math.min(box / image.naturalWidth, box / image.naturalHeight);
    const dw = image.naturalWidth * k, dh = image.naturalHeight * k;
    // A portrait taller than the circle keeps its top, where the face is, instead of being cropped about the middle.
    const dy = fit === 'cover' && dh > box ? cy - face / 2 : cy - dh / 2;
    ctx.drawImage(image, cx - dw / 2, dy, dw, dh);
  } else {
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = `700 ${face * 0.46}px Archivo, Inter, sans-serif`;
    ctx.fillText(creditInitial(credit), cx, cy + face * 0.16);
  }
  ctx.restore();
  const tx = x + pad + face + gap, ty = cy + size * 0.35;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (lead) { ctx.font = `500 ${size}px ${SANS}`; ctx.fillStyle = LEAD; ctx.fillText(`${lead} `, tx, ty); }
  ctx.font = `700 ${size}px ${SANS}`; ctx.fillStyle = '#FFFFFF'; ctx.fillText(name, tx + leadW, ty);
  ctx.restore();
}
