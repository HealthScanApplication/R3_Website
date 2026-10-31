/*
 * Treats (spa and wellness treatments) and Talks (lectures and talks) are ordinary Guardian offers of kind 'treat' and 'talk', so
 * they are created, priced, published and removed in the Guardian's admin like every other offer. They need two facts an offer has
 * no column for: a category ("Facial", "Lecture") and a length in minutes. Those live on the first line of the description,
 * "Facial · 60 min", with the written description underneath, so no schema change is needed and the line stays readable
 * wherever the offer is shown.
 */

export const TREAT_KINDS = ['treat', 'talk'] as const;
export type TreatKind = typeof TREAT_KINDS[number];
export const isTreatKind = (kind: string | null | undefined): kind is TreatKind => kind === 'treat' || kind === 'talk';

export const KIND_LABEL: Record<TreatKind, { one: string; many: string; verb: string }> = {
  treat: { one: 'Treat', many: 'Treats', verb: 'Book' },
  talk: { one: 'Talk', many: 'Talks', verb: 'Reserve' },
};

export interface OfferMeta { category: string; minutes: number | null; text: string }

/** "Facial · 60 min\nA non-invasive…" into its parts. A description with no header line is all text. */
export function parseOfferMeta(description: string | null | undefined): OfferMeta {
  const raw = String(description || '').replace(/\r\n/g, '\n').trim();
  const [first = '', ...rest] = raw.split('\n');
  const header = first.match(/^([^·\n]{1,40}?)\s*·\s*(\d{1,4})\s*(?:min|mins|minutes)\s*$/i) || first.match(/^()(\d{1,4})\s*(?:min|mins|minutes)\s*$/i) || first.match(/^([^·\n]{1,40}?)\s*$/);
  // A first line that is only a short label (no minutes) counts as a category only when more text follows it.
  if (header && /\d/.test(first)) return { category: header[1].trim(), minutes: Number(header[2]), text: rest.join('\n').trim() };
  if (header && rest.length && first.length <= 40 && !/[.!?]$/.test(first)) return { category: first.trim(), minutes: null, text: rest.join('\n').trim() };
  return { category: '', minutes: null, text: raw };
}

/** The reverse: the stored description for a category, a length and the written text. */
export function composeOfferDescription({ category, minutes, text }: OfferMeta): string {
  const cat = category.trim();
  const mins = minutes && minutes > 0 ? `${Math.round(minutes)} min` : '';
  const header = [cat, mins].filter(Boolean).join(' · ');
  return [header, text.trim()].filter(Boolean).join('\n');
}

export const formatMinutes = (minutes: number | null | undefined): string => {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

/** Offers of one treat/talk kind, in the order they should show: by category (in first-seen order), then by title. */
export function groupByCategory<T extends { id: string; title: string; description: string | null }>(offers: T[]): Array<{ category: string; offers: T[] }> {
  const groups = new Map<string, T[]>();
  for (const offer of offers) {
    const category = parseOfferMeta(offer.description).category || '';
    groups.set(category, [...(groups.get(category) || []), offer]);
  }
  return [...groups.entries()].map(([category, items]) => ({ category, offers: [...items].sort((a, b) => a.title.localeCompare(b.title)) }));
}

/** A price in cents as money in its currency ("A$130", "Free"); the browser's locale does the formatting. */
export function formatOfferPrice(cents: number, currency: string, accessModel: 'free' | 'paid'): string {
  if (accessModel === 'free' || !cents) return 'Free';
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency || 'AUD', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}
