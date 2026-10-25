// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ProtocolHomeScreen, type HomeItem } from '../../components/mockups/ProtocolHomeScreen';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const day = new Date(2026, 9, 24);
const items: HomeItem[] = [
  { display_name: 'Incline Bench Press', item_type: 'activity', subtype: 'exercise', time: '08:50', duration_minutes: 12, description: 'Moderate weight' },
  { display_name: 'Barbell Bench Press', item_type: 'activity', subtype: 'exercise', time: '09:00', duration_minutes: 20 },
  { display_name: 'Morning Hygiene', item_type: 'activity', subtype: 'hygiene', time: '08:55', duration_minutes: 20 },
  { display_name: 'Use Toilet', item_type: 'activity', subtype: 'hygiene', time: '08:55', indent: true },
  { display_name: 'Brush Teeth', item_type: 'activity', subtype: 'hygiene', time: '09:05', indent: true },
];
const show = (props: Partial<React.ComponentProps<typeof ProtocolHomeScreen>> = {}) => render(<div style={{ width: 393, height: 852, position: 'relative' }}><ProtocolHomeScreen protocolName="Test" items={items} date={day} scale={1} {...props} /></div>);
const headers = (container: HTMLElement) => [...container.querySelectorAll('button[aria-label$=" details"]')].map((b) => b.parentElement!.textContent);
const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

it('a smart group is a card that says what it holds, under the part of the day: "FITNESS", not "MORNING FITNESS"; the cards run by the clock', () => {
  const { container } = show();
  expect(screen.getByText('Morning')).toBeTruthy(); // the section header (drawn in capitals)
  expect(headers(container)).toEqual(['FITNESS', 'HYGIENE']); // fitness starts at 8:50, hygiene at 8:55
  expect(screen.queryByText('MORNING FITNESS')).toBeNull();
  expect(screen.getByText('Incline Bench Press')).toBeTruthy();
});

it('a step with sub-steps shows them under it, and the dashed Add row only where adding is on', () => {
  const { rerender } = show();
  expect(screen.getByText('Use Toilet')).toBeTruthy();
  expect(screen.getByText('Brush Teeth')).toBeTruthy();
  expect(screen.queryByText('Add')).toBeNull();
  rerender(<div style={{ width: 393, height: 852, position: 'relative' }}><ProtocolHomeScreen protocolName="Test" items={items} date={day} scale={1} addRows /></div>);
  expect(screen.getAllByText('Add')).toHaveLength(1); // one block holds sub-steps
});

it('parent mode folds a group of steps into one "Morning Fitness" parent row with the steps under it, and drops that group\'s header', () => {
  const { container } = show({ smartListMode: 'parent' });
  expect(screen.getByText('Morning Fitness')).toBeTruthy();
  expect(screen.getByText('Incline Bench Press')).toBeTruthy();
  expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
  // the parent's time is the first step's and its length the span of the steps: 8:50 to 9:20
  const parent = screen.getByText('Morning Fitness').closest('div[style*="min-height: 50px"]') as HTMLElement;
  expect(parent.textContent).toContain('8:50am');
  expect(parent.textContent).toContain('30min');
  // the hygiene block already holds sub-steps, so it stays a card with its header
  expect(headers(container)).toEqual(['HYGIENE']);
});

it('each part of the day offers its first free stretch: after Wake in the morning, before bedtime in the evening, and not past bedtime', () => {
  show();
  // Wake 8:50 (a 10-minute row) and the steps end 9:20: the morning's free stretch is 9:20 to noon; the afternoon is 12 to 5; the evening is 5 to the 10pm bedtime
  const slots = screen.getAllByText(/FREE$/).map((n) => n.textContent);
  expect(slots).toEqual(['2.7HRS FREE', '5HRS FREE', '5HRS FREE']);
  expect(follows(screen.getByText('Wake'), screen.getByText('2.7HRS FREE'))).toBe(true); // "Wake, then the spare slot", not above it
  expect(follows(screen.getByText('Brush Teeth'), screen.getByText('2.7HRS FREE'))).toBe(true); // after the morning's last card
  expect(follows(screen.getAllByText('5HRS FREE')[1], screen.getByText('Sleep'))).toBe(true); // the evening's slot is above Sleep
});

