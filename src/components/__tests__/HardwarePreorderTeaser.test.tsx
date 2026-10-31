// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HardwarePreorder } from '../HardwarePreorder';

const fetchStub = vi.fn();
globalThis.fetch = fetchStub as unknown as typeof fetch;

afterEach(() => {
  cleanup();
  fetchStub.mockClear();
});

describe('HardwarePreorder teaser', () => {
  it('has one call to action: a plain link to /ring', () => {
    render(<HardwarePreorder />);
    const link = screen.getByRole('link', { name: /See the R³ Ring/ });
    expect(link.getAttribute('href')).toBe('/ring');
    expect(link.textContent).toBe('See the R³ Ring — from $179');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('names both products', () => {
    render(<HardwarePreorder />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Meet the R³ Ring and R³ Clip.');
    expect(screen.getByRole('heading', { level: 3, name: 'R³ Ring' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'R³ Clip' })).toBeTruthy();
  });

  it('has no form, textbox or button, and makes no network call', () => {
    const { container } = render(<HardwarePreorder />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('form, input, button')).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('is a labelled section anchored at #hardware-preorder', () => {
    const { container } = render(<HardwarePreorder />);
    const section = container.querySelector('section#hardware-preorder')!;
    expect(section).toBeTruthy();
    const labelId = section.getAttribute('aria-labelledby')!;
    const heading = container.querySelector(`#${labelId}`);
    expect(heading?.tagName).toBe('H2');
  });

  it('carries none of the old copy and shows only the $179 price', () => {
    const { container } = render(<HardwarePreorder />);
    const text = container.textContent ?? '';
    for (const banned of ['Note', 'Heart', 'Nothing records', 'ambient', 'camera off by default', 'Capture the moment']) {
      expect(text).not.toContain(banned);
    }
    expect(text.match(/\$\d+/g)).toEqual(['$179']);
  });
});
