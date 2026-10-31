// The `guardian-images` Edge Function's pure parts: request shaping, prices, key encryption. No network, no credit.
import { describe, expect, it } from 'vitest';
import * as gi from '../../../supabase/functions/guardian-images/lib';
import { priceLabel } from '../guardianImages';

const ENC = Buffer.alloc(32, 9).toString('base64');

describe('guardian-images lib', () => {
  it('shapes an OpenAI request at the nearest size, with the price', () => {
    const r = gi.shapeImageRequest({ prompt: '  A calm   evening at home.\nComposition: subject upper right. ', aspect_ratio: '9:16', quality: 'medium', source: 'house' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({ model: 'gpt-image-2', prompt: 'A calm evening at home.\nComposition: subject upper right.', size: '1024x1536', quality: 'medium', n: 1, output_format: 'webp', moderation: 'auto' });
    expect(r.usd).toBe(0.063);
    expect(gi.shapeImageRequest({ prompt: 'A square scene of morning light.', aspect_ratio: '1:1', quality: 'low', source: 'own' })).toMatchObject({ ok: true, usd: 0.011, body: { size: '1024x1024' } });
    expect(gi.shapeImageRequest({ prompt: 'A wide scene of morning light.', aspect_ratio: '16:9', source: 'own' })).toMatchObject({ ok: true, quality: 'medium', body: { size: '1536x1024' } });
  });
  it('rejects what the browser should not be able to ask for', () => {
    expect(gi.shapeImageRequest({ prompt: 'short', aspect_ratio: '9:16', source: 'house' }).ok).toBe(false);
    expect(gi.shapeImageRequest({ prompt: 'x'.repeat(gi.PROMPT_MAX + 1), aspect_ratio: '9:16', source: 'house' }).ok).toBe(false);
    expect(gi.shapeImageRequest({ prompt: 'A calm evening at home.', aspect_ratio: '3:2', source: 'house' }).ok).toBe(false);
    expect(gi.shapeImageRequest({ prompt: 'A calm evening at home.', aspect_ratio: '9:16', source: 'someone-else' }).ok).toBe(false);
    expect(gi.shapeImageRequest({ prompt: 'A calm evening at home.', aspect_ratio: '9:16', quality: 'ultra', source: 'house' })).toMatchObject({ ok: true, quality: 'medium' });
  });
  it('shapes a circle-safe house avatar edit without changing identity', () => {
    const result = gi.shapeAvatarRequest({ image_url: 'https://cdn.example/portrait.jpg', name: "Barbara O'Neill", source: 'house' });
    expect(result).toMatchObject({ ok: true, aspect: '1:1', quality: 'medium', usd: 0.042, size: '1024x1024' });
    if (!result.ok) return;
    expect(result.prompt).toContain("Barbara O'Neill");
    expect(result.prompt).toContain("Preserve the person's identity");
    expect(result.prompt).toContain('circle-safe');
    expect(gi.shapeAvatarRequest({ image_url: 'http://private.test/avatar.jpg', source: 'house' }).ok).toBe(false);
    expect(gi.shapeAvatarRequest({ image_url: 'https://cdn.example/avatar.jpg', source: 'other' }).ok).toBe(false);
  });
  it('recognises OpenAI keys and only ever shows a hint', () => {
    expect(gi.looksLikeOpenAIKey('sk-proj-abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
    expect(gi.looksLikeOpenAIKey('pk_live_abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(gi.keyHint('sk-proj-abcdefghijklmnopqrstuvwxyz1234')).toBe('sk-…1234');
  });
  it('encrypts the key bound to the user', async () => {
    const sealed = await gi.encryptKey('sk-proj-secret-secret-secret-0000', 'user-1', ENC);
    expect(sealed.ciphertext).not.toContain('secret');
    const row = { credentials_ciphertext: sealed.ciphertext, credentials_iv: sealed.iv };
    expect(await gi.decryptKey(row, 'user-1', ENC)).toBe('sk-proj-secret-secret-secret-0000');
    await expect(gi.decryptKey(row, 'user-2', ENC)).rejects.toThrow();
  });
  it('turns OpenAI errors into plain sentences', () => {
    expect(gi.friendlyOpenAIError(401, {})).toMatch(/did not accept/);
    expect(gi.friendlyOpenAIError(429, { error: { code: 'insufficient_quota' } })).toMatch(/no credit/);
    expect(gi.friendlyOpenAIError(400, { error: { code: 'moderation_blocked' } })).toMatch(/declined/);
    expect(gi.friendlyOpenAIError(400, { error: { message: "Invalid value: 'medium'. Supported values are: 'low'." } })).toBe("Image generation failed (400): Invalid value: 'medium'. Supported values are: 'low'.");
    expect(gi.friendlyOpenAIError(400, { error: { message: 'bad key sk-proj-abcdef1234567890 here' } })).not.toMatch(/sk-proj/);
    expect(gi.friendlyOpenAIError(500, { error: { message: 'internal detail' } })).toBe('Image generation failed (500).');
  });
  it('test mode returns a placeholder image, no network', () => {
    expect(gi.mockImage('4:5')).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(atob(gi.mockImage('4:5').split(',')[1])).toContain('width="1024" height="1536"');
  });
  it('labels the price per aspect and quality', () => {
    expect(priceLabel(gi.PRICE_USD, '9:16', 'medium')).toBe('≈ $0.063');
    expect(priceLabel(gi.PRICE_USD, '1:1', 'high')).toBe('≈ $0.17');
    expect(priceLabel(undefined, '1:1', 'high')).toBe('');
  });
});

import { pickModel, DEFAULT_MODEL } from '../../../supabase/functions/guardian-images/lib';
it('only accepts the model the price list belongs to', () => {
  expect(DEFAULT_MODEL).toBe('gpt-image-2');
  expect(pickModel('gpt-image-2')).toBe('gpt-image-2');
  expect(pickModel('gpt-image-1')).toBe(DEFAULT_MODEL); // shut down by OpenAI on 2026-10-23
  expect(pickModel('gpt-image-1.5')).toBe(DEFAULT_MODEL);
  expect(pickModel(undefined)).toBe(DEFAULT_MODEL);
});
