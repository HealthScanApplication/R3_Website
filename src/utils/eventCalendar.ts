/*
 * The date logic behind the events calendar on a Guardian's page: which days have an event, the month grid, and which
 * events fit a chosen day or range. Days are "YYYY-MM-DD" keys read in each event's OWN timezone (a Sunday start in
 * Sydney is that Sunday for everyone), so the calendar agrees with the dates printed on the cards.
 */
import { validTimeZone } from './eventDates';

export interface CalendarEvent { id: string; start_at: string; end_at?: string | null; timezone?: string | null }
export interface DayRange { from: string; to: string }

/** Days marked for one event: enough for a long programme, but never a runaway loop. The event's true end is kept separately. */
const MAX_MARKED_DAYS = 400;

/** The calendar day of a moment in a timezone, as "YYYY-MM-DD". */
export function dayKey(iso: string, timeZone?: string | null): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: validTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const toUtc = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key: string, days: number) => fromUtc(toUtc(key) + days * 86400000);

/** The first and last day an event covers, from its real dates (an event with no end, or an end before its start, is one day). Null for a date that cannot be read. */
export function eventSpan(event: CalendarEvent): { first: string; last: string } | null {
  if (Number.isNaN(Date.parse(event.start_at)) || (event.end_at && Number.isNaN(Date.parse(event.end_at)))) return null;
  const first = dayKey(event.start_at, event.timezone);
  const last = event.end_at ? dayKey(event.end_at, event.timezone) : first;
  return { first, last: last < first ? first : last };
}

/** Every day an event covers, first to last, for marking the calendar (capped; use eventSpan for where it really ends). */
export function eventDays(event: CalendarEvent): string[] {
  const span = eventSpan(event);
  if (!span) return [];
  const days: string[] = [];
  for (let key = span.first; key <= span.last && days.length < MAX_MARKED_DAYS; key = addDays(key, 1)) days.push(key);
  return days;
}

/** For each day with something on, how many events start there and how many are simply under way. */
export function dayMarks(events: CalendarEvent[]): Map<string, { starts: number; ongoing: number }> {
  const marks = new Map<string, { starts: number; ongoing: number }>();
  for (const event of events) {
    eventDays(event).forEach((key, index) => {
      const mark = marks.get(key) || { starts: 0, ongoing: 0 };
      if (index === 0) mark.starts += 1; else mark.ongoing += 1;
      marks.set(key, mark);
    });
  }
  return marks;
}

export interface MonthCell { key: string; day: number; inMonth: boolean }

/** Six weeks of days that show the month (weeks start on Monday). `month` is 1 to 12. */
export function monthCells(year: number, month: number): MonthCell[] {
  const first = Date.UTC(year, month - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const ms = first + (index - lead) * 86400000;
    const date = new Date(ms);
    return { key: fromUtc(ms), day: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1 };
  });
}

export const monthOf = (key: string) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
export const shiftMonth = (view: { year: number; month: number }, by: number) => { const index = view.year * 12 + (view.month - 1) + by; return { year: Math.floor(index / 12), month: (index % 12) + 1 }; };

/** The events that fit a chosen day or range: any that is on at some point within it. Nothing chosen: all of them. */
export function eventsInRange<T extends CalendarEvent>(events: T[], range: DayRange | null): T[] {
  if (!range) return events;
  const { from, to } = range;
  return events.filter((event) => { const span = eventSpan(event); return !!span && span.first <= to && span.last >= from; });
}

/** A click on a day: the first starts a choice, the second completes a range, the next begins again; the same single day again clears it. */
export function pickDay(range: DayRange | null, key: string): DayRange | null {
  if (!range) return { from: key, to: key };
  if (range.from === range.to) return key === range.from ? null : { from: key < range.from ? key : range.from, to: key < range.from ? range.from : key };
  return { from: key, to: key };
}

/** The month to open the calendar on: the month of the first event day from today on (or its first day if today is inside it); the last month when everything is past. */
export function openingMonth(events: CalendarEvent[], today: string): { year: number; month: number } | null {
  const spans = events.map(eventSpan).filter((span): span is { first: string; last: string } => !!span);
  if (!spans.length) return null;
  const upcoming = spans.filter((span) => span.last >= today).map((span) => (span.first > today ? span.first : today)).sort();
  return monthOf(upcoming[0] || spans.map((span) => span.last).sort().pop()!);
}

/** The first and last month any event touches (the calendar does not page beyond them). */
export function monthBounds(events: CalendarEvent[]): { first: { year: number; month: number }; last: { year: number; month: number } } | null {
  const spans = events.map(eventSpan).filter((span): span is { first: string; last: string } => !!span);
  if (!spans.length) return null;
  return { first: monthOf(spans.map((span) => span.first).sort()[0]), last: monthOf(spans.map((span) => span.last).sort().pop()!) };
}
