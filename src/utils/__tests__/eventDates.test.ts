import { describe, expect, it } from 'vitest';
import { eventDay, validTimeZone } from '../eventDates';

const OPTIONS = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const;
// 1 Nov 2026 00:00 in Sydney (UTC+11) is 13:00 UTC on 31 Oct.
const SYDNEY_SUNDAY = '2026-10-31T13:00:00.000Z';

describe('eventDay', () => {
  it('shows the day in the event\'s own timezone: Sunday 1 November in Sydney, whoever is looking', () => {
    expect(eventDay(SYDNEY_SUNDAY, 'Australia/Sydney', OPTIONS, 'en-GB')).toBe('Sun, 1 Nov 2026');
  });
  it('shows the same moment as the previous day in a timezone behind it', () => {
    expect(eventDay(SYDNEY_SUNDAY, 'America/New_York', OPTIONS, 'en-GB')).toBe('Sat, 31 Oct 2026');
  });
  it('falls back to the visitor\'s timezone when the event has none or an unknown one, and never throws', () => {
    expect(() => eventDay(SYDNEY_SUNDAY, 'Not/AZone', OPTIONS, 'en-GB')).not.toThrow();
    expect(eventDay(SYDNEY_SUNDAY, null, OPTIONS, 'en-GB')).toMatch(/2026/);
    expect(validTimeZone('Not/AZone')).toBeUndefined();
    expect(validTimeZone('Australia/Sydney')).toBe('Australia/Sydney');
    expect(validTimeZone(undefined)).toBeUndefined();
  });
});
