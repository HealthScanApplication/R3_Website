// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StepModal, StepPrefix, stepTarget } from '../../components/guides/CatalogBrowsers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

it('opens a dialog for a linked activity with its steps and closes on Escape', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json(String(url).includes('catalog_activities') ? [{ id: 'a1', name: 'Push-Ups', image_url: null, category: 'Strength', description: 'A press.', steps: ['Lower', 'Press'], benefits: ['Chest'], body_parts: ['chest'], default_duration_min: 8 }] : [])));
  const onClose = vi.fn();
  render(<StepModal accessToken="t" target={{ kind: 'activity', id: 'a1', name: 'Push-Ups' }} onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Push-Ups' })).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Press')).toBeTruthy());
  expect(screen.getByText('A press.')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

it('shows a meal step as a button that opens its recipe, and an unlinked one as plain icon', () => {
  const onOpen = vi.fn();
  const linked = stepTarget({ name: 'Lunch', recipeId: 'r1' } as any, 'Meals', { 'r:r1': { name: 'Lentil stew', image: 'x.jpg' } }, {});
  expect(linked).toEqual({ target: { kind: 'recipe', id: 'r1', name: 'Lentil stew' }, image: 'x.jpg' });
  render(<><StepPrefix {...linked} list="Meals" onOpen={onOpen} /><StepPrefix target={null} image={null} list="Fitness" onOpen={onOpen} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Open Lentil stew' }));
  expect(onOpen).toHaveBeenCalledWith({ kind: 'recipe', id: 'r1', name: 'Lentil stew' });
  expect(screen.getAllByRole('button')).toHaveLength(1);
  // a generic meal slot falls back to its suggested recipe
  expect(stepTarget({ id: 's', name: 'Breakfast' } as any, 'Meals', {}, { s: { id: 'r9', name: 'Oats', image: null } as any }).target).toEqual({ kind: 'recipe', id: 'r9', name: 'Oats' });
});
