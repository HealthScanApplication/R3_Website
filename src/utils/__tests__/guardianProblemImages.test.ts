import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// The audience step shows one photo per suggested problem: /images/guides/problems/<name, lower-cased, spaces to dashes>.jpg
describe('problem card photos', () => {
  const portal = readFileSync('src/components/guides/GuidePortal.tsx', 'utf8');
  const list = /const audienceProblemSuggestions = \[([^\]]+)\]/.exec(portal)?.[1] ?? '';
  const problems = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  it('finds the suggested problems', () => expect(problems.length).toBeGreaterThanOrEqual(12));
  it.each(problems)('has a photo for "%s"', (problem) => {
    expect(existsSync(`public/images/guides/problems/${problem.toLowerCase().replace(/ /g, '-')}.jpg`)).toBe(true);
  });
});
