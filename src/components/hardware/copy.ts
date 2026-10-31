export const PRODUCTS = {
  ring:   { key: 'ring'   as const, name: 'R³ Ring',        priceCents: 17900, regPriceCents: 19900 },
  bundle: { key: 'bundle' as const, name: 'R³ Ring + Clip', priceCents: 29900, regPriceCents: 34900 },
};
export type ProductKey = keyof typeof PRODUCTS;
export const BATCH_GOAL = 250;
export const SHIP_WINDOW = 'Ships Q3 2027';
export const PREORDER_TERMS = `Full payment today. ${SHIP_WINDOW}. If we don't reach the first-batch goal by the deadline, you're refunded in full.`;
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

export const HERO_FEATURE_WORDS = ['meals', 'workouts', 'notes', 'moments', 'symptoms'];

// ---- Task 17: owner-approved use-case copy (planned features; no numbers beyond the brief) ----

export type IovKey = 'inputs' | 'outputs' | 'value';
export type DeviceIov = Record<IovKey, string>;
export const IOV_LABELS: Array<[IovKey, string]> = [['inputs', 'Inputs'], ['outputs', 'Outputs'], ['value', 'Value']];
export const DEVICE_IOV: Record<'ring' | 'watch', DeviceIov> = {
  ring: {
    inputs: 'Tap, double tap, press and hold, swipe. Heart rate, sleep and activity sensors.',
    outputs: "Commands to the R³ Clip's camera and microphone, and to your phone: music and your AI agent.",
    value: 'Log anything without taking your phone out.',
  },
  watch: {
    inputs: "Camera (photo and video), microphone, heart rate, sleep and activity sensors, and your phone's GPS.",
    outputs: 'Logged meals, activities, tasks and journals; directions to your next calendar event; replies from your AI agent; an end-of-day reel.',
    value: 'A record of your day, made in the moment.',
  },
};

export type GestureGlyph = 'tap' | 'double' | 'hold' | 'swipe';
export type Gesture = { id: GestureGlyph; name: string; line: string };
export const GESTURES_TITLE = 'One ring, four gestures';
export const GESTURES: Gesture[] = [
  { id: 'tap', name: 'Tap', line: 'The R³ Clip takes a photo or video.' },
  { id: 'double', name: 'Double tap', line: 'The same, with a voice note.' },
  { id: 'hold', name: 'Press and hold', line: 'Ask your AI agent.' },
  { id: 'swipe', name: 'Swipe', line: 'Next song on your phone.' },
];

