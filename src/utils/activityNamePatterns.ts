/**
 * The name patterns that decide which bucket an activity belongs to.
 *
 * WHY A SHARED MODULE. These sets were written twice — once for `ActivityScreen`'s
 * Mindfulness and Hygiene tabs, once for the timeline's "colour by activity"
 * bucketer — and the two copies immediately disagreed about what counts as
 * hygiene. One home means a widening or a correction lands in both places or in
 * neither, and never silently in one.
 *
 * WHY NAMES AT ALL. Neither surface has a structured field to read.
 * `catalog_activities` has no Hygiene category, and a `protocol_items` row
 * carries no subtype: `item_type` / `scope` / `category` collapse to four
 * folders (Do, Supplements, Consume, Sleep), inside which hygiene, mindfulness
 * and sport are indistinguishable. `display_name` is contractually the authored
 * English string precisely so wake/bed/hygiene/meal detection can match on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PATTERNS ARE ANCHORED AT THE FRONT ONLY. This is the whole point of the file.
 *
 * These were originally written `/\b(meditat|mindful|…|deodor)\b/`, and that
 * TRAILING `\b` silently defeats every stem in the alternation: "meditat" can
 * never match "Meditation", because the character after the stem ("i") is a word
 * character, so no boundary exists at that position. Only alternatives that were
 * already whole words ever fired — "breathwork" matched, while "meditation",
 * "mindfulness", "deodorant", "visualize" and "contemplation" all missed. The
 * Mindfulness tab did not list an activity called "Meditation".
 *
 * So there is no trailing `\b` here. A stem ends where the stem ends.
 *
 * Short or ambiguous stems carry their own explicit suffix group instead
 * (`run(?:ning|s)?\b`, so "run" cannot claim "runny"), because dropping the
 * boundary widens the match and the widening must not import false positives
 * along with the fix.
 */

/**
 * Hygiene — body-care and washing rituals.
 *
 * `ActivityScreen`'s Hygiene tab and the timeline's hygiene bucket want exactly
 * the same set, so there is one. Stems replace the whole-word forms that used to
 * be here (`flossing` → `floss`, `epsom bath|epsom salt` → `epsom`), which is a
 * widening, and `bath(?:e|ing)?\b` keeps its boundary so "bathroom" stays out.
 *
 * `hygiene`, `grooming` and `shave` lead the alternation because the LANE'S OWN
 * NAME did not match its own pattern. Every stem here was a hygiene *activity*
 * (floss, shower, tongue-scrap), so a row literally called "Morning Hygiene"
 * tested false — which is how one reached the timeline's wellness group and sat
 * inside a WELLNESS card on John's device (2026-10-10). Measured on staging:
 * exactly two rows match the added words and nothing else does.
 */
export const HYGIENE_NAME_RE = /\b(hygiene|grooming|groom\b|shav(?:e|ing)\b|tongue[\s-]?scrap|oil[\s-]?pull|dry[\s-]?(?:skin[\s-]?)?brush|skin[\s-]?brush|tooth[\s-]?brush|brushing[\s-]?teeth|floss|water[\s-]?floss|shower(?:s|ing)?\b|hot[\s-]?cold|skincare|skin[\s-]?care|face[\s-]?wash|cleans|deodor|hair[\s-]?wash|nail[\s-]?care|epsom|castor[\s-]?oil|sauna(?:s)?\b|steam[\s-]?room|bath(?:e|ing)?\b)/;

/**
 * The contemplative core — meditation, breathwork, prayer, gratitude, NSDR.
 *
 * Kept as a source fragment because the two consumers want different widths of
 * the same idea, and the shared half must not be typed twice.
 */
const CONTEMPLATIVE_STEMS =
  'meditat|mindful|breathwork|breathing|pranayama|wim[\\s-]?hof|box[\\s-]?breath|4[\\s-]?7[\\s-]?8|prayer|praying|gratitude|nsdr|yoga[\\s-]?nidra|visualiz|affirmation|contemplat|silent[\\s-]?time|quiet[\\s-]?time';

/**
 * Mindfulness — what `ActivityScreen`'s Mindfulness tab lists.
 *
 * The contemplative core and nothing else. Journalling, stretching and mobility
 * are wellness but they are not mindfulness, and a tab labelled "Mindfulness"
 * that lists "Hip Mobility" is a worse tab. See {@link WELLNESS_NAME_RE}.
 */
export const MINDFULNESS_NAME_RE = new RegExp(`\\b(${CONTEMPLATIVE_STEMS})`);

/**
 * Wellness — the timeline's colour bucket, which is broader than the tab.
 *
 * The bucketer has to place EVERY "Do" item somewhere, so the contemplative core
 * is widened with the adjacent self-care practices; an unplaced item falls
 * through to neutral grey, which reads as a bug on device. A tab, by contrast,
 * is allowed to list nothing — so it stays narrow. That asymmetry is the reason
 * these are two exports and not one.
 */
export const WELLNESS_NAME_RE = new RegExp(`\\b(${CONTEMPLATIVE_STEMS}|journal|stretch|mobility)`);

/**
 * Sport — movement verbs plus `ActivityScreen`'s FITNESS_CATS vocabulary.
 *
 * Used by the timeline bucketer; `ActivityScreen` has no Sport tab (its sports
 * arrive as catalog categories and `COMMON_SPORT_NAMES`). It lives here anyway
 * so the next surface that needs it finds it instead of writing a third copy.
 *
 * Test hygiene BEFORE sport: a "Cold Shower" contains no movement word, but
 * "Sauna after Training" does, and hygiene is the more specific claim.
 */
/*
 * `cycl` was widened to `cycling|cyclist|bicycl`: the bare stem matched
 * "Bitcoin Cycle Buy Window Begins", a calendar row, and filed it as fitness.
 * It is the one false positive the 2026-10-10 staging measurement found.
 */
export const SPORT_NAME_RE = /\b(run(?:ning|s)?\b|jog|walk(?:ing|s)?\b|hike|hiking|swim|swimming|cycling|cyclist|bicycl|bike|biking|ride|row(?:ing)?\b|lift|weights|strength|gym\b|workout|training|hiit|cardio|calisthenic|sprint|squat|deadlift|push[\s-]?up|pull[\s-]?up|pilates|yoga|climb|ski(?:ing)?\b|surf(?:ing|s|er)?\b|tennis|football|soccer|basketball|boxing|martial)/;
