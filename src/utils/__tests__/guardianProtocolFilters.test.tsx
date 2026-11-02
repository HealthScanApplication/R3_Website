// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuardianProtocols, protocolFilterOptions, protocolFits } from '../../components/guides/GuidePortal';

const proto = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: '', category: 'Wellness', type: null, target_gender: null, creator: null, source: null, image_url: null, health_score: null, total_days: 14, is_suggested: true, is_active: true, is_public: true, start_time: null, sort_order: 0, ...extra }) as any;
const PROTOCOLS = [
  proto('a', 'Self Heal by Design'),
  proto('w', "Women's Daily Wellness Routine", { target_gender: 'female' }),
  proto('m', "Men's Daily Wellness Routine", { target_gender: 'male' }),
  proto('t', "Teen Girls' Daily Wellness Routine", { target_gender: 'female', target_age_min: 13, target_age_max: 19 }),
  proto('c', 'Misty Mountain Cleanse Routine', { category: 'Detox', target_gender: 'female' }),
];
const profile = { user_id: 'g', slug: 'barbara-oneill', display_name: "Barbara O'Neill", avatar_url: null } as any;
const show = () => render(<GuardianProtocols protocols={PROTOCOLS} profile={profile} pagePadding="20px" tone="light" accent="#667245" headingFont="serif" linkToOffers={false} />);
afterEach(cleanup);

describe('protocol filters', () => {
  it('offer a focus, who it is for and an age, when there is more than one to choose from', () => {
    const groups = protocolFilterOptions(PROTOCOLS);
    expect(groups.map((group) => group.label)).toEqual(['Focus', 'For', 'Age']);
    expect(groups[0].options).toEqual(expect.arrayContaining(['Wellness', 'Detox']));
    expect(groups[1].options).toEqual(expect.arrayContaining(['Women', 'Men']));
  });
  it('treat a protocol made for everyone as fitting every choice', () => {
    expect(protocolFits(PROTOCOLS[0], { gender: 'Women' })).toBe(true);
    expect(protocolFits(PROTOCOLS[2], { gender: 'Women' })).toBe(false);
    expect(protocolFits(PROTOCOLS[1], { gender: 'Women', category: 'Detox' })).toBe(false);
  });
  it('narrow the cards when a choice is made in a drop-down, and All brings them back', () => {
    const { container } = show();
    const cards = () => container.querySelectorAll('.r3-pcard').length;
    expect(cards()).toBe(5);
    const forSelect = screen.getByLabelText('Filter by for') as HTMLSelectElement;
    fireEvent.change(forSelect, { target: { value: 'Men' } });
    expect(container.textContent).toMatch(/Men's Daily Wellness/);
    expect(container.textContent).not.toMatch(/Women's Daily Wellness/);
    expect(forSelect.value).toBe('Men');
    fireEvent.change(forSelect, { target: { value: '' } });
    expect(cards()).toBe(5);
  });
  it('sit in one boxed bar like the header pickers, and say so and offer to clear when nothing fits', () => {
    const { container } = show();
    const bar = container.querySelector('[data-protocol-filters]') as HTMLElement;
    expect(bar.style.border).toMatch(/1px solid/);
    expect(bar.querySelectorAll('select').length).toBe(3);
    expect([...bar.querySelectorAll('option')].every((option) => !/:/.test(option.textContent || ''))).toBe(true); // no 'Focus:' prefix on the choices
    expect((screen.getByLabelText('Filter by focus') as HTMLSelectElement).selectedOptions[0].textContent).toBe('All focus');
    fireEvent.change(screen.getByLabelText('Filter by focus'), { target: { value: 'Detox' } });
    fireEvent.change(screen.getByLabelText('Filter by for'), { target: { value: 'Men' } });
    expect(screen.getByText(/No protocol fits all of those/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear the filters' }));
    expect(screen.queryByText(/No protocol fits/)).toBeNull();
  });
});
