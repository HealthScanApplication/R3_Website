/*
 * A brand's own page: /guardians/<guardian>/<brand-slug>. It is the Guardian's page with the brand's name, logo, tagline
 * and links, showing only what belongs to that brand. The Guardian's own (personal) page shows what has no brand.
 */
import type { GuideBrand, GuideProfile } from './guidePortal';

/** Words that already mean something after /guardians/<guardian>/. */
export const GUARDIAN_SUBPAGES = ['community', 'value-ramp', 'workspace'];

/** The brand slug in a page path, or null when the path is not a brand page. */
export function brandSlugFromPath(pathname: string): { guardian: string; brand: string } | null {
  const match = pathname.replace(/\/+$/, '').match(/^\/guardians\/([^/]+)\/([^/]+)$/);
  if (!match || match[1] === 'workspace' || GUARDIAN_SUBPAGES.includes(match[2])) return null;
  let brand = match[2];
  try { brand = decodeURIComponent(brand); } catch { /* keep the raw text */ }
  return { guardian: match[1], brand };
}

/** Where a brand's page lives. The personal brand (no slug) is the Guardian's own page. */
export const brandSitePath = (guardianSlug: string, brand?: Pick<GuideBrand, 'kind' | 'slug'> | null): string =>
  brand && brand.kind !== 'personal' && brand.slug ? `/guardians/${guardianSlug}/${brand.slug}` : `/guardians/${guardianSlug}`;

/** Whether something that belongs to `itemBrandId` shows on this page. A brand's page shows its own; the personal page shows what has no brand. */
export function siteOwns(activeBrandId: string | null | undefined, personalBrandId: string | null | undefined, itemBrandId: string | null | undefined): boolean {
  if (activeBrandId) return itemBrandId === activeBrandId;
  return !itemBrandId || itemBrandId === personalBrandId;
}

/** The Guardian's profile as a brand's page shows it: the brand's name, logo, tagline, about text and links over the Guardian's own. */
export function brandSiteProfile(profile: GuideProfile | null, brand?: GuideBrand | null): GuideProfile | null {
  if (!profile || !brand || brand.kind === 'personal') return profile;
  const links = (brand.social_links || {}) as Record<string, string>;
  return {
    ...profile,
    display_name: brand.name,
    avatar_url: brand.logo_url || profile.avatar_url,
    headline: links.headline || profile.headline,
    bio: links.bio || profile.bio,
    contact_email: brand.contact_email || links.email || profile.contact_email,
    social_links: { ...profile.social_links, ...links, ...(brand.website_url ? { website: brand.website_url } : {}) },
  };
}
