/**
 * What the site header shows at the width it has. Pure, so it can be tested without a browser.
 *
 * The bar is: lockup | links | account actions | menu button. When it is too narrow it gives things up in this
 * order, so the most useful links stay on screen and the menu only holds what did not fit:
 *   1. everything fits: all links and the account actions, no menu button;
 *   2. some links go into the menu, in `dropOrder` (lowest first). The account actions either stay in the bar or move into
 *      the menu as well, whichever keeps more links (a tie keeps them in the bar);
 *   3. below `minInlineWidth` (a phone) no link stays in the bar: the lockup and the menu button only.
 * A link is never partly shown. The link with the highest `dropOrder` (Guardians) is the last to leave, and if even
 * it does not fit next to the menu button the bar falls back to step 4.
 */
export interface NavLinkSpec {
  key: string;
  /** Lower leaves the bar first. */
  dropOrder: number;
}
export interface MeasuredLink extends NavLinkSpec {
  /** Natural width in px, padding included. */
  width: number;
}
export interface HeaderMeasure {
  /** Width of the row the lockup, links, actions and menu button sit in. */
  rowWidth: number;
  logoWidth: number;
  /** Natural width of the account actions (Sign in | Subscribe, or the signed-in cluster). */
  authWidth: number;
  /** Width of the menu button. */
  triggerWidth: number;
  links: MeasuredLink[];
  /** Space between the blocks of the row. */
  gap: number;
  /** Space between two links. */
  linkGap: number;
  /** Below this row width no link stays in the bar. */
  minInlineWidth: number;
}
export interface HeaderLayout {
  /** Links shown in the bar, in their natural order. */
  inline: string[];
  /** Links that moved into the menu, in their natural order. */
  overflow: string[];
  /** Whether the account actions are in the bar (otherwise they are in the menu). */
  authInline: boolean;
  /** Whether the menu button is shown. */
  menu: boolean;
}

const widthOf = (keys: MeasuredLink[], linkGap: number) => keys.reduce((sum, l) => sum + l.width, 0) + Math.max(0, keys.length - 1) * linkGap;

/** The links that fit in `room`, dropping by `dropOrder`. Null when not even the last one fits. */
function fitLinks(room: number, links: MeasuredLink[], linkGap: number): MeasuredLink[] | null {
  let kept = [...links];
  const byDrop = [...links].sort((a, b) => a.dropOrder - b.dropOrder);
  for (const out of byDrop) {
    if (widthOf(kept, linkGap) <= room) return kept;
    if (kept.length === 1) return null;
    kept = kept.filter((l) => l.key !== out.key);
  }
  return widthOf(kept, linkGap) <= room && kept.length ? kept : null;
}

/** Phone layout, and the layout used before the bar has been measured. */
export const menuOnlyLayout = (links: NavLinkSpec[]): HeaderLayout => ({ inline: [], overflow: links.map((l) => l.key), authInline: false, menu: true });

export function chooseHeaderLayout(m: HeaderMeasure): HeaderLayout {
  const natural = m.links.map((l) => l.key);
  if (m.rowWidth <= 0 || m.rowWidth < m.minInlineWidth || !m.links.length) return menuOnlyLayout(m.links);
  const order = (kept: MeasuredLink[]) => natural.filter((k) => kept.some((l) => l.key === k));
  const done = (kept: MeasuredLink[], authInline: boolean): HeaderLayout => {
    const inline = order(kept);
    const overflow = natural.filter((k) => !inline.includes(k));
    return { inline, overflow, authInline, menu: overflow.length > 0 || !authInline };
  };

  // 1. Everything, no menu button: lockup, links, account actions.
  if (widthOf(m.links, m.linkGap) <= m.rowWidth - m.logoWidth - m.authWidth - m.gap * 2) return done(m.links, true);
  // 2. Two ways to make room, and the one that keeps more links wins (a tie keeps the account actions in the bar). Either the
  //    account actions stay and the menu button takes the links that do not fit, or the actions move into the menu too so
  //    more links can stay. Choosing by count keeps the bar monotonic: a wider bar never shows fewer links.
  const withAuth = fitLinks(m.rowWidth - m.logoWidth - m.authWidth - m.triggerWidth - m.gap * 3, m.links, m.linkGap);
  const noAuth = fitLinks(m.rowWidth - m.logoWidth - m.triggerWidth - m.gap * 2, m.links, m.linkGap);
  const a = withAuth?.length ?? 0, b = noAuth?.length ?? 0;
  if (!a && !b) return menuOnlyLayout(m.links); // nothing fits next to the lockup
  return b > a ? done(noAuth!, false) : done(withAuth!, true);
}

export const sameLayout = (a: HeaderLayout, b: HeaderLayout) =>
  a.authInline === b.authInline && a.menu === b.menu && a.inline.join('|') === b.inline.join('|') && a.overflow.join('|') === b.overflow.join('|');
