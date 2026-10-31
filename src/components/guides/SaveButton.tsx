/*
 * The Save control shared by every part of the Guardian setup (profile image, photos, and the bar under each step): one
 * button and one quiet status line, so "Saved 14:32", a failure, or nothing at all reads the same everywhere.
 */
import { Loader2, Save } from 'lucide-react';

const ink = '#F5F2EA', acid = '#C7D8A3', line = 'rgba(245,242,234,0.24)';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';

export interface SaveState { status: 'idle' | 'saving' | 'saved' | 'error'; at?: string; message?: string }
export const IDLE_SAVE: SaveState = { status: 'idle' };

/** The status line beside a Save button. Silent until there is something to say. */
export function SaveStatus({ state }: { state: SaveState }) {
  if (state.status === 'saved') return <span role="status" style={{ color: acid, fontFamily: sans, fontSize: 11 }}>Saved{state.at ? ` ${state.at}` : ''}</span>;
  if (state.status === 'error') return <span role="alert" style={{ color: '#F0A7A7', fontFamily: sans, fontSize: 11 }}>{state.message || 'Could not save.'}</span>;
  return null;
}

export function SaveButton({ state, onSave, label = 'Save', style }: { state: SaveState; onSave: () => void; label?: string; style?: React.CSSProperties }) {
  const saving = state.status === 'saving';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
      <button type="button" onClick={onSave} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '0 16px', border: `1px solid ${line}`, background: 'transparent', color: ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer', ...style }}>
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{saving ? 'Saving…' : label}
      </button>
      <SaveStatus state={state} />
    </span>
  );
}
