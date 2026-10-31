// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

const listGuideBrands = vi.hoisted(() => vi.fn());
vi.mock('../guidePortal', () => ({ listGuideBrands }));

import { GuardianAvatar, firstImage, initialsOf, useGuardianAvatarUrl } from '../../components/guides/GuardianAvatar';
import { GuardianHeader } from '../../components/guides/GuidePortal';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('picking the picture', () => {
  it('takes the first usable candidate and ignores blanks', () => {
    expect(firstImage(null, undefined, '  ', 'https://a/b.png', 'https://c/d.png')).toBe('https://a/b.png');
    expect(firstImage(null, '')).toBeNull();
  });
  it('makes initials from a name', () => {
    expect(initialsOf("Barbara O'Neill")).toBe('BO');
    expect(initialsOf('Cher')).toBe('CH');
    expect(initialsOf('  ')).toBe('');
    expect(initialsOf(undefined)).toBe('');
  });
});

describe('GuardianAvatar', () => {
  it('shows the picture on a light tile, so a transparent PNG or WebP of a dark drawing stays readable on the dark header', () => {
    render(<GuardianAvatar url="https://x/barbara.webp" name="Barbara O'Neill" />);
    const tile = screen.getByTestId('guardian-avatar') as HTMLElement;
    const img = tile.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://x/barbara.webp');
    expect(tile.style.background).toMatch(/rgb\(245, 242, 234\)|#f5f2ea/i); // not transparent, not the header's black
    expect(img.style.objectFit).toBe('cover');
    expect(tile.style.borderRadius).toBe('50%');
  });
  it('shows initials with no picture, and when the picture fails to load', () => {
    const { unmount } = render(<GuardianAvatar name="Barbara O'Neill" />);
    expect(screen.getByTestId('guardian-avatar').textContent).toBe('BO');
    unmount();
    render(<GuardianAvatar url="https://x/broken.png" name="Barbara O'Neill" />);
    fireEvent.error(screen.getByTestId('guardian-avatar').querySelector('img') as HTMLImageElement);
    expect(screen.getByTestId('guardian-avatar').textContent).toBe('BO');
  });
  it('tries a new picture after a failed one', () => {
    const { rerender } = render(<GuardianAvatar url="https://x/broken.png" name="Barbara O'Neill" />);
    fireEvent.error(screen.getByTestId('guardian-avatar').querySelector('img') as HTMLImageElement);
    rerender(<GuardianAvatar url="https://x/new.png" name="Barbara O'Neill" />);
    expect(screen.getByTestId('guardian-avatar').querySelector('img')?.getAttribute('src')).toBe('https://x/new.png');
  });
  it('renders nothing when there is neither a picture nor a name', () => {
    render(<GuardianAvatar />);
    expect(screen.queryByTestId('guardian-avatar')).toBeNull();
  });
});

describe('useGuardianAvatarUrl', () => {
  it('uses the profile photo, then the account photo, and never looks up brands when it has one', () => {
    const { result } = renderHook(() => useGuardianAvatarUrl('u-1', null, 'https://x/account.png'));
    expect(result.current).toBe('https://x/account.png');
    expect(listGuideBrands).not.toHaveBeenCalled();
  });
  it('falls back to the first brand that has a logo when there is no photo at all', async () => {
    listGuideBrands.mockResolvedValue([{ logo_url: null }, { logo_url: 'https://x/brand-1.png' }, { logo_url: 'https://x/brand-2.png' }]);
    const { result } = renderHook(() => useGuardianAvatarUrl('u-1', null, undefined));
    await waitFor(() => expect(result.current).toBe('https://x/brand-1.png'));
    expect(listGuideBrands).toHaveBeenCalledWith('u-1');
  });
  it('stays empty when the lookup fails or there is no signed-in user', async () => {
    listGuideBrands.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useGuardianAvatarUrl('u-1', null));
    await waitFor(() => expect(listGuideBrands).toHaveBeenCalled());
    expect(result.current).toBeNull();
    const none = renderHook(() => useGuardianAvatarUrl(undefined, null));
    expect(none.result.current).toBeNull();
  });
});

describe('the header wiring', () => {
  const portal = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'guides', 'GuidePortal.tsx'), 'utf8');
  it('shows the avatar before the name, and every signed-in page passes it', () => {
    expect(portal).toMatch(/<GuardianAvatar url=\{avatarUrl\} name=\{displayName\}[^>]*\/>\s*<\/a>\}\s*\{displayName && <span className="g-header-name"/);
    expect(portal).toContain('avatarUrl={navAvatarUrl}');
    // The Get started page, the setup steps and the workspace each draw their own header.
    expect(portal.match(/avatarUrl=\{navAvatarUrl\}/g)).toHaveLength(3);
    expect(portal).toContain('useGuardianAvatarUrl(user?.id, profile.avatar_url,');
    expect(portal).toContain('useGuardianAvatarUrl(userId, avatarUrl, logoUrl)');
  });
});

describe('pressing the avatar opens the profile', () => {
  const renderHeader = (props: Partial<React.ComponentProps<typeof GuardianHeader>> = {}) => {
    const onNavigate = vi.fn();
    render(<GuardianHeader isSignedIn displayName="Barbara O'Neill" avatarUrl="https://x/barbara.webp" onNavigate={onNavigate} {...props} />);
    return { onNavigate, link: screen.getByLabelText(/your profile/i) as HTMLAnchorElement };
  };
  it('is a link to the profile tab that navigates inside the app', () => {
    const { link, onNavigate } = renderHeader();
    expect(link.getAttribute('href')).toBe('/guardians/workspace?tab=profile');
    expect(link.querySelector('[data-testid="guardian-avatar"]')).toBeTruthy();
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith('profile');
  });
  it('does not navigate while setup is unsaved (the builders are locked), and says why', () => {
    const { link, onNavigate } = renderHeader({ locked: 'finish setup to open the builders' });
    expect(link.getAttribute('href')).toBeNull();
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('aria-label')).toMatch(/finish setup/);
    fireEvent.click(link);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it('opens the page\'s own profile step when it has one, even while the builders are locked', () => {
    const onOpen = vi.fn();
    const { link, onNavigate } = renderHeader({ locked: 'finish setup to open the builders', profileLink: { href: '/guardians/workspace?step=1', onOpen } });
    expect(link.getAttribute('href')).toBe('/guardians/workspace?step=1');
    expect(link.getAttribute('aria-disabled')).toBeNull();
    expect(link.getAttribute('aria-label')).toBe('Your profile');
    expect(fireEvent.click(link)).toBe(false); // the click was handled in the app, not followed as a link
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it('shows initials as the link when there is a name but no picture', () => {
    const { link } = renderHeader({ avatarUrl: null });
    expect(link.textContent).toBe('BO');
  });
  it('is not rendered at all with neither a name nor a picture', () => {
    render(<GuardianHeader isSignedIn avatarUrl={null} />);
    expect(screen.queryByLabelText(/your profile/i)).toBeNull();
  });
});
