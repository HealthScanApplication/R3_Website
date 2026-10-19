import { useState } from 'react';
import { PRAL_DISPLAY, type PralTotal, type TrustedPral } from '../../utils/pral';
import type { DietTotals } from '../../utils/dietNutrition';

// Guardian dark tokens (same values as DietNutritionPanel.tsx). Neutral only: no good/bad colouring.
const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,.12)';
const acid = '#C7D8A3';
const link: React.CSSProperties = { border: 0, background: 'transparent', color: acid, fontSize: 10, padding: 0, cursor: 'pointer' };
const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, fontSize: 11, padding: '3px 0', borderTop: `1px solid ${line}` };

const mEq = (n: number) => `${(Math.round(n * 10) / 10 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} mEq`;

/** One stored per-100 g value, worded per the claims lexicon §4. */
export function pralValueText(p: TrustedPral | undefined, rule?: boolean): string {
  if (p === 'not_applicable') return 'Not applicable to this food type';
  if (p == null) return '— not enough sourced data';
  if (rule && p === 0) return 'about 0 (rule: water)';
  return `${mEq(p)} per 100 g`;
}
/** A meal/day/week total: a number only when every weighed item has a value. */
export function pralTotalText(t: PralTotal | null | undefined): string {
  if (!t || !t.count) return '— not enough sourced data';
  if (t.total == null) return `— ${t.withValue} of ${t.count} items have a value`;
  return mEq(t.total);
}

function Info() {
  return <div role="note" style={{ margin: '6px 0', padding: 8, border: `1px solid ${line}`, color: muted, fontSize: 10, lineHeight: 1.5 }}>
    <p style={{ margin: '0 0 4px' }}>PRAL stands for potential renal acid load. It is a number calculated from protein, phosphorus, potassium, magnesium and calcium, as an estimate of how much acid or base a food leaves for the kidneys to excrete. It reflects acid in urine, not the pH of the blood.</p>
    <p style={{ margin: '0 0 4px' }}>Formula: Remer &amp; Manz (1995); model pral-remer-v1. Values are mEq per 100 g on a raw-mass basis. Input sources: USDA, CIQUAL, CoFID, MEXT, CNF, UK Department of Health.</p>
    <p style={{ margin: 0 }}>An estimate, reference only; not a target. Not medical advice.</p>
  </div>;
}

export function DietPralSummary({ totals, enabled = PRAL_DISPLAY, expanded = false }: { totals: DietTotals; enabled?: boolean; expanded?: boolean }) {
  const [info, setInfo] = useState(expanded);
  const [open, setOpen] = useState(expanded);
  if (!enabled) return null;
  const t = totals.pral;
  return <div aria-label="PRAL (acid/base load)" style={{ marginBottom: 16, color: ink }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <h3 style={{ fontSize: 13, margin: 0 }}>PRAL (acid/base load)</h3>
      <span style={{ fontSize: 12, fontWeight: 700 }} data-testid="pral-total">{pralTotalText(t)}</span>
    </div>
    <p style={{ color: muted, fontSize: 11, margin: '2px 0 4px' }}>
      Estimate, reference only; reflects acid in urine, not the pH of the blood; not a target.
      {t.notApplicable > 0 && ` ${t.notApplicable} not applicable to this food type.`}
      {' '}<button type="button" aria-expanded={info} onClick={() => setInfo(!info)} style={link}>About PRAL</button>
      {' · '}<button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={link}>{open ? 'Hide' : 'Per meal'} ({totals.pralMeals.length})</button>
    </p>
    {info && <Info />}
    {open && <div>
      {totals.pralMeals.map((m, i) => <div key={`${m.name}-${i}`} style={rowStyle}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span><span style={{ color: muted }}>{pralTotalText(m.pral)}</span></div>)}
      {totals.ingredients.length > 0 && <div style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', padding: '8px 0 2px' }}>Ingredients · per 100 g raw</div>}
      {totals.ingredients.map((g) => <div key={g.name} style={rowStyle}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span><span style={{ color: muted }}>{pralValueText(g.pral, g.pralRule)}</span></div>)}
    </div>}
  </div>;
}
