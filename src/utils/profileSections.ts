/**
 * The sections of a Guardian's public page, in value-ramp order (the free, low-priced things first, the retreat last), and which
 * of them hold something. A section with something in it shows up on the page and as a tag under the hero's call to action; the
 * owner also sees the empty ones, as dotted placeholders, so the page always reads as the same skeleton.
 */
export interface ProfileSectionDef {
  id: string;
  /** The tag text under the call to action. */
  label: string;
  /** The id of the block on the page the tag scrolls to. */
  anchor: string;
  /** The offer kinds that fill it. */
  kinds: readonly string[];
  /** The catalog tab (offerCategory) to open when the section lives inside the catalog. */
  category?: string;
  /** Where a Guardian adds something to it. */
  addHref: string;
}

const PRODUCTS_STEP = '/guardians/workspace?step=4';
export const PROFILE_SECTIONS: readonly ProfileSectionDef[] = [
  { id: 'guides', label: 'Guides', anchor: 'catalog', kinds: ['ebook', 'lead_magnet'], category: 'Guides', addHref: PRODUCTS_STEP },
  { id: 'recipes', label: 'Recipes', anchor: 'catalog', kinds: ['recipe_book'], category: 'Recipes', addHref: PRODUCTS_STEP },
  { id: 'protocols', label: 'Protocols', anchor: 'catalog', kinds: ['routine', 'routine_guidance'], category: 'Protocols', addHref: PRODUCTS_STEP },
  { id: 'courses', label: 'Courses', anchor: 'catalog', kinds: ['course', 'program', 'journey', 'team_program'], category: 'Programs', addHref: PRODUCTS_STEP },
  { id: 'community', label: 'Community', anchor: 'catalog', kinds: ['community'], category: 'Communities', addHref: PRODUCTS_STEP },
  { id: 'sessions', label: 'Sessions', anchor: 'catalog', kinds: ['one_to_one_call', 'group_call', 'in_person', 'festival'], category: 'Sessions', addHref: PRODUCTS_STEP },
  { id: 'shop', label: 'Shop', anchor: 'shop', kinds: ['product'], addHref: '/guardians/workspace?tab=products' },
  { id: 'events', label: 'Events', anchor: 'events', kinds: [], addHref: '/guardians/workspace?tab=events' },
  { id: 'talks', label: 'Talks', anchor: 'talks', kinds: ['talk'], addHref: '/guardians/workspace?tab=offer_builder' },
  { id: 'treats', label: 'Treats', anchor: 'treats', kinds: ['treat'], addHref: '/guardians/workspace?tab=offer_builder' },
  { id: 'retreats', label: 'Retreats', anchor: 'retreats', kinds: [], addHref: '/guardians/workspace?tab=events' },
];

export interface ProfileSectionContent {
  /** The offers that count (the public page passes the published ones). */
  offers: ReadonlyArray<{ kind: string }>;
  /** Products in the Guardian's shop. */
  products?: number;
  events?: number;
  retreats?: number;
}

export interface ProfileSectionState extends ProfileSectionDef { count: number; filled: boolean }

export function profileSectionStates(content: ProfileSectionContent): ProfileSectionState[] {
  const byKind = (kinds: readonly string[]) => content.offers.filter((offer) => kinds.includes(offer.kind)).length;
  const extra: Record<string, number> = { shop: content.products || 0, events: content.events || 0, retreats: content.retreats || 0 };
  return PROFILE_SECTIONS.map((section) => {
    const count = byKind(section.kinds) + (extra[section.id] || 0);
    return { ...section, count, filled: count > 0 };
  });
}
