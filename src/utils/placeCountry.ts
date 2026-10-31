/*
 * The country a place is in, worked out from the words around it, for the flag on an event or retreat. An event's location is
 * often just a venue ("Rots Church, 25 Lelie Street") while its title carries the city and country ("Cape Town, South Africa"), so
 * callers pass every line they have and the LAST country that appears wins (an address ends with its country).
 *
 * A plain lookup of country names, common aliases, the places events actually happen, and US / Australian / Canadian regions.
 * Anything it does not recognise returns null and the card shows no flag, never a wrong one.
 */

export interface PlaceCountry { code: string; name: string; flag: string }

const COUNTRIES: Array<[code: string, name: string, aliases: string[]]> = [
  ['AU', 'Australia', ['australia', 'nsw', 'new south wales', 'queensland', 'qld', 'victoria, australia', 'tasmania', 'western australia', 'south australia', 'northern territory', 'act', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'gold coast', 'sunshine coast', 'byron bay', 'mangrove mountain', 'central coast']],
  ['US', 'United States', ['usa', 'u.s.a', 'u.s.', 'united states', 'united states of america', 'america', 'north carolina', 'south carolina', 'california', 'texas', 'florida', 'new york', 'tennessee', 'georgia, usa', 'virginia', 'ohio', 'arizona', 'colorado', 'oregon', 'washington state', 'utah', 'nevada', 'michigan', 'illinois', 'pennsylvania', 'massachusetts', 'los angeles', 'las vegas', 'chicago', 'nashville']],
  ['GB', 'United Kingdom', ['uk', 'u.k.', 'united kingdom', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'bristol', 'leeds']],
  ['IE', 'Ireland', ['ireland', 'dublin', 'cork', 'galway']],
  ['CA', 'Canada', ['canada', 'ontario', 'british columbia', 'alberta', 'quebec', 'toronto', 'vancouver', 'calgary', 'montreal']],
  ['NZ', 'New Zealand', ['new zealand', 'auckland', 'wellington', 'christchurch', 'queenstown']],
  ['ZA', 'South Africa', ['south africa', 'cape town', 'johannesburg', 'durban', 'pretoria', 'protea hoogte']],
  ['AE', 'United Arab Emirates', ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'sharjah']],
  ['IN', 'India', ['india', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'kolkata']],
  ['SG', 'Singapore', ['singapore']],
  ['MY', 'Malaysia', ['malaysia', 'kuala lumpur']],
  ['TH', 'Thailand', ['thailand', 'bangkok', 'phuket', 'chiang mai']],
  ['ID', 'Indonesia', ['indonesia', 'bali', 'jakarta', 'ubud']],
  ['JP', 'Japan', ['japan', 'tokyo', 'osaka', 'kyoto']],
  ['CN', 'China', ['china', 'beijing', 'shanghai', 'hong kong', 'shenzhen']],
  ['PH', 'Philippines', ['philippines', 'manila', 'cebu']],
  ['DE', 'Germany', ['germany', 'deutschland', 'berlin', 'munich', 'hamburg', 'frankfurt']],
  ['FR', 'France', ['france', 'paris', 'lyon', 'marseille', 'nice']],
  ['ES', 'Spain', ['spain', 'madrid', 'barcelona', 'valencia', 'seville']],
  ['IT', 'Italy', ['italy', 'rome', 'milan', 'florence', 'venice']],
  ['PT', 'Portugal', ['portugal', 'lisbon', 'porto']],
  ['NL', 'Netherlands', ['netherlands', 'amsterdam', 'rotterdam']],
  ['CH', 'Switzerland', ['switzerland', 'zurich', 'geneva']],
  ['AT', 'Austria', ['austria', 'vienna']],
  ['SE', 'Sweden', ['sweden', 'stockholm']],
  ['NO', 'Norway', ['norway', 'oslo']],
  ['DK', 'Denmark', ['denmark', 'copenhagen']],
  ['FI', 'Finland', ['finland', 'helsinki']],
  ['PL', 'Poland', ['poland', 'warsaw', 'krakow', 'gdansk']],
  ['GR', 'Greece', ['greece', 'athens']],
  ['TR', 'Turkey', ['turkey', 'türkiye', 'istanbul']],
  ['IL', 'Israel', ['israel', 'tel aviv', 'jerusalem']],
  ['EG', 'Egypt', ['egypt', 'cairo']],
  ['MX', 'Mexico', ['mexico', 'cancun', 'mexico city']],
  ['BR', 'Brazil', ['brazil', 'brasil', 'sao paulo', 'são paulo', 'rio de janeiro']],
  ['AR', 'Argentina', ['argentina', 'buenos aires']],
  ['KE', 'Kenya', ['kenya', 'nairobi']],
  ['NG', 'Nigeria', ['nigeria', 'lagos']],
];

const norm = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9ãçéíóúü'.]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** A country flag emoji from its two-letter code. */
export const flagEmoji = (code: string): string => code.toUpperCase().replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));

// Longest alias first, so "united arab emirates" is found before anything shorter inside it, and "new york" before "york".
const INDEX = COUNTRIES.flatMap(([code, name, aliases]) => aliases.map((alias) => ({ code, name, alias: ` ${alias.replace(/[^a-z0-9ãçéíóúü'. ]+/g, ' ').replace(/\s+/g, ' ').trim()} ` }))).sort((a, b) => b.alias.length - a.alias.length);

/** The country named last across the given lines (title, venue, location, in any order), or null. */
export function countryForPlace(...lines: Array<string | null | undefined>): PlaceCountry | null {
  let best: { at: number; code: string; name: string } | null = null;
  const text = norm(lines.filter(Boolean).join(' , '));
  for (const entry of INDEX) {
    const at = text.lastIndexOf(entry.alias);
    if (at < 0) continue;
    // The place named last is the more specific end of an address; between aliases that start at the same spot the longer one was found first.
    if (!best || at > best.at) best = { at, code: entry.code, name: entry.name };
  }
  return best ? { code: best.code, name: best.name, flag: flagEmoji(best.code) } : null;
}

/** The text sent to a map: each distinct line once, in order, so a venue gets its city and country from the title. */
export function mapQueryFor(...lines: Array<string | null | undefined>): string {
  let parts: string[] = [];
  for (const line of lines) {
    const text = (line || '').trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    // A line already contained in another (a venue repeated inside a location) adds nothing; a line that contains earlier ones replaces them.
    if (parts.some((part) => part.toLowerCase().includes(lower))) continue;
    parts = parts.filter((part) => !lower.includes(part.toLowerCase()));
    parts.push(text);
  }
  return parts.join(', ').slice(0, 200);
}
