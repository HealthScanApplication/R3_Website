// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUrlParameterHandling } from '../useUrlParameterHandling';

function at(path: string) {
  window.history.replaceState({}, '', path);
}

describe('/ring route', () => {
  beforeEach(() => at('/'));
  it('maps /ring to the hardware page', () => {
    at('/ring');
    const setCurrentPage = vi.fn();
    renderHook(() => useUrlParameterHandling({ setCurrentPage }));
    expect(setCurrentPage).toHaveBeenCalledWith('hardware');
  });
  it('does not map /hardware to the hardware page', () => {
    at('/hardware');
    const setCurrentPage = vi.fn();
    renderHook(() => useUrlParameterHandling({ setCurrentPage }));
    expect(setCurrentPage).not.toHaveBeenCalledWith('hardware');
  });
});