it('a day with only Wake and Sleep has a slot per part of the day, the evening ending at bedtime not midnight', () => {
  show({ items: [] });
  expect(screen.getAllByText(/FREE$/).map((n) => n.textContent)).toEqual(['5.8HRS FREE', '5HRS FREE', '5HRS FREE']); // Wake 6:00 + 10 min to noon; 12 to 5; 5 to 10pm
});

it('a routine that only starts in the evening has no phantom morning slot, and a short stretch before bed is wind-down, not free time', () => {
  show({ items: [{ display_name: 'Evening walk', item_type: 'activity', time: '20:00', duration_minutes: 30 }] });
  expect(screen.queryByText(/FREE$/)).toBeNull();
});

it('the night after bedtime is not spare time: an evening that is full up to bed offers no slot', () => {
  show({ items: [
    { display_name: 'Wake', item_type: 'activity', category: 'sleep', time: '07:00' },
    { display_name: 'Family gathering', item_type: 'activity', time: '17:00', duration_minutes: 300 }, // 17:00 to the 22:00 bedtime
  ] });
  expect(screen.getAllByText(/FREE$/).map((n) => n.textContent)).toEqual(['4.8HRS FREE', '5HRS FREE']); // morning and afternoon only
});

it('no free-time slots when the day is not book-ended with Wake and Sleep', () => {
  show({ anchors: false, items: [{ display_name: 'Midday walk', item_type: 'activity', time: '13:00', duration_minutes: 20 }] });
  expect(screen.queryByText(/FREE$/)).toBeNull();
});

it('the synthesised day anchors are called Wake and Sleep, as in the app', () => {
  show();
  expect(screen.getByText('Wake')).toBeTruthy();
  expect(screen.getByText('Sleep')).toBeTruthy();
});

