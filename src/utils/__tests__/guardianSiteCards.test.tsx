// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SiteCardGrid, SitePublishBar, type SiteCardData } from '../../components/guides/GuardianSiteCards';
import { sitePublishAction, siteStatus } from '../guardianSiteStatus';

afterEach(cleanup);

const profile = (over: Partial<SiteCardData> = {}): SiteCardData => ({
  key: 'profile-site', type: 'Profile site', title: 'Test Guide profile', path: '/guardians/test-guide', status: siteStatus('draft'),
  heroKicker: 'Test Guide', heroLine: 'Feel better in your everyday life.', avatarUrl: '/me.png', backgroundUrl: '/bg.jpg', previewId: 'profile-site-preview', ...over,
});
const funnel = (over: Partial<SiteCardData> = {}): SiteCardData => ({
  key: 'funnel-site', type: 'Offer funnel', title: '7-day sleep challenge', path: '/guardians/test-guide/value-ramp/sleep', status: siteStatus('draft', 'draft'),
  heroKicker: 'Test Guide', heroLine: '7-day sleep challenge', avatarUrl: null, backgroundUrl: '/bg.jpg', previewId: 'value-ramp-funnel-preview', ...over,
});

function Grid({ sites, onEdit = () => {}, onPreview = () => {} }: { sites: SiteCardData[]; onEdit?: (s: SiteCardData) => void; onPreview?: (s: SiteCardData) => void }) {
  const [menu, setMenu] = React.useState<string | null>(null);
  return <SiteCardGrid sites={sites} openMenu={menu} onOpenMenu={setMenu} onEdit={onEdit} onPreview={onPreview} />;
}
const card = (key: string) => document.querySelector(`[data-site-card="${key}"]`) as HTMLElement;

it('shows one 16:9 hero card per site with its type, title, path and real status', () => {
  render(<Grid sites={[profile({ status: siteStatus('approved') }), funnel({ status: siteStatus('submitted', 'published') })]} />);
  const a = card('profile-site'), b = card('funnel-site');
  expect((a.querySelector('[data-site-hero]') as HTMLElement).style.aspectRatio).toBe('16 / 9');
  expect(within(a).getByText('Profile site')).toBeTruthy();
  expect(within(a).getByText('/guardians/test-guide')).toBeTruthy();
  expect(a.querySelector('[data-site-status]')!.textContent).toBe('Published');
  expect(b.querySelector('[data-site-status]')!.textContent).toBe('In review');
  expect(within(b).getByText('Offer funnel')).toBeTruthy();
  expect(document.querySelector('.g-sitecards')!.textContent).not.toMatch(/—/);
});

it('draws the background image only when it is an image that loads', () => {
  const { unmount } = render(<Grid sites={[profile()]} />);
  const hero = card('profile-site').querySelector('[data-site-hero]')!;
  expect(hero.querySelector('img[src="/bg.jpg"]')).toBeTruthy();
  fireEvent.error(hero.querySelector('img[src="/bg.jpg"]')!);
  expect(hero.querySelector('img[src="/bg.jpg"]')).toBeNull(); // no broken image icon, just the dark panel
  expect(within(hero as HTMLElement).getByText('Feel better in your everyday life.')).toBeTruthy();
  unmount();

  render(<Grid sites={[profile({ backgroundIsVideo: true }), funnel({ backgroundUrl: '' })]} />);
  expect(card('profile-site').querySelector('[data-site-hero] img[src="/bg.jpg"]')).toBeNull();
  expect(card('funnel-site').querySelector('[data-site-hero] img')).toBeNull();
});

it('puts the avatar and the headline over the hero, and skips an avatar that fails', () => {
  render(<Grid sites={[profile()]} />);
  const hero = card('profile-site').querySelector('[data-site-hero]') as HTMLElement;
  expect(hero.querySelector('img[src="/me.png"]')).toBeTruthy();
  expect(within(hero).getByText('Test Guide')).toBeTruthy();
  fireEvent.error(hero.querySelector('img[src="/me.png"]')!);
  expect(hero.querySelector('img[src="/me.png"]')).toBeNull();
});

