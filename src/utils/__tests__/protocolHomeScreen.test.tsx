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
const headers = (container: HTMLElement) => [...container.querySelectorAll('button[aria-label$="details"]')].map((b) => b.parentElement!.textContent);

it('a smart group is a card that says what it holds, under the part of the day: "FITNESS", not "MORNING FITNESS"', () => {
  const { container } = show();
  expect(screen.getByText('Morning')).toBeTruthy(); // the section header (drawn in capitals)
  expect(headers(container)).toEqual(['HYGIENE', 'FITNESS']);
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

it('an empty part of the day is a free-time slot with how long it is: the afternoon is "5HRS FREE"', () => {
  show();
  expect(screen.getByText('5HRS FREE')).toBeTruthy();
});

it('the synthesised day anchors are called Wake and Sleep, as in the app', () => {
  show();
  expect(screen.getByText('Wake')).toBeTruthy();
  expect(screen.getByText('Sleep')).toBeTruthy();
});

it('a group\'s Info button shows or hides the descriptions of its own steps', () => {
  const { container } = show();
  expect(screen.getByText('Moderate weight')).toBeTruthy();
  const info = [...container.querySelectorAll('button[aria-label$="details"]')].find((b) => b.parentElement!.textContent === 'FITNESS') as HTMLElement;
  fireEvent.click(info);
  expect(screen.queryByText('Moderate weight')).toBeNull();
  fireEvent.click(info);
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
