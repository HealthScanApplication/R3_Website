// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SITE_BUILDER_HREF } from '../guardianSiteRoute';

describe('the Site builder route', () => {
  it('is setup step 06, Build your site', () => {
    expect(SITE_BUILDER_HREF).toBe('/guardians/workspace?step=6');
  });
});
