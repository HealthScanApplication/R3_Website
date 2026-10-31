import { describe, expect, it } from 'vitest';
import { PRODUCTS, BATCH_GOAL, SHIP_WINDOW, PREORDER_TERMS, formatUsd, USE_CASES, GESTURES, DEVICE_IOV, IOV_LABELS } from '../copy';

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

  it('has 11 use cases with unique ids and every field filled', () => {
    expect(USE_CASES).toHaveLength(11);
    expect(new Set(USE_CASES.map(u => u.id)).size).toBe(11);
    expect(USE_CASES.map(u => u.id)).toEqual(['meal', 'activity', 'task', 'journal', 'navigate', 'agent', 'music', 'reel', 'symptom', 'reminder', 'sleep']);
    for (const u of USE_CASES) for (const k of ['title', 'gesture', 'result', 'scene'] as const) expect(u[k].trim()).not.toBe('');
  });
  it('has exactly four gestures', () => {
    expect(GESTURES.map(g => [g.name, g.line])).toEqual([
      ['Tap', 'The R³ Clip takes a photo or video.'],
      ['Double tap', 'The same, with a voice note.'],
      ['Press and hold', 'Ask your AI agent.'],
      ['Swipe', 'Next song on your phone.'],
    ]);
  });
  it('keeps the owner\'s Inputs / Outputs / Value text', () => {
    expect(IOV_LABELS.map(l => l[1])).toEqual(['Inputs', 'Outputs', 'Value']);
    expect(DEVICE_IOV.ring).toEqual({
      inputs: 'Tap, double tap, press and hold, swipe. Heart rate, sleep and activity sensors.',
      outputs: "Commands to the R³ Clip's camera and microphone, and to your phone: music and your AI agent.",
      value: 'Log anything without taking your phone out.',
    });
    expect(DEVICE_IOV.watch).toEqual({
      inputs: "Camera (photo and video), microphone, heart rate, sleep and activity sensors, and your phone's GPS.",
      outputs: 'Logged meals, activities, tasks and journals; directions to your next calendar event; replies from your AI agent; an end-of-day reel.',
      value: 'A record of your day, made in the moment.',
    });
  });
});
