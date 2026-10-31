// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SpecSheet } from '../SpecSheet';

afterEach(cleanup);

const rowsOf = (title: string) => {
  const list = screen.getByRole('heading', { level: 3, name: title }).parentElement as HTMLElement;
  return Array.from(list.querySelectorAll('dt')).map(dt => [dt.textContent, dt.nextElementSibling?.textContent]);
};

describe('SpecSheet', () => {
  it('keeps the planned-specifications notice', () => {
    render(<SpecSheet />);
    expect(screen.getByText('Planned specifications. Final details are confirmed before manufacturing.')).toBeTruthy();
  });

  it('lists the R³ Ring rows, keeping Control and Works with, with Music on the phone side', () => {
    render(<SpecSheet />);
    expect(rowsOf('R³ Ring')).toEqual([
      ['Control', 'Touch and slide'],
      ['Gestures', 'Tap, double tap, press and hold, swipe'],
      ['Tracks', 'Heart rate, sleep, activity'],
      ['Works with', 'R³ Clip'],
      ['Music', 'Swipe the ring for the next song on your phone'],
    ]);
  });

  it('lists the new R³ Clip rows', () => {
    render(<SpecSheet />);
    const rows = rowsOf('R³ Clip');
    expect(rows).toContainEqual(['Tracks', 'Heart rate, sleep, activity']);
    expect(rows).toContainEqual(['Navigation', "Directions to your next calendar event, using your phone's GPS"]);
    expect(rows).toContainEqual(['AI agent', 'Press and hold the ring; it can use your health data, email and calendar']);
    expect(rows).toContainEqual(['Reels', 'An end-of-day reel of your moments']);
    expect(rows.map(r => r[0])).toEqual(['Camera', 'Captures', 'Tracks', 'Navigation', 'AI agent', 'Reels', 'Worn as', 'Privacy']);
  });
});
