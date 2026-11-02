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

/** Every brand an item sits on: its own `brand_id` first, then any in `brand_ids`. Empty means the Guardian's own (personal) page. */
export function itemBrandIds(item: { brand_id?: string | null; brand_ids?: string[] | null } | null | undefined): string[] {
  const ids = [item?.brand_id, ...(item?.brand_ids || [])].filter((id): id is string => !!id);
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

/** The brands ticked for an item in the editor: its own list, or just the personal page when it has none. */
export function itemBrandSelection(item: { brand_id?: string | null; brand_ids?: string[] | null }, personalBrandId?: string | null): string[] {
  const ids = itemBrandIds(item);
  return ids.length ? ids : personalBrandId ? [personalBrandId] : [];
}

/** What to store for ticked brands: the first real brand is the item's `brand_id` (the card's credit), the rest go in `brand_ids`. Only the personal page ticked stores nothing. */
export function brandSelection(selected: string[], personalBrandId?: string | null): { brand_id: string | null; brand_ids: string[] } {
  const unique = selected.filter((id, index) => selected.indexOf(id) === index);
  const primary = unique.find((id) => id !== personalBrandId) ?? null;
  if (!primary) return { brand_id: null, brand_ids: [] };
  return { brand_id: primary, brand_ids: unique.filter((id) => id !== primary) };
}

/** Whether something that belongs to these brands shows on this page. A brand's page shows what lists it; the personal page shows what has no brand or lists the personal brand. */
export function siteOwns(activeBrandId: string | null | undefined, personalBrandId: string | null | undefined, itemBrandId: string | null | undefined | { brand_id?: string | null; brand_ids?: string[] | null }): boolean {
  const ids = itemBrandId && typeof itemBrandId === 'object' ? itemBrandIds(itemBrandId) : itemBrandId ? [itemBrandId] : [];
  if (activeBrandId) return ids.includes(activeBrandId);
  return !ids.length || (!!personalBrandId && ids.includes(personalBrandId));
}

/**
 * Who a card is credited to, bottom left: the brand's name and logo. On a brand's own page it is that brand; elsewhere the
 * item's first brand. The personal brand (or no brand) is the Guardian themself, so their own name and photo are kept.
 */
export function cardByline(
  item: { brand_id?: string | null; brand_ids?: string[] | null } | null | undefined,
  brands: Pick<GuideBrand, 'id' | 'name' | 'kind' | 'logo_url'>[],
  activeBrandId: string | null | undefined,
  owner: { name: string; avatarUrl: string | null },
): { name: string; avatarUrl: string | null } {
  const ids = itemBrandIds(item);
  const id = activeBrandId && ids.includes(activeBrandId) ? activeBrandId : ids[0];
  const brand = id ? brands.find((candidate) => candidate.id === id) : undefined;
  if (!brand || brand.kind === 'personal') return owner;
  return { name: brand.name, avatarUrl: brand.logo_url || owner.avatarUrl };
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

/** A saved brand's local id is `brand-<uuid>`; a brand added this session has `brand-<time>` and no saved id yet. */
export const savedBrandId = (localId: string): string | undefined => (/^brand-[0-9a-f]{8}-[0-9a-f]{4}-/.test(localId) ? localId.slice('brand-'.length) : undefined);

/**
 * After a save, a brand that was only known by a temporary local id now has a real one. This says which local ids to swap
 * for which saved ones (and the page address the brand was given), so the next save names the brand by id: a rename then
 * keeps its products, offers and page address instead of looking like a new brand.
 */
export function savedBrandMoves(drafts: { localId: string; name: string; kind: string }[], saved: Pick<GuideBrand, 'id' | 'name' | 'kind' | 'slug'>[]): Map<string, { localId: string; slug: string | null }> {
  const moves = new Map<string, { localId: string; slug: string | null }>();
  for (const draft of drafts) {
    if (draft.kind === 'personal' || savedBrandId(draft.localId)) continue;
    const hit = saved.find((item) => item.kind !== 'personal' && item.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
    if (hit?.id) moves.set(draft.localId, { localId: `brand-${hit.id}`, slug: hit.slug ?? null });
  }
  return moves;
}

/** Whether a protocol shows on this page. A brand's page shows the protocols that list it; the personal page shows those that list it or list no brand at all. */
export function protocolOnSite(activeBrandId: string | null | undefined, personalBrandId: string | null | undefined, listed: string[] | undefined): boolean {
  const ids = listed || [];
  if (activeBrandId) return ids.includes(activeBrandId);
  return !ids.length || (!!personalBrandId && ids.includes(personalBrandId));
}
