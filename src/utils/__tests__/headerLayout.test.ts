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

  it('tablet: the links that do not fit go into the menu, lowest drop order first; Guardians stays', () => {
    const l = chooseHeaderLayout(measure(944)); // all five need ~ 630; with the actions and the button only some fit
    expect(l.authInline).toBe(true);
    expect(l.menu).toBe(true);
    expect(l.inline).toContain('guardians');
    expect(l.overflow).toContain('faq');
    // dropped strictly in order: if a link is in the menu every link that leaves earlier is too
    const order = ['faq', 'how', 'features', 'routines'];
    const gone = order.filter((k) => l.overflow.includes(k));
    expect(gone).toEqual(order.slice(0, gone.length));
    // natural order is kept for what stays
    expect(l.inline).toEqual(['routines', 'features', 'how', 'faq', 'guardians'].filter((k) => l.inline.includes(k)));
  });

  it('820px: Routines and Guardians stay, Features, How It Works and FAQ are in the menu', () => {
    expect(chooseHeaderLayout(measure(705))).toEqual({ inline: ['routines', 'guardians'], overflow: ['features', 'how', 'faq'], authInline: true, menu: true });
  });

  it('narrower: Guardians is the last link to leave the bar', () => {
    const l = chooseHeaderLayout(measure(560));
    expect(l.inline).toEqual(['guardians']);
    expect(l.authInline).toBe(true);
  });

  it('then the account actions move into the menu so the links can stay', () => {
    const l = chooseHeaderLayout(measure(542)); // 640px viewport: the actions would push Guardians out
    expect(l).toEqual({ inline: ['routines', 'guardians'], overflow: ['features', 'how', 'faq'], authInline: false, menu: true });
  });

  it('a very wide account cluster (signed in) goes to the menu earlier', () => {
    expect(chooseHeaderLayout(measure(944, { authWidth: 420 })).authInline).toBe(true); // 944 still has room for it beside Routines and Guardians
    expect(chooseHeaderLayout(measure(700, { authWidth: 420 })).authInline).toBe(false); // 700 does not: the cluster would push Guardians out
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

  it('wider rows never show fewer links than narrower ones', () => {
    let last = -1;
    for (let w = 300; w <= 1400; w += 5) {
      const n = chooseHeaderLayout(measure(w)).inline.length;
      // at the point the account actions leave the bar the count may rise; otherwise it never falls as the row widens
      if (n < last) {
        const prev = chooseHeaderLayout(measure(w - 5));
        const cur = chooseHeaderLayout(measure(w));
        expect({ w, prevAuth: prev.authInline, curAuth: cur.authInline }).toEqual({ w, prevAuth: false, curAuth: true }); // regaining the actions can cost one link; nothing else may
      }
      last = n;
    }
  });

  it('sameLayout compares what is shown', () => {
    expect(sameLayout(chooseHeaderLayout(measure(705)), chooseHeaderLayout(measure(710)))).toBe(true);
    expect(sameLayout(chooseHeaderLayout(measure(705)), chooseHeaderLayout(measure(1300)))).toBe(false);
  });
});
