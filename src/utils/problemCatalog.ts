/** The symptom catalog as targetable problems, fetched once per page (public read, no auth needed). */
import { projectId, publicAnonKey } from './supabase/info';
import { isTargetableProblem, type CatalogProblem } from './audienceTaxonomy';

let cache: Promise<CatalogProblem[]> | null = null;
export function loadProblemCatalog(): Promise<CatalogProblem[]> {
  cache ??= fetch(`https://${projectId}.supabase.co/rest/v1/catalog_symptoms?select=id,name,lay_term,body_system,category,population_risk&is_active=eq.true&order=name.asc&limit=3000`, {
    headers: { apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Problem catalog failed (${res.status})`);
    return ((await res.json()) as CatalogProblem[]).filter(isTargetableProblem);
  }).catch((e) => { cache = null; throw e; });
  return cache;
}

// Problems and goals a Guardian adds themselves stay on this device for now.
const CUSTOM_KEY = 'r3.guardian.customFocus';
export function savedCustomFocus(): { problems: string[]; goals: string[] } {
  try { const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}'); return { problems: Array.isArray(v.problems) ? v.problems.map(String) : [], goals: Array.isArray(v.goals) ? v.goals.map(String) : [] }; }
  catch { return { problems: [], goals: [] }; }
}
export function addCustomFocus(kind: 'problems' | 'goals', label: string) {
  const v = savedCustomFocus();
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean || v[kind].some((x) => x.toLowerCase() === clean.toLowerCase())) return v;
  const next = { ...v, [kind]: [clean, ...v[kind]].slice(0, 50) };
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); } catch { /* storage blocked: still usable this session */ }
  return next;
}
