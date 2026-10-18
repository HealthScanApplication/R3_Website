/*
 * Prompt for a short Guardian video (Higgsfield). Built on the brand brief's imagePrompt, so a video carries the same
 * scene, audience, visual language and palette as the "Prompts for AI tools" panel, plus what a video needs: a
 * concrete scene for the topic, gentle motion, and framing for the chosen format. Pure; the Guardian can edit it.
 */
import { imagePrompt } from './brandBrief';
import type { BrandKit } from './brandKit';

export type VideoAspect = '9:16' | '4:5' | '1:1' | '16:9';
export const VIDEO_ASPECTS: Array<{ id: VideoAspect; platforms: string }> = [
  { id: '9:16', platforms: 'TikTok · Reel · Story · Short' },
  { id: '4:5', platforms: 'Instagram feed' },
  { id: '1:1', platforms: 'Square post' },
  { id: '16:9', platforms: 'YouTube' },
];

export interface VideoBrief { audience: string; problem: string; offer?: string; brandName?: string; kit?: BrandKit | null; aspect: VideoAspect }

const FRAMING: Record<VideoAspect, string> = {
  '9:16': 'vertical 9:16 frame, subject centred with headroom, the lower third kept calm for captions',
  '4:5': 'portrait 4:5 frame (keep the action in the centre so a 3:4 or 9:16 render crops cleanly)',
  '1:1': 'square 1:1 frame, subject centred',
  '16:9': 'wide 16:9 frame, subject on the right third, open space on the left',
};

/** Scene ideas by topic, in the same spirit as the post backgrounds: calm, real-life, natural light. */
const SCENES: Array<{ match: RegExp; scene: string }> = [
  { match: /sleep|insomnia|evening|night|bed/i, scene: 'an evening wind-down at home: dimming warm lamps, a cup of herbal tea, folding a soft blanket by the bed' },
  { match: /menopaus|hot flush|perimenopaus/i, scene: 'a calm, cool morning routine by an open window' },
  { match: /pregnan|prenatal/i, scene: 'preparing a nourishing breakfast in soft morning light' },
  { match: /postpartum|new mother|newborn/i, scene: 'resting with a baby in a quiet, sunlit room' },
  { match: /stress|anxiety|calm|overwhelm/i, scene: 'slow breathing by a window, then a short walk outdoors among trees' },
  { match: /energy|fatigue|tired/i, scene: 'opening the curtains to morning sun, a glass of water, gentle stretching' },
  { match: /weight|metabolic|fat/i, scene: 'preparing a colourful whole-food meal, then an easy walk outside' },
  { match: /movement|fitness|mobility|muscle|run|posture|exercise/i, scene: 'an unhurried mobility routine on a mat in a bright room' },
  { match: /gut|digest|bloat/i, scene: 'preparing fermented foods and fresh vegetables in a bright kitchen' },
  { match: /skin|hair|nail|beauty|glow/i, scene: 'a gentle skincare routine in a bright bathroom with natural textures' },
  { match: /focus|brain fog|concentrat/i, scene: 'a tidy desk in morning light, a notebook, a short breathing pause' },
];

/** The default video prompt for a brief: the brand brief's image prompt, turned into a short moving scene. */
export function buildVideoPrompt(b: VideoBrief): string {
  const scene = SCENES.find((s) => s.match.test(`${b.problem} ${b.offer || ''} ${b.audience}`))?.scene || 'a calm daily routine at home in natural light';
  const base = imagePrompt({ brandName: b.brandName, kit: b.kit, audience: b.audience, focus: b.problem, offer: b.offer, format: b.aspect })
    .split('\n')
    // A video has no headline area and its own framing line; the image wording becomes video wording.
    .filter((l) => !/^Leave clean space/.test(l))
    .map((l) => l.replace(/^A (\S+) social image for/, 'A short $1 social video for').replace('No text, logos or watermarks in the image.', 'No on-screen text, logos or watermarks.'));
  return [base[0], `Moment: ${scene}.`, ...base.slice(1, -1), 'Mood: warm, reassuring and practical, never clinical.',
    'Motion: realistic, slow and gentle; a smooth handheld or dolly camera move; soft natural light.',
    `Framing: ${FRAMING[b.aspect]}.`, base[base.length - 1]].join('\n');
}

/** Prompts are capped on the server too; this keeps the editor honest about the limit. */
export const VIDEO_PROMPT_MAX = 1500;
