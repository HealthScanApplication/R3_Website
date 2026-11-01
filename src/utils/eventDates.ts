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
