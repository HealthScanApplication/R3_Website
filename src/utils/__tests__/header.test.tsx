// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 20000 }); // the first render of the real header is slow on a loaded machine

let authUser: any = null;
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser, signOut: vi.fn(async () => {}), accessToken: null }) }));
vi.mock('../../components/auth/AuthModal', () => ({ AuthModal: ({ open }: { open: boolean }) => (open ? <div>auth-modal-open</div> : null) }));
vi.mock('../../components/UniversalWaitlist', () => ({ UniversalWaitlist: () => <div>waitlist-open</div> }));
vi.mock('../../components/SocialSharingModal', () => ({ SocialSharingModal: ({ open }: { open: boolean }) => (open ? <div>referral-open</div> : null) }));
vi.mock('../../hooks/useScrollHeader', () => ({ useScrollHeader: () => ({ isVisible: true, isScrolling: false, scrollDirection: 'up', animationState: 'idle' }) }));
import { Header } from '../../components/Header';

// jsdom has no layout: give the header the widths it would measure in a browser.
const WIDTHS: Record<string, number> = { 'ROUTINE³Beta': 149, Routines: 121, Features: 123, 'How It Works': 163, FAQ: 67, Guardians: 133, 'Sign inSubscribe': 185 };
let rowWidth = 0;
let signedInWidth = 420;
let observers: (() => void)[] = [];
/** What the browser does when the window, a font or the account name changes the size of something the header measures. */
const resized = () => act(() => { observers.forEach((cb) => cb()); });

beforeEach(() => {
  observers = [];
  vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { observers.push(cb); } observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { const t = (this.textContent || '').trim(); return WIDTHS[t] ?? (t.includes('Dashboard') && t.includes('Sign out') && !t.includes('Routines') ? signedInWidth : 0); } });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.style.height === '64px' ? rowWidth : 0; } });
  Element.prototype.scrollIntoView = vi.fn();
  authUser = null;
  signedInWidth = 420;
  WIDTHS['Sign inSubscribe'] = 185;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bar = () => document.querySelector('nav[aria-label="Main navigation"]')!;
const shown = () => [...bar().children].filter((el) => (el as HTMLElement).style.visibility !== 'hidden').map((el) => el.textContent!.trim());
const parkedLinks = () => [...bar().children].filter((el) => (el as HTMLElement).style.visibility === 'hidden').map((el) => el.textContent!.trim());
const trigger = () => screen.getByRole('button', { name: 'Menu' });
const open = () => { fireEvent.keyDown(trigger(), { key: 'Enter' }); return screen.getByRole('menu'); };
const rows = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((el) => el.textContent!.trim());

it('desktop: all five links and the account actions in the bar, no menu button', () => {
  rowWidth = 1300;
  render(<Header />);
  expect(shown()).toEqual(['Routines', 'Features', 'How It Works', 'FAQ', 'Guardians']);
  expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
});

it('tablet: the links that fit stay in the bar and the rest are in the menu with the account actions', () => {
  rowWidth = 705;
  render(<Header />);
  expect(shown()).toEqual(['Routines', 'Features', 'Guardians']);
  expect(parkedLinks()).toEqual(['How It Works', 'FAQ']);
  expect(rows(open())).toEqual(['How It Works', 'FAQ', 'Sign in', 'Subscribe']);
  expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull(); // the bar's own Sign in is parked: out of the accessibility tree
});

it('a tie keeps the account actions in the bar, so the menu holds only the links that did not fit', () => {
  WIDTHS['Sign inSubscribe'] = 10;
  rowWidth = 700;
  render(<Header />);
  expect(shown()).toEqual(['Routines', 'Features', 'Guardians']);
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(rows(open())).toEqual(['How It Works', 'FAQ']);
});

it('narrower tablet: Subscribe is the one filled row', () => {
  rowWidth = 542;
  render(<Header />);
  expect(shown()).toEqual(['Routines', 'Guardians']);
  const menu = open();
  expect(rows(menu)).toEqual(['Features', 'How It Works', 'FAQ', 'Sign in', 'Subscribe']);
  expect(within(menu).getByRole('menuitem', { name: 'Subscribe' }).getAttribute('data-tone')).toBe('primary');
});

