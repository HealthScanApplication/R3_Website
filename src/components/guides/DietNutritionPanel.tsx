import { useState } from 'react';
import { Atom, Beaker, Beef, Candy, Circle, CircleDot, Cookie, Croissant, Dot, Drumstick, Layers, LayoutGrid, OctagonAlert, TriangleAlert, Waves, Wine, Bug, ChevronRight, Citrus, CookingPot, Dna, Droplet, Droplets, Factory, FlaskConical, Flame, Gem, Hand, Leaf, Mountain, Package, Pill, Radiation, Scale, SprayCan, Sprout, Warehouse, Wheat, type LucideIcon } from 'lucide-react';
import { nutrientsForTier, type HazardLevel, type NutrientDef, type Tier } from '../../utils/recipeNutrients';
import { FOOD_STAGES, HAZARD_FAMILIES, NUTRIENT_FAMILIES, groupBy, hazardFamily, hazardStage, nutrientFamily, type FoodStage, type HazardFamily, type NutrientFamily } from '../../utils/foodTaxonomy';
import { TIERS, tierLabel, useEssential90, Essential90Note } from './RecipeInsights';
import { WEEK, type PlanIngredient } from '../../utils/protocolBuilders';
import type { aggregateDiet, DietTotals } from '../../utils/dietNutrition';

// Guardian dark tokens (same values as RecipeInsights.tsx).
const ink = '#F5F2EA';
const muted = '#B8B6AF';
const faint = 'rgba(184,182,175,.55)';
const line = 'rgba(245,242,234,.12)';
const acid = '#C7D8A3';
const warn = '#E8B86A';
const danger = '#E88A7A';
const chip = (on: boolean, tone = acid): React.CSSProperties => ({ border: `1px solid ${on ? tone : 'rgba(245,242,234,.24)'}`, background: on ? `${tone}22` : 'transparent', color: on ? tone : ink, borderRadius: 999, padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer' });
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '14px 14px minmax(0,1fr) auto', gap: 8, alignItems: 'center', width: '100%', padding: '6px 0', border: 0, borderTop: `1px solid ${line}`, background: 'transparent', color: ink, fontSize: 12, textAlign: 'left', cursor: 'pointer' };
const sub: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 60px 80px 110px', gap: 8, fontSize: 11, padding: '3px 0' };

const format = (n: number) => n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
const title = (key: string) => key.replace(/_(kcal|kj|g|mg|mcg|ug|iu)$/i,'').replace(/_/g,' ').replace(/^./,(c) => c.toUpperCase());
const unit = (key: string) => /_(kcal|kj|g|mg|mcg|ug|iu)$/i.exec(key)?.[1] || '';
const LEVELS: HazardLevel[] = ['high','moderate','low','trace'];
const tone = (l: HazardLevel) => l === 'high' ? danger : l === 'moderate' ? warn : muted;
const LEVEL_NOTE: Record<HazardLevel, string> = {
  high: 'Source records flag this ingredient as a frequent or high-concentration carrier.',
  moderate: 'Source records show it regularly, at mid-range concentrations.',
  low: 'Recorded occasionally or at low concentrations.',
  trace: 'Trace detections only, or not yet assessed (likelihood only).',
};
// Short, neutral context for the hazards the catalog records most often.
const AFFECTS: Record<string, string> = {
  lead: 'Nervous system, kidneys, blood; children most sensitive.',
  cadmium: 'Kidneys and bone; accumulates over years.',
  arsenic: 'Skin, lungs, bladder; inorganic form is the concern.',
  mercury: 'Nervous system; methylmercury in fish matters most.',
  acrylamide: 'Forms in high-heat cooking; probable carcinogen (IARC 2A).',
  bisphenol: 'Endocrine activity; migrates from can and packaging linings.',
  nitrate: 'Can convert to nitrites and nitrosamines.',
  aflatoxin: 'Liver; mould toxin in nuts and grains.',
};
const affects = (key: string) => Object.entries(AFFECTS).find(([k]) => key.toLowerCase().includes(k))?.[1];

const NUTRIENT_ICON: Record<NutrientFamily, LucideIcon> = { macros: Flame, fibre: Wheat, vitamins: Citrus, minerals: Gem, fatty_acids: Droplet, amino_acids: Dna, phytonutrients: Leaf, other: Atom };
/** Macros get their own icon; every other nutrient takes its family's icon. */
const MACRO_ICON: Record<string, LucideIcon> = { energy_kcal: Flame, protein_g: Drumstick, carbohydrates_g: Croissant, fats_g: Droplet, fiber_g: Wheat, sugars_g: Candy, saturated_fat_g: Beef, trans_fat_g: Cookie, salt_g: Waves, alcohol_g: Wine };
const nutrientIcon = (k: string): LucideIcon => MACRO_ICON[k] || NUTRIENT_ICON[nutrientFamily(k)];
const TIER_ICON: Record<Tier, LucideIcon> = { 15: CircleDot, 30: Layers, 90: LayoutGrid };
const LEVEL_ICON: Record<HazardLevel, LucideIcon> = { high: OctagonAlert, moderate: TriangleAlert, low: Circle, trace: Dot };
const chipIcon = (Icon: LucideIcon) => <Icon size={12} strokeWidth={2} aria-hidden="true" />;
const HAZARD_ICON: Record<HazardFamily, LucideIcon> = { heavy_metals: Mountain, radionuclides: Radiation, pesticides: SprayCan, drug_residues: Pill, plastics: Package, pollutants: Factory, water_treatment: Droplets, nitrates: FlaskConical, mycotoxins: Sprout, pathogens: Bug, process: CookingPot, natural: Leaf, additives: Beaker, limits: Scale, other: Atom };
const STAGE_ICON: Record<FoodStage, LucideIcon> = { in_food: Leaf, soil_water: Mountain, farm: SprayCan, storage: Warehouse, handling: Hand, processing: CookingPot, water_treatment: Droplets, packaging: Package, unknown: Atom };
const familyLabel = <T extends string>(list: Array<{ id: T; label: string }>, id: T) => list.find((f) => f.id === id)?.label || id;

/** Family heading: icon, name and count; sticks to the top of its scroll box while its rows scroll past. */
function GroupHead({ Icon, label, count, note, step }: { Icon: LucideIcon; label: string; count: number; note?: string; step?: string }) {
  return <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#11120F', padding: '12px 0 5px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
      {step && <span style={{ color: faint }}>{step}</span>}<Icon size={13} strokeWidth={1.8} aria-hidden="true" />{label}<span style={{ color: faint }}>· {count}</span>
    </div>
    {note && <div style={{ color: muted, fontSize: 10, marginTop: 2 }}>{note}</div>}
  </div>;
}

function Badge({ level }: { level: HazardLevel }) {
  return <span style={{ color: tone(level), border: `1px solid ${tone(level)}`, borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{level}</span>;
}
function Tabs({ tab, onTab }: { tab: 'ingredients' | 'health'; onTab: (t: 'ingredients' | 'health') => void }) {
  return <div role="tablist" style={{ display: 'flex', gap: 5, margin: '4px 0 6px' }}>{(['ingredients','health'] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onTab(t)} style={chip(tab === t)}>{t === 'ingredients' ? 'Ingredients' : 'Health'}</button>)}</div>;
}
function Sources({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return <div style={{ marginTop: 6 }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ border: 0, background: 'transparent', color: acid, fontSize: 10, padding: 0, cursor: 'pointer' }}>{open ? 'Hide' : 'Sources'} ({items.length})</button>
    {open && <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: muted, fontSize: 10, lineHeight: 1.45, maxHeight: 180, overflow: 'auto' }}>{items.map((s) => <li key={s}>{s}</li>)}</ul>}
  </div>;
}

