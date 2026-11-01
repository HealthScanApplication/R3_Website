// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

let authUser: any = null;
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser, signOut: vi.fn(async () => {}), accessToken: null }) }));
vi.mock('../../components/auth/AuthModal', () => ({ AuthModal: ({ open }: { open: boolean }) => (open ? <div>auth-modal-open</div> : null) }));
vi.mock('../../components/UniversalWaitlist', () => ({ UniversalWaitlist: () => <div>waitlist-open</div> }));
vi.mock('../../components/SocialSharingModal', () => ({ SocialSharingModal: ({ open }: { open: boolean }) => (open ? <div>referral-open</div> : null) }));
vi.mock('../../hooks/useScrollHeader', () => ({ useScrollHeader: () => ({ isVisible: true, isScrolling: false, scrollDirection: 'up', animationState: 'idle' }) }));
import { Header } from '../../components/Header';

// jsdom has no layout: give the header the widths it would measure in a browser.
const WIDTHS: Record<string, number> = { 'ROUTINE³Beta': 149, Routines: 121, Features: 123, How: 72, FAQ: 67, Guardians: 133, Wearables: 118, 'Sign inSubscribe': 185 };
let rowWidth = 0;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { const t = (this.textContent || '').trim(); return WIDTHS[t] ?? (t.includes('Dashboard') && t.includes('Sign out') && !t.includes('Routines') ? 420 : 0); } });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.style.height === '64px' ? rowWidth : 0; } });
  Element.prototype.scrollIntoView = vi.fn();
  authUser = null;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bar = () => document.querySelector('nav[aria-label="Main navigation"]')!;
const shown = () => [...bar().children].filter((el) => (el as HTMLElement).style.visibility !== 'hidden').map((el) => el.textContent!.trim());
const parkedLinks = () => [...bar().children].filter((el) => (el as HTMLElement).style.visibility === 'hidden').map((el) => el.textContent!.trim());
const open = () => { fireEvent.keyDown(screen.getByRole('button', { name: 'Menu' }), { key: 'Enter' }); return screen.getByRole('menu'); };
const rows = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((el) => el.textContent!.trim());

it('desktop: all six links and the account actions in the bar, no menu button', () => {
  rowWidth = 1300;
  render(<Header />);
  expect(shown()).toEqual(['Routines', 'Features', 'How', 'FAQ', 'Guardians', 'Wearables']);
  expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
});

it('tablet: Guardians and Wearables stay in the bar, the other links are in the menu, the account actions stay', () => {
  rowWidth = 705;
  render(<Header />);
  expect(shown()).toEqual(['Guardians', 'Wearables']);
  expect(parkedLinks()).toEqual(['Routines', 'Features', 'How', 'FAQ']);
  expect(rows(open())).toEqual(['Routines', 'Features', 'How', 'FAQ']);
  expect(screen.getAllByRole('button', { name: 'Sign in' }).some((b) => (b.closest('[style*="visibility: hidden"]') as HTMLElement | null) === null)).toBe(true);
});

it('narrower tablet: the account actions join the links in the menu, with Subscribe as the one filled row', () => {
  rowWidth = 542;
  render(<Header />);
  expect(shown()).toEqual(['Guardians', 'Wearables']);
  const menu = open();
  expect(rows(menu)).toEqual(['Routines', 'Features', 'How', 'FAQ', 'Sign in', 'Subscribe']);
  expect(within(menu).getByRole('menuitem', { name: 'Subscribe' }).getAttribute('data-tone')).toBe('primary');
});

it('phone: only the lockup and the menu button; the menu holds every link and the account actions', () => {
  rowWidth = 318;
  render(<Header />);
  expect(shown()).toEqual([]);
  expect(rows(open())).toEqual(['Routines', 'Features', 'How', 'FAQ', 'Guardians', 'Wearables', 'Sign in', 'Subscribe']);
});

it('Wearables is a link to /wearables, right after Guardians, in the bar and in the menu', () => {
  rowWidth = 1300;
  render(<Header />);
  const links = [...bar().querySelectorAll('a, button')].map((el) => el.textContent!.trim());
  expect(links.slice(links.indexOf('Guardians'), links.indexOf('Guardians') + 2)).toEqual(['Guardians', 'Wearables']);
  expect(bar().querySelector('a[href="/wearables"]')!.textContent).toBe('Wearables');
});

it('a menu row works: Sign in opens the sign-in dialog and the menu closes; Guardians is a real link', () => {
  rowWidth = 318;
  render(<Header />);
  const menu = open();
  expect(within(menu).getByRole('menuitem', { name: 'Guardians' }).getAttribute('href')).toBe('/guardians');
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign in' }));
  expect(screen.getByText('auth-modal-open')).toBeTruthy();
  expect(screen.queryByRole('menu')).toBeNull();
});

it('Escape closes the menu', () => {
  rowWidth = 318;
  render(<Header />);
  open();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
});

it('signed in on a phone: the account links are in the menu, in place of Sign in and Subscribe', () => {
  authUser = { id: 'u1', email: 'guide@example.com', user_metadata: { full_name: 'Guide' } };
  rowWidth = 318;
  render(<Header />);
  expect(rows(open())).toEqual(['Routines', 'Features', 'How', 'FAQ', 'Guardians', 'Wearables', 'Dashboard', 'Guardian workspace', 'Settings', 'Refer a friend', 'Sign out']);
});

it('signed in on a tablet: the wide account cluster moves into the menu so more links can stay', () => {
  authUser = { id: 'u1', email: 'guide@example.com', user_metadata: { full_name: 'Guide' } };
  rowWidth = 705;
  render(<Header />);
  const menu = open();
  expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeTruthy();
  expect(shown()).toContain('Guardians');
});
