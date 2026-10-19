// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { costCopy, pollDelay, progressOf } from '../higgsfieldVideo';
import { defaultBrandKit } from '../brandKit';

const models = [{ id: 'kling-3-std', label: 'Kling 3.0 Standard', durations: [3, 15], aspects: [{ aspect: '9:16', delivered: '9:16' }, { aspect: '4:5', delivered: '9:16' }, { aspect: '1:1', delivered: '1:1' }, { aspect: '16:9', delivered: '16:9' }] }];
const api = vi.hoisted(() => ({
  higgsfieldStatus: vi.fn(), startHiggsfieldLogin: vi.fn(async () => ({ url: 'https://mcp.higgsfield.ai/oauth2/authorize?x=1' })), estimateVideo: vi.fn(async () => ({ estimate: { usd: 0.42, credits: null, source: 'price_list', per_second: 0.084 }, duration: 5 })), connectHiggsfield: vi.fn(), disconnectHiggsfield: vi.fn(), generateVideo: vi.fn(), pollVideo: vi.fn(), listVideos: vi.fn(async () => ({ jobs: [] })),
}));
vi.mock('../higgsfieldVideo', async (importOriginal) => ({ ...await importOriginal<any>(), ...api }));
const { VideoStudio } = await import('../../components/guides/VideoStudio');
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('login round trip', () => {
  it('reads and clears ?higgsfield= from the address', async () => {
    const { takeLoginOutcome } = await vi.importActual<any>('../higgsfieldVideo');
    const replace = vi.fn();
    expect(takeLoginOutcome({ href: 'https://routine3.com/g?tab=content&higgsfield=connected' }, replace)).toBe('connected');
    expect(replace).toHaveBeenCalledWith('https://routine3.com/g?tab=content');
    expect(takeLoginOutcome({ href: 'https://routine3.com/g?higgsfield=weird' }, replace)).toBe('error');
    expect(takeLoginOutcome({ href: 'https://routine3.com/g' }, replace)).toBeNull();
  });
});

describe('progress copy and polling', () => {
  it('maps job statuses to labels and a progress fraction', () => {
    const at = '2026-10-18T12:00:00.000Z', t0 = Date.parse(at);
    expect(progressOf({ status: 'queued', created_at: at, duration_seconds: 5 }, t0)).toEqual({ label: 'Queued at Higgsfield', fraction: 0.08 });
    const early = progressOf({ status: 'in_progress', created_at: at, duration_seconds: 5 }, t0 + 5000).fraction;
    const late = progressOf({ status: 'in_progress', created_at: at, duration_seconds: 5 }, t0 + 600000).fraction;
    expect(early).toBeGreaterThan(0.12); expect(late).toBeGreaterThan(early); expect(late).toBeLessThanOrEqual(0.95);
    expect(progressOf({ status: 'completed', created_at: at, duration_seconds: 5 })).toEqual({ label: 'Ready', fraction: 1 });
    expect(progressOf({ status: 'nsfw', created_at: at, duration_seconds: 5 }).label).toMatch(/safety/);
  });
  it('words the cost by where it came from', () => {
    expect(costCopy({ usd: 0.42, credits: null, source: 'price_list', per_second: 0.084 }, 5, 'Kling')).toEqual({ short: '≈ $0.42', detail: expect.stringMatching(/5 s × \$0\.084\/s at Higgsfield’s published price/) });
    expect(costCopy({ usd: 0.672, credits: 6.72, source: 'higgsfield', per_second: null }, 8, 'Kling').detail).toBe('Higgsfield’s quote for this video: $0.67 (6.72 credits).');
    expect(costCopy({ usd: null, credits: null, source: 'price_list', per_second: null }, 5, 'Wan 2.7')).toEqual({ short: '', detail: expect.stringMatching(/No price for Wan 2\.7/) });
  });
  it('backs off from 2 s to 10 s', () => {
    expect(pollDelay(0, 0)).toBe(2000);
    expect(pollDelay(2, 0)).toBe(4500);
    expect(pollDelay(20, 0)).toBe(10000);
  });
});

