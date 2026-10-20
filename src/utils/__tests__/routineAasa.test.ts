import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRoutineShareLink, routineShareUrl } from '../routineShare';

const root = join(__dirname, '..', '..', '..');
const AASA = JSON.parse(readFileSync(join(root, 'public', '.well-known', 'apple-app-site-association'), 'utf8')) as {
  applinks: { details: Array<{ appIDs: string[]; components: Array<{ '/': string; comment?: string }> }> };
};
const TOKEN = '0123456789abcdef0123456789abcdef';

// An AASA `components` path pattern: `?` is one character, `*` any run of them. Same reading the mobile repo's
// universalLinks.test.ts uses, so a claim that passes here is one the app's own parity test will also understand.
const componentMatches = (pattern: string, urlPath: string) =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '.').replace(/\*/g, '.*')}$`).test(urlPath);
const claimed = (urlPath: string) => AASA.applinks.details.some((d) => d.components.some((c) => componentMatches(c['/'], urlPath)));

describe('apple-app-site-association', () => {
  it('claims /routine/<token>, so iOS hands a Guardian\'s routine link to R³', () => {
    expect(AASA.applinks.details.flatMap((d) => d.components.map((c) => c['/']))).toContain('/routine/*');
    expect(claimed(new URL(routineShareUrl(TOKEN)).pathname)).toBe(true);
  });

  it('claims it for both the release and the dev app ids, like every other path', () => {
    const withRoutine = AASA.applinks.details.filter((d) => d.components.some((c) => c['/'] === '/routine/*'));
    expect(withRoutine).toHaveLength(1);
    expect(withRoutine[0].appIDs).toEqual(['PMVKKWSBVW.design.johnferreira.healthscan', 'PMVKKWSBVW.design.johnferreira.healthscan.dev']);
  });

  it('claims only what the app opens: the routine path, not its look-alikes', () => {
    expect(claimed('/routine')).toBe(false);
    expect(claimed('/routines/all')).toBe(false);
    expect(claimed('/routine-builder')).toBe(false);
    expect(claimed('/guardians/john-ferreira')).toBe(false);
    expect(claimed('/g/john-ferreira')).toBe(false);
    expect(claimed('/privacy')).toBe(false);
    expect(claimed('/unsubscribe')).toBe(false);
  });

  it('keeps the claims it already had', () => {
    expect(claimed('/join/abcdefghijklmnop')).toBe(true);
    expect(claimed('/protocol/0b46960a-1d2c-4f3b-9a4e-5c6d7e8f9a0b')).toBe(true);
    expect(claimed('/protocol/not-a-uuid')).toBe(false);
  });

  it('round-trips: the link the portal builds is claimed, and parses back to its token', () => {
    const url = routineShareUrl(TOKEN);
    expect(claimed(new URL(url).pathname)).toBe(true);
    expect(parseRoutineShareLink(url)).toBe(TOKEN);
  });
});

describe('netlify.toml for /routine/*', () => {
  const toml = readFileSync(join(root, 'netlify.toml'), 'utf8');
  const redirectBlocks = toml.split('[[redirects]]').slice(1).map((block) => block.split('[[headers]]')[0]);
  const at = (from: string) => redirectBlocks.findIndex((block) => new RegExp(`from = "${from.replace(/[*]/g, '\\*')}"`).test(block));

  it('rewrites /routine/* to the static page, forced, above the SPA catch-all', () => {
    const index = at('/routine/*');
    expect(index).toBeGreaterThan(-1);
    expect(redirectBlocks[index]).toMatch(/to = "\/routine\/index\.html"/);
    expect(redirectBlocks[index]).toMatch(/status = 200/);
    expect(redirectBlocks[index]).toMatch(/force = true/);
    expect(index).toBeLessThan(at('/*'));
  });
});
