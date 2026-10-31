/**
 * The tags on a protocol card: its category (Hygiene, Fitness, …), who it is for (Women, Men) and the ages it is for.
 * Read from what the protocol actually carries: its category and tags, `target_gender`, `target_age_min / max`, and the
 * "Population:" / "Age:" lines the builder writes into the description. A tag that has no data behind it is left out;
 * nothing is guessed from a name.
 */
export const PROTOCOL_THEMES = ['Diet', 'Fitness', 'Hygiene', 'Beauty', 'Wellness', 'Detox', 'Longevity', 'Other'] as const;
export type ProtocolTheme = typeof PROTOCOL_THEMES[number];

export interface ProtocolTag { label: string; kind: 'category' | 'gender' | 'age' }

export interface ProtocolTagSource {
  category?: string | null;
  tags?: string[] | null;
  name?: string | null;
  description?: string | null;
  builder_kind?: string | null;
  target_gender?: string | null;
  target_age_min?: number | null;
  target_age_max?: number | null;
}

/** Category words, in the order they win: the first row that matches is the theme. */
const THEME_BY_CATEGORY: Array<[ProtocolTheme, RegExp]> = [
  ['Diet', /diet|nutrition|meal/],
  ['Fitness', /fitness|strength|cardio|hiit|recovery|mobility|workout/],
  ['Hygiene', /hygiene|oral|dental/],
  ['Beauty', /beauty|skin|hair/],
  ['Detox', /detox|cleanse/],
  ['Longevity', /longevity|performance/],
  ['Wellness', /wellness|health|sleep|mind/],
];
/** A tag that is, on its own, a theme. Whole words only: "recovery" or "morning" says nothing about the subject. */
const THEME_BY_TAG: Array<[ProtocolTheme, RegExp]> = [
  ['Diet', /^(diet|nutrition|meals?|recipes?)$/],
  ['Fitness', /^(fitness|strength|cardio|hiit|workout|mobility)$/],
  ['Hygiene', /^(hygiene|oral|dental)$/],
  ['Beauty', /^(beauty|skin|skincare|hair|k-beauty)$/],
  ['Detox', /^(detox|cleanse)$/],
  ['Longevity', /^longevity$/],
  ['Wellness', /^(wellness|health|sleep|mind)$/],
];
/** Words in a name or description, used only when neither the category nor the tags say. */
const THEME_BY_WORDS: Array<[ProtocolTheme, RegExp]> = [
  ['Diet', /\b(diet|meal|recipe|nutrition|eat|food|fasting)\b/],
  ['Fitness', /\b(fitness|workout|training|strength|run|gym|exercise|cardio|hiit|mobility)\b/],
  ['Detox', /\b(detox|cleanse|parasite)\b/],
  ['Beauty', /\b(skin|beauty|hair|glow)\b/],
  ['Hygiene', /\b(teeth|dental|oral|hygiene)\b/],
  ['Longevity', /\b(longevity|ageing|aging)\b/],
  ['Wellness', /\b(sleep|stress|wellness|calm|menopause)\b/],
];

const firstTheme = (rules: Array<[ProtocolTheme, RegExp]>, text: string) => rules.find(([, re]) => re.test(text))?.[0] ?? null;