describe('VideoStudio', () => {
  const props = { creator: 'John Ferreira', brandName: 'John Ferreira', audience: 'Women 45–64 · Menopause', problem: 'Sleep problems', offer: '7-day menopause sleep challenge' };

  it('asks a Guardian to connect their own Higgsfield key and never keeps it in the form', async () => {
    api.higgsfieldStatus.mockResolvedValue({ connected: false, key_hint: null, connected_at: null, live: false, models });
    api.connectHiggsfield.mockResolvedValue({ connected: true, key_hint: 'ef12', live: false });
    render(<VideoStudio {...props} />);
    expect(await screen.findByRole('button', { name: /^Log in with Higgsfield$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Use an API key/ }));
    fireEvent.change(await screen.findByLabelText('API key ID'), { target: { value: 'key_abcdef12' } });
    fireEvent.change(screen.getByLabelText('API key secret'), { target: { value: 'sec_ret_123456' } });
    expect(screen.getByLabelText('API key secret')).toHaveProperty('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: /Connect Higgsfield/ }));
    expect(api.connectHiggsfield).toHaveBeenCalledWith('key_abcdef12', 'sec_ret_123456');
    expect(await screen.findByText('Connected · key …ef12')).toBeTruthy();
    expect(document.body.innerHTML).not.toContain('sec_ret_123456');
  });

  it('pre-fills the prompt from the brief, generates, and shows progress', async () => {
    api.higgsfieldStatus.mockResolvedValue({ connected: true, key_hint: 'ef12', connected_at: null, live: false, models });
    api.generateVideo.mockResolvedValue({ job: { id: 'j1', model: 'kling-3-std', prompt: 'p', aspect_ratio: '4:5', duration_seconds: 5, image_url: null, status: 'queued', video_url: null, storage_path: null, error: null, mock: true, created_at: new Date().toISOString() } });
    render(<VideoStudio {...props} brandName="Calm Co" kit={{ ...defaultBrandKit(), visual: 'film grain, muted greens' }} />);
    const prompt = await screen.findByRole('textbox', { name: /Prompt/ }) as HTMLTextAreaElement;
    expect(prompt.value).toMatch(/Women 45–64/); expect(prompt.value).toMatch(/Visual language: film grain, muted greens/); expect(prompt.value).toMatch(/for Calm Co/);
    fireEvent.click(screen.getByRole('button', { name: /^4:5/ }));
    expect(screen.getByText(/renders at 9:16/)).toBeTruthy();
    expect(prompt.value).toMatch(/portrait 4:5/);
    expect(screen.getByText('Test mode')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Generate 5s video · ≈ $0.42' })).toBeTruthy();
    expect(api.estimateVideo).toHaveBeenLastCalledWith({ model: 'kling-3-std', aspect_ratio: '4:5', duration: 5 });
    fireEvent.click(screen.getByRole('button', { name: /Generate 5s video/ }));
    await waitFor(() => expect(api.generateVideo).toHaveBeenCalledWith(expect.objectContaining({ model: 'kling-3-std', aspect_ratio: '4:5', duration: 5 })));
    expect(await screen.findByRole('progressbar', { name: 'Video progress' })).toBeTruthy();
  });

  it('keeps a Guardian’s own prompt edits when the brief changes', async () => {
    api.higgsfieldStatus.mockResolvedValue({ connected: true, key_hint: 'ef12', connected_at: null, live: true, models });
    const { rerender } = render(<VideoStudio {...props} />);
    const prompt = await screen.findByRole('textbox', { name: /Prompt/ }) as HTMLTextAreaElement;
    fireEvent.change(prompt, { target: { value: 'My own idea for a sleepy video.' } });
    rerender(<VideoStudio {...props} problem="Stress" />);
    expect(prompt.value).toBe('My own idea for a sleepy video.');
    fireEvent.click(screen.getByRole('button', { name: /Use suggested/ }));
    expect(prompt.value).toMatch(/stress/i);
  });

  it('drafts an editable script and lays the post text over the video, drafted from the script', async () => {
    api.higgsfieldStatus.mockResolvedValue({ connected: true, key_hint: 'ef12', connected_at: null, live: false, models });
    render(<VideoStudio {...props} free siteUrl="/guardians/john" />);
    const script = await screen.findByLabelText(/Script · hook/) as HTMLTextAreaElement;
    expect(script.value.split('\n')[0]).toBe('Sleep problems? It might be your routine.');
    expect(script.value.split('\n').at(-1)).toBe('Get the free routine at the link in bio.');
    expect(screen.getByLabelText('Text on the video').tagName).toBe('CANVAS');
    expect((screen.getByLabelText('Video headline') as HTMLInputElement).value).toBe('Sleep problems? It might be your routine.');
    expect((screen.getByLabelText('Video button') as HTMLInputElement).value).toBe('Get the free routine');
    expect(screen.getByRole('group', { name: 'Video text style' }).querySelectorAll('button')).toHaveLength(6);
    expect(screen.getByLabelText('Video text position').querySelectorAll('option')).toHaveLength(4);
    // Editing the script's hook moves the headline with it, until the headline itself is edited.
    fireEvent.change(script, { target: { value: 'Tired of 3am wake-ups?\nOne line.\nJoin free.' } });
    expect((screen.getByLabelText('Video headline') as HTMLInputElement).value).toBe('Tired of 3am wake-ups?');
    fireEvent.change(screen.getByLabelText('Video headline'), { target: { value: 'My headline' } });
    fireEvent.change(script, { target: { value: 'Another hook\nOne line.\nJoin free.' } });
    expect((screen.getByLabelText('Video headline') as HTMLInputElement).value).toBe('My headline');
    fireEvent.click(screen.getByRole('checkbox', { name: /Text on the video/ }));
    expect(screen.queryByLabelText('Text on the video')).toBeNull();
  });

  it('offers "Log in with Higgsfield" and sends the Guardian to Higgsfield', async () => {
    api.higgsfieldStatus.mockResolvedValue({ connected: false, method: null, key_hint: null, connected_at: null, live: false, models });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: 'http://localhost:5173/guardians?tab=content', assign });
    render(<VideoStudio {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Log in with Higgsfield$/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://mcp.higgsfield.ai/oauth2/authorize?x=1'));
    expect(api.startHiggsfieldLogin).toHaveBeenCalledWith('http://localhost:5173/guardians?tab=content');
    vi.unstubAllGlobals();
  });

  it('shows a login connection with the account email and plan credits', async () => {
    api.higgsfieldStatus.mockResolvedValue({ connected: true, method: 'oauth', key_hint: 'jo…@example.com', connected_at: null, live: false, models });
    api.estimateVideo.mockResolvedValueOnce({ estimate: { usd: null, credits: null, source: 'plan', per_second: null }, duration: 5 });
    render(<VideoStudio {...props} />);
    expect(await screen.findByText('Logged in with Higgsfield · jo…@example.com')).toBeTruthy();
    expect(await screen.findByText(/Uses credits from your Higgsfield plan/)).toBeTruthy();
  });

  it('says so when the function is not deployed on this environment', async () => {
    api.higgsfieldStatus.mockRejectedValue(new Error('Video generation is not configured yet.'));
    render(<VideoStudio {...props} />);
    expect(await screen.findByText(/isn’t switched on here yet/)).toBeTruthy();
  });
});
