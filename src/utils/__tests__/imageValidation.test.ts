import { describe, expect, it } from 'vitest';
import { describeRejections, GIF_MAX_MB, IMAGE_MAX_MB, quickImageProblem, sniffImageType, validateImageFile, validateImageFiles } from '../imageValidation';

const bytes = (...head: number[]) => new Uint8Array([...head, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, Math.max(16, head.length)));
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const HEIC = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);
const file = (head: Uint8Array, name: string, type: string, extra = 0) => new File([head, new Uint8Array(extra)], name, { type });
const size = (width: number, height: number) => async () => ({ width, height });

describe('sniffImageType', () => {
  it('reads the real format from the first bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(GIF)).toBe('image/gif');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(sniffImageType(HEIC)).toBe('heic');
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
  });
});

describe('quickImageProblem', () => {
  it('accepts only the four image types by declared type', () => {
    expect(quickImageProblem({ type: 'image/png' })).toBeNull();
    expect(quickImageProblem({ type: 'application/pdf' })).toBe('Choose a JPG, PNG, WebP or GIF image.');
    expect(quickImageProblem({ type: '' })).toBe('Choose a JPG, PNG, WebP or GIF image.');
  });
});

describe('validateImageFile', () => {
  it('accepts a large enough real photo and returns its size', async () => {
    expect(await validateImageFile(file(JPEG, 'me.jpg', 'image/jpeg'), { readSize: size(1200, 1600) })).toEqual({ ok: true, width: 1200, height: 1600 });
  });
  it('accepts when this browser cannot read sizes (the dimension check is skipped, the server limit still applies)', async () => {
    expect((await validateImageFile(file(PNG, 'me.png', 'image/png'), { readSize: async () => null })).ok).toBe(true);
  });
  it('rejects an empty file', async () => {
    expect(await validateImageFile(new File([], 'a.png', { type: 'image/png' }))).toEqual({ ok: false, message: 'That file is empty.' });
  });
  it('rejects a file whose content is not an image even when it is named like one', async () => {
    const result = await validateImageFile(file(bytes(0x25, 0x50, 0x44, 0x46), 'cv.png', 'image/png'), { readSize: size(2000, 2000) });
    expect(result).toEqual({ ok: false, message: 'Choose a JPG, PNG, WebP or GIF image.' });
  });
  it('explains a HEIC photo from an iPhone', async () => {
    const result = await validateImageFile(file(HEIC, 'IMG_1.heic', ''), { readSize: size(3000, 4000) });
    expect(result.ok === false && result.message).toMatch(/HEIC.*JPG or PNG/);
  });
  it('rejects a file whose declared type disagrees with its content', async () => {
    const result = await validateImageFile(file(PNG, 'me.jpg', 'image/jpeg'), { readSize: size(1000, 1000) });
    expect(result.ok === false && result.message).toMatch(/named like a JPEG but is really a PNG/);
  });
  it('rejects a file over the size limit, with a higher limit for GIFs', async () => {
    const big = file(JPEG, 'big.jpg', 'image/jpeg', (IMAGE_MAX_MB + 1) * 1024 * 1024);
    const result = await validateImageFile(big, { readSize: size(2000, 2000) });
    expect(result.ok === false && result.message).toMatch(/must be smaller than 8 MB/);
    const gif = file(GIF, 'a.gif', 'image/gif', (IMAGE_MAX_MB + 1) * 1024 * 1024);
    expect((await validateImageFile(gif, { readSize: size(800, 800) })).ok).toBe(true);
    const bigGif = file(GIF, 'b.gif', 'image/gif', (GIF_MAX_MB + 1) * 1024 * 1024);
    expect((await validateImageFile(bigGif, { readSize: size(800, 800) })).ok).toBe(false);
  });
  it('rejects a picture that cannot be opened', async () => {
    const result = await validateImageFile(file(PNG, 'broken.png', 'image/png'), { readSize: async () => 'unreadable' });
    expect(result.ok === false && result.message).toMatch(/damaged or could not be opened/);
  });
  it('rejects a photo that is too small, and says its size', async () => {
    const result = await validateImageFile(file(PNG, 'tiny.png', 'image/png'), { readSize: size(320, 240) });
    expect(result.ok === false && result.message).toBe('That photo is 320 × 240 px. Use one at least 600 px on its shorter side.');
  });
  it('rejects a banner or a strip', async () => {
    const result = await validateImageFile(file(PNG, 'banner.png', 'image/png'), { readSize: size(3000, 700) });
    expect(result.ok === false && result.message).toMatch(/too long and thin/);
  });
  it('rejects a picture too large to decode safely', async () => {
    const result = await validateImageFile(file(PNG, 'huge.png', 'image/png'), { readSize: size(10000, 9000) });
    expect(result.ok === false && result.message).toMatch(/too large to process/);
  });
});

describe('validateImageFiles', () => {
  it('splits a batch into the usable and the rejected, and counts a repeated file once', async () => {
    const a = file(PNG, 'a.png', 'image/png');
    const pdf = file(bytes(0x25, 0x50, 0x44, 0x46), 'b.pdf', 'application/pdf');
    const { accepted, rejected } = await validateImageFiles([a, a, pdf], { readSize: size(900, 900) });
    expect(accepted).toEqual([a]);
    expect(rejected.map((item) => item.message)).toEqual(['You already chose this photo.', 'Choose a JPG, PNG, WebP or GIF image.']);
  });
  it('describes one rejection by its reason alone, several with file names', () => {
    const one = [{ file: new File(['x'], 'a.png'), message: 'Too small.' }];
    expect(describeRejections(one)).toBe('Too small.');
    expect(describeRejections([...one, { file: new File(['x'], 'b.png'), message: 'Empty.' }])).toBe('a.png: Too small. b.png: Empty.');
    expect(describeRejections(one, 3)).toBe('a.png: Too small.');
  });
});
