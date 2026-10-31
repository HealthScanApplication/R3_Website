import { describe, expect, it } from 'vitest';
import { PRODUCTS, BATCH_GOAL, SHIP_WINDOW, formatUsd } from '../copy';

describe('hardware copy', () => {
  it('prices the ring and bundle in cents', () => {
    expect(PRODUCTS.ring.priceCents).toBe(17900);
    expect(PRODUCTS.bundle.priceCents).toBe(29900);
  });
  it('exposes the batch goal and a ship window', () => {
    expect(BATCH_GOAL).toBe(250);
    expect(SHIP_WINDOW).toMatch(/\w/);
  });
  it('formats cents as USD', () => {
    expect(formatUsd(17900)).toBe('$179');
    expect(formatUsd(29900)).toBe('$299');
  });
});
