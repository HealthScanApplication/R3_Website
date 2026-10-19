/*
 * Who a piece of guidance is for, what it addresses, and which solution fits:
 * audience (population → age range → life stage) → focus (a problem from the symptom catalog, or a goal)
 * → solution (an offer, Protocol or recipe ranked by how well it matches).
 * Shared by the Guardian setup and the Content builder so both use the same lists.
 */

/* ── audience ── */
export const POPULATIONS = ['Everyone', 'Women', 'Men', 'Children'] as const;
export type Population = typeof POPULATIONS[number];
export const AGE_RANGES: Record<Population, string[]> = {
  Everyone: ['All ages', 'Children 0–5', 'Children 6–12', 'Teens 13–17', 'Adults 18–24', 'Adults 25–44', 'Adults 45–64', 'Adults 65+'],
  Women: ['All ages', 'Girls 0–12', 'Teens 13–17', 'Women 18–24', 'Women 25–44', 'Women 45–64', 'Women 65+'],
  Men: ['All ages', 'Boys 0–12', 'Teens 13–17', 'Men 18–24', 'Men 25–44', 'Men 45–64', 'Men 65+'],
  Children: ['All childhood', 'Infants 0–1', 'Toddlers 1–3', 'Children 4–8', 'Children 9–12', 'Teens 13–17'],
};
export const LIFE_STAGES: Record<Population, string[]> = {
  Everyone: ['Not specified', 'Early life', 'Adolescence', 'Young adulthood', 'Midlife', 'Healthy ageing'],
  Women: ['Not specified', 'Childhood', 'Puberty', 'Reproductive years', 'Preconception', 'Pregnancy', 'Postpartum', 'Premenopause', 'Perimenopause', 'Menopause', 'Postmenopause', 'Healthy ageing'],
  Men: ['Not specified', 'Childhood', 'Puberty', 'Reproductive years', 'Preconception and fertility', 'Fatherhood', 'Midlife', 'Andropause', 'Healthy ageing'],
  Children: ['Not specified', 'Infancy', 'Toddler years', 'Early childhood', 'Middle childhood', 'Puberty', 'Adolescence'],
};
export interface Audience { population: Population; age: string; stage: string }
export const defaultAudience = (): Audience => ({ population: 'Everyone', age: 'All ages', stage: 'Not specified' });
/** Keep age and life stage valid when the population changes. */
export function withPopulation(a: Audience, population: Population): Audience {
  return { population, age: AGE_RANGES[population].includes(a.age) ? a.age : AGE_RANGES[population][0], stage: LIFE_STAGES[population].includes(a.stage) ? a.stage : 'Not specified' };
}
/** "Women 45–64 · Menopause", "Everyone": the audience line used in posts and briefs. */
export function describeAudience(a: Audience): string {
  const age = /^All (ages|childhood)$/.test(a.age) ? '' : a.age;
  // Age ranges already name who they are for ("Women 45–64", "Toddlers 1–3"); teens within a sex say so.
  const who = !age ? a.population : /^Teens/.test(age) && (a.population === 'Women' || a.population === 'Men') ? age.replace('Teens', a.population === 'Women' ? 'Teen girls' : 'Teen boys') : age;
  return [who, a.stage !== 'Not specified' ? a.stage : ''].filter(Boolean).join(' · ');
}

