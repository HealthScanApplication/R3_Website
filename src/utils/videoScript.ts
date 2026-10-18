/*
 * A short script for a Guardian video: a hook, two or three lines and the call to action, in the brand's voice.
 * Drafted offline from the brief and the brand brief (words to use, words to avoid), so it never starts blank, and
 * paired with a ready-to-paste prompt (built on the brand brief's copyPrompt) for writing it with an AI tool.
 * Also the source of the video's static text overlay: hook → headline, first line → subline, CTA → button.
 */
import { copyPrompt, type PromptContext } from './brandBrief';
import type { BrandKit } from './brandKit';

export interface VideoScript { hook: string; lines: string[]; cta: string }
export interface ScriptBrief { audience: string; focus: string; focusKind?: 'problem' | 'goal'; offer?: string; free?: boolean; creator?: string; brandName?: string; kit?: BrandKit | null; format?: string }

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const terms = (csv: string) => csv.split(/[,;\n]/).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 2);

/** Is a focus label a goal ("Sleep better", "More energy") rather than a problem ("Sleep problems")? */
export const looksLikeGoal = (focus: string) => /^(sleep better|more |less |build |lose |run |better |healthy |clearer |glowing |stronger |steady |calmer |anti-|mobility|recovery|mindfulness|fertility|gut health|heart health|hormone balance)/i.test(focus.trim());

/** The offline draft: plain, encouraging, no medical claims; lines that use a brand's "avoid" words are dropped. */
export function draftVideoScript(b: ScriptBrief): VideoScript {
  const goal = b.focusKind ? b.focusKind === 'goal' : looksLikeGoal(b.focus);
  const focus = lower(b.focus.trim() || 'wellbeing');
  const who = b.audience && b.audience !== 'Everyone' ? lower(b.audience.split(' · ')[0]) : '';
  const hook = goal ? `Want to ${focus.replace(/^more /, 'have more ').replace(/^less /, 'feel less ')}? Start here.` : `${b.focus.trim() || 'Feeling stuck'}? It might be your routine.`;
  const avoid = terms(b.kit?.avoid || '');
  const brandWord = terms(b.kit?.words || '').find((w) => !/^(routine|simple|daily|feel)$/.test(w));
  const candidates = [
    `A few small daily steps${who ? ` for ${who}` : ''} can change how your days feel.`,
    b.offer ? `${b.offer}${b.creator ? ` by ${b.creator}` : ''} walks you through them, one day at a time.` : `${b.creator ? `${b.creator} shares` : 'Here is'} a simple routine you can start today.`,
    brandWord ? `Keep it ${brandWord}. Keep it yours.` : 'No overwhelm, no perfection. Just the next step.',
  ];
  const lines = candidates.filter((l) => !avoid.some((a) => l.toLowerCase().includes(a)));
  const cta = b.offer ? (b.free === false ? 'Start the Protocol at the link in bio.' : 'Get the free routine at the link in bio.') : 'Follow for the full routine.';
  return { hook, lines: lines.slice(0, 3), cta };
}

/** Plain text for the editor: one line per beat, hook first, CTA last. */
export const scriptText = (s: VideoScript) => [s.hook, ...s.lines, s.cta].filter(Boolean).join('\n');

/** Read an edited script back: first line is the hook, last line the CTA, everything between the body. */
export function parseScript(text: string): VideoScript {
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (rows.length === 0) return { hook: '', lines: [], cta: '' };
  if (rows.length === 1) return { hook: rows[0], lines: [], cta: '' };
  return { hook: rows[0], lines: rows.slice(1, -1), cta: rows[rows.length - 1] };
}

/** Ready-to-paste prompt for writing the script with an AI tool, in the brand's voice (brand brief copyPrompt). */
export function scriptPrompt(b: ScriptBrief): string {
  const ctx: PromptContext = { brandName: b.brandName || b.creator, kit: b.kit, audience: b.audience, focus: b.focus, offer: b.offer, format: b.format || '9:16 video' };
  const rows = copyPrompt(ctx).split('\n');
  rows[0] = `Write a 15–20 second ${ctx.format} script${b.offer ? ` for "${b.offer}"` : ''} by ${ctx.brandName || 'a wellness guide'}.`;
  rows[rows.length - 1] = 'Give one hook line, two or three short spoken lines, and the call to action (link in bio). Plain spoken English, no medical claims, no hashtags.';
  return rows.join('\n');
}
