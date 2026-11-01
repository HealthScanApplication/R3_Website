/*
 * A line-drawn month calendar for a Guardian's events. Days with something on are filled; days an event is simply under
 * way are tinted. Choosing a day, or two days for a range, narrows the event cards below to the ones that fit.
 * Presentational: the page owns the chosen range (see eventCalendar for the date logic).
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayMarks, monthBounds, monthCells, monthOf, openingMonth, pickDay, shiftMonth, type CalendarEvent, type DayRange } from '../../utils/eventCalendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const longDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = (view: { year: number; month: number }) => new Date(Date.UTC(view.year, view.month - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function EventsCalendar({ events, range, onChange, ink = '#F2EFE7', surface = '#11150F', accent = '#C7D8A3', line = 'rgba(242,239,231,.28)' }: { events: CalendarEvent[]; range: DayRange | null; onChange: (range: DayRange | null) => void; ink?: string; surface?: string; accent?: string; line?: string }) {
  const marks = useMemo(() => dayMarks(events), [events]);
  const bounds = useMemo(() => monthBounds(events), [events]);
  const eventsKey = useMemo(() => events.map((event) => `${event.id}:${event.start_at}:${event.end_at || ''}`).join('|'), [events]);
  const today = new Date().toISOString().slice(0, 10);
  const [view, setView] = useState(() => (range ? monthOf(range.from) : openingMonth(events, today) || monthOf(today)));
  // A different set of events (another brand's page, or events just re-imported) starts the calendar again on its own first month.
  useEffect(() => { setView(openingMonth(events, today) || monthOf(today)); }, [eventsKey]);
  useEffect(() => { if (range) setView(monthOf(range.from)); }, [range?.from]);
  if (!bounds) return null;
  const index = (month: { year: number; month: number }) => month.year * 12 + month.month;
  const canPrev = index(view) > index(bounds.first), canNext = index(view) < index(bounds.last);
  const cells = monthCells(view.year, view.month);
  const inRange = (key: string) => !!range && key >= range.from && key <= range.to;
  const nav: React.CSSProperties = { width: 34, height: 34, display: 'grid', placeItems: 'center', border: `1px solid ${line}`, background: 'transparent', color: ink, cursor: 'pointer' };
  return (
    <div data-events-calendar style={{ width: 'min(100%, 420px)', fontFamily: sans, color: ink }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setView((current) => shiftMonth(current, -1))} style={{ ...nav, opacity: canPrev ? 1 : .3, cursor: canPrev ? 'pointer' : 'default' }}><ChevronLeft size={16} /></button>
        <strong role="heading" aria-level={3} aria-live="polite" style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase' }}>{monthName(view)}</strong>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setView((current) => shiftMonth(current, 1))} style={{ ...nav, opacity: canNext ? 1 : .3, cursor: canNext ? 'pointer' : 'default' }}><ChevronRight size={16} /></button>
      </div>
      <div role="group" aria-label={`Events calendar, ${monthName(view)}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: line, border: `1px solid ${line}` }}>
        {WEEKDAYS.map((name) => <span key={name} aria-hidden="true" style={{ background: surface, padding: '7px 0', textAlign: 'center', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(242,239,231,.6)' }}>{name}</span>)}
        {cells.map((cell) => {
          const mark = marks.get(cell.key);
          const count = (mark?.starts || 0) + (mark?.ongoing || 0);
          const chosen = inRange(cell.key);
          const filled = !!mark?.starts, tinted = !!mark && !mark.starts;
          return <button key={cell.key} type="button" data-day={cell.key} data-has-event={count ? 'true' : undefined} aria-pressed={chosen} disabled={!cell.inMonth}
            aria-label={`${longDay(cell.key)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ', no events'}`}
            onClick={() => onChange(pickDay(range, cell.key))}
            style={{ position: 'relative', aspectRatio: '1', minHeight: 40, border: 0, padding: 0, background: filled ? accent : tinted ? 'rgba(199,216,163,.22)' : surface, color: filled ? '#11150F' : ink, fontFamily: sans, fontSize: 13, fontWeight: filled ? 800 : 500, cursor: cell.inMonth ? 'pointer' : 'default', opacity: cell.inMonth ? 1 : .22, boxShadow: chosen ? `inset 0 0 0 2px ${ink}` : 'none' }}>
            {cell.day}
            {mark && mark.starts + mark.ongoing > 1 ? <span aria-hidden="true" style={{ position: 'absolute', right: 4, bottom: 3, fontSize: 8, fontWeight: 800 }}>{mark.starts + mark.ongoing}</span> : null}
          </button>;
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 9, fontSize: 10, color: 'rgba(242,239,231,.7)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i aria-hidden="true" style={{ width: 10, height: 10, background: accent, display: 'inline-block' }} />Starts</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i aria-hidden="true" style={{ width: 10, height: 10, background: 'rgba(199,216,163,.22)', border: `1px solid ${line}`, display: 'inline-block' }} />Under way</span>
        <span style={{ marginLeft: 'auto' }}>Choose a day, or two for a range</span>
      </div>
      {range && <p data-calendar-range role="status" style={{ margin: '10px 0 0', fontSize: 12 }}>{range.from === range.to ? shortDay(range.from) : `${shortDay(range.from)} – ${shortDay(range.to)}`} · <button type="button" onClick={() => onChange(null)} style={{ border: 0, background: 'transparent', color: accent, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Clear dates</button></p>}
    </div>
  );
}