/** `scene` is the one-sentence picture description, used as the image alt; it describes the picture in `image`. */
/** Icon names for the "how" strip on each card: what you do (`from`) and what the devices do (`to`). */
export type HowIcon = 'ring' | 'ring-tap' | 'ring-double' | 'ring-hold' | 'ring-swipe' | 'watch' | 'cap' | 'camera' | 'video' | 'mic' | 'calendar' | 'arrow' | 'agent' | 'note' | 'check' | 'moon';
export type UseCase = { id: string; title: string; gesture: string; result: string; scene: string; image?: string; video?: string; how: { from: HowIcon[]; to: HowIcon[] } };
export const USE_CASES_TITLE = 'What you can do with it';
export const USE_CASES: UseCase[] = [
  { id: 'meal', title: 'Log a meal, drink or supplement', gesture: 'Tap: photo · Double tap: photo + voice note', result: "The R³ Clip captures it and it's added to today's routine as something you consumed.", scene: 'A hand holding a tray of takoyaki at a pastel Osaka street stall, the other hand tapping the black ring.', image: '/images/hardware/use-cases/meal.webp', video: '/videos/use-cases/meal.mp4', how: { from: ['ring-tap'], to: ['camera', 'mic'] } },
  { id: 'activity', title: 'Log an activity', gesture: 'Tap: photo or video · Double tap: add a voice note', result: 'Your workout, walk or session is logged with what you saw and said.', scene: 'A pastel gym, a raised wrist showing the R³ Ring screen while the other hand lifts a dumbbell.', image: '/images/hardware/use-cases/activity.webp', video: '/videos/use-cases/activity.mp4', how: { from: ['ring-tap'], to: ['video', 'mic'] } },
  { id: 'task', title: 'Add a task or routine', gesture: 'Double tap: say it', result: 'Say the task and it lands in your routine and calendar.', scene: 'Speaking a quick task to the wrist in a pastel kitchen, the TASKS screen on the watch.', image: '/images/hardware/use-cases/task.webp', video: '/videos/use-cases/task.mp4', how: { from: ['ring-double'], to: ['mic', 'calendar'] } },
  { id: 'journal', title: 'Voice or video journal', gesture: 'Double tap: start recording', result: 'Capture a thought or a moment as a journal entry, in your own words.', scene: 'Golden-hour bench by an Osaka river, recording a short voice entry into the wrist.', image: '/images/hardware/use-cases/journal.webp', video: '/videos/use-cases/journal.mp4', how: { from: ['ring-double'], to: ['mic', 'video'] } },
  { id: 'navigate', title: 'Get to your next event', gesture: 'Glance at the R³ Clip', result: 'The watch guides you from where your phone is to the location of your next calendar event.', scene: 'Riding a mint-green bike down a pastel Osaka street, the watch on the wrist at the handlebar.', image: '/images/hardware/use-cases/navigate.webp', video: '/videos/use-cases/navigate.mp4', how: { from: ['watch'], to: ['arrow'] } },
  { id: 'agent', title: 'Ask your AI agent', gesture: 'Press and hold', result: 'Your pixel AI agent can see your health data, email and calendar, so it can plan or research anything for you.', scene: 'Close-up of the watch at a cafe table, its screen showing the pixel AI agent replying.', image: '/images/hardware/use-cases/agent.webp', video: '/videos/use-cases/agent.mp4', how: { from: ['ring-hold'], to: ['agent'] } },
  { id: 'music', title: 'Run with music', gesture: 'Swipe: next song', result: 'Skip to the next song on your phone without stopping, while tracking keeps running.', scene: 'A runner at dawn on an Osaka canal path, earbuds in, thumb swiping across the ring.', image: '/images/hardware/use-cases/music.webp', video: '/videos/use-cases/music.mp4', how: { from: ['ring-swipe'], to: ['note'] } },
  { id: 'reel', title: 'Your day as a reel', gesture: 'Clip it on your hat', result: 'Wear the R³ Clip on a cap while you surf or skate, and get a reel of the fun moments at the end of the day.', scene: 'A skater carving a pastel skate bowl by the sea, the R³ Clip on their yellow cap.', image: '/images/hardware/use-cases/reel.webp', video: '/videos/use-cases/reel.mp4', how: { from: ['cap'], to: ['video'] } },
  { id: 'symptom', title: 'Log a symptom', gesture: 'Double tap: say it', result: 'Say "headache, 6 out of 10" and it\'s logged against your day.', scene: 'Someone at a desk by the window rubbing their temple and speaking a check-in to their wrist.', image: '/images/hardware/use-cases/symptom.webp', video: '/videos/use-cases/symptom.mp4', how: { from: ['ring-double'], to: ['mic'] } },
  { id: 'reminder', title: 'Confirm a reminder', gesture: 'Tap: mark it done', result: 'The watch reminds you to take a supplement; one tap marks it taken.', scene: 'A hand holding a supplement capsule over a kitchen table, the watch showing the reminder.', image: '/images/hardware/use-cases/reminder.webp', video: '/videos/use-cases/reminder.mp4', how: { from: ['watch', 'ring-tap'], to: ['check'] } },
  { id: 'sleep', title: 'Sleep and recovery', gesture: 'Just wear them', result: "The ring and watch track your night, and your agent adjusts tomorrow's plan.", scene: 'Morning light on a mint bedside table, the watch and ring resting side by side.', image: '/images/hardware/use-cases/sleep.webp', video: '/videos/use-cases/sleep.mp4', how: { from: ['ring', 'watch'], to: ['moon'] } },
];

/** Spec rows, shown under the "Planned specifications" notice. No device lists phone pairing, so Music sits under R³ Ring. */
export type SpecRow = [string, string];
export const SPEC_RING: SpecRow[] = [
  ['Control', 'Touch and slide'],
  ['Gestures', 'Tap, double tap, press and hold, swipe'],
  ['Tracks', 'Heart rate, sleep, activity'],
  ['Works with', 'R³ Clip'],
  ['Music', 'Swipe the ring for the next song on your phone'],
];
export const SPEC_CLIP: SpecRow[] = [
  ['Camera', '8 MP wide-angle, 160° field of view'],
  ['Captures', 'Food, activity, voice notes, AI requests'],
  ['Tracks', 'Heart rate, sleep, activity'],
  ['Navigation', "Directions to your next calendar event, using your phone's GPS"],
  ['AI agent', 'Press and hold the ring; it can use your health data, email and calendar'],
  ['Reels', 'An end-of-day reel of your moments'],
  ['Worn as', 'Necklace, watch, or clip'],
  ['Privacy', 'Physical slider cuts the camera, microphones, and radios; red LED while the camera is on'],
];

/** The /wearables hero background clips, played in this order: one first-person moment per gesture. */
export const HERO_CLIPS = ['meal', 'navigate', 'activity', 'music', 'reel'].map((id) => `/videos/hero/${id}.mp4`);
