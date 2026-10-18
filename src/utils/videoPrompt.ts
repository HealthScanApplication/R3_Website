/*
 * Prompt for a short Guardian video (Higgsfield), built from the same brief as the posts: who it is for
 * (audience), what it addresses (problem or goal), the offer, and the selected brand's tone and visual language.
 * Pure, so the Content builder can pre-fill it and the Guardian can still edit it before generating.
 */
import type { BrandKit } from './brandKit';

export type VideoAspect = '9:16' | '4:5' | '1:1' | '16:9';
export const VIDEO_ASPECTS: Array<{ id: VideoAspect; platforms: string }> = [
  { id: '9:16', platforms: 'TikTok · Reel · Story · Short' },
  { id: '4:5', platforms: 'Instagram feed' },
  { id: '1:1', platforms: 'Square post' },
  { id: '16:9', platforms: 'YouTube' },
];

/** A brand's voice and look for video, read from its social_links (keys added by the brand kit editor when present). */
export interface BrandStyle { name: string; voice: string; visual: string; font?: string; colours?: string[] }

/** Brand voice / visual notes stored as flat keys in a brand's social_links; missing keys are simply empty. */
export function brandStyleOf(name: string, links?: Record<string, string> | null, kit?: BrandKit | null): BrandStyle {
  const l = links || {};
  const text = (...keys: string[]) => keys.map((k) => (typeof l[k] === 'string' ? l[k].trim() : '')).find(Boolean) || '';
  const colours = kit ? (kit.ctaMode === 'colour' ? [kit.primary, kit.secondary] : [kit.mono === 'black_on_white' ? 'black and white' : 'white on black']) : undefined;
  return { name, voice: text('brand_voice', 'brand_tone'), visual: text('brand_visual', 'brand_visual_style', 'brand_imagery'), font: kit?.font, colours };
}

export interface VideoBrief { audience: string; problem: string; offer?: string; solution?: string; creator?: string; brand?: BrandStyle | null; aspect: VideoAspect }

const FRAMING: Record<VideoAspect, string> = {
  '9:16': 'vertical 9:16 frame, subject centred with headroom, safe space at the bottom for captions',
  '4:5': 'portrait 4:5 frame, subject centred',
  '1:1': 'square 1:1 frame, subject centred',
  '16:9': 'wide 16:9 frame, subject on the right third, open space on the left',
};

/** Scene ideas by topic, in the same spirit as the post backgrounds: calm, real-life, natural light. */
const SCENES: Array<{ match: RegExp; scene: string }> = [
  { match: /sleep|insomnia|evening|night|bed/i, scene: 'a calm evening wind-down at home: dimming warm lamps, a cup of herbal tea, folding a soft blanket by the bed' },
  { match: /menopaus|hot flush|perimenopaus/i, scene: 'a woman in midlife moving through a calm, cool morning routine by an open window' },
  { match: /pregnan|prenatal/i, scene: 'an expecting mother preparing a nourishing breakfast in soft morning light' },
  { match: /postpartum|new mother|newborn/i, scene: 'a new mother resting with her baby in a quiet, sunlit room' },
  { match: /stress|anxiety|calm|overwhelm/i, scene: 'slow breathing by a window, then a short walk outdoors among trees' },
  { match: /energy|fatigue|tired/i, scene: 'opening the curtains to morning sun, a glass of water, gentle stretching' },
  { match: /weight|metabolic|fat/i, scene: 'preparing a colourful whole-food meal, then an easy walk outside' },
  { match: /movement|fitness|mobility|muscle|run|posture|exercise/i, scene: 'an unhurried mobility routine on a mat in a bright room' },
  { match: /gut|digest|bloat/i, scene: 'preparing fermented foods and fresh vegetables in a bright kitchen' },
  { match: /skin|hair|nail|beauty|glow/i, scene: 'a gentle skincare routine in a bright bathroom with natural textures' },
  { match: /focus|brain fog|concentrat/i, scene: 'a tidy desk in morning light, a notebook, a short breathing pause' },
];

const sentence = (s: string) => { const t = s.trim().replace(/\s+/g, ' '); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ''; };

/** The default prompt for a brief. Plain prose: one scene, the mood, the brand look, and the framing. */
export function buildVideoPrompt(b: VideoBrief): string {
  const topic = `${b.problem} ${b.solution || ''} ${b.offer || ''} ${b.audience}`;
  const scene = SCENES.find((s) => s.match.test(topic))?.scene || 'a calm daily routine at home in natural light';
  const who = b.audience && b.audience !== 'Everyone' ? ` for ${b.audience.toLowerCase()}` : '';
  const parts = [
    sentence(`Short, realistic lifestyle video${who} about ${(b.solution || b.problem).toLowerCase()}`),
    sentence(`Scene: ${scene}`),
    b.offer ? sentence(`It introduces "${b.offer}"${b.creator ? ` by ${b.creator}` : ''}, a simple routine`) : '',
    b.brand?.voice ? sentence(`Tone: ${b.brand.voice}`) : sentence('Tone: warm, reassuring and practical, never clinical'),
    b.brand?.visual ? sentence(`Visual style: ${b.brand.visual}`) : sentence('Visual style: editorial, soft natural light, warm cream and earthy tones, gentle camera movement'),
    b.brand?.colours?.length ? sentence(`Colour accents: ${b.brand.colours.join(', ')}`) : '',
    sentence(`Framing: ${FRAMING[b.aspect]}`),
    'No on-screen text, no logos, no medical equipment.',
  ];
  return parts.filter(Boolean).join(' ');
}

/** Prompts are capped on the server too; this keeps the editor honest about the limit. */
export const VIDEO_PROMPT_MAX = 1500;
