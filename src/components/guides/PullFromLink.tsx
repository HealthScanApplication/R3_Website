/*
 * "Pull in from a link": the Guardian pastes their website or a public profile, the importer finds the images on it, and
 * they choose which to use. Presentational: GuidePortal runs the import and decides what "Use" does (add to the photos,
 * or turn it into the brand logo).
 */
import { Loader2, Link2 } from 'lucide-react';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', black = '#090A08', acid = '#C7D8A3';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';

export interface PullCandidate { url: string; label?: string }

export interface PullFromLinkProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onPull: () => void;
  pulling: boolean;
  candidates: PullCandidate[];
  /** What choosing a found image does, e.g. "Use as logo" or "Add to photos". */
  useLabel: string;
  onUse: (url: string) => void;
  /** The candidate being copied right now. */
  busyUrl?: string | null;
  message?: string;
  disabled?: boolean;
}

export function PullFromLink({ label, placeholder = 'https://yourwebsite.com', value, onChange, onPull, pulling, candidates, useLabel, onUse, busyUrl, message, disabled }: PullFromLinkProps) {
  return (
    <div data-pull-link style={{ marginTop: 16, textAlign: 'left' }}>
      <label style={{ display: 'block', color: muted, fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
      <form noValidate onSubmit={(event) => { event.preventDefault(); if (value.trim() && !pulling && !disabled) onPull(); }} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8 }}>
        <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={pulling || disabled}
          style={{ minHeight: 40, boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${line}`, background: black, color: ink, fontFamily: sans, fontSize: 13, minWidth: 0 }} />
        <button type="submit" disabled={!value.trim() || pulling || disabled} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 40, padding: '0 16px', border: `1px solid ${line}`, background: 'transparent', color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', cursor: pulling ? 'wait' : 'pointer', opacity: !value.trim() ? 0.5 : 1 }}>
          {pulling ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}{pulling ? 'Looking…' : 'Pull in'}
        </button>
      </form>
      {message && <p role="status" style={{ color: muted, fontFamily: sans, fontSize: 11, lineHeight: 1.5, margin: '8px 0 0' }}>{message}</p>}
      {candidates.length > 0 && (
        <ul aria-label="Images found" style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
          {candidates.map((candidate) => (
            <li key={candidate.url} style={{ display: 'grid', gap: 6 }}>
              <span style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', overflow: 'hidden', border: `1px solid ${line}`, background: '#FFF' }}>
                <img src={candidate.url} alt={candidate.label || 'Image found on that page'} referrerPolicy="no-referrer" loading="lazy" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </span>
              <button type="button" onClick={() => onUse(candidate.url)} disabled={!!busyUrl} style={{ minHeight: 34, border: `1px solid ${busyUrl === candidate.url ? acid : line}`, background: 'transparent', color: ink, fontFamily: sans, fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: busyUrl ? 'wait' : 'pointer' }}>
                {busyUrl === candidate.url ? 'Adding…' : useLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
