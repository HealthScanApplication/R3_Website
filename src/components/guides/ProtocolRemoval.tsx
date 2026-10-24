import { useEffect, useState } from 'react';
import { GuardianModal } from './GuardianModal';
import { archiveProtocol, deleteProtocol, protocolImpact, type ProtocolImpact } from '../../utils/protocolAdmin';

/**
 * Delete a protocol, with its consequences shown first. A private draft nobody uses is one confirmation. Anything published,
 * used by an offer, shared by link, or that we could not fully check offers "Archive" first (it leaves the list and the public
 * list, nothing is lost, and it can be undone) and makes "Delete permanently" need the protocol's name typed.
 */
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const INK = '#F5F2EA', MUTED = '#A7A49B', LINE = 'rgba(245,242,234,.24)', DANGER = '#E0745A';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const btn = (over: React.CSSProperties = {}): React.CSSProperties => ({ minHeight: 44, padding: '0 18px', border: `1px solid ${LINE}`, borderRadius: 2, background: 'transparent', color: INK, fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', ...over });

export type ProtocolRemoval = { kind: 'deleted' | 'archived'; id: string; name: string };

/** The lines that say what deleting takes with it. */
export function impactLines(impact: ProtocolImpact): string[] {
  const lines: string[] = [];
  if (impact.steps != null) lines.push(`Its ${plural(impact.steps, 'step')} will be deleted.`);
  if (impact.isPublic) lines.push('It is published, so it will disappear from the public list.');
  if (impact.offers) lines.push(`${plural(impact.offers, 'offer')} deliver${impact.offers === 1 ? 's' : ''} it and will lose the routine.`);
  if (impact.shareLink) lines.push('Its share link will stop working.');
  if (impact.adds) lines.push(`${plural(impact.adds, 'person', 'people')} added it from its link: their copies stay theirs, but the record that they came from you is deleted.`);
  if (impact.offers == null || impact.shareLink == null || impact.adds == null) lines.push('We could not check everything that uses it, so treat it as shared.');
  return lines;
}

export function ProtocolRemovalDialog({ accessToken, protocol, onClose, onDone }: { accessToken: string; protocol: { id: string; name: string; is_public?: boolean | null }; onClose: () => void; onDone: (removal: ProtocolRemoval) => void }) {
  const [impact, setImpact] = useState<ProtocolImpact | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'archive' | 'delete' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    protocolImpact(accessToken, protocol).then((x) => { if (live) setImpact(x); }).catch(() => { if (live) setImpact({ steps: null, offers: null, shareLink: null, adds: null, isPublic: Boolean(protocol.is_public), shared: true }); });
    return () => { live = false; };
  }, [accessToken, protocol.id, protocol.is_public]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = protocol.name.replace(/^R3 Protocol\s*>\s*/i, '');
  const shared = impact?.shared ?? true;
  const nameMatches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const run = async (kind: 'archive' | 'delete') => {
    setBusy(kind); setError('');
    try {
      if (kind === 'archive') await archiveProtocol(accessToken, protocol.id);
      else await deleteProtocol(accessToken, protocol.id);
      onDone({ kind: kind === 'archive' ? 'archived' : 'deleted', id: protocol.id, name });
    } catch (e) { setError((e as Error).message || 'That did not work. Try again.'); setBusy(null); }
  };
  return <GuardianModal compact label="Delete protocol" onClose={onClose}
    panelStyle={{ background: '#0D0E0C', color: INK, fontFamily: sans, borderRadius: 4, border: `1px solid ${LINE}` }} headerStyle={{ paddingBottom: 0 }} footerStyle={{ borderTop: `1px solid ${LINE}`, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}
    header={<h2 style={{ margin: 0, fontFamily: serif, fontSize: 30, fontWeight: 300, lineHeight: 1.05 }}>Delete “{name}”?</h2>}
    footer={<>
      <button type="button" onClick={onClose} style={btn()}>Cancel</button>
      {impact && shared && <button type="button" disabled={busy !== null} onClick={() => run('archive')} style={btn({ background: INK, color: '#0D0E0C', borderColor: INK, opacity: busy ? .6 : 1 })}>{busy === 'archive' ? 'Archiving…' : 'Archive instead'}</button>}
      {impact && <button type="button" disabled={busy !== null || (shared && !nameMatches)} onClick={() => run('delete')} style={btn({ color: DANGER, borderColor: DANGER, opacity: busy || (shared && !nameMatches) ? .45 : 1, cursor: busy || (shared && !nameMatches) ? 'not-allowed' : 'pointer' })}>{busy === 'delete' ? 'Deleting…' : 'Delete permanently'}</button>}
    </>}>
    {!impact ? <p role="status" style={{ color: MUTED, margin: 0, fontSize: 13 }}>Checking what uses it…</p> : <>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 14, lineHeight: 1.5 }}>{impactLines(impact).map((line) => <li key={line}>{line}</li>)}</ul>
      {shared
        ? <>
          <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: '16px 0 0' }}><strong style={{ color: INK }}>Archive</strong> takes it out of your list and the public list and keeps everything, and you can undo it right after. <strong style={{ color: INK }}>Delete permanently</strong> cannot be undone.</p>
          <label style={{ display: 'block', margin: '18px 0 0', color: MUTED, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Type the name to delete it for good
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" placeholder={name} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, height: 46, padding: '0 12px', border: `1px solid ${LINE}`, borderRadius: 2, background: 'transparent', color: INK, fontFamily: sans, fontSize: 16, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }} /></label>
        </>
        : <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: '16px 0 0' }}>It is a private draft and nothing else uses it. This cannot be undone.</p>}
      {error && <p role="alert" style={{ color: '#E8B86A', fontSize: 13, margin: '14px 0 0' }}>{error}</p>}
    </>}
  </GuardianModal>;
}
