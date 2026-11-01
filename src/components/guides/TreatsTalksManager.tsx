/*
 * Treats and Talks in the Guardian's admin: the offers of kind 'treat' and 'talk' that fill the Treats and Talks sections of
 * their public site. Add one, set its category, length, price and description, publish it or keep it as a draft, change it
 * later or remove it. They are ordinary offers underneath, so nothing here is separate from the rest of the Offer builder.
 */
import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createGuideOffer, deleteGuideOffer, updateGuideOfferDetails, type GuideOffer, type GuideProfile } from '../../utils/guidePortal';
import { KIND_LABEL, composeOfferDescription, formatOfferPrice, isTreatKind, parseOfferMeta, type TreatKind } from '../../utils/treatOffers';
import { confirmInPage } from '../../utils/confirmInPage';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', panel = '#11120F', black = '#090A08', acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const field: React.CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 40, padding: '0 12px', border: `1px solid ${line}`, background: black, color: ink, fontFamily: sans, fontSize: 13 };
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 5 };
const button: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', border: `1px solid ${line}`, background: 'transparent', color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', cursor: 'pointer' };

interface Draft { title: string; category: string; minutes: string; price: string; text: string; bookingUrl: string; status: 'draft' | 'published' }
const emptyDraft = (): Draft => ({ title: '', category: '', minutes: '', price: '', text: '', bookingUrl: '', status: 'draft' });
const draftOf = (offer: GuideOffer): Draft => { const meta = parseOfferMeta(offer.description); return { title: offer.title, category: meta.category, minutes: meta.minutes ? String(meta.minutes) : '', price: offer.price_cents ? String(offer.price_cents / 100) : '', text: meta.text, bookingUrl: offer.booking_url || '', status: offer.status }; };
// A currency symbol before the number is fine; any other letters are not a price. Blank means free.
const priceCents = (value: string): number | null => { const text = value.trim().replace(/^(?:A?\$|AUD|USD|GBP|EUR|€|£)\s*/i, ''); if (!text) return 0; if (!/^\d+(\.\d{1,2})?$/.test(text)) return null; return Math.round(Number(text) * 100); };

/** What a draft becomes as an offer row, or the reason it cannot yet. */
export function offerFromDraft(draft: Draft, currency: string): { fields: Pick<GuideOffer, 'title' | 'description' | 'price_cents' | 'access_model' | 'currency' | 'status' | 'booking_url'>; problem: null } | { fields: null; problem: string } {
  if (!draft.title.trim()) return { fields: null, problem: 'Give it a name.' };
  const cents = priceCents(draft.price);
  if (cents === null) return { fields: null, problem: 'Price is a number, like 130 or 95.50.' };
  const minutes = draft.minutes.trim() ? Number(draft.minutes) : null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) return { fields: null, problem: 'Length is a whole number of minutes.' };
  const url = draft.bookingUrl.trim();
  if (url && !/^https?:\/\//i.test(url)) return { fields: null, problem: 'The booking link must start with https://' };
  return { fields: { title: draft.title.trim(), description: composeOfferDescription({ category: draft.category, minutes, text: draft.text }) || null, price_cents: cents, access_model: cents > 0 ? 'paid' : 'free', currency, status: draft.status, booking_url: url || null }, problem: null };
}

function OfferForm({ draft, onChange, kind, id }: { draft: Draft; onChange: (patch: Partial<Draft>) => void; kind: TreatKind; id: string }) {
  const name = KIND_LABEL[kind].one.toLowerCase();
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label><span style={label}>Name</span><input style={field} value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-label={`${id} name`} placeholder={kind === 'treat' ? 'Hot Stone Massage' : 'Food as medicine'} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
        <label><span style={label}>Type</span><input style={field} value={draft.category} onChange={(e) => onChange({ category: e.target.value })} aria-label={`${id} type`} placeholder={kind === 'treat' ? 'Massage' : 'Lecture'} /></label>
        <label><span style={label}>Length (minutes)</span><input style={field} value={draft.minutes} onChange={(e) => onChange({ minutes: e.target.value })} aria-label={`${id} length`} inputMode="numeric" placeholder="60" /></label>
        <label><span style={label}>Price</span><input style={field} value={draft.price} onChange={(e) => onChange({ price: e.target.value })} aria-label={`${id} price`} inputMode="decimal" placeholder="130 (blank is free)" /></label>
      </div>
      <label><span style={label}>Description</span><textarea style={{ ...field, minHeight: 84, padding: '10px 12px', resize: 'vertical' }} value={draft.text} onChange={(e) => onChange({ text: e.target.value })} aria-label={`${id} description`} placeholder={`What a guest gets from this ${name}`} /></label>
      <label><span style={label}>Booking link (optional)</span><input style={field} value={draft.bookingUrl} onChange={(e) => onChange({ bookingUrl: e.target.value })} aria-label={`${id} booking link`} inputMode="url" placeholder="https://… (otherwise guests email you)" /></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: ink, fontFamily: sans, fontSize: 12 }}><input type="checkbox" checked={draft.status === 'published'} onChange={(e) => onChange({ status: e.target.checked ? 'published' : 'draft' })} aria-label={`${id} published`} />Published on my site</label>
    </div>
  );
}

