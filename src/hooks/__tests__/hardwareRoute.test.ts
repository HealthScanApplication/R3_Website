// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUrlParameterHandling } from '../useUrlParameterHandling';

function at(path: string) {
  window.history.replaceState({}, '', path);
}

describe('/wearables route', () => {
  beforeEach(() => at('/'));
  it('maps /wearables to the hardware page', () => {
    at('/wearables');
    const setCurrentPage = vi.fn();
    renderHook(() => useUrlParameterHandling({ setCurrentPage }));
    expect(setCurrentPage).toHaveBeenCalledWith('hardware');
    expect(window.location.pathname).toBe('/wearables');
  });
  it('sends old /ring links to /wearables, keeping the query and hash', () => {
    at('/ring?ref=ig#preorder');
    const setCurrentPage = vi.fn();
    renderHook(() => useUrlParameterHandling({ setCurrentPage }));
    expect(setCurrentPage).toHaveBeenCalledWith('hardware');
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/wearables?ref=ig#preorder');
  });
  it('does not map /hardware to the hardware page', () => {
    at('/hardware');
    const setCurrentPage = vi.fn();
    renderHook(() => useUrlParameterHandling({ setCurrentPage }));
    expect(setCurrentPage).not.toHaveBeenCalledWith('hardware');
  });
});
