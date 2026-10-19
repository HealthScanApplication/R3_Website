/*
 * Default post copy for the Content builder: a headline of at most 5 words and a subline of at most 8, written for
 * the audience and the problem (or outcome), plus the offer's own facts (its length, a recipe's ingredients and
 * time). Plain wording, no promises of results: every line describes what the person does, not what it cures.
 */

import { LIFE_STAGES } from './audienceTaxonomy';

export type CopyKind = 'offer' | 'protocol' | 'recipe' | 'none';
export interface CopyOffer { title: string; description?: string; free?: boolean; days?: number | null; ingredients?: number | null; minutes?: number | null }
export interface CopyInput { audience: string; problem: string; solution?: string; offer?: CopyOffer | null; kind?: CopyKind }
export interface PostCopyText { headline: string; subline: string; cta: string }

export const HEADLINE_MAX = 5, SUBLINE_MAX = 8;
export const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

interface Topic {
  match: RegExp;
  base: string;                        // no audience
  stage?: (stage: string) => string;   // a life stage ("menopause", "pregnancy")
  group?: (group: string) => string;   // a group ("women", "teen boys")
  outcome: string;                     // 3–4 words, for Protocols
  action: string;                      // what you do, as a short sentence
  unit?: 'nights' | 'days';
}
/** Common problems and goals, most specific first. Each pattern starts at a word boundary, so "eat" doesn't match
 *  "breath" and "back" doesn't match "feedback". */
