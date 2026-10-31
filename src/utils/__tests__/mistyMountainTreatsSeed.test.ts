import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(process.cwd(), 'supabase/seeds/barbara-oneill-misty-mountain-treats.sql'), 'utf8');
const rows = [...sql.matchAll(/^\s+\('((?:[^']|'')*)', '((?:[^']|'')*)', (\d+), (\d+), '((?:[^']|'')*)'\),?$/gm)].map((m) => ({ category: m[1], title: m[2].replace(/''/g, "'"), minutes: Number(m[3]), cents: Number(m[4]), body: m[5].replace(/''/g, "'") }));

describe('the Misty Mountain treats seed', () => {
  it('has the whole spa menu: every row parsed, no duplicates', () => {
    expect(rows.length).toBe(45);
    expect(new Set(rows.map((r) => r.title)).size).toBe(rows.length);
  });
  it('prices every treat from the menu, in whole dollars, with a sensible length', () => {
    for (const r of rows) { expect(r.cents, r.title).toBeGreaterThan(0); expect(r.cents % 100, r.title).toBe(0); expect(r.minutes, r.title).toBeGreaterThanOrEqual(10); expect(r.minutes, r.title).toBeLessThanOrEqual(60); }
    const price = (title: string) => rows.find((r) => r.title === title)!.cents / 100;
    expect(price('Gua Sha Facial')).toBe(130);
    expect(price('Thai Massage')).toBe(120);
    expect(price('Head Massage')).toBe(70);
    expect(price('Hyperbaric Oxygen Chamber')).toBe(95);
    expect(price('Three Facials of Your Choice')).toBe(360);
    expect(price('Full Leg & Bikini Wax')).toBe(90);
  });
  it('makes no medical or disease claims on her site', () => {
    for (const r of rows) expect(`${r.title} ${r.body}`, r.title).not.toMatch(/\b(?:cancer|cures?|cured|heals?|healing|detoxif\w*|toxins?|diseases?|illness|infection|immune)\b/i);
  });
  it('is inserted as drafts, only for her profile, and does not overwrite what she has edited', () => {
    expect(sql).toMatch(/'draft'\s*\nfrom public\.guide_profiles p/);
    expect(sql).toMatch(/where p\.slug = 'barbara-oneill'/);
    expect(sql).toMatch(/not exists \(select 1 from public\.guide_offers o where o\.guide_id = p\.user_id and o\.kind = 'treat' and o\.title = t\.title\)/);
    expect(sql).not.toMatch(/\bdelete\b|\bupdate\b|\btruncate\b|\bdrop\b/i);
  });
  it('uses the "<category> · <n> min" first line the site reads', () => {
    expect(sql).toContain("t.category || ' · ' || t.minutes || ' min' || E'\\n' || t.body");
  });
});
