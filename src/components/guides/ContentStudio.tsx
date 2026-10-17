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

const FIGMA_TEMPLATE = 'https://www.figma.com/design/6HS7WXK5SFoLh41AkzKzMZ/--R%C2%B3---Routine%C2%B3-%E2%80%A2-Libray?node-id=12-886';
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Italiana&family=Inter:wght@600&family=Nanum+Myeongjo&display=swap';

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
 * Apple-style QR on a white rounded card: round dots, rounded-square finder eyes and an R³ mark in the
 * middle. The mark covers ~6% of the code, well inside error correction Q (25%); Q keeps the grid
 * coarser than H, so it still reads when the post is shown small on a screen or screenshotted.
 */
function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  const n = qr.modules.size;
  const pad = size * 0.08, cell = (size - pad * 2) / n;
  ctx.save();
  ctx.shadowColor = 'rgba(17,17,17,0.18)'; ctx.shadowBlur = size * 0.06; ctx.shadowOffsetY = size * 0.015;
  ctx.fillStyle = '#FFFFFF'; roundRect(ctx, x, y, size, size, size * 0.12); ctx.fill();
  ctx.restore();
  const ox = x + pad, oy = y + pad;
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const logo = Math.round(n * 0.22) | 1, lo = (n - logo) / 2; // centre square kept clear for the mark
  const inLogo = (r: number, c: number) => r + 1 > lo && r < lo + logo && c + 1 > lo && c < lo + logo;
  ctx.fillStyle = '#111111';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.modules.get(r, c) || finder(r, c) || inLogo(r, c)) continue;
    ctx.beginPath(); ctx.arc(ox + (c + 0.5) * cell, oy + (r + 0.5) * cell, cell * 0.47, 0, Math.PI * 2); ctx.fill();
  }
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const fx = ox + c * cell, fy = oy + r * cell;
    ctx.lineWidth = cell; ctx.strokeStyle = '#111111';
    roundRect(ctx, fx + cell / 2, fy + cell / 2, cell * 6, cell * 6, cell * 2); ctx.stroke();
    roundRect(ctx, fx + cell * 2, fy + cell * 2, cell * 3, cell * 3, cell * 1.1); ctx.fill();
  }
  const m = logo * cell, mx = ox + lo * cell, my = oy + lo * cell;
  ctx.fillStyle = '#FFFFFF'; roundRect(ctx, mx, my, m, m, m * 0.24); ctx.fill();
  ctx.lineWidth = Math.max(1, m * 0.04); ctx.strokeStyle = '#111111'; roundRect(ctx, mx + m * 0.12, my + m * 0.12, m * 0.76, m * 0.76, m * 0.16); ctx.stroke();
  ctx.fillStyle = '#111111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${m * 0.36}px Inter`; ctx.fillText('R³', mx + m / 2, my + m / 2 + m * 0.02);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

