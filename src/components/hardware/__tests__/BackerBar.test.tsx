// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
vi.mock('../../../utils/hardwarePreorder', () => ({ fetchBackerCount: vi.fn() }));
import { fetchBackerCount } from '../../../utils/hardwarePreorder';
import { BackerBar } from '../BackerBar';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('BackerBar', () => {
  it('shows paid of goal when the count loads', async () => {
    (fetchBackerCount as any).mockResolvedValue({ paid: 142, goal: 250, deadline: 'd', status: 'open' });
    render(<BackerBar />);
    expect(await screen.findByText(/142 of 250 backers/i)).toBeTruthy();
  });
  it('degrades gracefully when the count fails', async () => {
    (fetchBackerCount as any).mockRejectedValue(new Error('down'));
    render(<BackerBar />);
    expect(await screen.findByText(/reserve yours/i)).toBeTruthy();
  });
  it('exposes progressbar semantics with paid and goal', async () => {
    (fetchBackerCount as any).mockResolvedValue({ paid: 142, goal: 250, deadline: 'd', status: 'open' });
    render(<BackerBar />);
    await screen.findByText(/142 of 250 backers/i);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('142');
    expect(bar.getAttribute('aria-valuemax')).toBe('250');
  });
  it('shows only the neutral line while loading, never a fake count', async () => {
    (fetchBackerCount as any).mockReturnValue(new Promise(() => {}));
    render(<BackerBar />);
    expect(screen.getByText(/reserve yours/i)).toBeTruthy();
    expect(screen.queryByText(/0 of/i)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('recovers on refresh after a failed first load', async () => {
    (fetchBackerCount as any)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ paid: 2, goal: 250, deadline: 'd', status: 'open' });
    const { rerender } = render(<BackerBar refreshKey={0} />);
    await screen.findByText(/reserve yours/i);
    rerender(<BackerBar refreshKey={1} />);
    expect(await screen.findByText(/2 of 250 backers/i)).toBeTruthy();
    expect(screen.queryByText(/reserve yours/i)).toBeNull();
  });
  it('updates the count when refreshKey changes', async () => {
    (fetchBackerCount as any)
      .mockResolvedValueOnce({ paid: 1, goal: 250, deadline: 'd', status: 'open' })
      .mockResolvedValueOnce({ paid: 2, goal: 250, deadline: 'd', status: 'open' });
    const { rerender } = render(<BackerBar refreshKey={0} />);
    await screen.findByText(/1 of 250 backers/i);
    rerender(<BackerBar refreshKey={1} />);
    expect(await screen.findByText(/2 of 250 backers/i)).toBeTruthy();
    expect((fetchBackerCount as any).mock.calls.length).toBe(2);
  });
  it('keeps the last known count when a refetch fails', async () => {
    (fetchBackerCount as any)
      .mockResolvedValueOnce({ paid: 3, goal: 250, deadline: 'd', status: 'open' })
      .mockRejectedValueOnce(new Error('down'));
    const { rerender } = render(<BackerBar refreshKey={0} />);
    await screen.findByText(/3 of 250 backers/i);
    rerender(<BackerBar refreshKey={1} />);
    await waitFor(() => expect((fetchBackerCount as any).mock.calls.length).toBe(2));
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByText(/3 of 250 backers/i)).toBeTruthy();
    expect(screen.queryByText(/reserve yours/i)).toBeNull();
  });
  it('names the progressbar and clamps aria-valuenow to the goal', async () => {
    (fetchBackerCount as any).mockResolvedValue({ paid: 300, goal: 250, deadline: 'd', status: 'open' });
    render(<BackerBar />);
    const bar = await screen.findByRole('progressbar', { name: 'Backers reserved' });
    expect(bar.getAttribute('aria-valuenow')).toBe('250');
    expect(bar.getAttribute('aria-valuemax')).toBe('250');
  });
});