it('a group\'s Info button shows or hides the descriptions of its own steps', () => {
  const { container } = show();
  expect(screen.getByText('Moderate weight')).toBeTruthy();
  const info = container.querySelector('button[aria-label="Fitness details"]') as HTMLElement; // a stable name that says which group it is for
  expect(info.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(info);
  expect(screen.queryByText('Moderate weight')).toBeNull();
  expect(info.getAttribute('aria-pressed')).toBe('false');
  expect(info.getAttribute('aria-label')).toBe('Fitness details');
  fireEvent.click(info);
  expect(screen.getByText('Moderate weight')).toBeTruthy();
});

it('the master Details toggle gates every group: with it off, opening a group\'s Info shows nothing', () => {
  const { container } = show();
  fireEvent.click(screen.getByTitle('Details'));
  expect(screen.queryByText('Moderate weight')).toBeNull();
  const info = container.querySelector('button[aria-label="Fitness details"]') as HTMLElement;
  fireEvent.click(info); // close, then open again: still master-gated
  fireEvent.click(info);
  expect(screen.queryByText('Moderate weight')).toBeNull();
  fireEvent.click(screen.getByTitle('Details'));
  expect(screen.getByText('Moderate weight')).toBeTruthy();
});

it('dark and light use the app\'s own colours: a white checkbox outline on black rows in dark, a pale grey one on white in light', () => {
  const box = (container: HTMLElement) => [...container.querySelectorAll('span')].find((s) => (s as HTMLElement).style.width === '26px' && (s as HTMLElement).style.borderRadius === '8px') as HTMLElement;
  const dark = show({ theme: 'dark' });
  const darkBox = box(dark.container);
  expect(darkBox.style.border).toBe('1.5px solid rgb(255, 255, 255)');
  const darkRow = darkBox.closest('div[style*="border-radius: 12px"]') as HTMLElement;
  expect(darkRow.style.background).toBe('rgb(0, 0, 0)');
  cleanup();
  const light = show({ theme: 'light' });
  expect(box(light.container).style.border).toBe('1.5px solid rgb(229, 231, 235)');
});

/* ── grouping, as the app builds the day (dayRows) ── */
const cards = (container: HTMLElement) => headers(container);

it('a step is filed by its name when it has no subtype: "Strength Session" and "Morning Run" are Fitness, "Morning Hygiene" is Hygiene', () => {
  const { container } = show({ anchors: false, items: [
    { display_name: 'Morning Run', item_type: 'activity', time: '07:00' },
    { display_name: 'Strength Session', item_type: 'activity', time: '07:30' },
    { display_name: 'Morning Hygiene', item_type: 'activity', time: '08:00' },
    { display_name: 'Read a book', item_type: 'activity', time: '08:10' },
  ] });
  expect(cards(container)).toEqual(['FITNESS', 'HYGIENE', 'WELLNESS']);
});

it('a step joins the card of its kind only within an hour of that card\'s first step: the same kind again later is a second card, and cards run by the clock', () => {
  const { container } = show({ anchors: false, items: [
    { display_name: 'Gratitude', item_type: 'activity', subtype: 'wellness', time: '06:30' },
    { display_name: 'Bench press', item_type: 'activity', subtype: 'exercise', time: '07:00' },
    { display_name: 'Journal', item_type: 'activity', subtype: 'wellness', time: '10:30' },
  ] });
  expect(cards(container)).toEqual(['WELLNESS', 'FITNESS', 'WELLNESS']);
});

it('steps that start on the same minute share one card, the first one\'s', () => {
  const { container } = show({ anchors: false, items: [
    { display_name: 'Vitamin D3', item_type: 'supplement', time: '08:00' },
    { display_name: 'Gratitude', item_type: 'activity', subtype: 'wellness', time: '08:00' },
  ] });
  expect(cards(container)).toEqual(['SUPPLEMENTS']);
  expect(screen.getByText('Gratitude')).toBeTruthy();
});

it('a supplement at 6:30, breakfast at 7:00 and a walk at 7:30 run in that order, a meal slot naming its card', () => {
  const { container } = show({ anchors: false, items: [
    { display_name: 'Morning Sunlight', item_type: 'activity', subtype: 'wellness', time: '07:30' },
    { display_name: 'Vitamin D3', item_type: 'supplement', time: '06:30' },
    { display_name: 'Green Tea', item_type: 'consume', group_name: 'Breakfast', time: '07:00' },
  ] });
  expect(cards(container)).toEqual(['SUPPLEMENTS', 'BREAKFAST', 'WELLNESS']);
});

it('parent mode: a meal slot is never folded, an unslotted meal group reads Breakfast / Lunch / Dinner, a group with a sleep step stays a card', () => {
  const folded = (items: HomeItem[]) => { cleanup(); const view = show({ anchors: false, smartListMode: 'parent', items }); return view.container; };
  let container = folded([
    { display_name: 'Oats', item_type: 'consume', group_name: 'Breakfast', time: '07:00' },
    { display_name: 'Berries', item_type: 'consume', group_name: 'Breakfast', time: '07:20' },
  ]);
  expect(cards(container)).toEqual(['BREAKFAST']); // a slot card, not a parent row
  expect(screen.queryByText('Morning Meal')).toBeNull();
  container = folded([
    { display_name: 'Green tea', item_type: 'consume', time: '07:00' },
    { display_name: 'Toast', item_type: 'consume', time: '07:20' },
  ]);
  expect(screen.getByText('Breakfast')).toBeTruthy();
  expect(cards(container)).toEqual([]);
  container = folded([
    { display_name: 'Nap in the sun', item_type: 'activity', subtype: 'wellness', time: '14:00' },
    { display_name: 'Stretch', item_type: 'activity', subtype: 'wellness', time: '14:10' },
  ]);
  expect(cards(container)).toEqual(['WELLNESS']); // a sleep word keeps the group a card
});

it('a folded smart-list parent has no Add row; a stored block that holds sub-steps still has one', () => {
  show({ smartListMode: 'parent', addRows: true, items: [
    { display_name: 'Incline Bench Press', item_type: 'activity', subtype: 'exercise', time: '08:50', duration_minutes: 12 },
    { display_name: 'Barbell Bench Press', item_type: 'activity', subtype: 'exercise', time: '09:00', duration_minutes: 20 },
    ...items.slice(2),
  ] });
  expect(screen.getByText('Morning Fitness')).toBeTruthy();
  expect(screen.getAllByText('Add')).toHaveLength(1); // only the hygiene block
});

/* ── a row's controls, as the app draws them ── */
const row = (name: string) => screen.getByText(name).closest('div[style*="min-height: 50px"]') as HTMLElement;

it('an activity has a round tracker pill whose icon follows its name; a supplement has a duration pill; a meal has neither', () => {
  show({ anchors: false, items: [
    { display_name: 'Morning Run', item_type: 'activity', time: '07:00', duration_minutes: 30 },
    { display_name: 'Vitamin D3', item_type: 'supplement', time: '08:00', duration_minutes: 5 },
    { display_name: 'Green Tea', item_type: 'consume', time: '09:00', duration_minutes: 5 },
  ] });
  expect(within(row('Morning Run')).getByTitle('Run')).toBeTruthy();
  expect(within(row('Morning Run')).queryByText('30m')).toBeNull(); // the pill is the tracker; its length stays under the title
  expect(row('Morning Run').textContent).toContain('30min');
  expect(within(row('Vitamin D3')).queryByTitle(/Track|Run/)).toBeNull();
  expect(within(row('Vitamin D3')).getByText('5m')).toBeTruthy();
  expect(row('Vitamin D3').textContent).not.toContain('5min'); // the pill says it once
  expect(row('Green Tea').textContent).not.toMatch(/\d+m/);
  expect([...row('Green Tea').querySelectorAll('span')].filter((s) => (s as HTMLElement).style.borderRadius === '13px')).toHaveLength(0); // no round pill
});

it('every stored step carries the repeat glyph (a one-off the calendar one); the made-up Wake and Sleep anchors carry none', () => {
  const { container } = show({ items: [
    { display_name: 'Vitamin D3', item_type: 'supplement', time: '08:00' },
    { display_name: 'Camera scan', item_type: 'activity', time: '09:00', recurrence_type: 'one_off' },
  ] });
  expect(row('Vitamin D3').querySelector('svg.lucide-repeat')).toBeTruthy();
  expect(row('Camera scan').querySelector('svg.lucide-calendar')).toBeTruthy();
  expect(row('Camera scan').querySelector('svg.lucide-repeat')).toBeNull();
  expect(row('Wake').querySelector('svg.lucide-repeat')).toBeNull();
  expect(row('Sleep').querySelector('svg.lucide-repeat')).toBeNull();
  expect(container.querySelectorAll('svg.lucide-repeat').length).toBeGreaterThan(0);
});

/* ── paint ── */
it('hues turn once per row top to bottom, a sub-step ticks in its group\'s first hue, and a step still to come is drawn in its own hue softened', () => {
  const { container } = show({ anchors: false, items: [
    { display_name: 'Journal', item_type: 'activity', subtype: 'wellness', time: '07:00', done: true },
    { display_name: 'Morning Hygiene', item_type: 'activity', subtype: 'hygiene', time: '08:30', done: true },
    { display_name: 'Use Toilet', item_type: 'activity', subtype: 'hygiene', time: '08:30', indent: true, done: true },
    { display_name: 'Brush Teeth', item_type: 'activity', subtype: 'hygiene', time: '08:35', indent: true, done: true },
    { display_name: 'Walk', item_type: 'activity', subtype: 'wellness', time: '11:00' },
  ] });
  const sub = ([...container.querySelectorAll('span')] as HTMLElement[]).filter((s) => s.style.width === '18px' && s.style.height === '18px');
  expect(sub.map((s) => s.style.background)).toEqual(['rgb(185, 83, 163)', 'rgb(185, 83, 163)']); // both take the block's hue, the second of the wheel
  const box = (name: string) => within(row(name)).getAllByText((_, el) => el instanceof HTMLElement && el.tagName === 'SPAN' && el.style.width === '26px' && el.style.borderRadius === '8px')[0] as HTMLElement;
  expect(box('Journal').style.background).toBe('rgb(139, 92, 199)'); // the first row, purple
  expect(box('Morning Hygiene').style.background).toBe('rgb(185, 83, 163)'); // the second; its sub-steps took no hue of their own
  // Walk is not done and is the third row: its capsule outline is #D65378 mixed toward the neutral (#9CA3AF in light), not the third hue itself
  expect(container.innerHTML).toMatch(/1px solid rgb\(182, 127, 150\)|1px solid #b67f96/i);
});
