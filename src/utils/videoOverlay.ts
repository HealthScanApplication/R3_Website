/*
 * The post's static text layer over a Guardian video. ContentStudio's drawPost with no background draws only the
 * text (headline, subline, CTA, QR, credit, logo) on a transparent canvas; here it is laid over the video preview
 * and burned into a downloadable copy by recording video + text frame by frame on a canvas (MediaRecorder).
 */
import type { VideoAspect } from './videoPrompt';

/** Canvas size per format, matching the post formats (16:9 at full HD for video). */
export const OVERLAY_FORMATS: Record<VideoAspect, { id: 'story' | 'post' | 'square' | 'thumb'; w: number; h: number }> = {
  '9:16': { id: 'story', w: 1080, h: 1920 },
  '4:5': { id: 'post', w: 1080, h: 1350 },
  '1:1': { id: 'square', w: 1080, h: 1080 },
  '16:9': { id: 'thumb', w: 1920, h: 1080 },
};

/** Where to draw a video so it covers the frame (centre crop), like CSS object-fit: cover. */
export function coverRect(vw: number, vh: number, w: number, h: number) {
  if (!vw || !vh) return { x: 0, y: 0, w, h };
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale, dh = vh * scale;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}

/** The best recording format this browser offers: MP4 (Safari, recent Chrome) before WebM. */
export function pickRecorderType(isSupported: (t: string) => boolean): { mime: string; ext: 'mp4' | 'webm' } | null {
  for (const mime of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (isSupported(mime)) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  return null;
}

/**
 * Record the video with the text layer on top, in real time (a 5 s clip takes ~5 s). The video is loaded with CORS
 * so the canvas stays exportable; a host without CORS headers makes this reject, and the caller offers the plain
 * video and the text layer PNG instead.
 */
export async function recordWithOverlay(videoUrl: string, overlay: HTMLCanvasElement, onProgress?: (fraction: number) => void): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  const type = typeof MediaRecorder === 'undefined' ? null : pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('This browser can’t record video. Download the video and the text layer separately.');
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = videoUrl;
  await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Could not load the video for export.')); });
  const { width: w, height: h } = overlay;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rect = coverRect(video.videoWidth, video.videoHeight, w, h);
  const draw = () => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h); ctx.drawImage(overlay, 0, 0, w, h); };
  draw();
  canvas.toDataURL(); // throws now (SecurityError) if the video is cross-origin without CORS, before we record anything
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type.mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: type.mime.split(';')[0] })); });
  let frame = 0;
  const loop = () => { draw(); onProgress?.(video.duration ? Math.min(1, video.currentTime / video.duration) : 0); if (!video.ended) frame = requestAnimationFrame(loop); };
  recorder.start(250);
  await video.play();
  loop();
  await new Promise<void>((resolve) => { video.onended = () => resolve(); });
  cancelAnimationFrame(frame); draw();
  recorder.stop();
  return { blob: await done, ext: type.ext };
}

export type StillMotion = 'drift' | 'zoom' | 'orbit';

/** Turn a finished still post into a short motion post without an AI-video charge. */
export async function recordStillCanvas(source: HTMLCanvasElement, seconds = 6, motion: StillMotion = 'drift', onProgress?: (fraction: number) => void): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  const type = typeof MediaRecorder === 'undefined' ? null : pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('This browser can’t record an animated post.');
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type.mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: type.mime.split(';')[0] })); });
  const started = performance.now();
  let frame = 0;
  const draw = (now: number) => {
    const p = Math.min(1, (now - started) / (seconds * 1000));
    ctx.fillStyle = '#11120F'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = motion === 'zoom' ? 1 + p * 0.075 : 1.035;
    const sway = motion === 'drift' ? Math.sin(p * Math.PI * 2) * canvas.width * 0.018 : 0;
    ctx.save(); ctx.translate(canvas.width / 2 + sway, canvas.height / 2); ctx.scale(scale, scale); ctx.drawImage(source, -canvas.width / 2, -canvas.height / 2); ctx.restore();
    if (motion === 'orbit') {
      const angle = p * Math.PI * 2, radius = Math.min(canvas.width, canvas.height) * 0.19;
      const x = canvas.width * 0.5 + Math.cos(angle) * radius, y = canvas.height * 0.5 + Math.sin(angle) * radius;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.7);
      glow.addColorStop(0, 'rgba(199,216,163,.3)'); glow.addColorStop(1, 'rgba(199,216,163,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    onProgress?.(p);
    if (p < 1) frame = requestAnimationFrame(draw); else recorder.stop();
  };
  recorder.start(250); frame = requestAnimationFrame(draw);
  const blob = await done; cancelAnimationFrame(frame);
  return { blob, ext: type.ext };
}
