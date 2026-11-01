/*
 * An event's day as people at the event would read it. A Sunday start in Sydney is 1 November there even though it is still
 * 31 October in London or New York, so the date is shown in the event's own timezone, not the visitor's. A missing or
 * unknown timezone falls back to the visitor's.
 */
export function validTimeZone(timeZone: string | null | undefined): string | undefined {
  if (!timeZone) return undefined;
  try { new Intl.DateTimeFormat(undefined, { timeZone }); return timeZone; } catch { return undefined; }
}

export function eventDay(startAt: string, timeZone: string | null | undefined, options: Intl.DateTimeFormatOptions, locale?: string): string {
  return new Date(startAt).toLocaleDateString(locale, { ...options, timeZone: validTimeZone(timeZone) });
}

/** An event's dates in its own timezone: "1 Nov – 8 Nov 2026" (the year once, at the end), or one day when it has no end or ends the same day. */
export function eventRangeLabel(event: { start_at: string; end_at?: string | null; timezone?: string | null }, locale?: string): string {
  const from = eventDay(event.start_at, event.timezone, { day: 'numeric', month: 'short' }, locale);
  const fromFull = eventDay(event.start_at, event.timezone, { day: 'numeric', month: 'short', year: 'numeric' }, locale);
  if (!event.end_at) return fromFull;
  const toFull = eventDay(event.end_at, event.timezone, { day: 'numeric', month: 'short', year: 'numeric' }, locale);
  if (toFull === fromFull) return fromFull;
  const sameYear = eventDay(event.start_at, event.timezone, { year: 'numeric' }, locale) === eventDay(event.end_at, event.timezone, { year: 'numeric' }, locale);
  return sameYear ? `${from} – ${toFull}` : `${fromFull} – ${toFull}`;
}

/** The year an event starts in, in its own timezone (for grouping a long list of dates). */
export const eventYear = (event: { start_at: string; timezone?: string | null }, locale?: string): string => eventDay(event.start_at, event.timezone, { year: 'numeric' }, locale);
