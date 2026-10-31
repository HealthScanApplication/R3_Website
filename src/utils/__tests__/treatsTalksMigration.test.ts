import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'supabase/migrations');
const kindsIn = (sql: string) => [...(sql.match(/check \(kind in \(([^)]*)\)/s)?.[1] || '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe('the treats and talks migration', () => {
  const file = readdirSync(dir).find((name) => name.endsWith('guide_treats_and_talks.sql'))!;
  const kinds = kindsIn(readFileSync(join(dir, file), 'utf8'));
  it('allows treat and talk', () => { expect(kinds).toEqual(expect.arrayContaining(['treat', 'talk'])); });
  it('keeps every kind an earlier migration allows, so it can only widen the list', () => {
    const earlier = readdirSync(dir).filter((name) => name < file && /guide_offer|guide_courses|guide_socials_and_offers/.test(name));
    for (const name of earlier) for (const kind of kindsIn(readFileSync(join(dir, name), 'utf8'))) expect(kinds, `${name}: ${kind}`).toContain(kind);
  });
  it('is the last migration to set the list, so nothing later narrows it', () => {
    const later = readdirSync(dir).filter((name) => name > file && /guide_offers_kind_check/.test(readFileSync(join(dir, name), 'utf8')));
    expect(later).toEqual([]);
  });
});
