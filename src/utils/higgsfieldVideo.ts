/*
 * Browser side of Guardian videos: thin calls to the `higgsfield` Edge Function (which holds the Guardian's own
 * Higgsfield credentials) plus the progress copy the generator shows. The browser never sees the key or secret.
 */
import { getSupabaseClient } from './supabase/client';
import type { VideoAspect } from './videoPrompt';

export type VideoJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled';
export interface VideoJob { id: string; model: string; prompt: string; aspect_ratio: VideoAspect; duration_seconds: number; image_url: string | null; status: VideoJobStatus; video_url: string | null; storage_path: string | null; error: string | null; mock: boolean; created_at: string; delivered_aspect?: string }
export interface VideoModel { id: string; label: string; durations: [number, number]; aspects: Array<{ aspect: VideoAspect; delivered: string }> }
export interface HiggsfieldStatus { connected: boolean; key_hint: string | null; connected_at: string | null; live: boolean; models: VideoModel[] }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke('higgsfield', { body });
  if (error) {
    let message = error.message;
    try { const detail = await (error as any).context?.json?.(); if (detail?.error) message = detail.error; } catch { /* keep default */ }
    throw new Error(message || 'Video request failed.');
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const higgsfieldStatus = () => call<HiggsfieldStatus>({ action: 'status' });
export const connectHiggsfield = (key: string, secret: string) => call<{ connected: true; key_hint: string; live: boolean }>({ action: 'connect', key, secret });
export const disconnectHiggsfield = () => call<{ connected: false }>({ action: 'disconnect' });
export const generateVideo = (req: { model: string; prompt: string; aspect_ratio: VideoAspect; duration: number; image_url?: string | null; brand_id?: string | null }) => call<{ job: VideoJob }>({ action: 'generate', ...req });
export interface VideoEstimate { usd: number | null; credits: number | null; source: 'higgsfield' | 'price_list'; per_second: number | null }
/** Cost before generating: Higgsfield's own quote in live mode, else the published per-second price. */
export const estimateVideo = (req: { model: string; aspect_ratio: VideoAspect; duration: number }) => call<{ estimate: VideoEstimate; duration: number }>({ action: 'estimate', ...req });
/** "≈ $0.42" and the line under the button that says where the number comes from. */
export function costCopy(e: VideoEstimate | null, duration: number, modelLabel: string): { short: string; detail: string } {
  if (!e || e.usd === null) return { short: '', detail: `No price for ${modelLabel} here yet; Higgsfield shows it in your console before you top up.` };
  const usd = `$${e.usd.toFixed(2)}`;
  if (e.source === 'higgsfield') return { short: `≈ ${usd}`, detail: `Higgsfield’s quote for this video: ${usd}${e.credits !== null ? ` (${e.credits} credits)` : ''}.` };
  return { short: `≈ ${usd}`, detail: `About ${usd}: ${duration} s × $${e.per_second}/s at Higgsfield’s published price. Higgsfield’s own quote replaces this once live.` };
}
export const pollVideo = (jobId: string) => call<{ job: VideoJob; warning?: string }>({ action: 'poll', job_id: jobId });
export const listVideos = () => call<{ jobs: VideoJob[] }>({ action: 'list' });

export const isFinished = (s: VideoJobStatus) => s === 'completed' || s === 'failed' || s === 'nsfw' || s === 'canceled';

/** What the generator says while a job runs, and a rough progress fraction (Higgsfield reports no percentage). */
export function progressOf(job: Pick<VideoJob, 'status' | 'created_at' | 'duration_seconds'>, now = Date.now()): { label: string; fraction: number } {
  if (job.status === 'queued') return { label: 'Queued at Higgsfield', fraction: 0.08 };
  if (job.status === 'in_progress') {
    // Typical renders take ~10–20 s per second of video; ease towards 95% and never claim done.
    const expected = Math.max(60, job.duration_seconds * 15) * 1000;
    const t = Math.max(0, now - Date.parse(job.created_at));
    return { label: 'Rendering', fraction: Math.min(0.95, 0.12 + 0.83 * (1 - Math.exp(-t / expected))) };
  }
  if (job.status === 'completed') return { label: 'Ready', fraction: 1 };
  if (job.status === 'nsfw') return { label: 'Blocked by Higgsfield’s safety filter', fraction: 1 };
  if (job.status === 'canceled') return { label: 'Cancelled', fraction: 1 };
  return { label: 'Failed', fraction: 1 };
}

/** Poll delay per Higgsfield's guidance: start at 2 s, back off to 10 s, with a little jitter. */
export const pollDelay = (attempt: number, jitter = Math.random()) => Math.round(Math.min(10000, 2000 * 1.5 ** attempt) + jitter * 500);
