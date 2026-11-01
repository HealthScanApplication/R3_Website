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

/** Whether something belonging to `itemBrandId` (null: the personal page) shows under the chosen scope. */
export function inBrandScope(scope: string, itemBrandId: string | null | undefined): boolean {
  if (!scope || scope === ALL_BRANDS) return true;
  if (scope === PERSONAL_BRAND) return !itemBrandId || itemBrandId === PERSONAL_BRAND;
  return !!itemBrandId && brandIdOf(itemBrandId) === brandIdOf(scope);
}

export function readBrandScope(): string {
  try { return localStorage.getItem(BRAND_SCOPE_KEY) || ALL_BRANDS; } catch { return ALL_BRANDS; }
}

export function writeBrandScope(scope: string): void {
  try { localStorage.setItem(BRAND_SCOPE_KEY, scope); } catch { /* storage may be unavailable: the scope then lasts until reload */ }
  window.dispatchEvent(new Event(BRAND_SCOPE_EVENT));
}
