/**
 * The R³ house style is required on a Guardian's profile image: one of the house avatars, or an uploaded photo
 * converted to the house style. The converted upload's URL is saved in social_links.avatar_house_url (on the profile
 * and on each brand), so the flag only counts while that exact image is still the avatar. `house` may be one URL or
 * every converted URL the Guardian has: each conversion is a new upload with its own URL.
 */
export const HOUSE_AVATARS = [
  { name: 'Guardian', image: '/images/guides/avatars/guardian.png' },
  { name: 'Woman', image: '/images/guides/avatars/woman.png' },
  { name: 'Man', image: '/images/guides/avatars/man.png' },
  { name: 'Grandmother', image: '/images/guides/avatars/grandmother.png' },
  { name: 'Grandfather', image: '/images/guides/avatars/grandfather.png' },
];

export const HOUSE_STYLE_REQUIRED = 'Your profile image must be in the R³ house style: convert your photo or choose a house avatar.';

type HouseUrls = string | null | undefined | readonly string[];
const isConverted = (avatarUrl: string, house: HouseUrls) => (typeof house === 'string' || house == null ? avatarUrl === house : house.includes(avatarUrl));

export function isHouseStyleAvatar(avatarUrl: string | null | undefined, house: HouseUrls): boolean {
  if (!avatarUrl) return false;
  return HOUSE_AVATARS.some((avatar) => avatar.image === avatarUrl) || isConverted(avatarUrl, house);
}

/** The value to save as avatar_house_url: the converted upload while it is still the avatar, else ''. */
export const houseAvatarFlag = (avatarUrl: string | null | undefined, house: HouseUrls) =>
  avatarUrl && isConverted(avatarUrl, house) ? avatarUrl : '';
