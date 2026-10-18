/*
 * Brand kit editor for one Guardian brand: logo, background (image or looping video), typeface from Google
 * Fonts, and CTA colours (two brand colours, or monochrome black on white / white on black), with a live preview.
 * Used by setup step 01 and the Site builder, so both edit the same thing.
 */
import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, Palette, Type, Upload, X } from 'lucide-react';
import { BRAND_FONTS, ctaColours, ensureBrandFont, type BrandKit, type MonoStyle } from '../../utils/brandKit';
import { uploadGuideImage } from '../../utils/guidePortal';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3', panel = '#11120F';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const label: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: muted, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 7px' };
const pill = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? acid : line}`, background: on ? 'rgba(199,216,163,.14)' : 'transparent', color: on ? acid : ink, padding: '7px 11px', fontFamily: sans, fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 2 });
const uploadBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: ink, border: `1px solid ${line}`, padding: '7px 11px', fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' };

export function BrandKitFields({ userId, brandName, kit, onChange, logoUrl, onLogo }: {
  userId: string; brandName: string; kit: BrandKit; onChange: (kit: BrandKit) => void; logoUrl: string | null; onLogo: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState<'logo' | 'background' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { ensureBrandFont(kit.font); }, [kit.font]);
  const set = (patch: Partial<BrandKit>) => onChange({ ...kit, ...patch });
  const upload = async (which: 'logo' | 'background', file?: File) => {
    if (!file) return;
    setBusy(which); setError('');
    try {
      const url = await uploadGuideImage(userId, file);
      if (which === 'logo') onLogo(url); else set({ background: url, backgroundType: file.type.startsWith('video/') ? 'video' : 'image' });
    } catch (e) { setError((e as Error).message || 'Upload failed.'); }
    finally { setBusy(null); }
  };
  const cta = ctaColours(kit);
  const name = brandName.trim() || 'Your brand';
  return <section aria-label="Brand kit" style={{ border: `1px solid ${line}`, background: panel, padding: 14, marginTop: 24 }}>
    <div style={{ ...label, color: acid }}><Palette size={12} aria-hidden="true" />Brand kit · {name}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ width: 40, height: 40, border: `1px solid ${line}`, display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#FFF' }}>{logoUrl ? <img src={logoUrl} alt={`${name} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImagePlus size={15} color="#888" aria-hidden="true" />}</span>
          <label style={uploadBtn}>{busy === 'logo' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{logoUrl ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Upload logo" onChange={(e) => upload('logo', e.target.files?.[0])} style={{ display: 'none' }} /></label>
          {logoUrl && <button type="button" onClick={() => onLogo(null)} style={{ ...uploadBtn, border: 0, color: muted }}><X size={12} />Remove</button>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={uploadBtn}>{busy === 'background' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}{kit.background ? 'Replace background' : 'Background image, GIF or video'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" aria-label="Upload background image, GIF or video" onChange={(e) => upload('background', e.target.files?.[0])} style={{ display: 'none' }} /></label>
          {kit.background && <button type="button" onClick={() => set({ background: '', backgroundType: '' })} style={{ ...uploadBtn, border: 0, color: muted }}><X size={12} />Remove</button>}
          <span style={{ color: muted, fontSize: 10 }}>JPG, PNG, WebP, an animated GIF (up to 15 MB) or a looping MP4/WebM (up to 25 MB).</span>
        </div>
        <div>
          <label htmlFor="brand-font" style={label}><Type size={11} aria-hidden="true" />Typeface · Google Fonts</label>
          <select id="brand-font" value={kit.font} onChange={(e) => set({ font: e.target.value })} style={{ width: '100%', height: 40, border: `1px solid ${line}`, background: '#090A08', color: ink, padding: '0 10px', fontFamily: `"${kit.font}", ${sans}`, fontSize: 15 }}>
            {(['Sans', 'Serif', 'Display'] as const).map((kind) => <optgroup key={kind} label={kind}>{BRAND_FONTS.filter((f) => f.kind === kind).map((f) => <option key={f.family} value={f.family}>{f.family}</option>)}</optgroup>)}
          </select>
        </div>
        <div>
          <span style={label}>Buttons</span>
          <div role="group" aria-label="Button style" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button type="button" aria-pressed={kit.ctaMode === 'colour'} onClick={() => set({ ctaMode: 'colour' })} style={pill(kit.ctaMode === 'colour')}>Brand colours</button>
            <button type="button" aria-pressed={kit.ctaMode === 'mono'} onClick={() => set({ ctaMode: 'mono' })} style={pill(kit.ctaMode === 'mono')}>Monochrome</button>
          </div>
          {kit.ctaMode === 'colour'
            ? <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{(['primary', 'secondary'] as const).map((k) => <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, color: ink, fontFamily: sans, fontSize: 11 }}>
              <input type="color" aria-label={`${k === 'primary' ? 'Primary' : 'Secondary'} CTA colour`} value={kit[k]} onChange={(e) => set({ [k]: e.target.value.toUpperCase() })} style={{ width: 34, height: 28, border: `1px solid ${line}`, background: 'transparent', padding: 0 }} />
              {k === 'primary' ? 'Primary' : 'Secondary'} <code style={{ color: muted, fontSize: 10 }}>{kit[k]}</code></label>)}</div>
            : <div role="group" aria-label="Monochrome style" style={{ display: 'flex', gap: 6 }}>{([['black_on_white', 'Black on white'], ['white_on_black', 'White on black']] as Array<[MonoStyle, string]>).map(([id, text]) => <button key={id} type="button" aria-pressed={kit.mono === id} onClick={() => set({ mono: id })} style={pill(kit.mono === id)}>{text}</button>)}</div>}
        </div>
        {error && <p role="alert" style={{ color: '#E8B86A', fontSize: 11, margin: 0 }}>{error}</p>}
      </div>
      {/* Live preview: how the brand reads on a page or post. */}
      <div aria-label="Brand preview" style={{ position: 'relative', minHeight: 220, overflow: 'hidden', border: `1px solid ${line}`, background: '#1B1C18', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 18 }}>
        {kit.background && kit.backgroundType === 'video' && <video src={kit.background} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {kit.background && kit.backgroundType === 'image' && <img src={kit.background} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.6))' }} />
        <div style={{ position: 'relative', color: '#FFF' }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ height: 30, maxWidth: 120, objectFit: 'contain', marginBottom: 10, background: '#FFF', padding: 3 }} />}
          <div style={{ fontFamily: `"${kit.font}", ${sans}`, fontSize: 26, lineHeight: 1.05, marginBottom: 12 }}>{name}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([['Start the routine', cta.primary], ['Learn more', cta.secondary]] as const).map(([text, c]) => <span key={text} style={{ background: c.background, color: c.color, border: `1.5px solid ${c.border}`, padding: '8px 13px', fontFamily: `"${kit.font}", ${sans}`, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{text}</span>)}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
