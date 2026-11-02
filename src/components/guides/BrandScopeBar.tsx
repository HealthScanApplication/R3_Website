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
  // A remembered choice that is not one of this Guardian's brands (another account, a removed brand) must not hide everything.
  const known = brands.map((brand) => (brand.kind === 'personal' ? PERSONAL_BRAND : brand.id!));
  const stale = brands.length > 0 && scope !== ALL_BRANDS && (brands.length < 2 || !known.includes(scope));
  useEffect(() => { if (stale) writeBrandScope(ALL_BRANDS); }, [stale]);
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

/**
 * The same filter as the bar above, folded into the workspace header after the logo: the Guardian's photo and each brand's
 * logo as small circles (the first, "All", clears the filter). The name shows on hover or focus. Nothing is drawn with one brand.
 */
export function BrandScopeCircles({ userId, personalName, personalAvatarUrl }: { userId: string; personalName?: string; personalAvatarUrl?: string | null }) {
  const [brands, setBrands] = useState<GuideBrand[]>([]);
  const scope = useBrandScope();
  useEffect(() => { let live = true; listGuideBrands(userId).then((list) => { if (live) setBrands(list); }).catch(() => undefined); return () => { live = false; }; }, [userId]);
  const known = brands.map((brand) => (brand.kind === 'personal' ? PERSONAL_BRAND : brand.id!));
  const stale = brands.length > 0 && scope !== ALL_BRANDS && (brands.length < 2 || !known.includes(scope));
  useEffect(() => { if (stale) writeBrandScope(ALL_BRANDS); }, [stale]);
  if (brands.length < 2) return null;
  const circles = [
    { id: ALL_BRANDS, name: 'All brands', logo: null as string | null },
    ...brands.map((brand) => ({ id: brand.kind === 'personal' ? PERSONAL_BRAND : brand.id!, name: brand.kind === 'personal' ? (personalName || brand.name) : brand.name, logo: brand.kind === 'personal' ? (personalAvatarUrl || brand.logo_url || null) : brand.logo_url || null })),
  ];
  return (
    <div role="group" aria-label="Show brand" data-brand-scope="circles" className="g-scope-circles" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 14, fontFamily: sans }}>
      <style>{`.g-scope-circle{position:relative}.g-scope-circle .g-scope-name{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#090A08;color:#F5F2EA;border:1px solid rgba(245,242,234,.3);padding:5px 9px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;opacity:0;pointer-events:none;z-index:60;transition:opacity .15s ease}.g-scope-circle:hover .g-scope-name,.g-scope-circle:focus-visible .g-scope-name{opacity:1}@media (max-width:760px){.g-scope-circles{display:none!important}}`}</style>
      {circles.map((circle) => {
        const active = scope === circle.id;
        return (
          <button key={circle.id} type="button" className="g-scope-circle" aria-pressed={active} aria-label={`Show ${circle.name}`} onClick={() => writeBrandScope(circle.id)} style={{ width: 28, height: 28, padding: 0, borderRadius: '50%', border: `1px solid ${active ? ink : line}`, boxShadow: active ? `0 0 0 2px ${black}, 0 0 0 3px ${ink}` : undefined, background: circle.logo ? '#FFFFFF' : 'transparent', color: ink, display: 'grid', placeItems: 'center', cursor: 'pointer', opacity: active ? 1 : .72, overflow: 'visible', fontSize: 9, fontWeight: 800 }}>
            {circle.logo ? <img src={circle.logo} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <span aria-hidden="true">{circle.id === ALL_BRANDS ? 'All' : circle.name.slice(0, 1)}</span>}
            <span className="g-scope-name" aria-hidden="true">{circle.name}</span>
          </button>
        );
      })}
    </div>
  );
}
