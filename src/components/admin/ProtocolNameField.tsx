import React from 'react';
import { Loader2, Pencil, Save } from 'lucide-react';

/**
 * The protocol's name, edited where it is shown: the title in the editor header is the field.
 *
 * The name used to be plain text in the header and could only be changed inside "Details & cover", which nobody looks in to
 * rename a Protocol. Typing here edits the same form value (`setField('name')`), Enter saves, and a Save button appears as
 * soon as anything on the Protocol is unsaved, so a rename can be finished without leaving the timeline.
 */
export const PROTOCOL_NAME_MAX = 120;

export interface ProtocolNameFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  /** Something on the Protocol (not necessarily the name) is unsaved. */
  dirty: boolean;
  saving: boolean;
  colors: { ink: string; faint: string; hair: string; accent: string };
}

export function ProtocolNameField({ value, onChange, onSave, dirty, saving, colors }: ProtocolNameFieldProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 240px', minWidth: 0 }}>
      <input
        aria-label="Protocol name"
        value={value}
        maxLength={PROTOCOL_NAME_MAX}
        placeholder="Untitled Protocol"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && dirty && !saving) { event.preventDefault(); onSave(); }
        }}
        style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: colors.ink, background: 'transparent', border: 'none', borderBottom: `1px dashed ${colors.hair}`, borderRadius: 0, padding: '4px 2px', outline: 'none' }}
      />
      <Pencil size={13} aria-hidden="true" style={{ color: colors.faint, flexShrink: 0 }} />
      {dirty && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: `1px solid ${colors.accent}`, background: colors.accent, color: '#fff', fontWeight: 700, fontSize: 12, cursor: saving ? 'default' : 'pointer', flexShrink: 0 }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}
    </div>
  );
}