it('opens the site in the builder from the whole card, as a real button', () => {
  const onEdit = vi.fn();
  render(<Grid sites={[profile()]} onEdit={onEdit} />);
  const open = screen.getByRole('button', { name: 'Edit Test Guide profile' });
  expect(open.tagName).toBe('BUTTON');
  fireEvent.click(open);
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: 'profile-site' }));
});

it('keeps the actions menu as a menu with Edit and Preview, and adds View live only when published', () => {
  const onEdit = vi.fn(), onPreview = vi.fn();
  render(<Grid sites={[profile(), funnel({ status: siteStatus('approved', 'published') })]} onEdit={onEdit} onPreview={onPreview} />);
  const draftButton = screen.getByRole('button', { name: 'Actions for Test Guide profile' });
  expect(draftButton.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(draftButton);
  const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Preview and test']);
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Preview and test' }));
  expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ previewId: 'profile-site-preview' }));

  fireEvent.click(screen.getByRole('button', { name: 'Actions for 7-day sleep challenge' }));
  const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
  expect(items.map((i) => i.textContent)).toEqual(['Edit', 'Preview and test', 'View live']);
  expect(items[2].getAttribute('href')).toBe('/guardians/test-guide/value-ramp/sleep');
});

it('closes the menu with Escape', () => {
  render(<Grid sites={[profile()]} />);
  const button = screen.getByRole('button', { name: 'Actions for Test Guide profile' });
  fireEvent.click(button);
  expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
});

it('lays the cards out in a grid that collapses to one column on a phone', () => {
  render(<Grid sites={[profile(), funnel()]} />);
  const css = document.querySelector('.g-sitecards style')!.textContent!;
  expect(css).toContain('repeat(auto-fill,minmax(min(280px,100%),1fr))');
  expect(css).toContain(':focus-visible');
});

function Form({ children, onSubmit }: { children: React.ReactNode; onSubmit: () => void }) {
  return <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>{children}</form>;
}

it('publish bar: shows the state and runs the form submit, the existing publish path', () => {
  const onSubmit = vi.fn();
  render(<Form onSubmit={onSubmit}><SitePublishBar site="Profile site" status={siteStatus('draft')} action={sitePublishAction('draft')} busy={false} /></Form>);
  const bar = screen.getByRole('group', { name: 'Profile site publishing' });
  expect(bar.querySelector('[data-site-status]')!.textContent).toBe('Draft');
  expect(within(bar).queryByRole('link')).toBeNull(); // nothing to view live yet
  const button = within(bar).getByRole('button', { name: /Request publish/ });
  expect(button.getAttribute('type')).toBe('submit');
  fireEvent.click(button);
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('publish bar: published sites offer View live and an update action', () => {
  render(<Form onSubmit={() => {}}><SitePublishBar site="Offer funnel" status={siteStatus('approved', 'published')} action={sitePublishAction('approved')} busy={false} liveHref="/guardians/x/value-ramp/y" /></Form>);
  const bar = screen.getByRole('group', { name: 'Offer funnel publishing' });
  expect(bar.querySelector('[data-site-status]')!.textContent).toBe('Published');
  expect(within(bar).getByRole('link', { name: 'View Offer funnel live' }).getAttribute('href')).toBe('/guardians/x/value-ramp/y');
  expect(within(bar).getByRole('button', { name: /Update live site/ })).toBeTruthy();
});

it('publish bar: shows In review, disables while sending and surfaces a failed publish', () => {
  render(<Form onSubmit={() => {}}><SitePublishBar site="Profile site" status={siteStatus('submitted')} action={sitePublishAction('submitted')} busy error="Add a valid contact email." /></Form>);
  const bar = screen.getByRole('group', { name: 'Profile site publishing' });
  expect(bar.querySelector('[data-site-status]')!.textContent).toBe('In review');
  const button = within(bar).getByRole('button') as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toMatch(/Sending/);
  expect(within(bar).getByRole('alert').textContent).toBe('Add a valid contact email.');
});
