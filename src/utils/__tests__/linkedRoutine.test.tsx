// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { DietConfig, FitnessConfig } from '../protocolBuilders';

const link = vi.hoisted(() => ({ result: null as null | { parentId: string; siblingId: string | null } }));
vi.mock('../protocolCopies', async (importOriginal) => ({ ...await importOriginal<any>(), findLinkedPlan: vi.fn(async () => link.result) }));
const { LinkedDiet, LinkedTraining } = await import('../../components/guides/LinkedRoutine');

const fit: FitnessConfig = { goal: 'general', level: 'beginner', minutes: 40, sessions: [{ day: 1, time: '07:00', anchor: 'clock', offset: 0, title: 'Leg day', minutes: 40, intensity: 'moderate', exercises: [] }], fuel: { pre: ['Banana'], post: ['Protein shake'], preMinutes: 30, postMinutes: 15 } };
const diet: DietConfig = { framework: 'balanced', kcal: 2000, protein: 20, carbs: 50, fat: 30, slots: ['breakfast', 'dinner'], plan: {}, supplements: { evening: ['Protein shake'] }, fasting: { type: 'intermittent', start: '20:00', end: '12:00', days: [7, 1, 2, 3, 4, 5, 6] } };
const protocols = [{ id: 'master', name: 'Anna’s routine' }, { id: 'fit', name: 'Anna strength week' }, { id: 'diet', name: 'Anna Mediterranean' }] as any;
const meta = { fit: { builder_kind: 'fitness', builder_config: fit }, diet: { builder_kind: 'diet', builder_config: diet } };
beforeEach(() => { link.result = null; });
afterEach(cleanup);

it('shows the routine’s training week and fuel in the Diet planner, with clashes', async () => {
  link.result = { parentId: 'master', siblingId: 'fit' };
  render(<LinkedTraining accessToken="t" protocolId="diet" diet={diet} meta={meta} protocols={protocols} onOpen={() => {}} />);
  expect(await screen.findByRole('region', { name: 'Training this week' })).toBeTruthy();
  expect(screen.getByText(/Part of Anna’s routine/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Anna strength week' })).toBeTruthy();
  expect(screen.getByText((_, el) => el?.tagName === 'DIV' && el.textContent === '07:00 Leg day · 40 min · moderate')).toBeTruthy();
  expect(screen.getByText('06:30 Before: Banana')).toBeTruthy();
  expect(screen.getByText('07:55 After: Protein shake')).toBeTruthy();
  const clashes = screen.getByRole('list', { name: 'Diet and fitness clashes' }).textContent || '';
  expect(clashes).toContain('Leg day starts inside the fast');
  expect(clashes).toContain('Protein shake is already in the Diet supplements');
});

it('shows the routine’s meals and Diet supplements in the Fitness planner', async () => {
  link.result = { parentId: 'master', siblingId: 'diet' };
  render(<LinkedDiet accessToken="t" protocolId="fit" fit={fit} meta={meta} protocols={protocols} onOpen={() => {}} />);
  expect(await screen.findByRole('region', { name: 'Meals and supplements this week' })).toBeTruthy();
  expect(screen.getAllByText('08:00 Breakfast')).toHaveLength(7);
  expect(screen.getAllByText('20:00 Protein shake')).toHaveLength(7);
  expect(screen.getByText(/Mon.*training/)).toBeTruthy();
});

it('explains a sibling that was not built in the planner, and a plan with no master routine', async () => {
  link.result = { parentId: 'master', siblingId: 'manual' };
  const { unmount } = render(<LinkedTraining accessToken="t" protocolId="diet" diet={diet} meta={meta} protocols={protocols} onOpen={() => {}} />);
  expect(await screen.findByText(/not built in the Fitness planner/)).toBeTruthy();
  unmount();
  link.result = null;
  render(<LinkedDiet accessToken="t" protocolId="fit" fit={fit} meta={meta} protocols={protocols} onOpen={() => {}} />);
  expect(await screen.findByText(/Not part of a master routine yet/)).toBeTruthy();
});