/* ── problems (catalog_symptoms) ── */
export interface CatalogProblem { id: string; name: string; lay_term?: string | null; body_system?: string | null; category?: string | null; population_risk?: string | string[] | null }
/** Friendly problem areas over the catalog's inconsistent body_system / category values. */
export const PROBLEM_AREAS: Array<{ id: string; label: string; match: RegExp }> = [
  { id: 'mind', label: 'Brain, mood & sleep', match: /nerv|brain|neuro|psych|mental|sleep|mood|cognit/i },
  { id: 'gut', label: 'Digestion & gut', match: /digest|gastro|hepat|liver|bowel|gut/i },
  { id: 'hormones', label: 'Hormones & metabolism', match: /endocrin|hormon|metabol|thyroid/i },
  { id: 'skin', label: 'Skin, hair & nails', match: /integument|derma|skin|hair|nail/i },
  { id: 'heart', label: 'Heart, blood & circulation', match: /cardio|circulat|hemat|haemat|blood|vascular|lymph/i },
  { id: 'immune', label: 'Immunity & inflammation', match: /immun|inflam|allerg/i },
  { id: 'muscles', label: 'Muscles, bones & joints', match: /musculo|skelet|bone|joint|muscle/i },
  { id: 'breathing', label: 'Breathing', match: /respir|lung|breath/i },
  { id: 'reproductive', label: 'Reproductive & sexual health', match: /reproduc|fertil|sexual|gynae|gyne|uro-?genit/i },
  { id: 'kidney', label: 'Kidneys & urinary', match: /renal|kidney|urinar|bladder/i },
  { id: 'senses', label: 'Eyes, ears & senses', match: /sensor|ophthal|eye|ear|auditor|oto/i },
  { id: 'general', label: 'Whole body', match: /.*/ },
];
// Not things a Guardian's guidance should target: clinical oncology, poisonings and catalog filler.
const EXCLUDED = /oncolog|toxicolog|placeholder|runoff/i;
export const isTargetableProblem = (p: CatalogProblem) => !EXCLUDED.test(`${p.category || ''} ${p.name}`);
export const problemLabel = (p: CatalogProblem) => (p.lay_term?.trim() || p.name).replace(/\.$/, '');
export function problemAreaOf(p: CatalogProblem): string {
  const text = `${p.body_system || ''} ${p.category || ''}`;
  const specific = PROBLEM_AREAS.find((a) => a.id !== 'general' && a.match.test(text));
  return specific?.id || 'general';
}
const riskTags = (p: CatalogProblem): string[] => {
  const raw = p.population_risk;
  if (Array.isArray(raw)) return raw.map((x) => String(x).toLowerCase());
  if (typeof raw === 'string') { try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : []; } catch { return [raw.toLowerCase()]; } }
  return [];
};
/** How strongly a problem's recorded at-risk groups match the audience (0 = no signal). */
export function audienceRelevance(p: CatalogProblem, a: Audience): number {
  const tags = riskTags(p).join(' ');
  if (!tags) return 0;
  let score = 0;
  if (a.population === 'Women' && /women|female|pregnan|postpartum|menopaus|menstru/.test(tags)) score += 2;
  if (a.population === 'Men' && /\bmen\b|male/.test(tags)) score += 2;
  if (a.population === 'Children' && /child|infant|toddler|adolescen|teen/.test(tags)) score += 2;
  if (/65\+|ageing/i.test(`${a.age} ${a.stage}`) && /elder|older|aged/.test(tags)) score += 1;
  const stage = a.stage.toLowerCase();
  if (stage !== 'not specified' && tags.includes(stage.split(' ')[0])) score += 2;
  return score;
}
/** Problems in an area, matching the search, most relevant to the audience first, then A–Z. */
export function problemsFor(all: CatalogProblem[], area: string | null, query: string, a: Audience, limit = 60): CatalogProblem[] {
  const q = query.trim().toLowerCase();
  return all
    .filter((p) => isTargetableProblem(p) && (!area || problemAreaOf(p) === area) && (!q || `${p.name} ${p.lay_term || ''}`.toLowerCase().includes(q)))
    .sort((x, y) => audienceRelevance(y, a) - audienceRelevance(x, a) || problemLabel(x).localeCompare(problemLabel(y)))
    .slice(0, limit);
}

/* ── goals ── */
export const GOAL_AREAS: Array<{ id: string; label: string; goals: string[] }> = [
  { id: 'health', label: 'Health', goals: ['Sleep better', 'More energy', 'Gut health', 'Hormone balance', 'Healthy weight', 'Heart health', 'Stronger immunity', 'Healthy ageing', 'Steady blood sugar', 'Fertility'] },
  { id: 'mind', label: 'Mind', goals: ['Less stress', 'Better focus', 'Calmer mood', 'Better habits', 'Mindfulness'] },
  { id: 'fitness', label: 'Fitness', goals: ['Build muscle', 'Lose fat', 'Run further', 'Mobility & flexibility', 'Better posture', 'Recovery'] },
  { id: 'beauty', label: 'Beauty', goals: ['Clearer skin', 'Healthy hair', 'Glowing skin', 'Healthy nails', 'Anti-ageing skin'] },
];

/* ── focus + solutions ── */
export type Focus = { kind: 'problem'; area: string; label: string } | { kind: 'goal'; area: string; label: string };
const STOP = new Set(['and', 'the', 'for', 'with', 'your', 'better', 'more', 'less', 'healthy', 'day', 'week', 'routine', 'plan', 'problems', 'problem']);
const SYNONYMS: Record<string, string[]> = { sleep: ['insomnia', 'sleep', 'rest', 'night'], insomnia: ['sleep'], stress: ['stress', 'anxiety', 'calm', 'cortisol'], energy: ['energy', 'fatigue', 'tired'], fatigue: ['energy'], gut: ['gut', 'digest', 'bloat', 'ibs'], skin: ['skin', 'acne', 'complexion'], acne: ['skin'], weight: ['weight', 'fat', 'metabolic'], hormone: ['hormone', 'menopaus', 'cycle', 'pms'], menopause: ['menopaus', 'hot flush', 'perimenopaus'] };
/** Words that identify a focus in titles and descriptions (with a few common synonyms). */
export function focusTerms(f: Focus): string[] {
  const words = f.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w));
  // Plural "s" is dropped for matching, but not from words that only look plural: "-ss" (stress, mindfulness),
  // "-us" (focus) and "-is" (psoriasis). Synonyms are looked up by the full word first, then the singular.
  const singular = (w: string) => (/(ss|us|is)$/.test(w) ? w : w.replace(/s$/, ''));
  return [...new Set(words.flatMap((w) => [singular(w), ...(SYNONYMS[w] || SYNONYMS[singular(w)] || [])]))];
}
/** How well a solution (offer, Protocol, recipe) matches the focus and audience: 0 = no match. */
export function solutionScore(text: string, f: Focus | null, a: Audience): number {
  if (!f) return 0;
  const t = text.toLowerCase();
  let score = focusTerms(f).filter((w) => t.includes(w)).length * 3;
  // Whole word: "men" must not match "women" or "menopause".
  if (a.population !== 'Everyone' && new RegExp(`\\b${a.population.toLowerCase().replace(/ren$|s$/, '')}`).test(t)) score += 1;
  if (a.stage !== 'Not specified' && t.includes(a.stage.toLowerCase().split(' ')[0])) score += 1;
  return score;
}
