/*
 * The image validator for photos a Guardian adds (profile image and the photo grid). It checks what the browser can know
 * before anything is uploaded: the file is not empty, its real content is a JPG, PNG, WebP or GIF (not just its name or
 * declared type), it fits the upload limit, it opens as a picture, and it is large enough and not so stretched that it
 * would look poor or fail the R3 house style. Every problem comes back as a plain sentence for the person.
 *
 * The limits mirror uploadGuideImage (8 MB, 15 MB for a GIF), which stays the final gate on the server side.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');
export const IMAGE_MAX_MB = 8;
export const GIF_MAX_MB = 15;
/** The shorter side must be at least this many pixels: smaller photos turn soft and give the house style too little to work with. */
export const IMAGE_MIN_SHORT_SIDE = 600;
/** A photo longer than this many times its width (either way) is a banner or a strip, not a portrait or a photo. */
export const IMAGE_MAX_ASPECT = 3;
/** Beyond this the browser may run out of memory decoding it. */
export const IMAGE_MAX_PIXELS = 80_000_000;

export const NOT_AN_IMAGE = 'Choose a JPG, PNG, WebP or GIF image.';

/** A one-line summary of what is accepted, for the hint under the buttons. */
export const IMAGE_REQUIREMENTS = `JPG, PNG, WebP or GIF · at least ${IMAGE_MIN_SHORT_SIDE} px · up to ${IMAGE_MAX_MB} MB`;

export interface ImageSize { width: number; height: number }
/** The picture's size; null when this browser cannot decode images to find out (the check is then skipped); 'unreadable' when it tried and could not. */
export type SizeReader = (file: File) => Promise<ImageSize | null | 'unreadable'>;

export interface ImageCheckOptions {
  minShortSide?: number;
  maxAspect?: number;
  /** For tests, or to reuse a decode the caller already did. */
  readSize?: SizeReader;
}

export type ImageCheck = { ok: true; width?: number; height?: number } | { ok: false; message: string };

/** What the first bytes of a file say it is, or null when they match none of the accepted formats. */
export function sniffImageType(head: Uint8Array): (typeof IMAGE_TYPES)[number] | 'heic' | null {
  const at = (index: number, bytes: number[]) => bytes.every((byte, offset) => head[index + offset] === byte);
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (at(0, [0x47, 0x49, 0x46, 0x38]) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) return 'image/gif';
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  // iPhone photos: an ISO media file ("ftyp") branded heic, heix, hevc, mif1 or heif.
  if (at(4, [0x66, 0x74, 0x79, 0x70]) && /^(?:hei[cx]|hevc|mif1|heif)$/.test(String.fromCharCode(head[8], head[9], head[10], head[11]))) return 'heic';
  return null;
}

async function readHead(file: Blob, length = 16): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  if (typeof slice.arrayBuffer === 'function') return new Uint8Array(await slice.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(slice);
  });
}

/** How long to wait for a browser to decode a picture before giving up on the size check (the upload limits still apply). */
const DECODE_TIMEOUT_MS = 8000;

/** Decodes the picture just far enough to learn its size. */
export const readImageSize: SizeReader = async (file) => {
  // jsdom has Image but never loads it, so a decode would wait forever there.
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null;
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    }
    if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<ImageSize | null>((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => resolve(null), DECODE_TIMEOUT_MS);
        image.onload = () => { clearTimeout(timer); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('decode')); };
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  } catch {
    return 'unreadable';
  }
};

const mb = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/** A cheap check on the name and declared type alone, for places that must answer at once (the drop target). */
export function quickImageProblem(file: { type: string }): string | null {
  return (IMAGE_TYPES as readonly string[]).includes(file.type) ? null : NOT_AN_IMAGE;
}

/** The full check on one file. Never throws. */
export async function validateImageFile(file: File, options: ImageCheckOptions = {}): Promise<ImageCheck> {
  const { minShortSide = IMAGE_MIN_SHORT_SIDE, maxAspect = IMAGE_MAX_ASPECT, readSize = readImageSize } = options;
  const fail = (message: string): ImageCheck => ({ ok: false, message });
  if (!file.size) return fail('That file is empty.');
  let sniffed: ReturnType<typeof sniffImageType>;
  try { sniffed = sniffImageType(await readHead(file)); } catch { return fail('That file could not be read. Try choosing it again.'); }
  if (sniffed === 'heic') return fail('That is an iPhone HEIC photo. Export it as a JPG or PNG first, or choose Most Compatible in your camera settings.');
  if (!sniffed) return fail(NOT_AN_IMAGE);
  if (file.type && file.type !== sniffed) return fail(`That file is named like a ${file.type.replace('image/', '').toUpperCase()} but is really a ${sniffed.replace('image/', '').toUpperCase()}. Save it again as a normal image.`);
  const limit = (sniffed === 'image/gif' ? GIF_MAX_MB : IMAGE_MAX_MB) * 1024 * 1024;
  if (file.size > limit) return fail(`That ${sniffed === 'image/gif' ? 'GIF' : 'image'} is ${mb(file.size)}. It must be smaller than ${sniffed === 'image/gif' ? GIF_MAX_MB : IMAGE_MAX_MB} MB.`);
  const size = await readSize(file);
  if (size === 'unreadable') return fail('That image is damaged or could not be opened. Choose another.');
  if (!size) return { ok: true };
  const short = Math.min(size.width, size.height), long = Math.max(size.width, size.height);
  if (short < minShortSide) return fail(`That photo is ${size.width} × ${size.height} px. Use one at least ${minShortSide} px on its shorter side.`);
  if (long / short > maxAspect) return fail(`That photo is ${size.width} × ${size.height} px, too long and thin. Use one closer to square or landscape.`);
  if (size.width * size.height > IMAGE_MAX_PIXELS) return fail('That photo is too large to process. Resize it below 80 megapixels and try again.');
  return { ok: true, ...size };
}

export interface ImageBatchResult { accepted: File[]; rejected: { file: File; message: string }[] }

/** Checks several files at once; the same file picked twice in one go counts once. */
export async function validateImageFiles(files: File[], options: ImageCheckOptions = {}): Promise<ImageBatchResult> {
  const accepted: File[] = [], rejected: ImageBatchResult['rejected'] = [];
  const seen = new Set<string>();
  const results = await Promise.all(files.map((file) => validateImageFile(file, options)));
  files.forEach((file, index) => {
    const result = results[index];
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (!result.ok) rejected.push({ file, message: result.message });
    else if (seen.has(key)) rejected.push({ file, message: 'You already chose this photo.' });
    else { seen.add(key); accepted.push(file); }
  });
  return { accepted, rejected };
}

/** One sentence for the person: just the reason for a single file, the file names with reasons for several. */
export function describeRejections(rejected: ImageBatchResult['rejected'], total = rejected.length): string {
  if (!rejected.length) return '';
  if (total === 1) return rejected[0].message;
  return rejected.map(({ file, message }) => `${file.name || 'A file'}: ${message}`).join(' ');
}
