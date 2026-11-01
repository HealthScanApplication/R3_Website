/*
 * Which brand's things the workspace is showing. A Guardian with several brands picks one at the top of the workspace
 * (or All); products, offers and sites then show only what belongs to it. Content with no brand belongs to the
 * Guardian's own (personal) page, so nothing that existed before brands is hidden under the wrong one.
 */
export const BRAND_SCOPE_KEY = 'r3-brand-scope';
export const BRAND_SCOPE_EVENT = 'r3-brand-scope-change';
export const ALL_BRANDS = 'all';
export const PERSONAL_BRAND = 'personal';

/** A brand draft's local id is `brand-<uuid>`; the data uses the bare uuid. */
export const brandIdOf = (id: string): string => id.replace(/^brand-/, '');

/** Whether something belonging to `item` (a brand id, or an item with `brand_id` / `brand_ids`; none: the personal page) shows under the chosen scope. */
export function inBrandScope(scope: string, item: string | null | undefined | { brand_id?: string | null; brand_ids?: string[] | null }): boolean {
  if (!scope || scope === ALL_BRANDS) return true;
  const ids = item && typeof item === 'object' ? [item.brand_id, ...(item.brand_ids || [])].filter((id): id is string => !!id) : item ? [item] : [];
  if (scope === PERSONAL_BRAND) return !ids.length || ids.includes(PERSONAL_BRAND);
  return ids.some((id) => brandIdOf(id) === brandIdOf(scope));
}

export function readBrandScope(): string {
  try { return localStorage.getItem(BRAND_SCOPE_KEY) || ALL_BRANDS; } catch { return ALL_BRANDS; }
}

export function writeBrandScope(scope: string): void {
  try { localStorage.setItem(BRAND_SCOPE_KEY, scope); } catch { /* storage may be unavailable: the scope then lasts until reload */ }
  window.dispatchEvent(new Event(BRAND_SCOPE_EVENT));
}
