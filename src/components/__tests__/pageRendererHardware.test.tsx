// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('../HeroSection', () => ({ HeroSection: () => <div data-testid="home-hero" /> }));
for (const m of ['RoutinesSection', 'AppFeaturesSection', 'HowItWorksSection', 'FeatureShowcase', 'LaunchVideoSection', 'SocialProofSection', 'FAQSection', 'EmailSubscribeSection', 'BlogPreviewSection', 'DiscordCommunitySection']) {
  vi.doMock(`../${m}`, () => ({ [m]: () => null }));
}
vi.mock('../admin/EnvironmentToggle', () => ({ EnvironmentToggle: () => null }));
vi.mock('../admin/EnvironmentBanner', () => ({ EnvironmentBanner: () => null }));
vi.mock('../admin/AdminWorkspace', () => ({ AdminWorkspace: () => null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAdminAuth: () => ({ accessToken: null, isAdminAuthenticated: false, refreshSession: vi.fn() }),
  getAccessTokenDirect: vi.fn(),
}));

const { PageRenderer } = await import('../PageRenderer');

const props = {
  setCurrentPage: vi.fn(), navigateToHome: vi.fn(), navigateToPage: vi.fn(),
  isAdmin: false, user: null, authLoading: false, hasReferral: false, isActive: false, referralCode: null,
};

describe('PageRenderer hardware page', () => {
  afterEach(cleanup);
  it('renders HardwarePage and not the home hero', () => {
    const { container, queryByTestId } = render(<PageRenderer currentPage="hardware" {...props} />);
    expect(container.querySelector('#hardware-page')).not.toBeNull();
    expect(queryByTestId('home-hero')).toBeNull();
  });
  it('still renders the home hero for home', () => {
    const { container, queryByTestId } = render(<PageRenderer currentPage="home" {...props} />);
    expect(queryByTestId('home-hero')).not.toBeNull();
    expect(container.querySelector('#hardware-page')).toBeNull();
  });
});
