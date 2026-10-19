/**
 * PRAL (acid/base load) reader for the Diet planner. Mirrors the mobile app's
 * src/utils/pralTrust.ts: this file decides whether a STORED catalog value may be
 * shown; it never calculates PRAL itself. Copy rules: mobile docs/CLAIMS_LEXICON.md §4.
 */

/** Ships dark: set VITE_PRAL_DISPLAY=true to show it after claims review. */
export const PRAL_DISPLAY = import.meta.env?.VITE_PRAL_DISPLAY === 'true';

export const PRAL_COLUMNS = ['pral_meq_per_100g','pral_status','pral_input_quality','pral_model_version','pral_calculated_at'] as const;
export const PRAL_TRUST_ABS_MAX = 500;

/** A number (sourced or rule), 'not_applicable', or null (unknown). Never 0 for unknown. */
export type TrustedPral = number | 'not_applicable' | null;
export interface PralTrustRow { pral_meq_per_100g?: unknown; pral_status?: unknown }

const storedNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};
export function trustedPral(row: PralTrustRow | null | undefined): TrustedPral {
  const status = row?.pral_status;
  if (status === 'not_applicable') return 'not_applicable';
  if (status !== 'sourced' && status !== 'rule') return null;
  const value = storedNumber(row!.pral_meq_per_100g);
  if (value === null || Math.abs(value) > PRAL_TRUST_ABS_MAX) return null;
  return value === 0 ? 0 : value;
}

/** One weighed item: grams already include the same retention/servings scaling as the other nutrients. */
export interface PralItem { name: string; grams: number | null; pral: TrustedPral; rule?: boolean }
export interface PralTotal {
  /** Sum of pral × grams / 100, or null unless EVERY item has a value. Never a partial sum. */
  total: number | null;
  withValue: number; count: number; notApplicable: number; rule: number;
}
export const EMPTY_PRAL: PralTotal = { total: null, withValue: 0, count: 0, notApplicable: 0, rule: 0 };

export function sumPral(items: PralItem[], divisor = 1): PralTotal {
  let total = 0, withValue = 0, notApplicable = 0, rule = 0;
  for (const i of items) {
    if (i.pral === 'not_applicable') { notApplicable++; continue; }
    if (i.pral == null || i.grams == null) continue;
    withValue++; if (i.rule) rule++;
    total += i.pral * i.grams / 100 / divisor;
  }
  const count = items.length;
  return { total: count > 0 && withValue === count ? total : null, withValue, count, notApplicable, rule };
}

/** Combine meal totals (each scaled by its servings). Unavailable if any part is. */
export function combinePral(parts: Array<{ pral?: PralTotal; servings: number } | null>): PralTotal {
  const out = { ...EMPTY_PRAL, total: 0 as number | null };
  if (!parts.length) out.total = null;
  for (const p of parts) {
    if (!p?.pral) { out.count++; out.total = null; continue; }
    out.withValue += p.pral.withValue; out.count += p.pral.count; out.notApplicable += p.pral.notApplicable; out.rule += p.pral.rule;
    out.total = out.total == null || p.pral.total == null ? null : out.total + p.pral.total * p.servings;
  }
  return out;
}

/** Fetch with the pral_* columns; on a database without them (PostgREST 42703 / 400) retry once without. */
export async function fetchWithPralFallback(build: (select: string) => string, select: string, init: RequestInit): Promise<Response> {
  const response = await fetch(build(`${select},${PRAL_COLUMNS.join(',')}`), init);
  if (response.ok || response.status !== 400) return response;
  return fetch(build(select), init);
}
