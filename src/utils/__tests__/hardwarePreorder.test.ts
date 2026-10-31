import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('../supabase/info', () => ({ projectId: 'proj', publicAnonKey: 'anon' }));
import { fetchBackerCount, createPreorderIntent } from '../hardwarePreorder';

beforeEach(() => { (globalThis as any).fetch = vi.fn(); });

describe('hardware preorder client', () => {
  it('fetches the backer count', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ paid: 3, goal: 250, deadline: 'd', status: 'open' }) });
    const data = await fetchBackerCount();
    expect(data.paid).toBe(3);
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('/hardware-preorders');
    expect(JSON.parse(opts.body).action).toBe('count');
  });
  it('throws on an error response for intent', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
    await expect(createPreorderIntent('ring', 'a@b.co')).rejects.toThrow('nope');
  });
});