const TOPICS: Topic[] = [
  { match: /\b(?:sleep|insomnia|night|bedtime)/i, base: 'Sleep better tonight', stage: (s) => `Sleep through ${s}`, group: (g) => `Better sleep for ${g}`, outcome: 'Better, steadier sleep', action: 'One evening routine.', unit: 'nights' },
  { match: /\b(?:menopaus|hot flush|perimenopaus)/i, base: 'Feel steadier through menopause', group: (g) => `Menopause support for ${g}`, outcome: 'Steadier through menopause', action: 'Daily habits, symptom by symptom.' },
  { match: /\b(?:stress|anxi|calm|overwhelm|burnout)/i, base: 'Make room for calm', stage: (s) => `Calmer through ${s}`, group: (g) => `Less stress for ${g}`, outcome: 'Calmer, steadier days', action: 'Five minutes a day to reset.' },
  { match: /\b(?:energy|fatigue|tired)/i, base: 'Steadier energy all day', stage: (s) => `Energy through ${s}`, group: (g) => `More energy for ${g}`, outcome: 'Steadier daily energy', action: 'Small habits, starting each morning.' },
  { match: /\b(?:gut|digest|bloat|ibs|bowel)/i, base: 'Look after your gut', stage: (s) => `Gut care through ${s}`, group: (g) => `Gut health for ${g}`, outcome: 'A more comfortable gut', action: 'Meals and habits for digestion.' },
  { match: /\b(?:weight|metabolic|metabolism)/i, base: 'Healthy weight, steady habits', stage: (s) => `Healthy weight through ${s}`, group: (g) => `Healthy weight for ${g}`, outcome: 'Steady, healthy weight habits', action: 'Daily habits, no crash diets.' },
  { match: /\b(?:skin|acne|eczema|complexion)/i, base: 'Care for your skin', stage: (s) => `Skin care through ${s}`, group: (g) => `Skin care for ${g}`, outcome: 'A calmer skin routine', action: 'A morning and evening routine.' },
  { match: /\b(?:pain|joint|back|mobility|stiff)/i, base: 'Move more comfortably', stage: (s) => `Move comfortably through ${s}`, group: (g) => `Easier movement for ${g}`, outcome: 'More comfortable movement', action: 'Gentle movement, a few minutes daily.' },
  { match: /\b(?:focus|brain fog|concentrat|adhd)/i, base: 'Clearer focus, fewer distractions', group: (g) => `Better focus for ${g}`, outcome: 'Clearer daily focus', action: 'One focus habit a day.' },
  { match: /\b(?:hydrat|water)/i, base: 'Drink enough, every day', group: (g) => `Hydration for ${g}`, outcome: 'Steady daily hydration', action: 'Water habits that stick.' },
  { match: /\b(?:movement|fitness|exercise|strength|walk)/i, base: 'Move a little every day', stage: (s) => `Stay active through ${s}`, group: (g) => `Daily movement for ${g}`, outcome: 'A daily movement habit', action: 'Short sessions, built into your day.' },
  { match: /\b(?:eat|meal|nutrition|food|diet)/i, base: 'Eat well, every day', stage: (s) => `Eat well through ${s}`, group: (g) => `Everyday nutrition for ${g}`, outcome: 'Steady, balanced eating', action: 'Meals planned around your week.' },
  { match: /\b(?:pregnan|prenatal)/i, base: 'Feel good while pregnant', outcome: 'A calmer pregnancy routine', action: 'Daily care, trimester by trimester.' },
  { match: /\b(?:postpartum|new mother|newborn)/i, base: 'Care for yourself, too', outcome: 'Recovery after birth', action: 'Small daily care for new mothers.' },
  { match: /\b(?:hormon|cycle|period|pms)/i, base: 'Work with your cycle', group: (g) => `Hormone care for ${g}`, outcome: 'Living with your cycle', action: 'Habits matched to each phase.' },
  { match: /\b(?:morning|wake)/i, base: 'Own your mornings', group: (g) => `Better mornings for ${g}`, outcome: 'Calmer, clearer mornings', action: 'One morning routine.' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

const STAGES = new Set(Object.values(LIFE_STAGES).flat().filter((s) => s !== 'Not specified').map((s) => s.toLowerCase()));
/** "Women 45–64 · Menopause" → group "women", stage "menopause"; "Everyone" → neither. Only a known life stage
 *  counts as a stage, so a second audience group ("Women 18–65 · Athletes") never becomes "through athletes". */
export function parseAudience(audience: string): { group: string | null; stage: string | null } {
  const parts = audience.split('·').map((p) => clean(p)).filter(Boolean);
  const first = (parts[0] || '').replace(/\d+\s*[–-]\s*\d+\+?|\d+\+/g, '').trim();
  const group = !first || /^(everyone|all|adults?|anyone)$/i.test(first) ? null : first.toLowerCase();
  const stage = parts.slice(1).map((p) => p.toLowerCase()).filter((p) => STAGES.has(p)).at(-1) || null;
  return { group, stage };
}

/** "7-day", "14 nights", "4-week" in an offer's title or description → days. */
export function daysIn(text: string): number | null {
  const m = text.match(/\b(\d{1,3})[\s-]*(day|night|week)s?\b/i);
  if (!m) return null;
  const n = Number(m[1]) * (/week/i.test(m[2]) ? 7 : 1);
  return n > 0 && n <= 365 ? n : null;
}

const fits = (s: string, max: number) => !!s && words(s) <= max;
const firstFit = (max: number, ...options: Array<string | null | undefined>) => options.find((o): o is string => !!o && fits(o, max)) || '';
/** A long name cut to whole words. */
const trimWords = (s: string, max: number) => clean(s).split(' ').slice(0, max).join(' ').replace(/[,:;–—-]+$/, '');

function topicFor(problem: string, rest: string): Topic | null {
  return TOPICS.find((t) => t.match.test(problem)) || TOPICS.find((t) => t.match.test(rest)) || null;
}

export function postCopy({ audience, problem, solution = '', offer = null, kind = offer ? 'offer' : 'none' }: CopyInput): PostCopyText {
  const facts = `${offer?.title || ''} ${offer?.description || ''}`;
  const topic = topicFor(problem, `${solution} ${facts}`);
  const { group, stage: rawStage } = parseAudience(audience);
  // A stage that is the topic itself ("menopause" for a menopause offer) adds nothing.
  const stage = rawStage && !(topic && topic.match.test(rawStage)) ? rawStage : null;
  const problemName = clean(problem.replace(/\s*(problems?|issues?|difficult(y|ies))\s*$/i, '')) || 'Wellbeing';
  const fallbackHead = `${cap(problemName.toLowerCase())}, handled`;
  const audienceHead = topic ? firstFit(HEADLINE_MAX, stage && topic.stage?.(stage), group && topic.group?.(group), topic.base) : fallbackHead;
  const action = topic?.action || 'One short daily routine.';
  const days = offer?.days ?? daysIn(facts);

  let headline: string, subline: string;
  if (kind === 'recipe' && offer?.title) {
    headline = trimWords(offer.title, HEADLINE_MAX);
    const bits = [offer.ingredients ? `${offer.ingredients} ingredients` : '', offer.minutes ? `${offer.minutes} min` : ''].filter(Boolean);
    subline = bits.length ? bits.join(' · ') : topic ? `A recipe for ${topic.outcome.toLowerCase()}` : 'One recipe, start to finish';
  } else if (kind === 'protocol') {
    headline = topic ? firstFit(HEADLINE_MAX, topic.outcome, audienceHead) : (offer?.title ? trimWords(offer.title, HEADLINE_MAX) : fallbackHead);
    const doing = action.replace(/\.$/, '');
    subline = days ? `${days} days · ${doing.charAt(0).toLowerCase()}${doing.slice(1)}` : action;
  } else {
    headline = audienceHead;
    const unit = topic?.unit || 'days';
    subline = days ? `${days} ${days === 1 ? unit.slice(0, -1) : unit}. ${action}` : action;
  }
  subline = firstFit(SUBLINE_MAX, subline, action) || trimWords(subline, SUBLINE_MAX);
  headline = fits(headline, HEADLINE_MAX) ? headline : trimWords(headline, HEADLINE_MAX);

  const cta = kind === 'recipe' ? 'Get the recipe'
    : /challenge/i.test(facts) ? 'Join the challenge'
    : kind === 'protocol' ? 'Start the Protocol'
    : offer && offer.free === false ? 'Start the Protocol' : 'Get routine';
  return { headline, subline, cta };
}
