import { describe, expect, it } from 'vitest';
import { addDays, dayKey, dayMarks, eventDays, eventSpan, eventsInRange, monthBounds, monthCells, monthOf, openingMonth, pickDay, shiftMonth } from '../eventCalendar';

// 1 Nov 2026 00:00 in Sydney (UTC+11) is 13:00 UTC on 31 Oct.
const SYDNEY_SUNDAY = '2026-10-31T13:00:00.000Z';
const ev = (id: string, start: string, end: string | null, timezone: string | null = 'Australia/Sydney') => ({ id, start_at: start, end_at: end, timezone });

describe('dayKey', () => {
  it('reads the day in the event\'s own timezone', () => {
    expect(dayKey(SYDNEY_SUNDAY, 'Australia/Sydney')).toBe('2026-11-01');
    expect(dayKey(SYDNEY_SUNDAY, 'America/New_York')).toBe('2026-10-31');
    expect(dayKey(SYDNEY_SUNDAY, 'Not/AZone')).toMatch(/^2026-1[01]-\d\d$/); // an unknown zone falls back, never throws
  });
});

describe('eventDays', () => {
  it('covers every day from start to end inclusive', () => {
    expect(eventDays(ev('a', SYDNEY_SUNDAY, '2026-11-07T13:00:00.000Z'))).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });
  it('is one day with no end, or an end before the start, and never runs away', () => {
    expect(eventDays(ev('a', SYDNEY_SUNDAY, null))).toEqual(['2026-11-01']);
    expect(eventDays(ev('a', SYDNEY_SUNDAY, '2026-10-01T00:00:00.000Z'))).toEqual(['2026-11-01']);
    expect(eventDays(ev('a', SYDNEY_SUNDAY, '2030-01-01T00:00:00.000Z')).length).toBe(400); // marking is capped, never a runaway loop
  });
  it('knows where a long event really ends, past the marking cap', () => {
    expect(eventSpan(ev('a', SYDNEY_SUNDAY, '2030-01-01T00:00:00.000Z'))).toEqual({ first: '2026-11-01', last: '2030-01-01' });
  });
  it('gives nothing for a date that cannot be read, instead of throwing', () => {
    expect(eventSpan(ev('a', 'not a date', null))).toBeNull();
    expect(eventDays(ev('a', SYDNEY_SUNDAY, 'also not a date'))).toEqual([]);
    expect(eventsInRange([ev('a', 'not a date', null)], { from: '2026-11-01', to: '2026-11-30' })).toEqual([]);
  });
});

describe('dayMarks', () => {
  it('counts where events start and where they are simply under way', () => {
    const marks = dayMarks([ev('a', SYDNEY_SUNDAY, '2026-11-03T13:00:00.000Z'), ev('b', '2026-11-01T14:00:00.000Z', null)]);
    expect(marks.get('2026-11-01')).toMatchObject({ starts: 1, ongoing: 0 });
    expect(marks.get('2026-11-02')).toMatchObject({ starts: 1, ongoing: 1 }); // b starts 2 Nov (Sydney) while a is under way
    expect(marks.get('2026-11-04')).toMatchObject({ starts: 0, ongoing: 1 });
    expect(marks.get('2026-11-20')).toBeUndefined();
  });
});

describe('day numbers within an event', () => {
  it('numbers each day of a multi-day event, and leaves a one-day event unnumbered', () => {
    const week = ev('w', SYDNEY_SUNDAY, '2026-11-07T13:00:00.000Z'); // 1 to 8 Nov, eight days
    const marks = dayMarks([week, ev('one', '2026-11-04T13:00:00.000Z', null)]);
    expect(marks.get('2026-11-01')!.days).toEqual([{ n: 1, of: 8 }]);
    expect(marks.get('2026-11-08')!.days).toEqual([{ n: 8, of: 8 }]);
    expect(marks.get('2026-11-05')!.days).toEqual([{ n: 5, of: 8 }]); // the single-day event on the 5th adds none
  });
  it('lists the day number of each overlapping event', () => {
    const marks = dayMarks([ev('a', SYDNEY_SUNDAY, '2026-11-07T13:00:00.000Z'), ev('b', '2026-11-04T13:00:00.000Z', '2026-11-18T13:00:00.000Z')]);
    expect(marks.get('2026-11-07')!.days).toEqual([{ n: 7, of: 8 }, { n: 3, of: 15 }]);
  });
});

