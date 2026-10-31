// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
  it('re-fetches when refreshKey changes', async () => {
    (fetchBackerCount as any).mockResolvedValue({ paid: 1, goal: 250, deadline: 'd', status: 'open' });
    const { rerender } = render(<BackerBar refreshKey={0} />);
    await screen.findByText(/1 of 250 backers/i);
    rerender(<BackerBar refreshKey={1} />);
    expect((fetchBackerCount as any).mock.calls.length).toBe(2);
  });
});
