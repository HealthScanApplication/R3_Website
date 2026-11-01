// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { GestureSection } from '../GestureSection';

afterEach(cleanup);

describe('GestureSection', () => {
  it('shows the heading and the four gestures, each with a glyph and one line', () => {
    const { container } = render(<GestureSection />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'One ring, four gestures' });
    expect(container.querySelector('section')?.getAttribute('aria-labelledby')).toBe(h2.id);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items.map(li => within(li).getByRole('heading', { level: 3 }).textContent)).toEqual(['Tap', 'Double tap', 'Press and hold', 'Swipe']);
    for (const line of ['The R³ Clip takes a photo or video.', 'The same, with a voice note.', 'Ask your AI agent.', 'Next song on your phone.']) {
      expect(screen.getByText(line)).toBeTruthy();
    }
    items.forEach(li => {
      const svg = li.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