describe('monthCells', () => {
  it('is six Monday-first weeks that contain the whole month', () => {
    const cells = monthCells(2026, 11);
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe('2026-10-26'); // 1 Nov 2026 is a Sunday: the week starts Monday 26 Oct
    expect(cells.filter((cell) => cell.inMonth).map((cell) => cell.day)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(cells[6]).toMatchObject({ key: '2026-11-01', inMonth: true });
  });
  it('handles a month that starts on a Monday, and leap years', () => {
    expect(monthCells(2026, 6)[0]).toMatchObject({ key: '2026-06-01', inMonth: true });
    expect(monthCells(2028, 2).filter((cell) => cell.inMonth)).toHaveLength(29);
  });
  it('moves between months across years', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
    expect(monthOf('2026-11-01')).toEqual({ year: 2026, month: 11 });
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('eventsInRange', () => {
  const week = ev('week', SYDNEY_SUNDAY, '2026-11-07T13:00:00.000Z'); // 1 to 8 Nov
  const later = ev('later', '2026-11-14T13:00:00.000Z', null); // 15 Nov
  it('shows everything when nothing is chosen', () => { expect(eventsInRange([week, later], null)).toEqual([week, later]); });
  it('shows an event that is on at some point in the range, including one already under way', () => {
    expect(eventsInRange([week, later], { from: '2026-11-04', to: '2026-11-04' })).toEqual([week]); // mid-week day
    expect(eventsInRange([week, later], { from: '2026-11-08', to: '2026-11-15' })).toEqual([week, later]); // the end day counts
    expect(eventsInRange([week, later], { from: '2026-11-09', to: '2026-11-14' })).toEqual([]);
  });
});

describe('long events and the calendar range', () => {
  it('a 90-day programme is still on in its last month', () => {
    const programme = ev('p', SYDNEY_SUNDAY, '2027-01-29T13:00:00.000Z'); // 1 Nov 2026 to 30 Jan 2027
    expect(eventsInRange([programme], { from: '2027-01-15', to: '2027-01-15' })).toEqual([programme]);
    expect(monthBounds([programme])).toEqual({ first: { year: 2026, month: 11 }, last: { year: 2027, month: 1 } });
  });
});

describe('openingMonth', () => {
  const past = ev('past', '2026-10-29T13:00:00.000Z', '2026-10-30T13:00:00.000Z'); // 30 to 31 Oct
  const nov = ev('nov', SYDNEY_SUNDAY, null);
  const dec = ev('dec', '2026-12-05T13:00:00.000Z', null);
  it('opens on the first month that still has something to come, not on one that has finished', () => {
    expect(openingMonth([past, nov, dec], '2026-11-01')).toEqual({ year: 2026, month: 11 });
    expect(openingMonth([past, nov, dec], '2026-11-02')).toEqual({ year: 2026, month: 12 }); // 1 Nov has finished by the 2nd
    expect(openingMonth([past, dec], '2026-11-01')).toEqual({ year: 2026, month: 12 });
  });
  it('opens on today\'s month while an event is under way', () => {
    expect(openingMonth([ev('long', '2026-10-20T13:00:00.000Z', '2026-12-20T13:00:00.000Z')], '2026-11-15')).toEqual({ year: 2026, month: 11 });
  });
  it('opens on the last month when everything has finished, and on nothing without events', () => {
    expect(openingMonth([past], '2027-03-01')).toEqual({ year: 2026, month: 10 });
    expect(openingMonth([], '2026-11-01')).toBeNull();
  });
});

describe('pickDay', () => {
  it('first click chooses a day, second completes a range in either direction, third starts again', () => {
    const one = pickDay(null, '2026-11-10');
    expect(one).toEqual({ from: '2026-11-10', to: '2026-11-10' });
    expect(pickDay(one, '2026-11-14')).toEqual({ from: '2026-11-10', to: '2026-11-14' });
    expect(pickDay(one, '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-10' });
    expect(pickDay({ from: '2026-11-02', to: '2026-11-10' }, '2026-11-20')).toEqual({ from: '2026-11-20', to: '2026-11-20' });
  });
  it('clicking the single chosen day again clears the choice', () => {
    expect(pickDay({ from: '2026-11-10', to: '2026-11-10' }, '2026-11-10')).toBeNull();
  });
});
