import { describe, expect, it } from 'vitest';
import { PRODUCTS, BATCH_GOAL, SHIP_WINDOW, PREORDER_TERMS, formatUsd } from '../copy';

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
  it('shares one terms line with the ship window and the refund promise', () => {
    expect(PREORDER_TERMS).toContain(SHIP_WINDOW);
    expect(PREORDER_TERMS).toContain("If we don't reach the first-batch goal by the deadline, you're refunded in full.");
  });
});
