import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { changedProtocolFields, importedProtocolFields } from '../protocolPatch';
import { updateProtocol } from '../protocolAdmin';

afterEach(() => vi.unstubAllGlobals());

const FIELDS = ['name', 'description', 'is_suggested', 'is_active'] as const;
type P = { name: string; description: string; is_suggested: boolean; is_active: boolean };
const stored: P = { name: 'Morning', description: 'x', is_suggested: false, is_active: true };

describe('changedProtocolFields', () => {
  it('an admin sends every changed field, including the suggested flag', () => {
    expect(changedProtocolFields({ ...stored, name: 'New', is_suggested: true }, stored, FIELDS, true)).toEqual({ name: 'New', is_suggested: true });
  });
  it('someone who is not an admin never sends the suggested flag, so their other edits are not lost with it', () => {
    expect(changedProtocolFields({ ...stored, name: 'New', is_suggested: true }, stored, FIELDS, false)).toEqual({ name: 'New' });
  });
  it('sends nothing when nothing changed (or only the flag changed and the person may not change it)', () => {
    expect(changedProtocolFields(stored, stored, FIELDS, false)).toEqual({});
    expect(changedProtocolFields({ ...stored, is_suggested: true }, stored, FIELDS, false)).toEqual({});
  });
});

describe('importedProtocolFields', () => {
  const file = { name: 'Imported', is_suggested: true, id: 'ignored', is_active: false };
  it('carries only the editable list, and the flag only for an admin', () => {
    expect(importedProtocolFields(file, FIELDS, true)).toEqual({ name: 'Imported', is_suggested: true, is_active: false });
    expect(importedProtocolFields(file, FIELDS, false)).toEqual({ name: 'Imported', is_active: false });
  });
});

describe('the refusal reads as a sentence', () => {
  it('turns the database\'s 403 for the suggested flag into plain words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ code: '42501', message: 'Only a catalog admin can change whether a routine is suggested.' }) }) as Response));
    await expect(updateProtocol('tok', 'p-1', { is_suggested: true } as any)).rejects.toThrow('Only an admin can mark a routine as suggested.');
  });
  it('leaves other failures as they were', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ code: '42501', message: 'new row violates row-level security policy' }) }) as Response));
    await expect(updateProtocol('tok', 'p-1', { name: 'x' } as any)).rejects.toThrow(/Update protocol failed \(403\)/);
  });
});

describe('the editor is wired to it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'admin', 'ProtocolEditor.tsx'), 'utf8');
  it('hides the Suggested checkbox from anyone who is not a catalog admin', () => {
    expect(src).toContain("const canSuggest = useMemo(() => isCatalogAdminToken(accessToken), [accessToken]);");
    expect(src).toContain(".filter(([key]) => key !== 'is_suggested' || canSuggest)");
  });
  it('builds its save and import patches through the shared helpers, not an open loop over every field', () => {
    expect(src).toContain('changedProtocolFields(form as AdminProtocol, selected, PROTO_FIELDS, canSuggest)');
    expect(src).toContain('importedProtocolFields(p, PROTO_FIELDS as readonly string[], canSuggest)');
    expect(src).not.toMatch(/for \(const f of PROTO_FIELDS\)/);
  });
});
