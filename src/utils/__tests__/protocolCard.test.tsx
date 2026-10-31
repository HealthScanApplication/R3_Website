// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PROTOCOL_CARD_CSS, PROTOCOL_PLATE, ProtocolCard, ProtocolCardGrid, clipCopy, protocolImageUrl } from '../../components/guides/ProtocolCard';

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

it('loads Supabase pictures progressively at responsive card sizes and keeps external URLs untouched', () => {
  const source = 'https://x.supabase.co/storage/v1/object/public/guide-assets/offers/photo.jpg?t=1';
  expect(protocolImageUrl(source, 48, 28)).toBe('https://x.supabase.co/storage/v1/render/image/public/guide-assets/offers/photo.jpg?t=1&width=48&quality=28&resize=cover');
  expect(protocolImageUrl('https://example.com/photo.jpg', 48, 28)).toBe('https://example.com/photo.jpg');
  const { container } = render(<ProtocolCard title="Progressive" imageUrl={source} />);
  const main = container.querySelector<HTMLImageElement>('.r3-pcard-img')!;
  expect(main.getAttribute('srcset')).toContain('width=320');
  expect(main.getAttribute('srcset')).toContain('width=640');
  expect(main.getAttribute('srcset')).toContain('width=960');
  expect(main.getAttribute('sizes')).toContain('360px');
  expect(container.querySelector('.r3-pcard-progress')?.getAttribute('data-loaded')).toBeNull();
  fireEvent.load(main);
  expect(main.getAttribute('data-loaded')).toBe('true');
  expect(container.querySelector('.r3-pcard-progress')?.getAttribute('data-loaded')).toBe('true');
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

it('carries what an offer needs: a badge and corner tags on the picture, the maker with an avatar, a line under the copy, and a plate of its own', () => {
  const { container } = render(<ProtocolCard title="Offer" href="/o" badge="£29" corner={<span>PDF</span>} plate={<span data-testid="art">art</span>} byAvatar={<i data-testid="avatar" />} by="Guardian" extra={<span>★★★★★</span>} />);
  const media = container.querySelector('.r3-pcard-media')!;
  expect(media.querySelector('.r3-pcard-badge')!.textContent).toBe('£29');
  expect(media.querySelector('.r3-pcard-corner')!.textContent).toBe('PDF');
  expect(media.querySelector('.r3-pcard-plate-slot [data-testid="art"]')).toBeTruthy();
  expect(media.querySelector('img')).toBeNull(); // the default plate picture is replaced
  expect(container.querySelector('.r3-pcard-by [data-testid="avatar"]')).toBeTruthy();
  expect(container.querySelector('.r3-pcard-by-name')!.textContent).toBe('Guardian');
  expect(container.querySelector('.r3-pcard-extra')!.textContent).toBe('★★★★★');
});

it('a card with no photo gets the colour glow, which an open card or a hover brings in; a card with a photo does not', () => {
  const { container, rerender } = render(<ProtocolCard title="No photo" onClick={() => {}} />);
  expect(container.querySelector('.r3-pcard-glow')).toBeTruthy();
  const rule = PROTOCOL_CARD_CSS.split('\n').find((l) => l.includes('.r3-pcard-glow') && l.includes(':hover'))!;
  expect(rule).toContain('[data-pressed=true] .r3-pcard-glow');
  rerender(<ProtocolCard title="With photo" imageUrl="https://example.com/p.png" onClick={() => {}} />);
  expect(container.querySelector('.r3-pcard-glow')).toBeNull();
});

it('the stylesheet is in the page head, so a card outside a ProtocolCardGrid is styled too', () => {
  const el = document.getElementById('r3-pcard-css');
  expect(el).toBeTruthy();
  expect(el!.textContent).toBe(PROTOCOL_CARD_CSS);
});

it('a long tag is clipped with an ellipsis inside the card, and carries its full text as a title', () => {
  const rule = /\.r3-pcard-tag\{([^}]*)\}/.exec(PROTOCOL_CARD_CSS)![1];
  for (const part of ['min-width:0', 'max-width:100%', 'overflow:hidden', 'text-overflow:ellipsis']) expect(rule).toContain(part);
  const { container } = render(<ProtocolCard title="Long" tags={[{ label: 'Women · 32–55 · Perimenopause, Menopause', kind: 'audience' }]} onClick={() => {}} />);
  expect(container.querySelector('.r3-pcard-tag')!.getAttribute('title')).toBe('Women · 32–55 · Perimenopause, Menopause');
});

it('on a narrow picture the corner tags move to the bottom left so they do not run past the price badge', () => {
  expect(PROTOCOL_CARD_CSS).toMatch(/\.r3-pcard-media\{[^}]*container-type:inline-size/);
  const query = /@container \(max-width:330px\)\{([^\n]*)\}\n/.exec(PROTOCOL_CARD_CSS)![1];
  expect(query).toContain('.r3-pcard-corner{top:auto;bottom:12px;left:12px;right:auto');
});

it('the keyboard focus ring is drawn round the whole card, where the picture cannot cover it', () => {
  expect(PROTOCOL_CARD_CSS).toContain('@supports selector(:has(a))');
  expect(PROTOCOL_CARD_CSS).toContain('.r3-pcard:has(.r3-pcard-main:focus-visible){outline:2px solid #9A6A2F;outline-offset:2px}');
  expect(PROTOCOL_CARD_CSS).toContain('.r3-pcard-main:focus-visible{outline:2px solid #9A6A2F;outline-offset:-4px}'); // the fallback where :has is missing
});

it('art on the plate keeps the size it was given (the slot is as wide as its art, and nothing squeezes the art to half the picture)', () => {
  expect(PROTOCOL_CARD_CSS).toContain('.r3-pcard-plate-slot{width:max-content}');
  expect(PROTOCOL_CARD_CSS).toContain('.r3-pcard-plate-slot>*{max-width:none}');
});

it('an inert card is a preview: drawn like the others, but neither a link nor a button', () => {
  const { container } = render(<ProtocolCard title="Preview" cta="Open recipe" inert href="/x" onClick={() => {}} />);
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  const main = container.querySelector('.r3-pcard-main') as HTMLElement;
  expect(main.tagName).toBe('DIV');
  expect(main.textContent).toContain('Preview');
  expect(main.textContent).toContain('Open recipe');
  expect(PROTOCOL_CARD_CSS).toContain('.r3-pcard-main[data-inert]{cursor:default}');
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
