// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PROTOCOL_CARD_CSS, PROTOCOL_PLATE, ProtocolCard, ProtocolCardGrid, clipCopy } from '../../components/guides/ProtocolCard';

afterEach(cleanup);

it('is a button that says what it opens, with the Guardian card\'s parts: kicker, title, copy, maker, call to action', () => {
  const onClick = vi.fn();
  render(<ProtocolCardGrid><ProtocolCard title="Calm & Breath" kicker="Module · 14 days · Public" copy="Slow breathing for the evening." by="ROUTINE³" cta="View steps" onClick={onClick} /></ProtocolCardGrid>);
  const card = screen.getByRole('button', { name: /Calm & Breath/ });
  expect(card.textContent).toContain('Module · 14 days · Public');
  expect(card.textContent).toContain('Slow breathing for the evening.');
  expect(card.textContent).toContain('ROUTINE³');
  expect(card.textContent).toContain('View steps');
  expect(screen.getByRole('heading', { level: 3, name: 'Calm & Breath' })).toBeTruthy();
  fireEvent.click(card);
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('is a link when it goes to a page, and a toggle (aria-pressed, ink border) when its detail is open', () => {
  const { rerender } = render(<ProtocolCard title="Public one" href="/protocol/abc" />);
  expect(screen.getByRole('link', { name: /Public one/ }).getAttribute('href')).toBe('/protocol/abc');
  rerender(<ProtocolCard title="Open one" pressed onClick={() => {}} />);
  const card = screen.getByRole('button', { name: /Open one/ });
  expect(card.getAttribute('aria-pressed')).toBe('true');
  expect(card.getAttribute('data-pressed')).toBe('true');
  rerender(<ProtocolCard title="Plain action" onClick={() => {}} />);
  expect(screen.getByRole('button', { name: /Plain action/ }).hasAttribute('aria-pressed')).toBe(false);
});

it('the picture is one sharp layer plus a blurred copy for the top and one for the bottom, the copies hidden from screen readers', () => {
  const { container } = render(<ProtocolCard title="With picture" imageUrl="https://example.com/p.png" />);
  const imgs = [...container.querySelectorAll('img')];
  expect(imgs.map((i) => i.className)).toEqual(['r3-pcard-img', 'r3-pcard-blur top', 'r3-pcard-blur bottom']);
  expect(imgs.every((i) => i.getAttribute('src') === 'https://example.com/p.png')).toBe(true);
  expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['', '', '']);
  expect(imgs.slice(1).every((i) => i.getAttribute('aria-hidden') === 'true')).toBe(true);
});

it('with no picture, or a picture that fails to load, it shows the plate', () => {
  const { container, rerender } = render(<ProtocolCard title="No picture" imageUrl={null} />);
  expect(container.querySelector('img')!.getAttribute('src')).toBe(PROTOCOL_PLATE);
  expect(container.querySelectorAll('img')).toHaveLength(1);
  rerender(<ProtocolCard title="Broken" imageUrl="https://example.com/missing.png" />);
  expect(container.querySelectorAll('img')).toHaveLength(3);
  fireEvent.error(container.querySelector('.r3-pcard-img')!);
  expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([PROTOCOL_PLATE]);
});

it('a card that gets a different picture after one failed tries the new one; the same failed picture stays the plate', () => {
  const { container, rerender } = render(<ProtocolCard title="Changing" imageUrl="https://example.com/missing.png" />);
  fireEvent.error(container.querySelector('.r3-pcard-img')!);
  expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([PROTOCOL_PLATE]);
  rerender(<ProtocolCard title="Changing" imageUrl="https://example.com/missing.png" />);
  expect(container.querySelectorAll('img')).toHaveLength(1);
  rerender(<ProtocolCard title="Changing" imageUrl="https://example.com/fixed.png" />);
  expect(container.querySelector('.r3-pcard-img')!.getAttribute('src')).toBe('https://example.com/fixed.png');
});

it('an open card brings the colour into the fallback plate as it does into a picture', () => {
  const colourRule = PROTOCOL_CARD_CSS.split('\n').find((line) => line.includes('.r3-pcard-plate') && line.includes('grayscale(0)'))!;
  expect(colourRule).toContain('.r3-pcard[data-pressed=true] .r3-pcard-plate');
});

it('leans toward the mouse and settles when it leaves; touch and zero-size boxes do nothing', () => {
  render(<ProtocolCard title="Leaning" />);
  const card = screen.getByRole('button', { name: /Leaning/ });
  card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  // jsdom has no PointerEvent: a mouse event that carries a pointerType stands in for one.
  const move = (pointerType: string, clientX: number, clientY: number) => fireEvent(card, Object.assign(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }), { pointerType }));
  move('touch', 200, 0);
  expect(card.style.getPropertyValue('--ty')).toBe('');
  move('mouse', 200, 0);
  expect(card.style.getPropertyValue('--ty')).toBe('2.00deg');
  expect(card.style.getPropertyValue('--tx')).toBe('1.50deg');
  fireEvent.pointerOut(card); // React derives onPointerLeave from pointerout
  expect(card.style.getPropertyValue('--ty')).toBe('');
  expect(card.style.getPropertyValue('--tx')).toBe('');
});

it('the stylesheet keeps the effect: black and white tilt-shift at rest, colour on hover, colour from the start on touch, still for reduced motion', () => {
  const css = PROTOCOL_CARD_CSS.replace(/\s+/g, ' ');
  expect(css).toMatch(/\.r3-pcard-img,\.r3-pcard-blur\{[^}]*filter:grayscale\(1\)/);
  expect(css).toMatch(/\.r3-pcard-blur\.top\{[^}]*mask-image:linear-gradient\(to bottom/);
  expect(css).toMatch(/\.r3-pcard-blur\.bottom\{[^}]*mask-image:linear-gradient\(to top/);
  expect(css).toMatch(/\.r3-pcard:hover \.r3-pcard-img[^{]*\{filter:grayscale\(0\)/);
  expect(css).toMatch(/\.r3-pcard:focus-visible \.r3-pcard-img/);
  expect(css).toMatch(/@media \(hover:none\)\{ \.r3-pcard-img\{filter:grayscale\(0\)/);
  expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^@]*transform:none!important/);
});

it('clipCopy cuts at a word and leaves short text alone', () => {
  expect(clipCopy(undefined)).toBeUndefined();
  expect(clipCopy('  ')).toBeUndefined();
  expect(clipCopy('Short  text')).toBe('Short text');
  const long = 'word '.repeat(40);
  const cut = clipCopy(long, 30)!;
  expect(cut.length).toBeLessThanOrEqual(31);
  expect(cut.endsWith('…')).toBe(true);
  expect(cut).not.toMatch(/wor…$/);
});
