// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, accessToken: null, signOut: () => {} }) }));
import { ProductCard } from '../../components/guides/GuidePortal';

afterEach(cleanup);
const base = { title: '7-day sleep challenge', name: 'John Ferreira', accent: '#667245' };

it('an offer is the Guardian card: price on the picture, format tags, kicker, serif title, copy, author, call to action', () => {
  const { container } = render(<ProductCard {...base} kind="routine" eyebrow="Everyone" copy="Follow a simple routine." price="Free" href="/guardians/john#start" />);
  const card = screen.getByRole('link', { name: /7-day sleep challenge/ });
  expect(card.getAttribute('href')).toBe('/guardians/john#start');
  expect(container.querySelector('.r3-pcard-badge')!.textContent).toBe('Free');
  expect(container.querySelector('.r3-pcard-corner')!.textContent).toMatch(/PDF.*ROUTINE³/);
  expect(container.querySelector('.r3-pcard-kicker')!.textContent).toBe('Everyone');
  expect(screen.getByRole('heading', { level: 3, name: '7-day sleep challenge' })).toBeTruthy();
  expect(card.textContent).toContain('Follow a simple routine.');
  expect(container.querySelector('.r3-pcard-by-name')!.textContent).toBe('John Ferreira');
  expect(container.querySelector('.r3-pcard-cta')!.textContent).toBe('Get it free');
});

it('the call to action says what the offer needs: free is "Get it free", paid is "View offer", and a given label is kept', () => {
  const { container, rerender } = render(<ProductCard {...base} price="£29" href="#" />);
  expect(container.querySelector('.r3-pcard-cta')!.textContent).toBe('View offer');
  rerender(<ProductCard {...base} price="£29" cta="See what is included" href="#" />);
  expect(container.querySelector('.r3-pcard-cta')!.textContent).toBe('See what is included');
  rerender(<ProductCard {...base} price="Free" cta="Get it now" href="#" />);
  expect(container.querySelector('.r3-pcard-cta')!.textContent).toBe('Get it now');
});

it('a click runs onClick instead of following the link; a modified click still opens the link', () => {
  const onClick = vi.fn();
  render(<ProductCard {...base} href="/somewhere" onClick={onClick} />);
  const link = screen.getByRole('link', { name: /7-day sleep challenge/ });
  // Record whether the card already cancelled the click, then cancel it ourselves so jsdom does not try to navigate.
  const cancelled: boolean[] = [];
  const spy = (event: Event) => { cancelled.push(event.defaultPrevented); event.preventDefault(); };
  document.addEventListener('click', spy);
  fireEvent.click(link);
  fireEvent.click(link, { ctrlKey: true });
  fireEvent.click(link, { metaKey: true });
  document.removeEventListener('click', spy);
  expect(cancelled).toEqual([true, false, false]);
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('a card with nowhere to go (a preview) is not a link and not a button; with only a click handler it is a button', () => {
  const { container, rerender } = render(<ProductCard {...base} kind="recipe_book" cta="Open recipe" />);
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  expect(container.querySelector('a[href="#"]')).toBeNull();
  rerender(<ProductCard {...base} onClick={() => {}} />);
  expect(screen.getByRole('button', { name: /7-day sleep challenge/ })).toBeTruthy();
  expect(container.querySelector('a')).toBeNull();
});

it('a cover photo is the tilt-shift picture; without one the offer\'s art stands on the plate with a glow behind it', () => {
  const { container, rerender } = render(<ProductCard {...base} kind="ebook" imageUrl="https://example.com/cover.jpg" href="#" />);
  expect([...container.querySelectorAll('img')].map((i) => i.className).filter((c) => c.startsWith('r3-pcard'))).toEqual(['r3-pcard-img', 'r3-pcard-blur top', 'r3-pcard-blur bottom']);
  expect(container.querySelector('.r3-pcard-glow')).toBeNull();
  rerender(<ProductCard {...base} kind="ebook" imageUrl={null} href="#" />);
  expect(container.querySelector('.r3-pcard-img')).toBeNull();
  expect(container.querySelector('.r3-pcard-plate-slot')).toBeTruthy();
  expect(container.querySelector('.r3-pcard-glow')).toBeTruthy();
});

it('stars only when there are reviews; the audience is a tag; the author falls back to an initial', () => {
  const { container, rerender } = render(<ProductCard {...base} href="#" />);
  expect(container.querySelector('[aria-label^="Rated"]')).toBeNull();
  expect(container.querySelector('.r3-pcard-tags')).toBeNull();
  expect(container.querySelector('.r3-pcard-by > span:first-child')!.textContent).toBe('J');
  rerender(<ProductCard {...base} rating={4.5} reviewCount={12} audience="Women · 45–64" avatarUrl="https://example.com/a.jpg" href="#" />);
  expect(container.querySelector('[aria-label="Rated 4.5 out of 5 from 12 reviews"]')).toBeTruthy();
  expect([...container.querySelectorAll('.r3-pcard-tag')].map((t) => t.textContent)).toEqual(['Women · 45–64']);
  expect(container.querySelector('.r3-pcard-by img')!.getAttribute('src')).toBe('https://example.com/a.jpg');
});
