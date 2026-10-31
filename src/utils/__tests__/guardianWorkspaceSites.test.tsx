// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StepRelated } from '../../components/guides/GuidePortal';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', app_metadata: {} }, accessToken: null, signOut: () => {} }) }));
vi.mock('../supabase/client', async (importOriginal) => ({ ...await importOriginal<any>(), getSupabaseClient: () => ({ functions: { invoke: vi.fn() } }) }));

afterEach(cleanup);

const ramp = (id: string, name: string) => ({ id, name, slug: id, audience: 'Women', problem: 'Sleep', offer_ids: ['a', 'b'], status: 'published' }) as any;
const related = { leads: [], offers: [], protocols: [], ramps: [ramp('better-sleep', 'Better sleep')] };
const one = [{ id: 'personal', name: 'John Ferreira', kind: 'personal' as const, logo: null }];
const two = [...one, { id: 'b2', name: 'Calm Co', kind: 'business' as const, logo: 'https://cdn.example/calm.png' }];
const render1 = (brands = one, activeBrandId = 'personal') => render(<StepRelated step={1} guardianSlug="john-ferreira" displayName="John Ferreira" related={related} brands={brands} activeBrandId={activeBrandId} />);

describe('workspace sites as wide cards', () => {
  it('lays the sites out as wide cards in a grid that holds two per row', () => {
    render1();
    const section = screen.getByRole('region', { name: 'Your sites' });
    const grid = section.querySelector('div[style*="repeat(auto-fill"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toMatch(/minmax\(min\(100%,\s*440px\)/); // 2 x 440 fits the 1100px column, 3 do not
    expect(within(section).getByRole('button', { name: 'Open John Ferreira profile site' })).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Open Better sleep' })).toBeTruthy();
    expect(within(section).getByText('/guardians/john-ferreira')).toBeTruthy();
    expect(within(section).getByText(/2 offers · published/)).toBeTruthy();
    expect(within(section).getByText(/In your workspace · Your sites · 2/)).toBeTruthy();
    expect(within(section).queryByRole('group', { name: 'Filter sites by brand' })).toBeNull(); // one brand: no filter
  });

  it('shows every brand with a filter: All, the current brand first, then the others', () => {
    render1(two, 'b2');
    const section = screen.getByRole('region', { name: 'Your sites' });
    const chips = within(within(section).getByRole('group', { name: 'Filter sites by brand' })).getAllByRole('button').map((chip) => chip.textContent);
    expect(chips).toEqual(['All', 'Current · Calm Co', 'John Ferreira']);
    expect(within(section).getByRole('button', { name: 'Open Calm Co profile site' })).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Open John Ferreira profile site' })).toBeTruthy();
    expect(within(section).getByText(/In your workspace · Your sites · 3/)).toBeTruthy(); // 2 brand sites + 1 offer path
    expect(within(section).getByText('/guardians/john-ferreira · Business brand')).toBeTruthy();
  });

  it('filters to one brand, keeps the Guardian-wide offer path, and goes back to All', () => {
    render1(two, 'personal');
    const section = screen.getByRole('region', { name: 'Your sites' });
    fireEvent.click(within(section).getByRole('button', { name: 'Calm Co' }));
    expect(within(section).queryByRole('button', { name: 'Open John Ferreira profile site' })).toBeNull();
    expect(within(section).getByRole('button', { name: 'Open Calm Co profile site' })).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Open Better sleep' })).toBeTruthy();
    expect(within(section).getByText(/In your workspace · Your sites · 2/)).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Calm Co' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(section).getByRole('button', { name: 'All' }));
    expect(within(section).getByText(/In your workspace · Your sites · 3/)).toBeTruthy();
  });
});