/** The theme the protocol itself states: its category or builder, else the first of its tags that is a theme. */
function themeFromLabels(x: ProtocolTagSource): ProtocolTheme | null {
  const own = firstTheme(THEME_BY_CATEGORY, `${x.category || ''} ${x.builder_kind || ''}`.toLowerCase());
  if (own) return own;
  for (const tag of x.tags || []) {
    const hit = firstTheme(THEME_BY_TAG, tag.trim().toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/** A protocol's theme, for grouping: what it states, then words in its name, then in its description, then Other. */
export function protocolTheme(x: ProtocolTagSource): ProtocolTheme {
  return themeFromLabels(x)
    || firstTheme(THEME_BY_WORDS, (x.name || '').toLowerCase())
    || firstTheme(THEME_BY_WORDS, `${x.category || ''} ${x.builder_kind || ''} ${x.name || ''} ${x.description || ''}`.toLowerCase())
    || 'Other';
}

/** "1 day", "14 days". */
export const daysLabel = (days: number | null | undefined) => { const n = days && days > 0 ? days : 1; return `${n} ${n === 1 ? 'day' : 'days'}`; };

/** The part of the day a category names ("Morning", "midday"), for the card's top line. */
export function protocolWhen(category: string | null | undefined): string | null {
  const c = (category || '').trim().toLowerCase();
  return c === 'morning' ? 'Morning' : c === 'midday' ? 'Midday' : c === 'evening' ? 'Evening' : c === 'night' ? 'Night' : null;
}

const titleCase = (text: string) => text.replace(/\b\w/g, (m) => m.toUpperCase());
// Categories that name a kind of record rather than a subject: not worth a tag.
const NOT_A_SUBJECT = /^(module|program|programme|protocol|other)$/;

/** "Women" / "Men" from the description's Population line, else target_gender. Everyone, and no value, give null. */
export function genderLabel(source: Pick<ProtocolTagSource, 'target_gender' | 'description'>): string | null {
  const raw = (/Population:\s*([^.]+)\./.exec(source.description || '')?.[1] || source.target_gender || '').trim();
  const v = raw.toLowerCase();
  if (!v || /^(all|everyone|everybody|any|both|not specified|unisex)$/.test(v)) return null;
  if (/^(male|men|man|boys?)$/.test(v)) return 'Men';
  if (/^(female|women|woman|girls?)$/.test(v)) return 'Women';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** "Ages 18+", "Ages 13–19", "Up to 5": from the age columns, else the number range in the description's Age line. Null when neither says, and for "All ages". */
export function ageLabel(source: Pick<ProtocolTagSource, 'target_age_min' | 'target_age_max' | 'description'>): string | null {
  const min = typeof source.target_age_min === 'number' ? source.target_age_min : null;
  const max = typeof source.target_age_max === 'number' ? source.target_age_max : null;
  // A ceiling of 99 or more is "no upper limit".
  if (min !== null && (max === null || max >= 99)) return `Ages ${min}+`;
  if (min !== null && max !== null) return `Ages ${min}–${max}`;
  if (max !== null) return `Up to ${max}`;
  // The builder's own age options: "Adults 45–64", "Women 45–64", "Teens 13–17", "Infants 0–1", "Adults 65+", "All ages", "All childhood".
  const line = /Age:\s*([^.]+)\./.exec(source.description || '')?.[1]?.trim() || '';
  const range = /(\d+)\s*(?:[–-]\s*(\d+)|(\+))/.exec(line);
  return range ? (range[3] ? `Ages ${range[1]}+` : `Ages ${range[1]}–${range[2]}`) : null;
}

/** Who it is for: gender, then age. */
export function audienceTags(source: ProtocolTagSource): ProtocolTag[] {
  const gender = genderLabel(source), age = ageLabel(source);
  return [...(gender ? [{ label: gender, kind: 'gender' as const }] : []), ...(age ? [{ label: age, kind: 'age' as const }] : [])];
}

/**
 * Category, gender and age as tags. The category is the theme the protocol states (its category or tags) or its name
 * says; otherwise its own category word. A theme guessed from the description is not used: a tag is only shown when the
 * data behind it is plain. `category: false` leaves the category out, for a list already grouped by theme; `label` names
 * it in the page's own words (a routine's "Strength"). Whatever the label, a kind of record ("module"), a part of the day
 * (it is on the card's top line) or a repeat of the gender ("Women" and Women) is not a tag.
 */
export function protocolTags(source: ProtocolTagSource, options: { category?: boolean; label?: string | null } = {}): ProtocolTag[] {
  const audience = audienceTags(source);
  if (options.category === false) return audience;
  const own = (source.category || '').trim();
  const label = options.label || themeFromLabels(source) || firstTheme(THEME_BY_WORDS, (source.name || '').toLowerCase()) || (own ? titleCase(own) : '');
  if (!label || NOT_A_SUBJECT.test(label.toLowerCase()) || protocolWhen(label) || audience.some((t) => t.label.toLowerCase() === label.toLowerCase())) return audience;
  return [{ label, kind: 'category' }, ...audience];
}

/**
 * The complete metadata row used by cards. Database utilities keep unknown
 * targeting as null, while the visual card explicitly communicates the broad
 * fallback so every protocol has category, gender and age context.
 */
export function completeProtocolTags(source: ProtocolTagSource, options: { category?: boolean; label?: string | null } = {}): ProtocolTag[] {
  const tags = protocolTags(source, options);
  const category = tags.some((tag) => tag.kind === 'category')
    ? tags
    : [{ label: protocolTheme(source) === 'Other' ? 'Wellness' : protocolTheme(source), kind: 'category' as const }, ...tags];
  return [
    ...category,
    ...(category.some((tag) => tag.kind === 'gender') ? [] : [{ label: 'Everyone', kind: 'gender' as const }]),
    ...(category.some((tag) => tag.kind === 'age') ? [] : [{ label: 'All ages', kind: 'age' as const }]),
  ];
}
