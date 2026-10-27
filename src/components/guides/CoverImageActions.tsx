/*
 * The ways to change a product's or offer's picture, in one row: upload one (a click or a dropped file, through the
 * shared PhotoDropzone), replace it with an AI picture in the house style, or remove it. Every route ends in
 * `onChange(url)`, so the caller decides where the address is kept (an offer's cover_url, a product's image link).
 */
import { useState } from 'react';
import { ImageOff, Loader2, Upload } from 'lucide-react';
import { PhotoDropzone } from '../PhotoDropzone';
import { AiImageReplace } from './AiImageReplace';
import { uploadGuideImage } from '../../utils/guidePortal';

const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,0.24)';
const acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const btn: React.CSSProperties = { minHeight: 36, border: `1px solid ${line}`, background: 'transparent', color: ink, padding: '0 13px', borderRadius: 4, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 };

const COVER_ACCEPT = 'image/jpeg,image/png,image/webp';
const COVER_MAX_MB = 8; // the guide-assets bucket's ceiling for a still image
const coverProblem = (file: File) => (/^image\/(?:jpeg|png|webp)$/.test(file.type) ? (file.size > COVER_MAX_MB * 1024 * 1024 ? `The image must be smaller than ${COVER_MAX_MB} MB.` : null) : 'Choose a JPG, PNG or WebP image.');
const errorText = (error: unknown) => (error as { message?: string } | null)?.message || 'Something went wrong. Please try again.';

export interface CoverImageActionsProps {
  /** The signed-in Guardian: their own folder in guide-assets. */
  userId: string;
  title: string;
  description?: string | null;
  /** guide_offers.kind, or "product" for a shop product. */
  kind?: string | null;
  imageUrl?: string | null;
  /** Keep the new picture (or null for none). A rejection is shown to the person and nothing is reported as changed. */
  onChange: (url: string | null) => void | Promise<void>;
  onOpenContentBuilder?: () => void;
  /** Smaller print under the buttons, e.g. where the picture shows. */
  hint?: string;
}

export function CoverImageActions({ userId, title, description, kind, imageUrl, onChange, onOpenContentBuilder, hint }: CoverImageActionsProps) {
  const [working, setWorking] = useState<'upload' | 'remove' | null>(null);
  const [message, setMessage] = useState('');

  async function upload(file: File) {
    setWorking('upload'); setMessage('');
    try { await onChange(await uploadGuideImage(userId, file, 'cover')); }
    catch (error) { setMessage(errorText(error)); }
    finally { setWorking(null); }
  }
  async function remove() {
    setWorking('remove'); setMessage('');
    try { await onChange(null); }
    catch (error) { setMessage(errorText(error)); }
    finally { setWorking(null); }
  }

  return <PhotoDropzone onFile={(file) => void upload(file)} validate={coverProblem} onReject={setMessage} accept={COVER_ACCEPT} disabled={working !== null}>
    {({ open, dragging }) => <div style={{ border: `1px dashed ${dragging ? acid : line}`, background: dragging ? 'rgba(199,216,163,.1)' : 'transparent', padding: 10, marginTop: 10, display: 'grid', gap: 8, fontFamily: sans }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={open} disabled={working !== null} style={{ ...btn, opacity: working ? 0.5 : 1 }}>{working === 'upload' ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" />Uploading…</> : <><Upload size={13} aria-hidden="true" />Upload image</>}</button>
        <AiImageReplace userId={userId} title={title} description={description} kind={kind} currentUrl={imageUrl} disabled={working !== null} onAccepted={(url) => onChange(url)} onOpenContentBuilder={onOpenContentBuilder} buttonStyle={{ minHeight: 36, padding: '0 13px' }} />
        {imageUrl && <button type="button" onClick={() => void remove()} disabled={working !== null} style={{ ...btn, border: 0, color: muted, opacity: working ? 0.5 : 1 }}>{working === 'remove' ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <ImageOff size={13} aria-hidden="true" />}Remove image</button>}
      </div>
      <span style={{ color: muted, fontSize: 10.5, lineHeight: 1.45 }}>{hint ?? 'Drop an image here, or upload one. JPG, PNG or WebP, up to 8 MB.'}</span>
      {message && <span role="alert" style={{ color: '#E8A39B', fontSize: 11 }}>{message}</span>}
    </div>}
  </PhotoDropzone>;
}