/** The flipped view: one ingredient → its recorded nutrients and hazards. */
function IngredientDetail({ ing, defs }: { ing: PlanIngredient; defs: NutrientDef[] }) {
  const g = ing.grams;
  const nutrients = defs.filter((d) => ing.per100[d.key] != null);
  return <div style={{ margin: '2px 0 8px 10px', paddingLeft: 10, borderLeft: `2px solid ${line}` }}>
    <div style={{ color: muted, fontSize: 10, marginBottom: 3 }}>{g == null ? 'Portion unknown' : `${format(g)} g in this plan`} · {nutrients.length} nutrients in this group · {ing.hazards.length} hazards</div>
    {nutrients.map((d) => <div key={d.key} style={sub}><span>{d.label}</span><span style={{ color: muted }}>{format(ing.per100[d.key])}/100 g</span><span style={{ textAlign: 'right' }}>{g == null ? '—' : `${format(ing.per100[d.key] * g / 100)} ${d.unit}`}</span><span /></div>)}
    {ing.hazards.map((h) => <div key={h.key} style={sub}><span>{h.label}</span><span style={{ color: muted }}>{h.per100 == null ? '—' : `${format(h.per100)}/100 g`}</span><span style={{ textAlign: 'right' }}>{g == null || h.per100 == null ? '—' : `${format(h.per100 * g / 100)} ${unit(h.key)}`}</span><span style={{ textAlign: 'right' }}><Badge level={h.level} /></span></div>)}
  </div>;
}

