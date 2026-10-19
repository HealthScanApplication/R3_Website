// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { ensureBrandFont, googleFontHref } from '../brandKit';

it('resolves once the font stylesheet loads, shares one load per family, and never hangs on errors', async () => {
  let done = false;
  const first = ensureBrandFont('Lora').then(() => { done = true; });
  expect(ensureBrandFont('Lora')).toBe(ensureBrandFont('Lora')); // one shared load
  const link = document.querySelector<HTMLLinkElement>(`link[href="${googleFontHref('Lora')}"]`)!;
  expect(link).toBeTruthy();
  await Promise.resolve();
  expect(done).toBe(false);                     // waits for the stylesheet…
  link.dispatchEvent(new Event('load'));
  await first;
  expect(done).toBe(true);                      // …then resolves
  const failing = ensureBrandFont('Fraunces');
  document.querySelector<HTMLLinkElement>(`link[href="${googleFontHref('Fraunces')}"]`)!.dispatchEvent(new Event('error'));
  await expect(failing).resolves.toBeUndefined(); // a blocked font falls back instead of hanging the draw
  await expect(ensureBrandFont('Comic Sans')).resolves.toBeUndefined(); // not in the list: no request
  expect(document.querySelectorAll('link[href*="Comic"]').length).toBe(0);
});
