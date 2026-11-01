import { describe, expect, it } from 'vitest';
import { chooseImageProvider, dataUrlToFile, type ImageStatus } from '../guardianImages';

const status = (over: Partial<Omit<ImageStatus, 'own'>> & { own?: Partial<ImageStatus['own']> } = {}): ImageStatus => ({
  live: true, house: true, house_left: 4, house_per_day: 10, model: 'gpt-image-1',
  prices: { low: { square: 0.011, wide: 0.016 }, medium: { square: 0.042, wide: 0.063 }, high: { square: 0.167, wide: 0.25 } },
  ...over,
  own: { connected: false, key_hint: null, connected_at: null, available: true, ...(over.own || {}) },
});

describe('chooseImageProvider', () => {
  it('uses the Guardian\'s own OpenAI account when it is connected, and says so', () => {
    expect(chooseImageProvider(status({ own: { connected: true, key_hint: 'sk-…1234' } }))).toMatchObject({ ok: true, source: 'own', note: expect.stringContaining('sk-…1234') });
  });
  it('uses the R³ allowance when there is one left today', () => {
    expect(chooseImageProvider(status())).toMatchObject({ ok: true, source: 'house', note: expect.stringContaining('4 left today') });
  });
  it('in test mode the R³ route is free and always open', () => {
    expect(chooseImageProvider(status({ live: false, house_left: 0 }))).toMatchObject({ ok: true, source: 'house', test: true });
  });
  it('in test mode an own account is still free, and the note does not say anyone is billed', () => {
    expect(chooseImageProvider(status({ live: false, own: { connected: true, key_hint: 'sk-…1234' } }))).toMatchObject({ ok: true, source: 'own', test: true, note: expect.not.stringContaining('Billed') });
  });
  it('refuses politely when nothing is connected, and says how to connect', () => {
    const choice = chooseImageProvider(status({ house: false }));
    expect(choice.ok).toBe(false);
    if (choice.ok) return;
    expect(choice.reason).toBe('not_connected');
    expect(choice.message).toMatch(/connect/i);
    expect(choice.message).toMatch(/OpenAI/);
    expect(choice.message).toMatch(/Content builder/);
  });
  it('when today\'s R³ images are used up and no account is connected, asks to connect one', () => {
    const choice = chooseImageProvider(status({ house_left: 0 }));
    expect(choice).toMatchObject({ ok: false, reason: 'allowance_used' });
    if (!choice.ok) expect(choice.message).toMatch(/connect/i);
  });
  it('when connecting an own key is not switched on, says that instead of asking for one', () => {
    const choice = chooseImageProvider(status({ house: false, own: { available: false } }));
    expect(choice).toMatchObject({ ok: false, reason: 'not_available' });
  });
  it('an own account beats an exhausted allowance', () => {
    expect(chooseImageProvider(status({ house_left: 0, own: { connected: true, key_hint: 'sk-…9' } }))).toMatchObject({ ok: true, source: 'own' });
  });
});

describe('dataUrlToFile', () => {
  const b64 = (s: string) => btoa(s);
  it('turns a generated image into a file of the same type and bytes', async () => {
    const file = dataUrlToFile(`data:image/webp;base64,${b64('RIFFwebp')}`, 'cover');
    expect(file.type).toBe('image/webp');
    expect(file.name).toBe('cover.webp');
    expect(file.size).toBe(8);
  });
  it('knows png and jpeg too', () => {
    expect(dataUrlToFile(`data:image/png;base64,${b64('x')}`, 'a').name).toBe('a.png');
    expect(dataUrlToFile(`data:image/jpeg;base64,${b64('x')}`, 'a').name).toBe('a.jpg');
  });
  it('refuses the free test placeholder (an SVG), which is not something to keep as a cover', () => {
    expect(() => dataUrlToFile(`data:image/svg+xml;base64,${b64('<svg/>')}`, 'a')).toThrow(/test image/i);
  });
  it('refuses anything that is not an image data URL', () => {
    expect(() => dataUrlToFile('https://example.com/a.webp', 'a')).toThrow();
    expect(() => dataUrlToFile('data:text/html;base64,PGI+', 'a')).toThrow();
  });
});
