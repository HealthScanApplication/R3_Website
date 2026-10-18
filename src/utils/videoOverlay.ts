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
