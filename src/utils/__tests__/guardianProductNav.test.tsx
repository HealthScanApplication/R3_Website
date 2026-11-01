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
});
