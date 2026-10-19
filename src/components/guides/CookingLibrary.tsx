/*
 * Diet section reference pages: cooking techniques (catalog_cooking_methods) and kitchen equipment
 * (catalog_equipment, kitchen categories only). Browse by category, search, and open one to read it below its card.
 * Read-only.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChefHat, CookingPot, Loader2, Search, X } from 'lucide-react';
import { listCookingMethods, listKitchenEquipment, type CookingMethod, type KitchenEquipment } from '../../utils/protocolBuilders';
import { Header } from './GuardianBuilders';

const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,0.24)', acid = '#C7D8A3', panel = '#11120F';
const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? acid : line}`, background: on ? 'rgba(199,216,163,.14)' : 'transparent', color: on ? acid : ink, borderRadius: 999, padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' });
const kicker: React.CSSProperties = { color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', margin: '0 0 8px' };
const tag: React.CSSProperties = { border: `1px solid ${line}`, borderRadius: 3, padding: '2px 6px', fontSize: 10, color: ink };

interface Item { id: string; name: string; category: string | null; image: string | null; description: string | null; facts: Array<[string, string | null]>; sub: string | null }

/** Category chips, search, and grids grouped by category with the opened item's details right after its card. */
function Library({ title, copy, Icon, load, empty }: { title: string; copy: string; Icon: typeof ChefHat; load: () => Promise<Item[]>; empty: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('All');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { let live = true; load().then((r) => { if (live) setItems(r); }).catch((e) => { if (live) { setItems([]); setError((e as Error).message); } }); return () => { live = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => ['All', ...[...new Set((items || []).map((i) => i.category || 'Other'))].sort()], [items]);
  const q = query.trim().toLowerCase();
  const shown = (items || []).filter((i) => (cat === 'All' || (i.category || 'Other') === cat) && (!q || `${i.name} ${i.description || ''}`.toLowerCase().includes(q)));
  const groups = [...new Set(shown.map((i) => i.category || 'Other'))].sort().map((c) => ({ c, list: shown.filter((i) => (i.category || 'Other') === c) }));
  return <div>
    <Header Icon={Icon} kicker="Diet" title={title} copy={copy} />
    <div role="group" aria-label={`${title} category`} style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>{cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setOpen(null); }} style={chip(cat === c)}>{c}</button>)}</div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${line}`, background: '#090A08', padding: '0 10px', height: 40, marginBottom: 14, maxWidth: 420 }}>
      <Search size={14} color={muted} aria-hidden="true" />
      <input aria-label={`Search ${title.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${title.toLowerCase()}`} style={{ flex: 1, border: 0, background: 'transparent', color: ink, fontSize: 13, outline: 'none' }} />
    </label>
    {items === null ? <p style={{ color: muted, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={12} className="animate-spin" />Loading…</p>
      : error ? <p style={{ color: '#E8B07A', fontSize: 12 }}>{error}</p>
      : !shown.length ? <p style={{ color: muted, fontSize: 12 }}>{empty}</p>
      : groups.map(({ c, list }) => <section key={c} aria-label={c} style={{ marginBottom: 18 }}>
        <h3 style={kicker}>{c} <span style={{ color: muted }}>· {list.length}</span></h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
          {list.map((i) => <Fragment key={i.id}>
            <button type="button" aria-pressed={open === i.id} onClick={() => setOpen(open === i.id ? null : i.id)} style={{ textAlign: 'left', border: `1px solid ${open === i.id ? acid : line}`, background: panel, color: ink, padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4 / 3', background: i.image ? `url(${i.image}) center/cover` : '#1B1C18' }} />
              <div style={{ padding: '8px 10px 10px' }}><div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25 }}>{i.name}</div>{i.sub && <div style={{ color: muted, fontSize: 10, marginTop: 4 }}>{i.sub}</div>}</div>
            </button>
            {open === i.id && <div role="region" aria-label={`${i.name} details`} style={{ gridColumn: '1 / -1', border: `1px solid ${acid}`, background: '#141611', padding: 14, display: 'grid', gridTemplateColumns: i.image ? 'minmax(0,140px) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 14, position: 'relative' }}>
              <button type="button" aria-label="Close details" onClick={() => setOpen(null)} style={{ position: 'absolute', top: 8, right: 8, border: 0, background: 'transparent', color: muted, cursor: 'pointer' }}><X size={14} /></button>
              {i.image && <div style={{ aspectRatio: '1', background: `url(${i.image}) center/cover`, border: `1px solid ${line}` }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, paddingRight: 20 }}>{i.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>{i.category && <span style={tag}>{i.category}</span>}</div>
                <p style={{ color: muted, fontSize: 12, lineHeight: 1.55, margin: '0 0 8px', maxWidth: 760 }}>{i.description || 'No description in the catalogue yet.'}</p>
                {i.facts.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 760 }}><span style={{ color: acid }}>{k}:</span> <span style={{ color: ink }}>{v}</span></div>)}
              </div>
            </div>}
          </Fragment>)}
        </div>
      </section>)}
  </div>;
}

const methodItem = (m: CookingMethod): Item => ({ id: m.id, name: m.name, category: m.category, image: m.image, description: m.description, sub: [m.medium, m.typicalTime].filter(Boolean).join(' · ') || null, facts: [['Temperature', m.temperature], ['Medium', m.medium], ['Typical time', m.typicalTime], ['Effect on nutrients', m.nutrientEffect], ['Best for', m.bestFor]] });
const equipmentItem = (e: KitchenEquipment): Item => ({ id: e.id, name: e.name, category: e.category, image: e.image, description: e.description, sub: e.material, facts: [['Use', e.useCase], ['Material', e.material], ['Used for', e.methodsUsedWith.join(', ') || null]] });

export function CookingTechniques({ accessToken }: { accessToken: string }) {
  return <Library title="Cooking techniques" Icon={CookingPot} copy="How food is prepared, from dry heat to fermentation: temperature, medium, time and what each does to nutrients." load={() => listCookingMethods(accessToken).then((r) => r.map(methodItem))} empty="No techniques match." />;
}
export function CookingEquipment({ accessToken }: { accessToken: string }) {
  return <Library title="Cooking equipment" Icon={ChefHat} copy="Kitchen equipment in the ROUTINE³ catalogue: cookware, appliances, prep, utensils, knives, baking and measuring." load={() => listKitchenEquipment(accessToken).then((r) => r.map(equipmentItem))} empty="No equipment matches." />;
}
