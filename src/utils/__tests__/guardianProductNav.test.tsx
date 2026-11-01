// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuardianHeader, GUARDIAN_BUILDERS_ORDER } from '../../components/guides/GuidePortal';

afterEach(cleanup);
const header = (props: Record<string, unknown> = {}) => render(<GuardianHeader isSignedIn activeTab="home" displayName="John" onNavigate={vi.fn()} onSignOut={() => {}} {...props} />);

describe('Product builder in the top nav', () => {
  it('sits before the Offer builder', () => {
    expect(GUARDIAN_BUILDERS_ORDER.indexOf('Product builder')).toBeGreaterThanOrEqual(0);
    expect(GUARDIAN_BUILDERS_ORDER.indexOf('Product builder')).toBe(GUARDIAN_BUILDERS_ORDER.indexOf('Offer builder') - 1);
  });
  it('links to the Products overview page, and its menu has the shop products too', () => {
    header();
    const link = screen.getAllByRole('link', { name: 'Product builder' })[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/guardians/workspace?step=4');
    expect(screen.getAllByRole('link', { name: 'Overview' }).some((a) => a.getAttribute('href') === '/guardians/workspace?step=4')).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Shop products' })[0].getAttribute('href')).toBe('/guardians/workspace?tab=products');
  });
  it('signed out, it opens the sign-in instead of the page', () => {
    const onSignIn = vi.fn();
    header({ isSignedIn: false, onSignIn });
    fireEvent.click(screen.getAllByRole('link', { name: 'Product builder' })[0]);
    expect(onSignIn).toHaveBeenCalled();
  });
  it('signed in, it goes to the page instead of switching workspace tabs', () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      const onNavigate = vi.fn();
      header({ onNavigate });
      expect(fireEvent.click(screen.getAllByRole('link', { name: 'Product builder' })[0])).toBe(false);
      expect(assign).toHaveBeenCalledWith('/guardians/workspace?step=4');
      expect(onNavigate).not.toHaveBeenCalled();
    } finally { Object.defineProperty(window, 'location', { configurable: true, value: original }); }
  });
  it('on the Products tab only Shop products is highlighted, not the Overview page link', () => {
    header({ activeTab: 'products' });
    const style = (name: string) => (screen.getAllByRole('link', { name })[0] as HTMLElement).style.color;
    expect(style('Overview')).not.toBe(style('Shop products'));
  });
});
