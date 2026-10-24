import { describe, expect, it } from 'vitest';
import { chooseHeaderLayout, menuOnlyLayout, sameLayout, type HeaderMeasure } from '../../components/header/headerLayout';

// The real link widths at 14px Archivo (padding included), in the bar's natural order.
const links = [
  { key: 'routines', dropOrder: 4, width: 121 },
  { key: 'features', dropOrder: 3, width: 123 },
  { key: 'how', dropOrder: 2, width: 163 },
  { key: 'faq', dropOrder: 1, width: 67 },
  { key: 'guardians', dropOrder: 99, width: 133 },
];
const measure = (rowWidth: number, over: Partial<HeaderMeasure> = {}): HeaderMeasure => ({ rowWidth, logoWidth: 149, authWidth: 185, triggerWidth: 32, links, gap: 16, linkGap: 4, minInlineWidth: 440, ...over });

describe('header layout', () => {
  it('desktop: every link and the account actions fit, so there is no menu button', () => {
    expect(chooseHeaderLayout(measure(1300))).toEqual({ inline: ['routines', 'features', 'how', 'faq', 'guardians'], overflow: [], authInline: true, menu: false });
  });

  it('a wide tablet: all five links stay, the account actions go into the menu (keeping them would cost links)', () => {
    expect(chooseHeaderLayout(measure(944))).toEqual({ inline: ['routines', 'features', 'how', 'faq', 'guardians'], overflow: [], authInline: false, menu: true });
  });

  it('820px: Routines, Features and Guardians stay; How It Works, FAQ and the account actions are in the menu', () => {
    expect(chooseHeaderLayout(measure(705))).toEqual({ inline: ['routines', 'features', 'guardians'], overflow: ['how', 'faq'], authInline: false, menu: true });
  });

  it('links leave the bar lowest drop order first, and a link is never partly shown', () => {
    const order = ['faq', 'how', 'features', 'routines'];
    for (let w = 440; w <= 1300; w += 4) {
      const l = chooseHeaderLayout(measure(w));
      const gone = order.filter((k) => l.overflow.includes(k));
      expect(gone, `row ${w}`).toEqual(order.slice(0, gone.length));
      expect(l.inline, `row ${w}`).toEqual(['routines', 'features', 'how', 'faq', 'guardians'].filter((k) => l.inline.includes(k))); // natural order
    }
  });

  it('narrower: Guardians is the last link to leave the bar', () => {
    expect(chooseHeaderLayout(measure(471)).inline).toEqual(['routines', 'guardians']); // the account actions are in the menu
    expect(chooseHeaderLayout(measure(470)).inline).toEqual(['guardians']); // Routines no longer fits beside the lockup, Guardians still does
    expect(chooseHeaderLayout(measure(445)).inline).toEqual(['guardians']);
  });

  it('with no room beside the lockup for the actions, they move into the menu so the links can stay (640px viewport)', () => {
    expect(chooseHeaderLayout(measure(542))).toEqual({ inline: ['routines', 'guardians'], overflow: ['features', 'how', 'faq'], authInline: false, menu: true });
  });

  it('a tie keeps the account actions in the bar', () => {
    const l = chooseHeaderLayout(measure(700, { authWidth: 10 })); // so small that moving them out does not free another link
    expect(l.authInline).toBe(true);
    expect(l.inline).toEqual(['routines', 'features', 'guardians']);
    expect(l.overflow).toEqual(['how', 'faq']);
  });

  it('a wide signed-in cluster goes into the menu, but still fits on a desktop', () => {
    expect(chooseHeaderLayout(measure(700, { authWidth: 420 })).authInline).toBe(false);
    expect(chooseHeaderLayout(measure(1300, { authWidth: 420 })).authInline).toBe(true);
  });

  it('phone: nothing but the lockup and the menu button', () => {
    expect(chooseHeaderLayout(measure(318))).toEqual(menuOnlyLayout(links));
    expect(chooseHeaderLayout(measure(439))).toEqual(menuOnlyLayout(links));
  });

  it('never half a link: when Guardians cannot fit beside the lockup and the button, the bar is menu-only', () => {
    expect(chooseHeaderLayout(measure(440, { logoWidth: 300 }))).toEqual(menuOnlyLayout(links));
  });

  it('unmeasured (no width yet) is the safe phone layout', () => {
    expect(chooseHeaderLayout(measure(0))).toEqual(menuOnlyLayout(links));
    expect(chooseHeaderLayout(measure(900, { links: [] })).menu).toBe(true);
  });

  it('a wider bar never shows fewer links, whatever the width of the account actions', () => {
    for (const authWidth of [0, 10, 185, 300, 420, 600]) {
      let last = 0;
      for (let w = 300; w <= 1500; w += 1) {
        const n = chooseHeaderLayout(measure(w, { authWidth })).inline.length;
        expect(n, `auth ${authWidth}, row ${w}`).toBeGreaterThanOrEqual(last);
        last = n;
      }
    }
  });

  it('sameLayout compares what is shown', () => {
    expect(sameLayout(chooseHeaderLayout(measure(705)), chooseHeaderLayout(measure(710)))).toBe(true);
    expect(sameLayout(chooseHeaderLayout(measure(705)), chooseHeaderLayout(measure(1300)))).toBe(false);
  });
});