async function drawPost(canvas: HTMLCanvasElement, fmt: (typeof FORMATS)[number], bg: string, copy: { headline: string; subline: string; cta: string; credit: string; qr?: string }) {
  const { w, h } = fmt;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  await Promise.all([document.fonts.load('111px Italiana'), document.fonts.load('52px "Nanum Myeongjo"'), document.fonts.load('600 28px Inter')]).catch(() => {});
  const img = new Image(); img.src = bg;
  await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
  ctx.fillStyle = '#EFE6DB'; ctx.fillRect(0, 0, w, h);
  // Cover the frame from the top of the photo (faces and objects sit high in the library images).
  if (img.naturalWidth) {
    const scale = Math.max(w / img.naturalWidth, (fmt.id === 'thumb' ? h : h * 1.0) / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, fmt.id === 'story' ? 0 : -dh * 0.06, dw, dh);
  }
  // Cream fade behind the text (the library images carry their own fade at 9:16; this keeps other ratios legible).
  const s = fmt.id === 'thumb' ? h / 1080 : w / 1081;
  if (fmt.id === 'thumb') {
    const g = ctx.createLinearGradient(0, 0, w * 0.62, 0); g.addColorStop(0, 'rgba(239,230,219,0.96)'); g.addColorStop(0.75, 'rgba(239,230,219,0.75)'); g.addColorStop(1, 'rgba(239,230,219,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } else if (fmt.id !== 'story') {
    const g = ctx.createLinearGradient(0, h * 0.35, 0, h); g.addColorStop(0, 'rgba(239,230,219,0)'); g.addColorStop(0.45, 'rgba(239,230,219,0.92)'); g.addColorStop(1, 'rgba(239,230,219,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  const x = 91 * s;
  ctx.fillStyle = '#111111'; ctx.textBaseline = 'alphabetic';
  // CTA box size first: the QR sits beside it, and the text above wraps short of the QR.
  ctx.font = `600 ${28 * s}px Inter`;
  const label = copy.cta.toUpperCase();
  const tracking = 28 * s * 0.3;
  const textW = [...label].reduce((sum, ch) => sum + ctx.measureText(ch).width + tracking, -tracking);
  const boxW = textW + 64 * s, boxH = 95 * s;
  // QR to the CTA link, bottom-aligned with the button on the right; shrinks (or is left out) if the button is long.
  const right = w - 91 * s;
  const qrFit = copy.qr ? Math.min((fmt.id === 'thumb' ? 220 : 260) * s, right - (x + boxW + 36 * s)) : 0;
  const qrSize = qrFit >= 150 * s ? qrFit : 0;
  const maxW = Math.min((fmt.id === 'thumb' ? 640 : 743) * s, qrSize ? right - qrSize - 36 * s - x : Infinity);
  ctx.font = `${111 * s}px Italiana`;
  const head = wrap(ctx, copy.headline, maxW);
  ctx.font = `${52 * s}px "Nanum Myeongjo", serif`;
  const sub = copy.subline ? wrap(ctx, copy.subline, maxW) : [];
  const blockH = head.length * 116 * s + 30 * s + sub.length * 66 * s + 52 * s + 95 * s;
  // 9:16 keeps the Figma position (y 1271) unless a long headline/subline would push the CTA off the frame;
  // other ratios sit the block 93px from the bottom.
  let y = fmt.id === 'story' ? Math.min(1271 * s, h - 93 * s - blockH) : fmt.id === 'thumb' ? (h - blockH) / 2 : h - 93 * s - blockH;
  ctx.font = `${111 * s}px Italiana`;
  for (const line of head) { y += 116 * s; ctx.fillText(line, x, y - 22 * s); }
  y += 30 * s;
  ctx.font = `${52 * s}px "Nanum Myeongjo", serif`;
  for (const line of sub) { y += 66 * s; ctx.fillText(line, x, y - 14 * s); }
  y += 52 * s;
  // CTA box: Inter SemiBold 28 / 30% tracking, 2px black border on white.
  ctx.font = `600 ${28 * s}px Inter`;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, boxW, boxH);
  ctx.lineWidth = 2 * s; ctx.strokeStyle = '#111111'; ctx.strokeRect(x, y, boxW, boxH);
  ctx.fillStyle = '#111111';
  let cx = x + 32 * s;
  for (const ch of label) { ctx.fillText(ch, cx, y + boxH / 2 + 10 * s); cx += ctx.measureText(ch).width + tracking; }
  if (copy.qr && qrSize) drawQr(ctx, copy.qr, right - qrSize, y + boxH - qrSize, qrSize);
  // Creator credit, top left: who this guidance comes from.
  if (copy.credit) {
    ctx.font = `600 ${20 * s}px Inter`;
    const t = copy.credit.toUpperCase();
    const pad = 14 * s, tw = ctx.measureText(t).width;
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fillRect(x, 70 * s, tw + pad * 2, 44 * s);
    ctx.fillStyle = '#111111'; ctx.fillText(t, x + pad, 70 * s + 29 * s);
  }
}

export function ContentStudio({ creator, audience, problem, offers, siteUrl, heading = 'Create posts for this offer path' }: { creator: string; audience: string; problem: string; offers: StudioOffer[]; siteUrl: string; heading?: string }) {
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
  const [copied, setCopied] = useState('');
  useEffect(() => {
    setHeadline(`Build a routine for ${solution}`);
    setSubline(offer.description ? offer.description.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '') : `Simple daily actions for ${audience.toLowerCase()}`);
    setCta(offer.free ? 'Unlock the free routine' : 'Start the Protocol');
  }, [offerIndex, solution, audience]);
  const fmt = FORMATS.find((f) => f.id === fmtId)!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const background = bg || autoBg;
  const credit = creator ? `Guidance by ${creator}` : '';
  const fullUrl = siteUrl.startsWith('http') ? siteUrl : `https://routine3.com${siteUrl}`;
  useEffect(() => {
    if (canvasRef.current) drawPost(canvasRef.current, fmt, bgUrl(background), { headline, subline, cta, credit, qr: fullUrl });
  }, [fmt, background, headline, subline, cta, credit, fullUrl, fontsReady]);
  const tag = solution.replace(/\s+/g, '');
  const captions: Record<string, string> = {
    TikTok: `${problem}? Here's a simple routine for ${solution} for ${audience.toLowerCase()}. ${offer.free ? 'Free' : 'Start'} "${offer.title}" by ${creator}. Link in bio. #${tag} #routine #wellbeing`,
    Instagram: `${headline}.\n\nFor ${audience.toLowerCase()} dealing with ${problem.toLowerCase()}: ${subline.toLowerCase()}.\n\n${offer.title} — guidance by ${creator}. ${cta} at the link in bio.\n\n#${tag} #routine3 #healthyhabits`,
    YouTube: `${headline} | ${offer.title}\n\n${creator} shares a practical routine for ${audience.toLowerCase()} with ${problem.toLowerCase()}.\n\n${cta}: ${fullUrl}`,
  };
  const download = () => { const url = canvasRef.current?.toDataURL('image/png'); if (!url) return; const a = document.createElement('a'); a.href = url; a.download = `${tag}-${fmt.id}-${fmt.w}x${fmt.h}.png`; a.click(); };
  const copy = (key: string) => { navigator.clipboard?.writeText(captions[key]).then(() => { setCopied(key); window.setTimeout(() => setCopied(''), 1600); }); };
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
        <div><span style={lab}>Format</span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>{FORMATS.map((f) => <button key={f.id} type="button" aria-pressed={fmtId === f.id} onClick={() => setFmtId(f.id)} style={{ minHeight: 44, border: `1px solid ${fmtId === f.id ? acid : line}`, background: fmtId === f.id ? '#20251B' : 'transparent', color: ink, textAlign: 'left', padding: '6px 10px', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 12 }}>{f.label}</strong><span style={{ display: 'block', color: muted, fontSize: 9.5 }}>{f.platforms}</span></button>)}</div></div>
        <label><span style={lab}>Headline</span><input value={headline} onChange={(e) => setHeadline(e.target.value)} style={field} /></label>
        <label><span style={lab}>Subline</span><input value={subline} onChange={(e) => setSubline(e.target.value)} style={field} /></label>
        <label><span style={lab}>Button</span><input value={cta} onChange={(e) => setCta(e.target.value)} style={field} /></label>
        <div><span style={lab}>Background {bg ? '' : '· auto'}</span><div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5 }}>{BACKGROUNDS.map((b) => <button key={b.file} type="button" title={b.label} aria-pressed={background === b.file} onClick={() => setBg(b.file)} style={{ aspectRatio: '9 / 16', padding: 0, border: `2px solid ${background === b.file ? acid : 'transparent'}`, background: `url(${bgUrl(b.file)}) center/cover`, cursor: 'pointer' }} />)}</div></div>
        <button type="button" onClick={download} style={{ height: 42, border: `1px solid ${ink}`, background: ink, color: '#090A08', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}><Download size={14} /> Download {fmt.w}×{fmt.h} PNG</button>
        <div style={{ display: 'grid', gap: 8 }}>{Object.keys(captions).map((k) => <div key={k} style={{ border: `1px solid ${line}`, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={{ ...lab, margin: 0, color: acid }}>{k} caption</span><button type="button" onClick={() => copy(k)} style={{ border: 0, background: 'transparent', color: muted, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><Copy size={12} />{copied === k ? 'Copied' : 'Copy'}</button></div>
          <p style={{ margin: 0, color: ink, fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{captions[k]}</p>
        </div>)}</div>
      </div>
      <div className="g-sticky" style={{ display: 'grid', placeItems: 'center' }}>
        <canvas ref={canvasRef} aria-label={`${fmt.platforms} preview`} style={{ width: fmt.w >= fmt.h ? '100%' : `${Math.round(640 * fmt.w / fmt.h)}px`, maxWidth: '100%', aspectRatio: `${fmt.w} / ${fmt.h}`, height: 'auto', boxShadow: '0 14px 36px rgba(0,0,0,.4)' }} />
      </div>
    </div>
  </section>;
}
