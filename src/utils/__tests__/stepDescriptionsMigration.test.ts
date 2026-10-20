import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/** The step descriptions are written once into the catalogue: hold them to the same style and safety rules they were drafted under. */
const sql = readFileSync('supabase/migrations/20261020150000_step_descriptions.sql', 'utf8');
const unq = (s: string) => s.replace(/''/g, "'");
const rows = [...sql.matchAll(/^\s*\('((?:[^']|'')*)', (NULL|'(?:[^']|'')*'), '((?:[^']|'')*)'\)\)?,?$/gm)].map((m) => ({ name: unq(m[1]), activity: m[2] === 'NULL' ? null : unq(m[2].slice(1, -1)), notes: unq(m[3]) }));

describe('step descriptions migration', () => {
  it('has one description per distinct step and the expected row count', () => {
    expect(rows.length).toBe(136);
    expect(new Set(rows.map((r) => `${r.name.toLowerCase()}|${r.activity}`)).size).toBe(rows.length);
    expect(sql).toMatch(/expected CONSTANT int := 422;/);
  });
  it('is short, plain text: what to do and why', () => {
    for (const r of rows) {
      expect(r.notes.length, r.name).toBeGreaterThan(80);
      expect(r.notes.length, r.name).toBeLessThanOrEqual(300);
      expect(r.notes, r.name).not.toMatch(/[*#_`<>\n]|&amp;|[\u{1F300}-\u{1FAFF}]/u);
      expect(r.notes, r.name).toMatch(/[.)]$/);
    }
  });
  it('makes no medical, treatment, detox or dosing claims', () => {
    const banned = /\b(cure[sd]?|treat(s|ed|ment)?|heal(s|ed|ing)?|detox\w*|burns? fat|fat[- ]loss|lose weight|weight loss|diagnos\w*|prevent(s|ed)?|guarantee\w*|clinically|proven|mg|dosage)\b/i;
    for (const r of rows) expect(r.notes, r.name).not.toMatch(banned);
  });
  it('does not fix an amount that differs between the rows that share the step (Strength Session, Zone 2 Cardio)', () => {
    for (const name of ['Strength Session', 'Zone 2 Cardio']) expect(rows.find((r) => r.name === name)!.notes, name).not.toMatch(/\d/);
  });
  it('only fills empty descriptions, in catalogue protocols, and never rules', () => {
    expect(sql).toMatch(/coalesce\(trim\(i\.notes\), ''\) = ''/);
    expect(sql).toMatch(/p\.user_id IS NULL AND i\.kind = 'action'/);
    expect(sql).not.toMatch(/^\s*(DELETE FROM|DROP |TRUNCATE )/im); // statements only: a note may say "drop to your knees"
  });
});
