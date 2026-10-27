// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProtocolNameField, PROTOCOL_NAME_MAX } from '../../components/admin/ProtocolNameField';

afterEach(cleanup);
const colors = { ink: '#111', faint: '#999', hair: '#ddd', accent: '#2a7' };

function setup(props: Partial<React.ComponentProps<typeof ProtocolNameField>> = {}) {
  const onChange = vi.fn(); const onSave = vi.fn();
  render(<ProtocolNameField value="Morning Routine" onChange={onChange} onSave={onSave} dirty={false} saving={false} colors={colors} {...props} />);
  return { onChange, onSave, input: screen.getByRole('textbox', { name: 'Protocol name' }) as HTMLInputElement };
}

describe('renaming a protocol from its title', () => {
  it('the title is an editable field showing the current name', () => {
    expect(setup().input.value).toBe('Morning Routine');
  });
  it('typing passes the new name up, and there is a placeholder for an empty one', () => {
    const { input, onChange } = setup({ value: '' });
    expect(input.placeholder).toBe('Untitled Protocol');
    fireEvent.change(input, { target: { value: 'Evening Wind-Down' } });
    expect(onChange).toHaveBeenCalledWith('Evening Wind-Down');
  });
  it('there is no Save button until something is unsaved, then one appears and saves', () => {
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    cleanup();
    const { onSave } = setup({ dirty: true });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it('Enter saves when there is something to save, and does nothing when there is not or while saving', () => {
    const a = setup({ dirty: true });
    fireEvent.keyDown(a.input, { key: 'Enter' });
    expect(a.onSave).toHaveBeenCalledTimes(1);
    cleanup();
    const b = setup({ dirty: false });
    fireEvent.keyDown(b.input, { key: 'Enter' });
    expect(b.onSave).not.toHaveBeenCalled();
    cleanup();
    const c = setup({ dirty: true, saving: true });
    fireEvent.keyDown(c.input, { key: 'Enter' });
    expect(c.onSave).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /saving/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('a name has a length limit', () => {
    expect(setup().input.maxLength).toBe(PROTOCOL_NAME_MAX);
  });
  it('the editor header uses it instead of plain text', () => {
    const editor = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'admin', 'ProtocolEditor.tsx'), 'utf8');
    expect(editor).toContain("import { ProtocolNameField } from './ProtocolNameField'");
    expect(editor).toContain("<ProtocolNameField value={form.name || ''}");
    expect(editor).not.toMatch(/<strong[^>]*>\{form\.name \|\| 'Untitled Protocol'\}<\/strong>/);
  });
});
