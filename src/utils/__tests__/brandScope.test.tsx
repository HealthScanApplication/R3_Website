// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { inBrandScope, brandIdOf, readBrandScope } from '../brandScope';
import { BrandScopeBar, useBrandScope } from '../../components/guides/BrandScopeBar';

const mocks = vi.hoisted(() => ({ brands: vi.fn() }));
vi.mock('../guidePortal', async (importOriginal) => ({ ...await importOriginal<any>(), listGuideBrands: async () => mocks.brands() }));

const BRANDS = [
  { id: 'b-personal', guide_id: 'g', name: "Barbara O'Neill", kind: 'personal' },
  { id: 'b-mmh', guide_id: 'g', name: 'Misty Mountain Lifestyle Retreat', kind: 'business' },
  { id: 'b-tre', guide_id: 'g', name: 'Tre Lune', kind: 'business' },
];

beforeEach(() => { localStorage.clear(); mocks.brands.mockReset(); mocks.brands.mockReturnValue(BRANDS); });
afterEach(cleanup);

describe('inBrandScope', () => {
  it('shows everything under All', () => {
    expect(inBrandScope('all', null)).toBe(true);
    expect(inBrandScope('all', 'b-tre')).toBe(true);
  });
  it('shows the personal page what has no brand, and nothing that belongs to another brand', () => {
    expect(inBrandScope('personal', null)).toBe(true);
    expect(inBrandScope('personal', 'b-tre')).toBe(false);
  });
  it('shows a brand only its own, accepting the draft id form', () => {
    expect(inBrandScope('b-tre', 'b-tre')).toBe(true);
    expect(inBrandScope('brand-b-tre', 'b-tre')).toBe(true);
    expect(inBrandScope('b-tre', null)).toBe(false);
    expect(inBrandScope('b-tre', 'b-mmh')).toBe(false);
    expect(brandIdOf('brand-123')).toBe('123');
  });
});

function Probe() { return <output data-testid="scope">{useBrandScope()}</output>; }

describe('BrandScopeBar', () => {
  it('lists All and every brand, and the choice is shared and remembered', async () => {
    render(<><BrandScopeBar userId="g" /><Probe /></>);
    const group = await screen.findByRole('group', { name: 'Show brand' });
    expect([...group.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['All', "Barbara O'Neill", 'Misty Mountain Lifestyle Retreat', 'Tre Lune']);
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Tre Lune' }));
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('b-tre'));
    expect(screen.getByRole('button', { name: 'Tre Lune' }).getAttribute('aria-pressed')).toBe('true');
    expect(readBrandScope()).toBe('b-tre');
    fireEvent.click(screen.getByRole('button', { name: "Barbara O'Neill" }));
    await waitFor(() => expect(screen.getByTestId('scope').textContent).toBe('personal'));
  });

  it('is not shown for a Guardian with a single brand', async () => {
    mocks.brands.mockReturnValue([BRANDS[0]]);
    render(<BrandScopeBar userId="g" />);
    await waitFor(() => expect(mocks.brands).toHaveBeenCalled());
    expect(screen.queryByRole('group', { name: 'Show brand' })).toBeNull();
  });
});
