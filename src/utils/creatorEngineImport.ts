/*
 * Reads a Creator Engine export (Guardian export contract, version 1) and turns it into a draft for a Guardian profile.
 *
 * Creator Engine writes one JSON file per creator; this site never reads its database and never calls it. Facts cross the
 * line, decisions do not: this module checks the file, then says what it would put on the profile. The rules from the
 * contract that matter here:
 *   - only version 1 is read; any other version is refused, and so is any field the contract does not define;
 *   - there is no contact data in the file;
 *   - a file may be published only when consent.status is "agreed" and consent.at is set. Anything else is a private
 *     preview and the draft says so, so nothing built from it can go live;
 *   - a problem needs a quote, the page it came from and confirmed:true; a price is whole cents with its currency, or
 *     both null (never estimated).
 * The two sample files in __tests__/fixtures/creator-engine are Creator Engine's own and both sides test against them.
 */

export const CREATOR_EXPORT_VERSION = 1 as const;

export type ConsentStatus = 'none' | 'replied' | 'agreed';

export interface CreatorExport {
  version: 1;
  exportedAt: string;
  consent: { status: ConsentStatus; at: string | null };
  creator: { handle: string; platform: string; displayName: string; website: string | null; avatarUrl: string | null; country: string | null; language: string | null; niche: string | null };
  pocket: { title: string; audienceTotal: number | null; audienceAverage: number | null; creatorsOnFile: number | null; creatorsInPlay: number | null; openings: number | null; reachable: number | null };
  problems: { statement: string; evidenceQuote: string; evidenceUrl: string; recurrence: number | null; confirmed: true }[];
  products: { title: string; priceCents: number | null; currency: string | null; url: string }[];
  sources: { kind: string; url: string; title: string | null }[];
}

export type CreatorExportResult = { ok: true; value: CreatorExport } | { ok: false; errors: string[] };

const isObj = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const textOrNull = (value: unknown) => value === null || isText(value);
const countOrNull = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const isWebUrl = (value: unknown) => { if (!isText(value)) return false; try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; } };
const isDate = (value: unknown) => isText(value) && !Number.isNaN(Date.parse(value));

/** Checks a parsed file against version 1. Returns every problem found, not just the first. */
export function validateCreatorExport(input: unknown): CreatorExportResult {
  if (!isObj(input)) return { ok: false, errors: ['The file is not an object.'] };
  if (input.version !== CREATOR_EXPORT_VERSION) return { ok: false, errors: [`Unknown version ${String(input.version)}; this reader only knows version 1.`] };
  const errors: string[] = [];
  const bad = (message: string) => errors.push(message);
  const only = (object: Record<string, unknown>, keys: string[], where: string) => { for (const key of Object.keys(object)) if (!keys.includes(key)) bad(`${where}.${key} is not part of version 1.`); };

  only(input, ['version', 'exportedAt', 'consent', 'creator', 'pocket', 'problems', 'products', 'sources'], 'file');
  if (!isDate(input.exportedAt)) bad('exportedAt must be a date.');

  const consent = input.consent;
  if (!isObj(consent)) bad('consent is required.');
  else {
    only(consent, ['status', 'at'], 'consent');
    if (!['none', 'replied', 'agreed'].includes(consent.status as string)) bad('consent.status must be none, replied or agreed.');
    if (!(consent.at === null || isDate(consent.at))) bad('consent.at must be a date or null.');
    if (consent.status === 'agreed' && consent.at === null) bad('consent.at is required when consent is agreed.');
  }

  const creator = input.creator;
  if (!isObj(creator)) bad('creator is required.');
  else {
    only(creator, ['handle', 'platform', 'displayName', 'website', 'avatarUrl', 'country', 'language', 'niche'], 'creator');
    for (const key of ['handle', 'platform', 'displayName']) if (!isText(creator[key])) bad(`creator.${key} is required.`);
    for (const key of ['website', 'avatarUrl']) if (!(creator[key] === null || isWebUrl(creator[key]))) bad(`creator.${key} must be a web address or null.`);
    for (const key of ['country', 'language', 'niche']) if (!textOrNull(creator[key])) bad(`creator.${key} must be text or null.`);
  }

  const pocket = input.pocket;
  if (!isObj(pocket)) bad('pocket is required.');
  else {
    only(pocket, ['title', 'audienceTotal', 'audienceAverage', 'creatorsOnFile', 'creatorsInPlay', 'openings', 'reachable'], 'pocket');
    if (!isText(pocket.title)) bad('pocket.title is required.');
    for (const key of ['audienceTotal', 'audienceAverage', 'creatorsOnFile', 'creatorsInPlay', 'openings', 'reachable']) if (!countOrNull(pocket[key])) bad(`pocket.${key} must be a number or null.`);
  }

  if (!Array.isArray(input.problems)) bad('problems must be a list.');
  else input.problems.forEach((item, index) => {
    if (!isObj(item)) return bad(`problems[${index}] is not an object.`);
    only(item, ['statement', 'evidenceQuote', 'evidenceUrl', 'recurrence', 'confirmed'], `problems[${index}]`);
    if (!isText(item.statement)) bad(`problems[${index}].statement is required.`);
    if (!isText(item.evidenceQuote)) bad(`problems[${index}] has no quote: only problems with a quote are accepted.`);
    if (!isWebUrl(item.evidenceUrl)) bad(`problems[${index}] has no page: only problems with the page they came from are accepted.`);
    if (item.confirmed !== true) bad(`problems[${index}] is not confirmed.`);
    if (!countOrNull(item.recurrence)) bad(`problems[${index}].recurrence must be a number or null.`);
  });

  if (!Array.isArray(input.products)) bad('products must be a list.');
  else input.products.forEach((item, index) => {
    if (!isObj(item)) return bad(`products[${index}] is not an object.`);
    only(item, ['title', 'priceCents', 'currency', 'url'], `products[${index}]`);
    if (!isText(item.title)) bad(`products[${index}].title is required.`);
    if (!isWebUrl(item.url)) bad(`products[${index}].url must be a web address.`);
    if (!(item.priceCents === null || (Number.isInteger(item.priceCents) && (item.priceCents as number) >= 0))) bad(`products[${index}].priceCents must be whole cents or null.`);
    if (!textOrNull(item.currency)) bad(`products[${index}].currency must be text or null.`);
    if ((item.priceCents === null) !== (item.currency === null)) bad(`products[${index}] needs both a price and a currency, or neither.`);
  });

  if (!Array.isArray(input.sources)) bad('sources must be a list.');
  else input.sources.forEach((item, index) => {
    if (!isObj(item)) return bad(`sources[${index}] is not an object.`);
    only(item, ['kind', 'url', 'title'], `sources[${index}]`);
    if (!isText(item.kind)) bad(`sources[${index}].kind is required.`);
    if (!isWebUrl(item.url)) bad(`sources[${index}].url must be a web address.`);
    if (!textOrNull(item.title)) bad(`sources[${index}].title must be text or null.`);
  });

  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as CreatorExport };
}

