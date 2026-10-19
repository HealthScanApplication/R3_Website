/*
 * Under an offer card: which routine the offer delivers, and, once one is chosen, "Share routine link" for it.
 * The choice is stored in guide_offer_routines (owner-only; guide_offers itself is publicly readable, so the routine id
 * does not go there). Onboarding names a routine after the offer without recording the link, so a routine with the
 * offer's name is suggested.
 */
import { useState } from 'react';
import { Link2 } from 'lucide-react';
import type { AdminProtocol } from '../../utils/protocolAdmin';
import type { GuideOffer } from '../../utils/guidePortal';
import { setOfferRoutine } from '../../utils/routineShare';
import { RoutineShareLink } from './RoutineShareLink';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3', warn = '#E8B86A';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The Guardian's own routine whose name is the offer's title, if there is exactly one. */
export function suggestOfferRoutine(offerTitle: string, protocols: AdminProtocol[], guideId: string): AdminProtocol | null {
  const mine = protocols.filter((p) => !p.user_id || p.user_id === guideId);
  const wanted = squash(offerTitle);
  if (!wanted) return null;
  const hits = mine.filter((p) => squash(p.name) === wanted);
  return hits.length === 1 ? hits[0] : null;
}

export function OfferRoutineLink({ offer, protocols, guideId, guardianSlug, linkedProtocolId, onChange }: { offer: GuideOffer; protocols: AdminProtocol[]; guideId: string; guardianSlug?: string; linkedProtocolId?: string; onChange: (offerId: string, protocolId: string | null) => void }) {
  const mine = protocols.filter((p) => !p.user_id || p.user_id === guideId);
  const linked = linkedProtocolId ? protocols.find((p) => p.id === linkedProtocolId) : undefined;
  const suggestion = suggestOfferRoutine(offer.title, protocols, guideId);
  const [choice, setChoice] = useState(suggestion?.id || '');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save(protocolId: string | null) {
    setBusy(true); setMessage('');
    try { await setOfferRoutine(guideId, offer.id, protocolId); onChange(offer.id, protocolId); setChanging(false); }
    catch (error: any) { setMessage(error?.message || 'Could not save the routine for this offer.'); }
    finally { setBusy(false); }
  }

  const small: React.CSSProperties = { minHeight: 44, border: `1px solid ${line}`, background: 'transparent', color: ink, padding: '0 14px', borderRadius: 4, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' };
  const field: React.CSSProperties = { flex: '1 1 200px', minWidth: 0, height: 44, boxSizing: 'border-box', border: `1px solid ${line}`, background: '#0D0E0C', color: ink, borderRadius: 2, padding: '0 10px', fontFamily: sans, fontSize: 13 };

  return <div style={{ marginTop: 10, fontFamily: sans }}>
    {linked && !changing && <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: muted, fontSize: 12, marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Link2 size={12} color={acid} aria-hidden="true" />Delivers <strong style={{ color: ink, fontWeight: 600 }}>{linked.name}</strong></span>
        <button type="button" onClick={() => { setChoice(linked.id); setChanging(true); }} style={{ ...small, minHeight: 32, padding: '0 10px' }}>Change</button>
      </div>
      <RoutineShareLink protocolId={linked.id} protocolName={linked.name} guardianSlug={guardianSlug} paid={offer.access_model === 'paid'} />
    </>}
    {(!linked || changing) && <div style={{ border: `1px solid ${line}`, padding: 12 }}>
      <label style={{ display: 'block', color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Routine this offer delivers</label>
      {mine.length === 0 && <p style={{ color: muted, fontSize: 12, margin: 0 }}>Build a routine in Protocols first, then choose it here to share it.</p>}
      {mine.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select aria-label="Routine this offer delivers" value={choice} onChange={(event) => setChoice(event.target.value)} style={field}>
          <option value="">Choose a routine</option>
          {mine.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" disabled={!choice || busy} onClick={() => save(choice)} style={{ ...small, background: ink, color: '#090A08', opacity: !choice || busy ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Use this routine'}</button>
        {linked && <button type="button" disabled={busy} onClick={() => save(null)} style={small}>Unlink</button>}
        {changing && <button type="button" onClick={() => setChanging(false)} style={small}>Cancel</button>}
      </div>}
      {suggestion && !linked && <p style={{ color: muted, fontSize: 11, margin: '8px 0 0' }}>A routine named “{suggestion.name}” matches this offer.</p>}
    </div>}
    {message && <p role="alert" style={{ color: warn, fontSize: 12, margin: '8px 0 0' }}>{message}</p>}
  </div>;
}
