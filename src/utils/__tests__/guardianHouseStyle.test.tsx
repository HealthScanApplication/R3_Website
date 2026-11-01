// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const convert = vi.fn();
const upload = vi.fn();
vi.mock('../guardianImages', () => ({
  convertGuardianAvatar: (...args: unknown[]) => convert(...args),
  generatedImageFile: () => new File(['x'], 'guardian-avatar.webp', { type: 'image/webp' }),
}));
vi.mock('../chromaKey', () => ({ removeGreenBackground: async (image: string) => image }));
vi.mock('../guidePortal', () => ({ uploadGuideImage: (...args: unknown[]) => upload(...args) }));
import { HOUSE_AVATARS, HOUSE_STYLE_REQUIRED, houseAvatarFlag, isHouseStyleAvatar } from '../guardianHouseStyle';
import { HouseAvatarReview } from '../../components/guides/HouseAvatarReview';

beforeEach(() => { convert.mockReset(); upload.mockReset(); });
afterEach(cleanup);

describe('the R³ house-style rule', () => {
  it('accepts every house avatar', () => {
    for (const avatar of HOUSE_AVATARS) expect(isHouseStyleAvatar(avatar.image, null)).toBe(true);
  });

  it('accepts an upload only while it is the image that was converted', () => {
    const converted = 'https://cdn.example/guardian-avatar.webp';
    expect(isHouseStyleAvatar(converted, converted)).toBe(true);
    expect(isHouseStyleAvatar('https://cdn.example/raw-photo.jpg', converted)).toBe(false);
    expect(isHouseStyleAvatar('https://cdn.example/raw-photo.jpg', null)).toBe(false);
  });

  it('a missing image is not house style', () => {
    expect(isHouseStyleAvatar(null, null)).toBe(false);
    expect(isHouseStyleAvatar('', '')).toBe(false);
  });

  it('saves the flag only for a converted upload that is still the avatar', () => {
    expect(houseAvatarFlag('https://cdn.example/a.webp', 'https://cdn.example/a.webp')).toBe('https://cdn.example/a.webp');
    expect(houseAvatarFlag('https://cdn.example/raw.jpg', 'https://cdn.example/a.webp')).toBe('');
    expect(houseAvatarFlag(HOUSE_AVATARS[0].image, null)).toBe('');
  });

  it('says what to do', () => {
    expect(HOUSE_STYLE_REQUIRED).toMatch(/R³ house style/);
    expect(HOUSE_STYLE_REQUIRED).toMatch(/house avatar/);
  });
});

describe('HouseAvatarReview', () => {
  it('converts the photo, shows both, and applies the uploaded house-style image', async () => {
    convert.mockResolvedValue({ image: 'data:image/webp;base64,eA==', mock: false });
    upload.mockResolvedValue('https://cdn.example/guardian-avatar.webp');
    const onApplied = vi.fn();
    render(<HouseAvatarReview userId="u1" name="Ana" source="https://cdn.example/raw.jpg" onApplied={onApplied} onCancel={() => {}} />);
    expect(convert).toHaveBeenCalledWith('https://cdn.example/raw.jpg', 'Ana');
    expect(await screen.findByAltText('R3 house-style avatar preview')).toBeTruthy();
    expect(screen.getByAltText('Original portrait').getAttribute('src')).toBe('https://cdn.example/raw.jpg');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use this avatar' })); });
    expect(upload).toHaveBeenCalledWith('u1', expect.any(File));
    expect(onApplied).toHaveBeenCalledWith('https://cdn.example/guardian-avatar.webp');
  });

  it('shows the error and lets the Guardian try again', async () => {
    convert.mockRejectedValueOnce(new Error('Image service is busy.')).mockResolvedValueOnce({ image: 'data:image/svg+xml;base64,eA==', mock: true });
    render(<HouseAvatarReview userId="u1" name="Ana" source="https://cdn.example/raw.jpg" onApplied={() => {}} onCancel={() => {}} />);
    expect(await screen.findByText('Image service is busy.')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(convert).toHaveBeenCalledTimes(2);
    expect(await screen.findByAltText('R3 house-style avatar preview')).toBeTruthy();
    // A test-mode placeholder cannot be saved as the avatar.
    expect((screen.getByRole('button', { name: 'Use this avatar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
