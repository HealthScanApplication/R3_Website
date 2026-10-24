import { useEffect, useState } from 'react';
import { GuardianModal } from './GuardianModal';
import { archiveProtocol, deleteProtocol, protocolImpact, type ProtocolImpact } from '../../utils/protocolAdmin';

/**
 * Delete a protocol, with its consequences read fresh from the database and shown first.
 *  - "Archive" is one click: it leaves the owner's list and the public list, keeps everything, and can be undone.
 *  - "Delete permanently" always needs the protocol's name typed. Deleting cascades to things this screen cannot see (other
 *    people who added the protocol to their own app, and their history), so no protocol counts as safe to delete in one click.
 *  - A protocol that is active in the owner's own app can only be archived.
 * The dialog cannot be closed while a request is running, so a result is never lost.
 */
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const INK = '#F5F2EA', MUTED = '#A7A49B', LINE = 'rgba(245,242,234,.24)', DANGER = '#E0745A';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const btn = (over: React.CSSProperties = {}): React.CSSProperties => ({ minHeight: 44, padding: '0 18px', border: `1px solid ${LINE}`, borderRadius: 2, background: 'transparent', color: INK, fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', ...over });

export type ProtocolRemoval = { kind: 'deleted' | 'archived'; id: string; name: string };
export const cleanProtocolName = (name: string) => name.replace(/^R3 Protocol\s*>\s*/i, '').trim();

/** The lines that say what deleting takes with it. */
export function impactLines(impact: ProtocolImpact): string[] {
  const lines: string[] = [];
  const n = (value: number | null) => value != null && value > 0;
  if (n(impact.steps)) lines.push(`Its ${plural(impact.steps!, 'step')} will be deleted.`);
  if (n(impact.copiedIntoParents)) lines.push(`${plural(impact.copiedIntoParents!, 'step')} copied from it into a parent protocol will be deleted there too.`);
  if (n(impact.attachedTo)) lines.push(`It is attached to ${plural(impact.attachedTo!, 'parent protocol')} and will be detached.`);
  if (n(impact.childPlans)) lines.push(`${plural(impact.childPlans!, 'attached plan')} will be detached and stay as protocols of their own.`);
  if (impact.isPublic) lines.push('It is published, so it will disappear from the public list.');
  if (impact.isSuggested) lines.push('It is a suggested protocol, shown to everyone.');
  if (n(impact.offers)) lines.push(`${plural(impact.offers!, 'offer')} deliver${impact.offers === 1 ? 's' : ''} it and will lose the routine.`);
  if (impact.shareLink) lines.push('Its share link will stop working.');
  if (n(impact.adds)) lines.push(`${plural(impact.adds!, 'person', 'people')} added it from its link: their copies stay theirs, but the record that they came from you is deleted.`);
  if (n(impact.own.active)) lines.push('It is active in your own app.');
  else if (n(impact.own.enabled) || n(impact.own.pinned)) lines.push('You have it in your own app.');
  if (n(impact.own.logs)) lines.push(`Your ${plural(impact.own.logs!, 'log')} for it will be deleted.`);
  if (impact.unreadable) lines.push('We could not check everything that uses it.');
  return lines;
}

export function ProtocolRemovalDialog({ accessToken, protocol, onClose, onDone }: { accessToken: string; protocol: { id: string; name: string }; onClose: () => void; onDone: (removal: ProtocolRemoval) => void }) {
  const [impact, setImpact] = useState<ProtocolImpact | null>(null);
  const [loadError, setLoadError] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'archive' | 'delete' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setImpact(null); setLoadError('');
    protocolImpact(accessToken, protocol.id).then((x) => { if (live) setImpact(x); }).catch((e) => { if (live) setLoadError((e as Error).message || 'Could not check this protocol.'); });
    return () => { live = false; };
  }, [accessToken, protocol.id]);
  // The name in the database now, not the one the list was loaded with.
  const current = cleanProtocolName(impact ? impact.name : protocol.name);
  const name = current || 'this protocol';
  const required = current || 'DELETE';
  const nameMatches = typed.trim().toLowerCase() === required.toLowerCase();
  const activeInApp = (impact?.own.active ?? 0) > 0;
  const close = () => { if (!busy) onClose(); };
  const run = async (kind: 'archive' | 'delete') => {
    setBusy(kind); setError('');
    try {
      if (kind === 'archive') await archiveProtocol(accessToken, protocol.id);
      else await deleteProtocol(accessToken, protocol.id);
      onDone({ kind: kind === 'archive' ? 'archived' : 'deleted', id: protocol.id, name });
    } catch (e) { setError((e as Error).message || 'That did not work. Try again.'); setBusy(null); }
  };
  const lines = impact ? impactLines(impact) : [];
  const blocked = busy !== null;
  return <GuardianModal compact label="Delete protocol" onClose={close}
    panelStyle={{ background: '#0D0E0C', color: INK, fontFamily: sans, borderRadius: 4, border: `1px solid ${LINE}` }} headerStyle={{ paddingBottom: 0 }} footerStyle={{ borderTop: `1px solid ${LINE}`, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}
    header={<h2 style={{ margin: 0, fontFamily: serif, fontSize: 30, fontWeight: 300, lineHeight: 1.05 }}>Delete “{name}”?</h2>}
    footer={<>
      <button type="button" disabled={blocked} onClick={close} style={btn({ opacity: blocked ? .5 : 1 })}>Cancel</button>
      {impact && <button type="button" disabled={blocked} onClick={() => run('archive')} style={btn({ background: INK, color: '#0D0E0C', borderColor: INK, opacity: blocked ? .6 : 1 })}>{busy === 'archive' ? 'Archiving…' : 'Archive'}</button>}
      {impact && !activeInApp && <button type="button" disabled={blocked || !nameMatches} onClick={() => run('delete')} style={btn({ color: DANGER, borderColor: DANGER, opacity: blocked || !nameMatches ? .45 : 1, cursor: blocked || !nameMatches ? 'not-allowed' : 'pointer' })}>{busy === 'delete' ? 'Deleting…' : 'Delete permanently'}</button>}
    </>}>
    {loadError ? <p role="alert" style={{ color: '#E8B86A', margin: 0, fontSize: 14, lineHeight: 1.5 }}>{loadError}</p>
      : !impact ? <p role="status" style={{ color: MUTED, margin: 0, fontSize: 13 }}>Checking what uses it…</p> : <>
        {lines.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 14, lineHeight: 1.5 }}>{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: lines.length ? '16px 0 0' : 0 }}><strong style={{ color: INK }}>Archive</strong> takes it out of your list and the public list and keeps everything. You can undo it right after.</p>
        {activeInApp
          ? <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: '10px 0 0' }}>It is your active routine, so it can only be archived. Switch your app to another routine first if you want to delete it for good.</p>
          : <>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: '10px 0 0' }}><strong style={{ color: INK }}>Delete permanently</strong> cannot be undone. If other people added it to their own app, it disappears there too, with their history, and we cannot see who.</p>
            <label style={{ display: 'block', margin: '18px 0 0', color: MUTED, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Type {current ? 'the name' : 'DELETE'} to delete it for good
              <input value={typed} onChange={(event) => setTyped(event.target.value)} disabled={blocked} autoComplete="off" placeholder={required} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, height: 46, padding: '0 12px', border: `1px solid ${LINE}`, borderRadius: 2, background: 'transparent', color: INK, fontFamily: sans, fontSize: 16, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }} /></label>
          </>}
        {error && <p role="alert" style={{ color: '#E8B86A', fontSize: 13, margin: '14px 0 0' }}>{error}</p>}
      </>}
  </GuardianModal>;
}