function Row({ offer, currency, guideId, onSaved, onDeleted }: { offer: GuideOffer; currency: string; guideId: string; onSaved: (offer: GuideOffer) => void; onDeleted: (id: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(offer));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const kind = offer.kind as TreatKind;
  async function save() {
    const built = offerFromDraft(draft, currency);
    if (!built.fields) { setMessage(built.problem); return; }
    setBusy(true); setMessage('');
    try { const saved = await updateGuideOfferDetails(guideId, offer.id, built.fields); onSaved({ ...offer, ...saved }); setMessage('Saved.'); }
    catch (error) { setMessage((error as Error).message || 'Could not save.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!(await confirmInPage(`Delete ${offer.title}?`))) return;
    setBusy(true); setMessage('');
    try { await deleteGuideOffer(guideId, offer.id); onDeleted(offer.id); }
    catch (error) { setMessage((error as Error).message || 'Could not delete.'); setBusy(false); }
  }
  return (
    <details data-managed-offer={offer.id} style={{ border: `1px solid ${line}`, background: panel }}>
      <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', cursor: 'pointer', listStyle: 'none' }}>
        <span style={{ fontFamily: serif, fontSize: 19 }}>{offer.title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: muted, fontFamily: sans, fontSize: 11 }}>
          <span>{formatOfferPrice(offer.price_cents, offer.currency, offer.access_model)}</span>
          <span style={{ color: offer.status === 'published' ? acid : muted, textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 9, fontWeight: 800 }}>{offer.status}</span>
        </span>
      </summary>
      <div style={{ padding: 14, borderTop: `1px solid ${line}`, display: 'grid', gap: 12 }}>
        <OfferForm draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} kind={kind} id={offer.title} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={save} disabled={busy} style={{ ...button, background: ink, color: black }}>{busy ? <Loader2 size={12} className="animate-spin" /> : null}Save changes</button>
          <button type="button" onClick={remove} disabled={busy} aria-label={`Delete ${offer.title}`} style={button}><Trash2 size={12} />Delete</button>
          {message && <span role={message === 'Saved.' ? 'status' : 'alert'} style={{ color: message === 'Saved.' ? acid : '#F0A7A7', fontFamily: sans, fontSize: 11 }}>{message}</span>}
        </div>
      </div>
    </details>
  );
}

export function TreatsTalksManager({ profile, offers, onChange }: { profile: GuideProfile; offers: GuideOffer[]; onChange: (offers: GuideOffer[]) => void }) {
  const [adding, setAdding] = useState<TreatKind | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currency = offers.find((offer) => isTreatKind(offer.kind))?.currency || profile.social_links?.currency || 'AUD';
  const managed = offers.filter((offer) => isTreatKind(offer.kind));

  async function create() {
    if (!adding) return;
    const built = offerFromDraft(draft, currency);
    if (!built.fields) { setMessage(built.problem); return; }
    setBusy(true); setMessage('');
    try {
      const { booking_url, ...rest } = built.fields;
      const created = await createGuideOffer(profile.user_id, { kind: adding, affiliate_url: null, file_path: null, booking_url, ...rest });
      onChange([created, ...offers]);
      setAdding(null); setDraft(emptyDraft());
    } catch (error) { setMessage((error as Error).message || 'Could not add it.'); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Treats and talks" style={{ maxWidth: 1100, margin: '46px auto 0', border: `1px solid ${line}`, background: '#0D0E0B', padding: 'clamp(16px,3vw,28px)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', justifyContent: 'space-between', gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ ...label, color: acid, marginBottom: 6 }}>Offers · {managed.length}</div>
          <h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(30px,4vw,44px)', lineHeight: 1.05, margin: 0, color: ink }}>Treats and talks</h2>
          <p style={{ color: muted, fontFamily: sans, fontSize: 13, lineHeight: 1.6, margin: '8px 0 0', maxWidth: 560 }}>Spa treatments and lectures guests can book. What you publish here fills the Treats and Talks sections of your site.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['treat', 'talk'] as TreatKind[]).map((kind) => <button key={kind} type="button" onClick={() => { setAdding(kind); setDraft(emptyDraft()); setMessage(''); }} style={button}><Plus size={12} />Add a {KIND_LABEL[kind].one.toLowerCase()}</button>)}
        </div>
      </div>

      {adding && (
        <div role="group" aria-label={`New ${KIND_LABEL[adding].one.toLowerCase()}`} style={{ border: `1px solid ${acid}`, background: panel, padding: 14, marginBottom: 16, display: 'grid', gap: 12 }}>
          <strong style={{ fontFamily: serif, fontSize: 20, fontWeight: 300, color: ink }}>New {KIND_LABEL[adding].one.toLowerCase()}</strong>
          <OfferForm draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} kind={adding} id="New" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={create} disabled={busy} style={{ ...button, background: ink, color: black }}>{busy ? <Loader2 size={12} className="animate-spin" /> : null}Add it</button>
            <button type="button" onClick={() => { setAdding(null); setMessage(''); }} disabled={busy} style={button}>Cancel</button>
            {message && <span role="alert" style={{ color: '#F0A7A7', fontFamily: sans, fontSize: 11 }}>{message}</span>}
          </div>
        </div>
      )}

      {(['treat', 'talk'] as TreatKind[]).map((kind) => {
        const list = managed.filter((offer) => offer.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} style={{ marginBottom: 16 }}>
            <h3 style={{ ...label, color: ink, margin: '0 0 8px' }}>{KIND_LABEL[kind].many} · {list.length}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {list.map((offer) => <Row key={offer.id} offer={offer} currency={currency} guideId={profile.user_id} onSaved={(saved) => onChange(offers.map((item) => item.id === saved.id ? saved : item))} onDeleted={(id) => onChange(offers.filter((item) => item.id !== id))} />)}
            </div>
          </div>
        );
      })}
      {!managed.length && !adding && <p style={{ color: muted, fontFamily: sans, fontSize: 12, margin: 0 }}>Nothing here yet. Add a treat or a talk to start.</p>}
    </section>
  );
}
