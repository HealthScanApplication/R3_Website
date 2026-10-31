// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { ClipArt, RingArt } from '../DeviceArt';

afterEach(cleanup);

const bgRects = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('svg > rect')).filter(
    r => r.getAttribute('width') === '640' && r.getAttribute('height') === '520',
  );

describe.each([['RingArt', RingArt], ['ClipArt', ClipArt]])('%s', (_n, Art) => {
  it('renders the full-viewBox background rect by default', () => {
    const { container } = render(<Art />);
    expect(bgRects(container)).toHaveLength(1);
    expect(container.querySelector('radialGradient')).toBeTruthy();
  });

  it('omits the background rect and gradient when transparent', () => {
    const { container } = render(<Art transparent />);
    expect(bgRects(container)).toHaveLength(0);
    expect(container.querySelector('radialGradient')).toBeNull();
    expect(container.querySelector('ellipse')).toBeTruthy();
  });
});