/** Contributing ingredients, largest contribution first; click one to flip to its own nutrients and hazards. */
function IngredientTable({ rows, valueUnit, defs }: { rows: Array<{ ing: PlanIngredient; per100: number | null; level?: HazardLevel }>; valueUnit: string; defs: NutrientDef[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const contrib = (r: typeof rows[number]) => r.per100 == null || r.ing.grams == null ? null : r.per100 * r.ing.grams / 100;
  const sum = rows.reduce((a, r) => a + (contrib(r) ?? 0), 0);
  const sorted = [...rows].sort((a, b) => (contrib(b) ?? -1) - (contrib(a) ?? -1));
  if (!rows.length) return <div style={{ color: muted, fontSize: 11 }}>No ingredient-level records for this item.</div>;
  return <div>
    <div style={{ ...sub, color: faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}><span>Ingredient</span><span>Portion</span><span>Per 100 g</span><span style={{ textAlign: 'right' }}>Contribution</span></div>
    <div style={{ maxHeight: 260, overflow: 'auto' }}>{sorted.map((r) => { const c = contrib(r); return <div key={r.ing.name}>
      <div style={sub}>
        <button type="button" aria-expanded={open === r.ing.name} onClick={() => setOpen(open === r.ing.name ? null : r.ing.name)} style={{ border: 0, background: 'transparent', color: ink, padding: 0, fontSize: 11, textAlign: 'left', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open === r.ing.name ? '▾' : '▸'} {r.ing.name}{r.level ? <> <Badge level={r.level} /></> : null}</button>
        <span style={{ color: muted }}>{r.ing.grams == null ? '?' : `${format(r.ing.grams)} g`}</span>
        <span style={{ color: muted }}>{r.per100 == null ? 'unknown' : `${format(r.per100)} ${valueUnit}`.trim()}</span>
        <span style={{ textAlign: 'right' }}>{c == null ? '—' : `${format(c)} ${valueUnit}`}{c != null && sum > 0 && <span style={{ color: faint }}> · {Math.round(c / sum * 100)}%</span>}</span>
      </div>
      {open === r.ing.name && <IngredientDetail ing={r.ing} defs={defs} />}
    </div>; })}</div>
  </div>;
}

function NutrientRow({ k, def, cell, totals, period, defs }: { k: string; def?: NutrientDef; cell?: DietTotals['nutrients'][string]; totals: DietTotals; period: number; defs: NutrientDef[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'ingredients' | 'health'>('ingredients');
  const u = def?.unit || unit(k);
  const incomplete = totals.count > 0 && (cell?.partial || (cell?.known ?? 0) !== totals.count);
  const pct = cell?.amount != null && def?.dv ? Math.round(cell.amount / period / def.dv * 100) : null;
  const Icon = nutrientIcon(k);
  return <div>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={row}>
      <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : undefined, color: muted }} />
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" style={{ color: cell?.amount == null ? faint : acid }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cell?.amount == null ? faint : ink }}>{def?.label || title(k)}{def?.safety === 'Hazardous' && <span style={{ color: danger }}> · hazardous</span>}{incomplete && <span style={{ color: faint }}> · {cell?.known || 0}/{totals.count}</span>}</span>
      <span style={{ color: cell?.amount == null ? faint : ink, whiteSpace: 'nowrap' }}>{cell?.amount == null ? (totals.count ? 'unknown' : '—') : `${format(cell.amount)} ${u}`}{pct != null && <span style={{ color: muted }}> · {pct}%/day</span>}</span>
    </button>
    {open && <div style={{ padding: '0 0 8px 22px' }}>
      <Tabs tab={tab} onTab={setTab} />
      {tab === 'ingredients'
        ? <IngredientTable rows={totals.ingredients.filter((i) => i.per100[k] != null).map((ing) => ({ ing, per100: ing.per100[k] }))} valueUnit={u} defs={defs} />
        : <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
          <div><span style={{ color: ink }}>Reference:</span> {def?.dv ? `${format(def.dv)} ${u} per day` : 'no daily reference recorded'}{pct != null && ` · this plan averages ${pct}% per day`}</div>
          <div><span style={{ color: ink }}>Data:</span> {cell?.known || 0} of {totals.count} selections have a value{incomplete ? '; the total is a lower bound' : ''}.</div>
          {def?.safety === 'Hazardous' && <div style={{ color: danger }}>Listed historically, but hazardous; not an intake goal.</div>}
          {def && <div>In the {def.tier === 90 ? 'Essential 90' : def.tier === 30 ? 'Extended 30' : 'Core 15'} group.</div>}
        </div>}
    </div>}
  </div>;
}

function HazardRow({ h, totals, defs }: { h: DietTotals['hazards'][number]; totals: DietTotals; defs: NutrientDef[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'ingredients' | 'health'>('ingredients');
  const carriers = totals.ingredients.flatMap((ing) => ing.hazards.filter((hz) => hz.key === h.key).map((hz) => ({ ing, per100: hz.per100, level: hz.level })));
  const u = unit(h.key);
  const Icon = HAZARD_ICON[hazardFamily(h.key)];
  return <div>
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={row}>
      <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : undefined, color: muted }} />
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" style={{ color: tone(h.level) === muted ? acid : tone(h.level) }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label} <Badge level={h.level} /><span style={{ color: muted }}> · {carriers.length || h.sources.length} ingredients</span></span>
      <span style={{ color: h.assessed ? muted : faint, whiteSpace: 'nowrap', fontSize: 11 }}>{h.amount != null ? `${format(h.amount)} ${u} · ` : ''}{h.assessed ? 'assessed' : 'likelihood only'}</span>
    </button>
    {open && <div style={{ padding: '0 0 8px 22px' }}>
      <Tabs tab={tab} onTab={setTab} />
      {tab === 'ingredients'
        ? <IngredientTable rows={carriers} valueUnit={u} defs={defs} />
        : <div style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
          {affects(h.key) && <div><span style={{ color: ink }}>Affects:</span> {affects(h.key)}</div>}
          <div><span style={{ color: ink }}>Level <Badge level={h.level} />:</span> {LEVEL_NOTE[h.level]} Not a calculated exposure limit.</div>
          <div><span style={{ color: ink }}>Quantity:</span> {h.amount == null ? 'not additive in the records' : `${format(h.amount)} ${u} recorded`}{h.unknown ? `; ${h.unknown} of ${h.occurrences} occurrences unquantified` : ''}.</div>
          <div><span style={{ color: ink }}>Limits:</span> regulatory maxima are listed per food in the sources below.</div>
        </div>}
      <Sources items={h.reasons} />
    </div>}
  </div>;
}

export function DietNutritionPanel({ report, loading, error }: { report: ReturnType<typeof aggregateDiet>; loading: boolean; error: string }) {
  const [day,setDay] = useState('week');
  const [tier,setTier] = useState<Tier>(15);
  const [levels,setLevels] = useState<HazardLevel[]>(LEVELS);
  const [hazardView,setHazardView] = useState<'family' | 'route'>('family');
  const catalog = useEssential90();
  const defs = nutrientsForTier(tier,catalog);
  const allDefs = nutrientsForTier(90,catalog);
  const totals = day === 'week' ? report.week : report.days[Number(day)-1];
  const period = day === 'week' ? 7 : 1;
  const macros = ['energy_kcal','protein_g','carbohydrates_g','fats_g','fiber_g','sugars_g','saturated_fat_g','trans_fat_g','salt_g','alcohol_g'];
  const keys = [...new Set([...macros, ...defs.map(d => d.key)])];
  const other = Object.keys(totals.nutrients).filter((k) => !keys.includes(k) && totals.nutrients[k].amount != null);
  const hazards = totals.hazards.filter((h) => levels.includes(h.level));
  const nutrientRow = (k: string) => <NutrientRow key={k} k={k} def={allDefs.find((d) => d.key === k)} cell={totals.nutrients[k]} totals={totals} period={period} defs={allDefs} />;
  const nutrientGroup = (g: { id: NutrientFamily; items: string[] }, keyPrefix = '') => <div key={keyPrefix + g.id}><GroupHead Icon={NUTRIENT_ICON[g.id]} label={familyLabel(NUTRIENT_FAMILIES, g.id)} count={g.items.length} />{g.items.map(nutrientRow)}</div>;
  const hazardRow = (h: typeof hazards[number]) => <HazardRow key={h.key} h={h} totals={totals} defs={allDefs} />;
  return <section aria-label="Meal and drink nutrition" style={{ border: '1px solid rgba(245,242,234,.24)', padding: 16, marginBottom: 18, background: '#11120F', color: ink }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>All meals &amp; drinks · nutrition and hazards</h2>
      <select aria-label="Nutrition totals period" value={day} onChange={(e) => setDay(e.target.value)} style={{ background: '#11120F', color: ink, padding: 5, fontSize: 12 }}><option value="week">Whole week</option>{WEEK.map((w) => <option key={w.day} value={w.day}>{w.short}</option>)}</select>
    </div>
    <p style={{ fontSize: 11, color: muted, margin: '6px 0 10px' }}>{totals.count} selections, servings applied. Missing data is unknown, not zero; supplements are listed separately.</p>
    {loading && <p role="status" style={{ fontSize: 12 }}>Refreshing selected recipes’ nutrients and hazards…</p>}
    {error && <p role="alert" style={{ color: warn, fontSize: 12 }}>{error} Showing saved data only; totals may be incomplete.</p>}
    {!!totals.unlinked && <p style={{ color: warn, fontSize: 12 }}>{totals.unlinked} text-only drinks need a database match before they count.</p>}

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
      <h3 style={{ fontSize: 13, margin: 0 }}>Nutrients <span style={{ color: muted, fontWeight: 400 }}>· {keys.length}</span></h3>
      <span aria-label="Nutrient groups" style={{ display: 'flex', gap: 5 }}>{TIERS.map(t => <button type="button" key={t} aria-pressed={tier === t} onClick={() => setTier(t)} style={{ ...chip(tier === t), display: 'inline-flex', alignItems: 'center', gap: 4 }}>{chipIcon(TIER_ICON[t])}{tierLabel(t)}</button>)}</span>
    </div>
    {tier === 90 && <Essential90Note defs={catalog} />}
    <div style={{ maxHeight: 420, overflow: 'auto', marginBottom: 16 }}>{groupBy(keys, nutrientFamily, NUTRIENT_FAMILIES).map((g) => nutrientGroup(g))}
      {other.length > 0 && <div style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', padding: '16px 0 0', borderTop: `1px solid ${line}`, marginTop: 8 }}>Other measured, outside {tierLabel(tier)} · {other.length}</div>}
      {groupBy(other, nutrientFamily, NUTRIENT_FAMILIES).map((g) => nutrientGroup(g, 'other-'))}</div>

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
      <h3 style={{ fontSize: 13, margin: 0 }}>Recorded hazards <span style={{ color: muted, fontWeight: 400 }}>· {hazards.length} of {totals.hazards.length}</span></h3>
      <span aria-label="Hazard levels" style={{ display: 'flex', gap: 5 }}>{LEVELS.map((l) => { const on = levels.includes(l); return <button type="button" key={l} aria-pressed={on} onClick={() => setLevels(on ? levels.filter((x) => x !== l) : [...levels, l])} style={{ ...chip(on, tone(l) === muted ? acid : tone(l)), display: 'inline-flex', alignItems: 'center', gap: 4 }}>{chipIcon(LEVEL_ICON[l])}{l} {totals.hazards.filter((h) => h.level === l).length}</button>; })}</span>
    </div>
    <p style={{ color: muted, fontSize: 11, margin: '0 0 4px' }}>Levels describe source records, not safe-exposure limits. No record ≠ hazard-free.{totals.unassessed ? ` ${totals.unassessed} selections incompletely analysed.` : ''}</p>
    {!totals.hazards.length && <p style={{ fontSize: 12 }}>No hazard records for these selections.</p>}
    {totals.hazards.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0 2px' }}>
      <span role="tablist" aria-label="Hazard view" style={{ display: 'flex', gap: 5 }}>{([['family', 'By type'], ['route', 'Farm to plate']] as const).map(([v, text]) => <button type="button" role="tab" key={v} aria-selected={hazardView === v} onClick={() => setHazardView(v)} style={chip(hazardView === v)}>{text}</button>)}</span>
      {hazardView === 'route' && <span style={{ color: faint, fontSize: 10 }}>Typical route for each kind of hazard, not traced for these ingredients.</span>}
    </div>}
    <div style={{ maxHeight: 420, overflow: 'auto' }}>
      {hazardView === 'family'
        ? groupBy(hazards, (h) => hazardFamily(h.key), HAZARD_FAMILIES).map((g) => <div key={g.id}><GroupHead Icon={HAZARD_ICON[g.id]} label={familyLabel(HAZARD_FAMILIES, g.id)} count={g.items.length} />{g.items.map(hazardRow)}</div>)
        : groupBy(hazards, (h) => hazardStage(h.key), FOOD_STAGES).map((g) => {
          const stage = FOOD_STAGES.find((s) => s.id === g.id)!;
          // Step numbers keep their place in the full field-to-plate chain, so gaps show which stages had nothing recorded.
          return <div key={g.id} style={{ borderLeft: `1px solid ${line}`, paddingLeft: 12, marginLeft: 6 }}><GroupHead step={String(FOOD_STAGES.indexOf(stage) + 1).padStart(2, '0')} Icon={STAGE_ICON[g.id]} label={stage.label} note={stage.note} count={g.items.length} />{g.items.map(hazardRow)}</div>;
        })}
    </div>
  </section>;
}
