/*
 * The Diet and Fitness planners of one person's master routine, read side by side.
 *
 * When both plans are children of the same master Protocol (protocol_children), each planner shows the
 * other's day: the Diet planner sees training sessions and their fuel, the Fitness planner sees meal times
 * and Diet supplements. linkIssues() flags where the two disagree: training or post-workout fuel inside a
 * fasting window, and a fuel supplement the Diet plan already gives that day.
 */
import { MEAL_SLOTS, SUPPLEMENT_PERIODS, WEEK, fuelName, isFastingAt, mealTiming, resolveTiming, sessionTiming, supplementCell, trainingFuel, type DietConfig, type FitnessConfig, type FitnessSession, type FuelItem, type FuelSlot } from './protocolBuilders';

export interface DayTraining { day: number; sessions: Array<{ title: string; time: string; minutes: number; intensity: FitnessSession['intensity'] }>; fuel: FuelSlot[] }
export interface DayDiet { day: number; meals: Array<{ label: string; time: string }>; supplements: Array<{ time: string; name: string; item: FuelItem }> }

/** Training sessions and their fuel for each day of the week (days with no training are left out). */
export function trainingByDay(fit: FitnessConfig): DayTraining[] {
  const fuel = trainingFuel(fit);
  return WEEK.map(({ day }) => ({
    day,
    sessions: fit.sessions.filter((s) => s.day === day).map((s) => ({ title: s.title, time: resolveTiming(sessionTiming(s)), minutes: s.minutes, intensity: s.intensity })).sort((a, b) => a.time.localeCompare(b.time)),
    fuel: fuel.filter((f) => f.day === day),
  })).filter((d) => d.sessions.length);
}

/** Meal times and supplements for each day of the week from a Diet plan. */
export function dietByDay(diet: DietConfig): DayDiet[] {
  return WEEK.map(({ day }) => ({
    day,
    meals: MEAL_SLOTS.filter((s) => diet.slots.includes(s.id)).map((s) => ({ label: s.label, time: resolveTiming(mealTiming(diet, s.id)) })).sort((a, b) => a.time.localeCompare(b.time)),
    supplements: SUPPLEMENT_PERIODS.flatMap((p) => { const cell = supplementCell(diet, day, p.id); return cell.items.filter((i) => fuelName(i)).map((item) => ({ time: cell.time, name: fuelName(item), item })); }),
  }));
}

export type LinkIssueKind = 'training_while_fasting' | 'fuel_while_fasting' | 'duplicate_supplement';
export interface LinkIssue { day: number; kind: LinkIssueKind; message: string }
const dayShort = (day: number) => WEEK.find((w) => w.day === day)?.short || String(day);
// A catalog pick matches by id; free text matches by name, case-insensitively.
const sameItem = (a: FuelItem, b: FuelItem) => typeof a !== 'string' && typeof b !== 'string' ? a.id === b.id : fuelName(a).toLowerCase() === fuelName(b).toLowerCase();

/** Where the Diet and Fitness plans of one routine disagree, day by day. */
export function linkIssues(diet: DietConfig, fit: FitnessConfig): LinkIssue[] {
  const issues: LinkIssue[] = [];
  const dietDays = new Map(dietByDay(diet).map((d) => [d.day, d]));
  for (const t of trainingByDay(fit)) {
    for (const s of t.sessions) if (isFastingAt(diet, t.day, s.time)) issues.push({ day: t.day, kind: 'training_while_fasting', message: `${dayShort(t.day)} ${s.time} ${s.title} starts inside the fast. Fasted training: keep it easier or move it after the fast ends.` });
    for (const f of t.fuel) if (isFastingAt(diet, t.day, f.time)) issues.push({ day: t.day, kind: 'fuel_while_fasting', message: `${dayShort(t.day)} ${f.time}: ${f.when === 'pre' ? 'pre' : 'post'}-workout ${f.items.map(fuelName).join(', ')} falls inside the fast.` });
    const dietSupps = dietDays.get(t.day)?.supplements || [];
    const seen = new Set<string>();
    for (const f of t.fuel) for (const item of f.items) {
      const dup = dietSupps.find((d) => sameItem(d.item, item));
      if (!dup || seen.has(fuelName(item).toLowerCase())) continue;
      seen.add(fuelName(item).toLowerCase());
      issues.push({ day: t.day, kind: 'duplicate_supplement', message: `${dayShort(t.day)}: ${fuelName(item)} is already in the Diet supplements at ${dup.time}.` });
    }
  }
  return issues;
}
