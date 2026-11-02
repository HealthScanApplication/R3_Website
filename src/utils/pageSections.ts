/*
 * The order of the content sections on a Guardian's public page (and on each brand's page). The hero stays first and the
 * footer last; everything between can be moved up or down. The order is saved as one comma-separated text in the page's
 * settings (`section_order`), so each brand can have its own. Missing or unknown entries never break a page: a section the
 * saved order does not mention keeps its default place after the ones it does.
 */
export const PAGE_SECTIONS = [
  { key: 'protocols', label: 'Protocols' },
  { key: 'offers', label: 'Offers' },
  { key: 'shop', label: 'Shop' },
  { key: 'events', label: 'Events' },
  { key: 'talks', label: 'Talks' },
  { key: 'treats', label: 'Treats' },
  { key: 'forum', label: 'Ask a question' },
  { key: 'retreats', label: 'Retreats' },
  { key: 'funnel', label: 'Follow and subscribe' },
  { key: 'brands', label: 'Official brands' },
] as const;

export type PageSectionKey = (typeof PAGE_SECTIONS)[number]['key'];
export const DEFAULT_SECTION_ORDER: PageSectionKey[] = PAGE_SECTIONS.map((section) => section.key);
const KNOWN = new Set<string>(DEFAULT_SECTION_ORDER);

/** The saved text as a full order: the named sections first (once each), then any not named in their default order. */
export function orderPageSections(saved?: string | null): PageSectionKey[] {
  const named: PageSectionKey[] = [];
  for (const part of (saved || '').split(',')) {
    const key = part.trim();
    if (KNOWN.has(key) && !named.includes(key as PageSectionKey)) named.push(key as PageSectionKey);
  }
  return [...named, ...DEFAULT_SECTION_ORDER.filter((key) => !named.includes(key))];
}

/**
 * Protocols are always the second section of the page: the hero is the first, so Protocols come directly under it, ahead of
 * whatever else shows, whatever order the Guardian saved.
 */
export function protocolsSecond(order: PageSectionKey[], shown?: ReadonlySet<PageSectionKey>): PageSectionKey[] {
  if (!order.includes('protocols') || (shown && !shown.has('protocols'))) return order;
  return ['protocols', ...order.filter((key) => key !== 'protocols')];
}

/** One step up (-1) or down (1). A section already at the end stays put. */
export function moveSection(order: PageSectionKey[], key: PageSectionKey, direction: -1 | 1): PageSectionKey[] {
  const from = order.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** What to save: nothing at all when the order is the default, so a page that was never reordered stores no setting. */
export function serializeSectionOrder(order: PageSectionKey[]): string {
  return order.every((key, index) => key === DEFAULT_SECTION_ORDER[index]) ? '' : order.join(',');
}