it('phone: only the lockup and the menu button; the menu holds every link and the account actions; the empty nav is hidden from assistive tech', () => {
  rowWidth = 318;
  render(<Header />);
  expect(shown()).toEqual([]);
  expect(bar().getAttribute('aria-hidden')).toBe('true');
  expect(rows(open())).toEqual(['Routines', 'Features', 'How It Works', 'FAQ', 'Guardians', 'Sign in', 'Subscribe']);
});

it('the nav is not hidden from assistive tech while it has links in it', () => {
  rowWidth = 705;
  render(<Header />);
  expect(bar().getAttribute('aria-hidden')).toBeNull();
});

it('live resize: the bar re-lays out when the window gets wider or narrower', () => {
  rowWidth = 318;
  render(<Header />);
  expect(shown()).toEqual([]);
  rowWidth = 705; resized();
  expect(shown()).toEqual(['Routines', 'Features', 'Guardians']);
  rowWidth = 1300; resized();
  expect(shown()).toEqual(['Routines', 'Features', 'How It Works', 'FAQ', 'Guardians']);
  expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  rowWidth = 318; resized();
  expect(shown()).toEqual([]);
  expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
});

it('the layout follows the account block when its width changes without the row changing (a longer name arrives)', () => {
  authUser = { id: 'u1', email: 'guide@example.com', user_metadata: { full_name: 'Guide' } };
  rowWidth = 1000; signedInWidth = 100;
  render(<Header />);
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy(); // a short cluster fits in the bar beside all five links
  signedInWidth = 600; resized();
  expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull(); // it no longer fits: it moved into the menu
  expect(rows(open())).toContain('Sign out');
});

it('a menu row works: Sign in opens the sign-in dialog once the menu has closed, and focus is back on the menu button; Guardians is a real link', async () => {
  rowWidth = 318;
  render(<Header />);
  const menu = open();
  expect(within(menu).getByRole('menuitem', { name: 'Guardians' }).getAttribute('href')).toBe('/guardians');
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign in' }));
  await waitFor(() => expect(screen.getByText('auth-modal-open')).toBeTruthy());
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger()); // so a dialog that restores focus on close restores it here
});

it('Subscribe opens the waitlist dialog, and closing it puts focus back on the menu button (not on the page)', async () => {
  rowWidth = 318;
  render(<Header />);
  fireEvent.click(within(open()).getByRole('menuitem', { name: 'Subscribe' }));
  await waitFor(() => expect(screen.getByText('waitlist-open')).toBeTruthy());
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByText('waitlist-open')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger()));
});

it('Escape closes the menu and focus returns to the menu button', async () => {
  rowWidth = 318;
  render(<Header />);
  open();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(trigger()));
});

it('scrolling the page closes an open menu', () => {
  rowWidth = 318;
  render(<Header />);
  open();
  act(() => { window.dispatchEvent(new Event('scroll')); });
  expect(screen.queryByRole('menu')).toBeNull();
});

it('signed in on a phone: the account links are in the menu, in place of Sign in and Subscribe; Refer a friend opens its dialog', async () => {
  authUser = { id: 'u1', email: 'guide@example.com', user_metadata: { full_name: 'Guide' } };
  rowWidth = 318;
  render(<Header />);
  const menu = open();
  expect(rows(menu)).toEqual(['Routines', 'Features', 'How It Works', 'FAQ', 'Guardians', 'Dashboard', 'Guardian workspace', 'Settings', 'Refer a friend', 'Sign out']);
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Refer a friend' }));
  await waitFor(() => expect(screen.getByText('referral-open')).toBeTruthy());
});

it('signed in on a tablet: the wide account cluster moves into the menu so more links can stay', () => {
  authUser = { id: 'u1', email: 'guide@example.com', user_metadata: { full_name: 'Guide' } };
  rowWidth = 705;
  render(<Header />);
  const menu = open();
  expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeTruthy();
  expect(shown()).toEqual(['Routines', 'Features', 'Guardians']);
});
