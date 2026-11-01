/*
 * "Shows on" for one offer or product: a tick per brand page it appears on (Barbara O'Neill, Misty Mountain, Tre Lune…).
 * Ticking more than one puts the same item on each of those pages; the card is credited to the first brand.
 * Saved as soon as a brand is ticked or cleared. Draws nothing for a Guardian with a single brand.
 */
import { useEffect, useState } from 'react';
import { listGuideBrands, setItemBrands, type GuideBrand, type ItemBrandTable } from '../../utils/guidePortal';
import { brandSelection, itemBrandSelection } from '../../utils/brandSite';

const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';

export function ItemBrands({ guideId, table, item, onSaved, onDark = true }: {
  guideId: string;
  table: ItemBrandTable;
  item: { id: string; brand_id?: string | null; brand_ids?: string[] | null };
  onSaved?: (item: { brand_id: string | null; brand_ids: string[] }) => void;
  onDark?: boolean;
}) {
  const [brands, setBrands] = useState<GuideBrand[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<string[] | null>(null);
  useEffect(() => { let live = true; listGuideBrands(guideId).then((list) => { if (live) setBrands(list); }).catch(() => {}); return () => { live = false; }; }, [guideId]);
  if (brands.length < 2) return null;
  const personal = brands.find((brand) => brand.kind === 'personal');
  const selected = chosen ?? itemBrandSelection(item, personal?.id);
  const ink = onDark ? '#F5F2EA' : '#11120F', line = onDark ? 'rgba(245,242,234,.3)' : 'rgba(17,18,15,.3)', on = onDark ? '#C7D8A3' : '#667245';
  async function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    if (!next.length) { setError('Keep at least one page.'); return; }
    setError(''); setSaving(true); setChosen(next);
    try { onSaved?.(await setItemBrands(table, guideId, item.id, brandSelection(next, personal?.id))); }
    catch (cause: any) { setChosen(null); setError(cause?.message?.includes('brand_ids') ? 'Showing on more than one page needs the database update first.' : (cause?.message || 'Could not save.')); }
    finally { setSaving(false); }
  }
  return (
    <fieldset data-item-brands disabled={saving} style={{ border: 0, margin: '10px 0 0', padding: 0, minWidth: 0, color: ink, fontFamily: sans }}>
      <legend style={{ padding: 0, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .75 }}>Shows on</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {brands.map((brand) => {
          const id = brand.id || '';
          const active = selected.includes(id);
          return (
            <label key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 30, padding: '0 10px', border: `1px solid ${active ? on : line}`, color: active ? on : ink, fontSize: 11, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
              <input type="checkbox" checked={active} onChange={() => toggle(id)} style={{ margin: 0 }} aria-label={`Show on ${brand.name}`} />{brand.name}
            </label>
          );
        })}
      </div>
      {error && <div role="alert" style={{ color: '#E0A08F', fontSize: 11, marginTop: 6 }}>{error}</div>}
    </fieldset>
  );
}
