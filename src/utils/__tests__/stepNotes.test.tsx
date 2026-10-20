// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FitnessRoutines, StepNote } from '../../components/guides/CatalogBrowsers';
import { routineSteps } from '../protocolBuilders';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

const LONG = 'Stand with feet hip-width apart, hinge at the hips and drive them forward to swing the bell to chest height, arms relaxed. It trains the glutes and hamstrings and builds power without loading the knees.';

it('StepNote shows a short description as it is, and a long one on two lines with More / Less', () => {
  const { rerender } = render(<StepNote text="Brace the core; keep the spine long." />);
  expect(screen.getByText('Brace the core; keep the spine long.')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<StepNote text={LONG} />);
  const more = screen.getByRole('button', { name: 'More' });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect((screen.getByText(LONG) as HTMLElement).style.webkitLineClamp || (screen.getByText(LONG) as HTMLElement).style.display).toBeTruthy();
  fireEvent.click(more);
  expect(screen.getByRole('button', { name: 'Less' }).getAttribute('aria-expanded')).toBe('true');
  expect((screen.getByText(LONG) as HTMLElement).style.display).not.toBe('-webkit-box');
});

it('StepNote renders nothing for an empty description', () => {
  const { container } = render(<><StepNote text={null} /><StepNote text="   " /></>);
  expect(container.textContent).toBe('');
});

it('routineSteps reads each step\'s notes (blank becomes null)', async () => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(String(url)); return json([{ id: 'a', display_name: 'Zone 2 Cardio', kind: 'action', notes: '  Easy pace.  ' }, { id: 'b', display_name: 'Stretch', kind: 'action', notes: '   ' }]); }));
  const steps = await routineSteps('t', 'p1');
  expect(calls[0]).toMatch(/select=[^&]*\bnotes\b/);
  expect(steps.map((s) => s.notes)).toEqual(['Easy pace.', null]);
});

it('the routine step list shows each step\'s description under it, and a sub-step\'s under that', async () => {
  const rows = [
    { id: 's1', display_name: 'Kettlebell Swing', kind: 'action', category: 'do', subtype: 'exercise', item_type: 'activity', scheduled_time: '07:00:00', day_number: null, sort_order: 1, notes: LONG },
    { id: 's2', display_name: 'Zone 2 Cardio', kind: 'action', category: 'do', subtype: 'exercise', item_type: 'activity', scheduled_time: '07:30:00', day_number: null, sort_order: 2, notes: 'Easy pace where you can still talk. Builds your aerobic base.' },
    { id: 's3', display_name: 'Cool-down walk', kind: 'action', category: 'do', subtype: 'exercise', item_type: 'activity', scheduled_time: '07:30:00', day_number: null, sort_order: 3, parent_protocol_item_id: 's2', notes: 'Five minutes, slowing down. Brings your heart rate back gently.' },
    { id: 's4', display_name: 'Stretch', kind: 'action', category: 'do', subtype: 'exercise', item_type: 'activity', scheduled_time: '08:00:00', day_number: null, sort_order: 4, notes: null },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/protocol_items')) return json(rows);
    if (u.includes('/protocols')) return json([{ id: 'p1', name: 'Fitness Foundation', description: 'A base.', image_url: null, category: 'fitness', tags: [], total_days: 1 }]);
    return json([]);
  }));
  render(<FitnessRoutines accessToken="t" />);
  fireEvent.click(await screen.findByRole('button', { name: /Fitness Foundation/ }));
  const region = await screen.findByRole('region', { name: 'Fitness Foundation steps' });
  await waitFor(() => expect(region.textContent).toContain('Zone 2 Cardio'));
  expect(region.textContent).toContain(LONG);
  expect(region.textContent).toContain('Easy pace where you can still talk. Builds your aerobic base.');
  expect(region.textContent).toContain('Five minutes, slowing down. Brings your heart rate back gently.');
  // the step with no description shows none, and no empty paragraph or toggle is left behind
  expect(screen.getAllByRole('button', { name: 'More' })).toHaveLength(1); // only the long swing note
});
