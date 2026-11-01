/*
 * The top-level brand filter of the Guardian workspace: All, then the Guardian's own page and each business brand.
 * It is shown only when there is more than one brand. The choice is remembered and read by the lists below it.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { listGuideBrands, type GuideBrand } from '../../utils/guidePortal';
import { ALL_BRANDS, BRAND_SCOPE_EVENT, PERSONAL_BRAND, readBrandScope, writeBrandScope } from '../../utils/brandScope';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', black = '#090A08';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';

const subscribe = (notify: () => void) => {
  window.addEventListener(BRAND_SCOPE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => { window.removeEventListener(BRAND_SCOPE_EVENT, notify); window.removeEventListener('storage', notify); };
};

/** The chosen brand scope, shared by everything on the page. */
export function useBrandScope(): string {
  return useSyncExternalStore(subscribe, readBrandScope, () => ALL_BRANDS);
}

export function BrandScopeBar({ userId, personalName }: { userId: string; personalName?: string }) {
  const [brands, setBrands] = useState<GuideBrand[]>([]);
  const scope = useBrandScope();
  useEffect(() => { let live = true; listGuideBrands(userId).then((list) => { if (live) setBrands(list); }).catch(() => undefined); return () => { live = false; }; }, [userId]);
  if (brands.length < 2) return null;
  const chips = [
    { id: ALL_BRANDS, name: 'All' },
    ...brands.map((brand) => ({ id: brand.kind === 'personal' ? PERSONAL_BRAND : brand.id!, name: brand.kind === 'personal' ? (personalName || brand.name) : brand.name })),
  ];
  return (
    <div role="group" aria-label="Show brand" data-brand-scope style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 20px', background: black, borderBottom: `1px solid ${line}`, fontFamily: sans }}>
      <span style={{ color: muted, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginRight: 4 }}>Showing</span>
      {chips.map((chip) => {
        const active = scope === chip.id;
        return <button key={chip.id} type="button" aria-pressed={active} onClick={() => writeBrandScope(chip.id)} style={{ minHeight: 30, padding: '0 12px', border: `1px solid ${active ? ink : line}`, background: active ? ink : 'transparent', color: active ? black : ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{chip.name}</button>;
      })}
    </div>
  );
}
