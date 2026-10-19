// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DietBuilder } from '../../components/guides/GuardianBuilders';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows and selects private and catalog drinks without offering meals in the drink picker', async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('/catalog_recipes?') && url.includes('health_score')) return Response.json([
      { id: 'spring', name_common: 'Spring Water', category: 'Drink', nutrition_per_serving: { energy_kcal: 0 } },
      // Defensive validation even if a stale response includes a meal.
      { id: 'cake', name_common: 'Carrot Cake', category: 'Dessert', nutrition_per_serving: { energy_kcal: 629 } },
    ]);
    return Response.json([]);
  });
  const recipes = [
    { id: 'own-drink', title: 'Private infusion', meal_slot: 'drink', nutrition_per_serving: { energy_kcal: 0 } },
    { id: 'own-meal', title: 'Private cake', meal_slot: 'dessert' },
  ] as any;
  render(<DietBuilder accessToken="token" ownerId="owner" protocols={[]} recipes={recipes} onSaved={() => {}} onOpen={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add 1:breakfast drink' }));
  const water = await screen.findByRole('button', { name: /Spring Water/ });
  expect(screen.queryByRole('button', { name: /Carrot Cake|Private cake/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Private infusion/ })).toBeTruthy();
  fireEvent.click(water);
  await waitFor(() => expect(screen.queryByPlaceholderText('Search recipes (yours and the catalog)')).toBeNull());
  expect(screen.getByText('Spring Water')).toBeTruthy();
}, 20_000); // renders the whole Diet planner; slow on a loaded CI runner
