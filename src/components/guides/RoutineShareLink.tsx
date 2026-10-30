/*
 * "Share routine link": creates (or reuses) the routine's link, then shows https://routine3.com/routine/<token> with
 * copy and a QR. Anyone who opens it in R³ can add a copy of the routine, although the routine is not published.
 * Only the routine's owner can create the link; "Stop sharing" switches it off. See src/utils/routineShare.ts.
 */
import { useEffect, useState } from 'react';
import { Check, Copy, Link2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { createRoutineShareLink, getRoutineShareLink, getRoutineShareStats, guardianUtmSource, revokeRoutineShareLink, routineShareUrl, utmValue, type RoutineShareStats } from '../../utils/routineShare';

const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const TONES = {
  dark: { ink: '#F5F2EA', muted: '#B8B6AF', line: 'rgba(245,242,234,0.24)', accent: '#C7D8A3', field: '#0D0E0C', panel: '#11120F', buttonBg: '#F5F2EA', buttonInk: '#090A08', warn: '#E8B86A' },
  light: { ink: '#151515', muted: '#55574F', line: 'rgba(21,21,21,0.22)', accent: '#2F5D3A', field: '#FFFFFF', panel: '#FFFFFF', buttonBg: '#151515', buttonInk: '#FFFFFF', warn: '#8A5A00' },
} as const;

export interface RoutineShareLinkProps {
  protocolId: string;
  protocolName?: string;
  /** The Guardian's page slug: names the Guardian as utm_source (guardian-<slug>) on the link. */
  guardianSlug?: string;
  tone?: keyof typeof TONES;
  /** The routine comes with a paid offer: say so, because the link gives the routine to anyone who holds it. */
  paid?: boolean;
  /** Called whenever the live token changes (null once stopped), so a parent can reuse it. */
  onToken?: (token: string | null) => void;
}

/** Compact QR for an owned routine card. Loading the card ensures the routine has its default live share link. */
export function RoutineCardQr({ protocolId, guardianSlug, size = 58 }: { protocolId: string; guardianSlug?: string; size?: number }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    let live = true;
    createRoutineShareLink(protocolId)
      .then((token) => QRCode.toDataURL(routineShareUrl(token, { source: guardianSlug ? guardianUtmSource(guardianSlug) : null, medium: 'qr' }), { errorCorrectionLevel: 'Q', margin: 1, width: Math.max(160, size * 3) }))
      .then((data) => { if (live) setQr(data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [guardianSlug, protocolId, size]);
  return qr
    ? <img src={qr} alt="QR code for this routine" width={size} height={size} style={{ display: 'block', width: size, height: size, padding: 3, boxSizing: 'border-box', background: '#FFF', border: '1px solid rgba(17,18,15,.22)', borderRadius: 3 }} />
    : <span aria-label="Preparing routine QR code" style={{ display: 'grid', placeItems: 'center', width: size, height: size, boxSizing: 'border-box', background: '#FFF', color: '#55574F', border: '1px solid rgba(17,18,15,.22)', borderRadius: 3 }}><QrCode size={Math.round(size * .38)} /></span>;
}

export function RoutineShareLink({ protocolId, protocolName, guardianSlug, tone = 'dark', paid = false, onToken }: RoutineShareLinkProps) {
  const c = TONES[tone];
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [qr, setQr] = useState('');
  const [campaign, setCampaign] = useState('');
  const [stats, setStats] = useState<RoutineShareStats | null>(null);

  // Every owned routine has a share link by default. The RPC returns the existing live token when there is one,
  // so mounting this panel is idempotent and never rotates a link.
  useEffect(() => {
    let live = true;
    setToken(null); setMessage(''); setConfirmStop(false); setCopied(false);
    getRoutineShareLink(protocolId).then((found) => found || createRoutineShareLink(protocolId)).then((found) => { if (live) setToken(found); }).catch(() => undefined);
    return () => { live = false; };
  }, [protocolId]);

  useEffect(() => { onToken?.(token); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // The link to send says where an open came from (utm_medium=link, plus the Guardian and an optional campaign); the QR says qr.
  // Credit never depends on these: the token already names the Guardian.
  const source = guardianSlug ? guardianUtmSource(guardianSlug) : null;
  const campaignValue = utmValue(campaign);
  const url = token ? routineShareUrl(token, { source, medium: 'link', campaign: campaignValue }) : '';
  const qrUrl = token ? routineShareUrl(token, { medium: 'qr', campaign: campaignValue }) : '';
  useEffect(() => {
    let live = true;
    setQr('');
    if (qrUrl) QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'Q', margin: 2, width: 240 }).then((data) => { if (live) setQr(data); }).catch(() => undefined);
    return () => { live = false; };
  }, [qrUrl]);

  // The counts, once there is a link. Quiet when the database update is not applied yet.
  useEffect(() => {
    let live = true;
    setStats(null);
    if (token) getRoutineShareStats(protocolId).then((found) => { if (live) setStats(found); }).catch(() => undefined);
    return () => { live = false; };
  }, [token, protocolId]);

  async function create() {
    setBusy(true); setMessage('');
    try { setToken(await createRoutineShareLink(protocolId)); }
    catch (error: any) { setMessage(error?.message || 'Could not create the routine link.'); }
    finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true); setMessage('');
    try { await revokeRoutineShareLink(protocolId); setToken(null); setConfirmStop(false); }
    catch (error: any) { setMessage(error?.message || 'Could not stop sharing.'); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setMessage('Copy did not work here. Select the link and copy it.'); }
  }

  const button: React.CSSProperties = { minHeight: 44, border: `1px solid ${c.line}`, background: c.buttonBg, color: c.buttonInk, padding: '0 16px', borderRadius: 4, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
  const quiet: React.CSSProperties = { ...button, background: 'transparent', color: c.ink };

  return <section aria-label="Routine link" style={{ border: `1px solid ${c.line}`, background: c.panel, color: c.ink, padding: 16, marginBottom: 14, fontFamily: sans }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: c.accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}><Link2 size={13} aria-hidden="true" />Routine link{protocolName ? <span style={{ color: c.muted, fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}> · {protocolName}</span> : null}</div>
    {!token && <>
      <p style={{ color: c.muted, fontSize: 12, lineHeight: 1.5, margin: '8px 0 12px', maxWidth: 560 }}>Send anyone a link that adds a copy of this routine to their R³ app, even though it is not published. They get their own copy; yours stays yours.</p>
      <button type="button" onClick={create} disabled={busy} style={{ ...button, opacity: busy ? 0.6 : 1 }}><Link2 size={14} aria-hidden="true" />{busy ? 'Creating…' : 'Share routine link'}</button>
    </>}
    {token && <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 10 }}>
        {qr ? <img src={qr} alt="QR code for the routine link" width={132} height={132} style={{ background: '#FFFFFF', display: 'block', borderRadius: 4 }} /> : <div aria-hidden="true" style={{ width: 132, height: 132, display: 'grid', placeItems: 'center', border: `1px solid ${c.line}`, color: c.muted }}><QrCode size={28} /></div>}
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <label style={{ display: 'block', color: c.muted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Link</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input readOnly aria-label="Routine link" value={url} onFocus={(event) => event.currentTarget.select()} style={{ flex: '1 1 220px', minWidth: 0, height: 44, boxSizing: 'border-box', border: `1px solid ${c.line}`, background: c.field, color: c.ink, borderRadius: 2, padding: '0 11px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
            <button type="button" onClick={copy} style={button}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <label style={{ display: 'block', color: c.muted, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '12px 0 6px' }}>Campaign (optional)</label>
          <input aria-label="Campaign" value={campaign} maxLength={64} placeholder="e.g. spring-sleep" onChange={(event) => setCampaign(event.target.value)} style={{ width: '100%', maxWidth: 260, height: 40, boxSizing: 'border-box', border: `1px solid ${c.line}`, background: c.field, color: c.ink, borderRadius: 2, padding: '0 11px', fontFamily: sans, fontSize: 12 }} />
          <p style={{ color: c.muted, fontSize: 12, lineHeight: 1.5, margin: '10px 0 0' }}>Anyone who opens this link in R³ can add a copy of the routine. They cannot change yours. Switch it off any time; a new link will be a different one. You are credited when someone new to R³ adds it.</p>
          {stats && <p aria-label="Link results" style={{ color: c.ink, fontSize: 12, lineHeight: 1.5, margin: '8px 0 0' }}>Opened <strong>{stats.opens}</strong>{stats.opens_7d ? ` (${stats.opens_7d} this week)` : ''} · Added to R³ <strong>{stats.adds}</strong> · New to R³ <strong>{stats.credited}</strong>{stats.by_medium.length > 0 && <span style={{ color: c.muted }}> · {stats.by_medium.map((m) => `${m.medium} ${m.opens}`).join(', ')}</span>}</p>}
          {paid && <p role="note" style={{ color: c.warn, fontSize: 12, lineHeight: 1.5, margin: '8px 0 0' }}>This routine comes with a paid offer. Anyone holding this link gets it without paying, so send it only to people who bought.</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <a href={qr || undefined} download="routine-link-qr.png" aria-disabled={!qr} style={{ ...quiet, textDecoration: 'none', opacity: qr ? 1 : 0.5, pointerEvents: qr ? 'auto' : 'none' }}><QrCode size={14} aria-hidden="true" />Download QR</a>
            {!confirmStop && <button type="button" onClick={() => setConfirmStop(true)} style={quiet}>Stop sharing</button>}
            {confirmStop && <>
              <button type="button" onClick={stop} disabled={busy} style={{ ...button, opacity: busy ? 0.6 : 1 }}>{busy ? 'Stopping…' : 'Yes, stop sharing'}</button>
              <button type="button" onClick={() => setConfirmStop(false)} style={quiet}>Keep it</button>
            </>}
          </div>
        </div>
      </div>
    </>}
    {message && <p role="alert" style={{ color: c.warn, fontSize: 12, margin: '10px 0 0' }}>{message}</p>}
  </section>;
}
