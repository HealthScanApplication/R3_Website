import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { qrLink } from '../../components/guides/ContentStudio';

describe('post QR link', () => {
  it('shortens a Guardian page to the upper-case /G/ link', () => {
    expect(qrLink('/guardians/john-ferreira')).toBe('HTTPS://ROUTINE3.COM/G/JOHN-FERREIRA');
    expect(qrLink('https://routine3.com/guardians/calm-co')).toBe('HTTPS://ROUTINE3.COM/G/CALM-CO');
  });
  it('leaves other links as they are', () => {
    expect(qrLink('/guardians/john-ferreira/value-ramp/sleep-1')).toBe('https://routine3.com/guardians/john-ferreira/value-ramp/sleep-1');
    expect(qrLink('https://example.com/Page')).toBe('https://example.com/Page');
  });
  it('is a coarser code than the long link', () => {
    const version = (t: string) => QRCode.create(t, { errorCorrectionLevel: 'Q' }).version;
    expect(version(qrLink('/guardians/john-ferreira'))).toBe(3);
    expect(version('https://routine3.com/guardians/john-ferreira')).toBe(4);
  });
});
