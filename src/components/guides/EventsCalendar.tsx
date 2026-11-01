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

export function EventsCalendar({ events, range, onChange, ink = '#F2EFE7', surface = '#11150F', line = 'rgba(242,239,231,.55)' }: { events: CalendarEvent[]; range: DayRange | null; onChange: (range: DayRange | null) => void; ink?: string; surface?: string; line?: string }) {
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
  const nav: React.CSSProperties = { width: 28, height: 28, display: 'grid', placeItems: 'center', border: `1px solid ${line}`, background: 'transparent', color: ink, cursor: 'pointer' };
  /** "Day 3" for one event; "D1 · D3" when several overlap (the cell is small). */
  const dayLabel = (days: { n: number; of: number }[]) => (days.length === 0 ? '' : days.length === 1 ? `Day ${days[0].n}` : `${days.slice(0, 2).map((day) => `D${day.n}`).join(' · ')}${days.length > 2 ? ` +${days.length - 2}` : ''}`);
  return (
    <div data-events-calendar style={{ width: 'min(100%, 300px)', fontFamily: sans, color: ink }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setView((current) => shiftMonth(current, -1))} style={{ ...nav, opacity: canPrev ? 1 : .3, cursor: canPrev ? 'pointer' : 'default' }}><ChevronLeft size={14} /></button>
        <strong role="heading" aria-level={3} aria-live="polite" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>{monthName(view)}</strong>
        <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setView((current) => shiftMonth(current, 1))} style={{ ...nav, opacity: canNext ? 1 : .3, cursor: canNext ? 'pointer' : 'default' }}><ChevronRight size={14} /></button>
      </div>
      <div role="group" aria-label={`Events calendar, ${monthName(view)}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: line, border: `1px solid ${line}` }}>
        {WEEKDAYS.map((name) => <span key={name} aria-hidden="true" style={{ background: surface, padding: '5px 0', textAlign: 'center', fontSize: 8, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(242,239,231,.6)' }}>{name}</span>)}
        {cells.map((cell) => {
          const mark = marks.get(cell.key);
          const count = (mark?.starts || 0) + (mark?.ongoing || 0);
          const chosen = inRange(cell.key);
          const filled = !!mark?.starts, tinted = !!mark && !mark.starts;
          const label = mark ? dayLabel(mark.days) : '';
          return <button key={cell.key} type="button" data-day={cell.key} data-has-event={count ? 'true' : undefined} aria-pressed={chosen} disabled={!cell.inMonth}
            aria-label={`${longDay(cell.key)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}${mark!.days.length ? `, ${mark!.days.map((day) => `day ${day.n} of ${day.of}`).join(' and ')}` : ''}` : ', no events'}`}
            onClick={() => onChange(pickDay(range, cell.key))}
            style={{ position: 'relative', minHeight: 38, border: 0, padding: '3px 0 11px', background: filled ? ink : tinted ? 'rgba(242,239,231,.1)' : surface, color: filled ? surface : ink, fontFamily: sans, fontSize: 11, fontWeight: filled ? 800 : 500, lineHeight: 1.2, cursor: cell.inMonth ? 'pointer' : 'default', opacity: cell.inMonth ? 1 : .22, boxShadow: chosen ? (filled ? `inset 0 0 0 2px ${surface}, inset 0 0 0 4px ${ink}` : `inset 0 0 0 2px ${ink}`) : 'none' }}>
            {cell.day}
            {label ? <span data-day-label aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 2, fontSize: 7, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap', opacity: .85 }}>{label}</span> : null}
          </button>;
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 9, color: 'rgba(242,239,231,.7)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i aria-hidden="true" style={{ width: 9, height: 9, background: ink, display: 'inline-block' }} />Starts</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i aria-hidden="true" style={{ width: 9, height: 9, background: 'rgba(242,239,231,.1)', border: `1px solid ${line}`, display: 'inline-block' }} />Under way</span>
        <span style={{ marginLeft: 'auto' }}>Choose a day, or two for a range</span>
      </div>
      {range && <p data-calendar-range role="status" style={{ margin: '8px 0 0', fontSize: 11 }}>{range.from === range.to ? shortDay(range.from) : `${shortDay(range.from)} – ${shortDay(range.to)}`} · <button type="button" onClick={() => onChange(null)} style={{ border: 0, background: 'transparent', color: ink, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Clear dates</button></p>}
    </div>
  );
}
