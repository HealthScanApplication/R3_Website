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
const render1 = (brands = one, activeBrandId = 'personal', profileStatus: any = null) => render(<StepRelated step={1} guardianSlug="john-ferreira" displayName="John Ferreira" related={related} brands={brands} activeBrandId={activeBrandId} profileStatus={profileStatus} />);
const open = (section: HTMLElement, title: string) => within(section).queryByRole('button', { name: `Edit ${title}` });

describe('workspace sites as tall website cards', () => {
  it('lays the sites out as tall cards in a grid that holds two per row', () => {
    render1();
    const section = screen.getByRole('region', { name: 'Your sites' });
    const grid = section.querySelector('.g-sitecards') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toMatch(/minmax\(min\(440px,\s*100%\)/); // 2 x 440 fits the 1100px column, 3 do not
    expect((section.querySelector('[data-site-hero]') as HTMLElement).style.aspectRatio).toBe('16 / 9'); // website ratio
    expect(open(section, 'John Ferreira profile site')).toBeTruthy();
    expect(open(section, 'Better sleep')).toBeTruthy();
    expect(within(section).getByText('/guardians/john-ferreira')).toBeTruthy();
    expect(within(section).getByText('Profile site')).toBeTruthy();
    expect(within(section).getByText('Offer site')).toBeTruthy();
    expect(within(section).getByText(/In your workspace · Your sites · 2/)).toBeTruthy();
    expect(within(section).queryByRole('group', { name: 'Filter sites by brand' })).toBeNull(); // one brand: no filter
  });

  it('says each site\'s title and kind once, not over the picture and again under it', () => {
    render1(one, 'personal', 'approved');
    const section = screen.getByRole('region', { name: 'Your sites' });
    const profileCard = section.querySelector('article[aria-label="Profile site: John Ferreira profile site"]') as HTMLElement;
    expect(within(profileCard).getAllByText('John Ferreira profile site').length).toBe(1);
    expect(within(profileCard).getAllByText('Profile site').length).toBe(1);
    expect(profileCard.querySelector('[data-site-hero] span')).toBeNull(); // no text laid over the picture
    const offerCard = section.querySelector('article[aria-label="Offer site: Better sleep"]') as HTMLElement;
    expect(within(offerCard).getAllByText('Better sleep').length).toBe(1);
    expect(within(offerCard).queryByText('Offer path')).toBeNull();
  });

  it('shows a live preview of the page on a published site and the picture on a draft', () => {
    render1(one, 'personal', 'approved');
    const published = screen.getByRole('region', { name: 'Your sites' });
    const preview = published.querySelector('[data-site-preview] iframe') as HTMLIFrameElement;
    expect(preview.getAttribute('src')).toBe('/guardians/john-ferreira');
    expect(preview.getAttribute('title')).toBe('John Ferreira profile site website preview');
    cleanup();
    render1(one, 'personal', 'draft');
    expect(screen.getByRole('region', { name: 'Your sites' }).querySelector('[data-site-preview]')).toBeNull(); // not live: no preview of a page that is not public
  });

  it('shows every brand with a filter: All, the current brand first, then the others', () => {
    render1(two, 'b2');
    const section = screen.getByRole('region', { name: 'Your sites' });
    const chips = within(within(section).getByRole('group', { name: 'Filter sites by brand' })).getAllByRole('button').map((chip) => chip.textContent);
    expect(chips).toEqual(['All', 'Current · Calm Co', 'John Ferreira']);
    expect(open(section, 'Calm Co profile site')).toBeTruthy();
    expect(open(section, 'John Ferreira profile site')).toBeTruthy();
    expect(within(section).getByText(/In your workspace · Your sites · 3/)).toBeTruthy(); // 2 brand sites + 1 offer path
  });

  it('filters to one brand, keeps the Guardian-wide offer path, and goes back to All', () => {
    render1(two, 'personal');
    const section = screen.getByRole('region', { name: 'Your sites' });
    fireEvent.click(within(section).getByRole('button', { name: 'Calm Co' }));
    expect(open(section, 'John Ferreira profile site')).toBeNull();
    expect(open(section, 'Calm Co profile site')).toBeTruthy();
    expect(open(section, 'Better sleep')).toBeTruthy();
    expect(within(section).getByText(/In your workspace · Your sites · 2/)).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Calm Co' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(section).getByRole('button', { name: 'All' }));
    expect(within(section).getByText(/In your workspace · Your sites · 3/)).toBeTruthy();
  });
});