/** The one rule about going live: only with a recorded yes. */
export const mayPublishExport = (file: CreatorExport): boolean => file.consent.status === 'agreed' && file.consent.at !== null;

export interface GuardianDraftFromExport {
  /** 'publish': the creator agreed, so a Guardian may choose to publish it. 'preview': private only, never to be published. */
  mode: 'publish' | 'preview';
  /** The draft status anything built from this must be saved with: always a draft, here, whatever the mode. */
  status: 'draft';
  profile: { handle: string; display_name: string; website: string | null; avatar_url: string | null; niche: string | null; country: string | null; language: string | null };
  /** The pocket they serve, with the numbers as Creator Engine has them. */
  pocket: CreatorExport['pocket'];
  /** Each audience problem with the words and page it came from. */
  problems: { problem: string; quote: string; sourceUrl: string; seen: number | null }[];
  /** Products as stated on their pages. A price is only present with its currency. */
  products: { title: string; url: string; price_cents: number | null; currency: string | null }[];
  links: { kind: string; url: string; title: string | null }[];
  exportedAt: string;
}

/** What importing a file would put on a Guardian profile. Reads the file; changes nothing. */
export function draftFromCreatorExport(file: CreatorExport): GuardianDraftFromExport {
  return {
    mode: mayPublishExport(file) ? 'publish' : 'preview',
    status: 'draft',
    profile: { handle: file.creator.handle, display_name: file.creator.displayName, website: file.creator.website, avatar_url: file.creator.avatarUrl, niche: file.creator.niche, country: file.creator.country, language: file.creator.language },
    pocket: file.pocket,
    problems: file.problems.map((problem) => ({ problem: problem.statement, quote: problem.evidenceQuote, sourceUrl: problem.evidenceUrl, seen: problem.recurrence })),
    products: file.products.map((product) => ({ title: product.title, url: product.url, price_cents: product.priceCents, currency: product.currency })),
    links: file.sources.map((source) => ({ ...source })),
    exportedAt: file.exportedAt,
  };
}

/** Parses the text of an export file and returns its draft, or why it was refused. */
export function readCreatorExport(text: string): { ok: true; draft: GuardianDraftFromExport } | { ok: false; errors: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, errors: ['The file is not valid JSON.'] }; }
  const checked = validateCreatorExport(parsed);
  return checked.ok ? { ok: true, draft: draftFromCreatorExport(checked.value) } : checked;
}
