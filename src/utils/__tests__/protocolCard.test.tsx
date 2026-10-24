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

it('shows its tags under the title, in the order given, each marked with its kind; none, no list', () => {
  const { container, rerender } = render(<ProtocolCard title="Tagged" tags={[{ label: 'Hygiene', kind: 'category' }, { label: 'Women', kind: 'gender' }, { label: 'Ages 45–64', kind: 'age' }]} onClick={() => {}} />);
  const items = [...container.querySelectorAll('.r3-pcard-tags .r3-pcard-tag')];
  expect(items.map((i) => i.textContent)).toEqual(['Hygiene', 'Women', 'Ages 45–64']);
  expect(items.map((i) => i.getAttribute('data-kind'))).toEqual(['category', 'gender', 'age']);
  const title = container.querySelector('.r3-pcard-title')!, list = container.querySelector('.r3-pcard-tags')!;
  expect(title.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  rerender(<ProtocolCard title="Tagged" tags={[]} onClick={() => {}} />);
  expect(container.querySelector('.r3-pcard-tags')).toBeNull();
  rerender(<ProtocolCard title="Tagged" onClick={() => {}} />);
  expect(container.querySelector('.r3-pcard-tags')).toBeNull();
});

it('the tags are part of what a screen reader says about the card', () => {
  render(<ProtocolCard title="Teen routine" kicker="1 day · Draft" tags={[{ label: 'Hygiene', kind: 'category' }, { label: 'Women', kind: 'gender' }, { label: 'Ages 13–19', kind: 'age' }]} onClick={() => {}} />);
  expect(screen.getByRole('button', { name: /Teen routine.*Hygiene.*Women.*Ages 13–19/ })).toBeTruthy();
});

it('the serif title has room above and below its lines, so the tops of the letters are not clipped by the line clamp', () => {
  const rule = /\.r3-pcard-title\{([^}]*)\}/.exec(PROTOCOL_CARD_CSS)![1];
  expect(Number(/line-height:([\d.]+)/.exec(rule)![1])).toBeGreaterThanOrEqual(1.1);
  expect(rule).toMatch(/padding:\.\d+em 0 \.\d+em/);
});

it('is a link when it goes to a page, and a toggle (aria-pressed, ink border) when its detail is open', () => {
  const { rerender } = render(<ProtocolCard title="Public one" href="/protocol/abc" />);
  expect(screen.getByRole('link', { name: /Public one/ }).getAttribute('href')).toBe('/protocol/abc');
  rerender(<ProtocolCard title="Open one" pressed onClick={() => {}} />);
  const card = screen.getByRole('button', { name: /Open one/ });
  expect(card.getAttribute('aria-pressed')).toBe('true');
  expect(card.closest('.r3-pcard')!.getAttribute('data-pressed')).toBe('true');
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

it('leans toward the mouse and settles when it leaves; touch and zero-size boxes do nothing', () => {
  render(<ProtocolCard title="Leaning" />);
  const card = screen.getByRole('button', { name: /Leaning/ }).closest('.r3-pcard') as HTMLElement;
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
  expect(css).toMatch(/\.r3-pcard:focus-within \.r3-pcard-img/);
  expect(css).toMatch(/@media \(hover:none\),\(pointer:coarse\)\{[^@]*\.r3-pcard-img\{filter:grayscale\(0\)/);
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

it('an owner\'s card carries Edit and Delete beside the main control, not inside it', () => {
  const onEdit = vi.fn(); const onDelete = vi.fn(); const open = vi.fn();
  render(<ProtocolCard title="Mine" onClick={open} onEdit={onEdit} onDelete={onDelete} />);
  const main = screen.getByRole('button', { name: /^Mine/ });
  const edit = screen.getByRole('button', { name: 'Edit Mine' });
  const del = screen.getByRole('button', { name: 'Delete Mine' });
  expect(main.contains(edit)).toBe(false);
  expect(main.contains(del)).toBe(false);
  expect(main.closest('.r3-pcard')!.contains(edit) && main.closest('.r3-pcard')!.contains(del)).toBe(true);
  fireEvent.click(edit); fireEvent.click(del);
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled(); // the icon buttons do not also open the card
});

it('a card the viewer does not own has no Edit or Delete', () => {
  render(<ProtocolCard title="Public one" href="/protocol/x" />);
  expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
});

it('the action buttons show on hover and focus, always on touch, and the delete one turns red', () => {
  const css = PROTOCOL_CARD_CSS.replace(/\s+/g, ' ');
  expect(css).toMatch(/\.r3-pcard-actions\{[^}]*opacity:0;pointer-events:none/); // invisible buttons cannot be hit by a first tap or a stray click
  expect(css).toMatch(/\.r3-pcard:hover \.r3-pcard-actions,\.r3-pcard:focus-within \.r3-pcard-actions\{opacity:1;pointer-events:auto/);
  expect(css).toMatch(/@media \(hover:none\),\(pointer:coarse\)\{ \.r3-pcard-actions\{opacity:1;pointer-events:auto/);
  expect(css).toMatch(/\.r3-pcard-act\.danger:hover\{background:#B4472F/);
});
