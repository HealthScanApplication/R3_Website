/**
 * Which default avatar a person gets when they have no photo of their own.
 *
 * John, 2026-10-05: "lets have 10 images as draft avatars so if a young girl have
 * that avatar, grandpa and so on". One generic silhouette for everyone made a
 * five-year-old and her grandfather look the same; this picks from ten by what the
 * profile knows — age first, then gender, with the relation as a fallback.
 *
 * Pure on purpose: no React, no assets. The images live in src/assets/avatars/ and
 * are registered by key in src/assets/avatars/index.ts, so replacing the draft art
 * is a file swap, not a code change.
 *
 * ── Two rules that matter more than the table ──────────────────────────────────
 * 1. NEVER GUESS A GENDER. A profile with an age and no gender gets the neutral
 *    avatar, not a coin flip. A wrong guess on a child's face is worse than a
 *    plain one. (Babies are the exception only because there is no gendered baby
 *    avatar to get wrong.)
 * 2. A GRANDPARENT IS DECIDED BY THE RELATION FIRST. "Grandfather" aged 58 is
 *    still a grandfather; age alone would call him a man. The relation column
 *    exists on staging but not on every database, so age 65+ is the fallback.
 */

export type AvatarKey =
  | 'baby'
  | 'child-girl'
  | 'child-boy'
  | 'teen-girl'
  | 'teen-boy'
  | 'woman'
  | 'man'
  | 'grandma'
  | 'grandpa'
  | 'neutral';

/** In display order — also the order the README and the draft sheet list them. */
export const AVATAR_KEYS: readonly AvatarKey[] = [
  'baby',
  'child-girl',
  'child-boy',
  'teen-girl',
  'teen-boy',
  'woman',
  'man',
  'grandma',
  'grandpa',
  'neutral',
];

export interface AvatarMember {
  age?: number | null;
  /** `'male' | 'female'` in the database; anything else reads as unknown. */
  gender?: string | null;
  relation?: string | null;
}

/** The ages at which the picture changes. Inclusive lower bounds. */
export const AGE_BANDS = { child: 3, teen: 13, adult: 18, grandparent: 65 } as const;

const GRANDMA = /\b(grand(mother|ma|mum|mom|mama)|gran|granny|nan|nana|nanny|nonna|oma|babcia|abuela|mamie|av[oó]|vov[oó]|grand-?m[eè]re)\b/i;
const GRANDPA = /\b(grand(father|pa|dad|papa)|grandad|gramps|opa|nonno|dziadek|abuelo|papy|av[oô]|vov[oô]|grand-?p[eè]re)\b/i;
const BABY = /\b(baby|infant|newborn|toddler|dziecko|beb[eé])\b/i;
const FEMALE_REL = /\b(mother|mom|mum|mama|wife|daughter|sister|aunt|auntie|niece|girlfriend|matka|c[oó]rka|siostra|madre|hija|hermana|m[eè]re|fille|soeur|mutter|tochter|schwester)\b/i;
const MALE_REL = /\b(father|dad|daddy|papa|husband|son|brother|uncle|nephew|boyfriend|ojciec|syn|brat|padre|hijo|hermano|p[eè]re|fils|fr[eè]re|vater|sohn|bruder)\b/i;
const YOUNG_REL = /\b(son|daughter|child|kid|syn|c[oó]rka|dziecko|hijo|hija|fils|fille|sohn|tochter)\b/i;

export type Gender = 'f' | 'm';

/** The stored spelling only — also the cycle sections' gender gate. Never the relation. */
export function readGender(raw: string | null | undefined): Gender | null {
  const g = (raw ?? '').trim().toLowerCase();
  if (g === 'female' || g === 'f' || g === 'woman' || g === 'girl') return 'f';
  if (g === 'male' || g === 'm' || g === 'man' || g === 'boy') return 'm';
  return null;
}

function genderFromRelation(relation: string): Gender | null {
  const f = FEMALE_REL.test(relation);
  const m = MALE_REL.test(relation);
  if (f === m) return null; // neither, or contradictory — do not guess
  return f ? 'f' : 'm';
}

function readAge(raw: number | null | undefined): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

/** The three facts the picture is chosen from, lifted off any profile-shaped row. */
export function avatarFactsOf(
  p: { age?: number | null; gender?: string | null; relation?: string | null } | null | undefined,
): AvatarMember {
  return { age: p?.age ?? null, gender: p?.gender ?? null, relation: p?.relation ?? null };
}

/** True when the profile carries anything the picture could be chosen from. */
export function hasAvatarSignal(member: AvatarMember | null | undefined): boolean {
  if (!member) return false;
  return (
    readAge(member.age) !== null
    || readGender(member.gender) !== null
    || (member.relation ?? '').trim().length > 0
  );
}

export function defaultAvatarKeyFor(member: AvatarMember | null | undefined): AvatarKey {
  if (!member) return 'neutral';

  const age = readAge(member.age);
  const relation = (member.relation ?? '').trim();
  const gender: Gender | null = readGender(member.gender) ?? genderFromRelation(relation);

  // Rule 2: the relation decides a grandparent before any age does.
  if (GRANDMA.test(relation)) return 'grandma';
  if (GRANDPA.test(relation)) return 'grandpa';

  if (age !== null) {
    if (age < AGE_BANDS.child) return 'baby';
    if (gender === null) return 'neutral'; // Rule 1
    const f = gender === 'f';
    if (age < AGE_BANDS.teen) return f ? 'child-girl' : 'child-boy';
    if (age < AGE_BANDS.adult) return f ? 'teen-girl' : 'teen-boy';
    if (age >= AGE_BANDS.grandparent) return f ? 'grandma' : 'grandpa';
    return f ? 'woman' : 'man';
  }

  // No age on file: the relation is all there is.
  if (BABY.test(relation)) return 'baby';
  if (gender === null) return 'neutral';
  if (YOUNG_REL.test(relation)) return gender === 'f' ? 'child-girl' : 'child-boy';
  return gender === 'f' ? 'woman' : 'man';
}
