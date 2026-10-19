// Safe zones on Content builder posts: the composition brief sent to image models, and how library photos are
// mirrored / moved so their subject (from src/data/contentImageZones.json) clears the text package and QR.
import { describe, expect, it } from 'vitest';
import { imagePrompt } from '../brandBrief';
import { AS_IS, IMAGE_ZONES, compositionBrief, layoutZones, legacyPlacement, onFrame, overlap, placeBackground, type ImageZones } from '../postLayout';

const fake = (subject: ImageZones['subject']): Record<string, ImageZones> => ({ pic: { w: 1080, h: 1920, label: 'test', subject, photo: { x: 0, y: 0, w: 1, h: 0.6 }, grid: [], luma: [] } });

describe('layoutZones', () => {
  it('puts the text on its side and the QR in the opposite corner', () => {
    const bl = layoutZones('story', 'bottom-left');
    expect(bl.text.x).toBe(0);
    expect(bl.text.y).toBeGreaterThan(0.5);
    expect(bl.qr!.x).toBeGreaterThan(0.7); // top right
    expect(bl.qr!.y).toBeLessThan(0.1);
    const tr = layoutZones('story', 'top-right');
    expect(tr.text.x + tr.text.w).toBeCloseTo(1);
    expect(tr.text.y).toBeLessThan(0.2);
    expect(tr.qr!.x).toBeLessThan(0.1); // bottom left
    expect(tr.qr!.y + tr.qr!.h).toBeGreaterThan(0.9);
  });
  it('never overlaps text and QR, in any format or position', () => {
    for (const f of ['story', 'post', 'square', 'thumb'] as const) for (const p of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const z = layoutZones(f, p, size);
        expect(overlap(z.text, z.qr!), `${f} ${p} ${size}`).toBe(0);
        for (const r of [z.text, z.qr!]) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(1.0001); expect(r.y + r.h).toBeLessThanOrEqual(1.0001); }
      }
    }
  });
  it('drops the QR zone when there is no QR', () => expect(layoutZones('post', 'bottom-left', null).qr).toBeNull());
  it('uses a narrower text column on 16:9', () => expect(layoutZones('thumb', 'bottom-left').text.w).toBeLessThan(0.5));
});

describe('compositionBrief / image prompt', () => {
  it('asks for the subject opposite the text and calm space where the text goes', () => {
    const b = compositionBrief('story', 'bottom-left');
    expect(b).toMatch(/9:16 frame/);
    expect(b).toMatch(/subject in the upper \d+% of the frame, leaning right/);
    expect(b).toMatch(/Keep the lower left .* calm and uncluttered/);
    expect(b).toMatch(/upper right corner plain too, for a small QR code/);
  });
  it('flips for top-right text', () => {
    const b = compositionBrief('post', 'top-right');
    expect(b).toMatch(/4:5 frame: place the main subject in the lower \d+% of the frame, leaning left/);
    expect(b).toMatch(/Keep the upper right/);
    expect(b).toMatch(/lower left corner plain/);
  });
  it('splits left / right on 16:9', () => {
    expect(compositionBrief('thumb', 'bottom-left')).toMatch(/subject in the right half/);
    expect(compositionBrief('thumb', 'top-right')).toMatch(/subject in the left half/);
  });
  it('leaves out the QR line without a QR', () => expect(compositionBrief('square', 'bottom-left', false)).not.toMatch(/QR/));
  it('replaces the generic lower-third line in imagePrompt and keeps the brand language', () => {
    const layout = compositionBrief('story', 'top-left');
    const p = imagePrompt({ brandName: 'Calm Co', audience: 'New mothers', focus: 'Sleep problems', format: '9:16 (TikTok)', layout, kit: { visual: 'Soft linen tones', ctaMode: 'mono', mono: 'black_on_white' } as any });
    expect(p).toContain(layout);
    expect(p).not.toMatch(/lower third/);
    expect(p).toMatch(/Visual language: Soft linen tones/);
    expect(p).toMatch(/No text, logos or watermarks/);
    expect(imagePrompt({ audience: 'Everyone', focus: 'Energy', format: '1:1' })).toMatch(/lower third/); // unchanged default
  });
});

describe('placeBackground', () => {
  it('keeps the old rules as the fallback for unknown images', () => {
    expect(placeBackground('nope', 'story', 'top-right')).toMatchObject({ ...legacyPlacement('story', 'top-right'), fit: 'ok' });
    expect(legacyPlacement('story', 'bottom-left')).toEqual({ mirror: false, shift: 0, nudge: false });
    expect(legacyPlacement('post', 'top-left')).toEqual({ mirror: false, shift: 0.3, nudge: false });
    expect(legacyPlacement('thumb', 'top-right')).toEqual({ mirror: true, shift: 0, nudge: true });
  });
  it('mirrors a subject that sits on the text side, and leaves one already clear alone', () => {
    const left = fake({ x: 0.05, y: 0.35, w: 0.3, h: 0.35 }); // low on the left, into a bottom-left text block
    expect(placeBackground('pic', 'story', 'bottom-left', left)).toMatchObject({ mirror: true, shift: 0 });
    const right = fake({ x: 0.3, y: 0.15, w: 0.4, h: 0.35 }); // between text band and QR: untouched wins the tie
    expect(placeBackground('pic', 'story', 'bottom-left', right)).toMatchObject({ mirror: false, shift: 0, fit: 'good' });
  });
  it('moves the photo down under a band for top text when that clears the subject', () => {
    const p = placeBackground('pic', 'story', 'top-left', fake({ x: 0.1, y: 0.05, w: 0.8, h: 0.45 }));
    expect(p.shift).toBeGreaterThan(0);
    expect(p.fit).not.toBe('poor');
  });
  it('maps a subject onto the frame the way drawPost draws it', () => {
    const r = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    const same = onFrame(r, { w: 1080, h: 1920 }, 'story', AS_IS); // same aspect: unchanged
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(same[k]).toBeCloseTo(r[k]);
    const m = onFrame(r, { w: 1080, h: 1920 }, 'story', { ...AS_IS, mirror: true });
    expect(m.x).toBeCloseTo(0.7);
    const shifted = onFrame(r, { w: 1080, h: 1920 }, 'story', { mirror: false, shift: 0.38, nudge: false });
    expect(shifted.y).toBeCloseTo(0.48);
  });
  it('has metadata for every library photo, and clears 9:16 bottom text for all of them', () => {
    expect(Object.keys(IMAGE_ZONES).length).toBeGreaterThanOrEqual(18);
    for (const [file, z] of Object.entries(IMAGE_ZONES)) {
      expect(z.subject.w * z.subject.h, file).toBeGreaterThan(0);
      expect(z.grid).toHaveLength(9);
      expect(placeBackground(file, 'story', 'bottom-left').fit, file).not.toBe('poor');
    }
  });
});
