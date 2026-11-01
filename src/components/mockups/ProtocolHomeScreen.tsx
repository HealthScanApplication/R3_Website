/*
 * ProtocolHomeScreen — a pixel-faithful web replica of the ROUTINE³ iOS app's
 * protocol HOME screen (the "YOUR ROUTINE" day view). Reverse-engineered from
 * the mobile repo (ActiveProtocolCard / ProtocolGroupBody / WeekCalendarStrip /
 * categoryTints) so the marketing phone mock and the admin preview are identical
 * to each other and to the app.
 *
 * Fed a protocol name + a flat list of items, it runs the app's TWO-LEVEL
 * grouping: (1) part-of-day section (Morning/Afternoon/Evening) then (2) the
 * "TIME · TYPE" bands (category-tinted cards). Tints/icons come from the shared
 * src/config/protocolCategories.ts — the single source of truth.
 *
 * No-JIT: every style is inline (the site ships prebuilt static CSS).
 */
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import {
  User, ShoppingBasket, ListChecks, Plus, Repeat, Check, Sparkles, Timer, Apple, Ellipsis, Sun, Info, NotebookPen, Droplet,
  Activity, Bike, Calendar, Flame, Footprints, GitCommitVertical, Lightbulb, Map as MapIcon, Snowflake, TrendingUp, Waves, Wind,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_TINTS, itemIcon, type CatKey, type ProtocolItem as CatItem,
} from "../../config/protocolCategories";
import { computeSleepWindow } from "../../utils/sleepWindow";
import { getItemTod, parseHM, type SimpleTod } from "../../protocolDomain/timeOfDay";
import { mealSlotName } from "../../protocolDomain/mealSlot";
import { isSleepItemByName } from "../../protocolDomain/category";
import { HYGIENE_NAME_RE, SPORT_NAME_RE } from "../../utils/activityNamePatterns";
import { claimsBedAnchor, claimsWakeAnchor } from "../../protocolDomain/sleepAnchorClaim";
import { MOBILE_TIMELINE as MT } from "./mobileTimelineContract";
import { OptimizedImage } from "../OptimizedImage";

const POPPINS = '"Poppins", system-ui, -apple-system, sans-serif';
// The thumbnails here are 32px wide at most, but come from full-size catalogue pictures (often 1-2 MB PNGs): ask Storage for
// small ones. A tall capsule shows the picture at its height, so the sizes below follow the longer side.
const THUMB_WIDTHS = [96, 192, 384];
const JOHN_AVATAR = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&h=160&q=85";

export interface HomeItem {
  display_name: string;
  item_type?: string;            // supplement | consume | recipe | activity | product | ingredient
  kind?: string | null;
  scope?: string | null;         // consume | supplement | inside | outside | None
  time?: string | null;          // 'HH:MM' or 'HH:MM:SS'
  duration_minutes?: number | null;
  group_name?: string | null;
  category?: string | null;
  subtype?: string | null;
  recurrence_type?: string | null;
  scheduled_date?: string | null;
  /** Explicit role supplied by wearable-derived rows; null means not a bookend. */
  sleep_anchor?: "wake" | "bed" | null;
  image_url?: string | null;
  repeat?: boolean;
  description?: string | null;
  done?: boolean;                // checked off for the day
  children?: string[];           // sub-item descriptions, shown as a faded checklist (like the app)
  /** A row made up for the preview (the grey Wake and Sleep anchors, a folded parent), not a stored step: it draws no repeat glyph. */
  virtual?: boolean;
  /** Time used to group and sort the item (an indented child takes its parent's); `time` stays what is shown. */
  slotTime?: string | null;
  indent?: boolean;              // a sub-item of the card above it, drawn indented under its parent (like the app)
}

/* ───────── time + category helpers (mirror mobile precedence) ───────── */
function fmtTime(t?: string | null): string {
  const hm = parseHM(t);
  if (!hm) return "";
  const h12 = ((hm.h + 11) % 12) + 1;
  const ampm = hm.h < 12 ? "am" : "pm";
  return `${h12}:${String(hm.m).padStart(2, "0")}${ampm}`;
}
function categorizeFull(it: HomeItem): CatKey {
  const stored = (it.category || "").toLowerCase();
  if (stored === "sleep") return "sleep";
  if (stored === "supplement" || stored === "supplements") return "supplements";
  if (stored === "consume") return "consume";
  if (stored === "do") return "do";
  if (isSleepItemByName(it.display_name)) return "sleep";
  if (it.item_type === "supplement") return "supplements";
  if (it.item_type === "consume" || it.item_type === "recipe") return "consume";
  if (it.scope === "consume") return "consume";
  if (it.scope === "supplement") return "supplements";
  return "do";
}
const CAT_TITLE: Record<CatKey, string> = { supplements: "Supplements", consume: "Consume", do: "Do", sleep: "Sleep" };

// shim for the shared itemIcon (expects the simplified item shape)
function iconFor(it: HomeItem) {
  const t: CatItem["item_type"] =
    it.item_type === "supplement" ? "supplement"
      : (it.item_type === "consume" || it.item_type === "recipe" || it.scope === "consume") ? "consume"
        : "activity";
  return itemIcon({ name: it.display_name || "", item_type: t });
}

const mealSlot = (group?: string | null): string | null => mealSlotName(group);
// Day-anchor detection, mirroring the app (ProtocolWidget):
// "End Sleep"/Wake book-ends the morning; the terminal sleep/bed action ends the day.
function isWake(it: HomeItem): boolean {
  if (it.sleep_anchor === "wake") return true;
  if (it.sleep_anchor === null) return false;
  return claimsWakeAnchor(it);
}
function isBed(it: HomeItem): boolean {
  if (it.sleep_anchor === "bed") return true;
  if (it.sleep_anchor === null) return false;
  return claimsBedAnchor(it);
}
// Virtual sleep anchors float to the very top (-1) / bottom (1e9) of the day.
function orderKey(it: HomeItem): number {
  if (isWake(it)) return -1;
  if (isBed(it)) return 1e9;
  return parseHM(it.slotTime ?? it.time)?.mins ?? 5e8;
}
// An indented sub-item stays with the item above it: it takes that parent's time, slot and list, so grouping by part
// of the day and sorting by time never separate the two (the stable sorts then keep it right under its parent).
function inheritParentSlot(items: HomeItem[]): HomeItem[] {
  let parent: HomeItem | undefined;
  return items.map((it) => {
    if (!it.indent) { parent = it; return it; }
    return parent ? { ...it, slotTime: parent.slotTime ?? parent.time, group_name: parent.group_name, category: parent.category, subtype: parent.subtype } : it;
  });
}
// Book-end any day with grey Sleep anchors when the protocol doesn't supply them.
// The WAKE default links to the protocol's own first timed step (so a 7am routine
// wakes at 7am, not a fixed 6am). Bedtime stays a real 10pm default — the last
// step is usually an evening activity, not actual bedtime.
function withSleepAnchors(items: HomeItem[]): HomeItem[] {
  const hasEnd = items.some(isWake);
  const hasStart = items.some(isBed);
  const mins = items.map((i) => parseHM(i.time)?.mins).filter((m): m is number => m != null).sort((a, b) => a - b);
  const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const wakeTime = mins.length ? toHM(mins[0]) : "06:00";
  return [
    ...(hasEnd ? [] : [{ display_name: "Wake", item_type: "activity", category: "sleep", sleep_anchor: "wake", time: wakeTime, virtual: true } as HomeItem]),
    ...items,
    ...(hasStart ? [] : [{ display_name: "Sleep", item_type: "activity", category: "sleep", sleep_anchor: "bed", time: "22:00", virtual: true } as HomeItem]),
  ];
}

type Tod = SimpleTod;
const todForItem = (it: HomeItem, wakeHour: number): Tod =>
  getItemTod({ group_name: it.group_name, scheduled_time: it.slotTime ?? it.time, display_name: it.display_name, category: it.category }, wakeHour);

interface Band { cat: CatKey; slot: string | null; firstMin: number | null; order: number; time?: string | null; label: string; items: HomeItem[]; smart?: SmartCategory; parentLabel?: string; /** Breakfast / Lunch / Dinner / Snack when the group is a meal slot: it names the card and is never folded. */ mealSlot?: string | null }
function buildBands(list: HomeItem[]): Band[] {
  const sorted = [...list].sort((a, b) => orderKey(a) - orderKey(b));
  const bands: Band[] = [];
  for (const it of sorted) {
    const cat = categorizeFull(it);
    const slot = mealSlot(it.group_name);
    const m = parseHM(it.slotTime ?? it.time)?.mins ?? null;
    const last = bands[bands.length - 1];
    const canMerge = !!last && !last.slot && !slot && last.cat === cat &&
      m != null && last.firstMin != null && m - last.firstMin <= 60;
    if (canMerge) last.items.push(it);
    else bands.push({ cat, slot, firstMin: m, order: orderKey(it), time: it.time, label: "", items: [it] });
  }
  bands.sort((a, b) => a.order - b.order);
  for (const b of bands) {
    b.items.sort((x, y) => orderKey(x) - orderKey(y));
    b.label = b.slot
      ? b.slot.toUpperCase()
      : (b.time ? `${fmtTime(b.time)} · ${CAT_TITLE[b.cat]}` : CAT_TITLE[b.cat]).toUpperCase();
  }
  return bands;
}


/* ───────── smart lists (mirrors mobile timeline/smartGroups.ts) ─────────
   A group is a function of (time-of-day phase, subtype): the card says what it holds ("Hygiene", "Fitness") under the
   phase header, and in parent mode the folded row reads "Morning Hygiene". Sleep anchors stay their own headerless group. */
type SmartCategory = "hygiene" | "wellness" | "fitness" | "supplements" | "meal" | "work" | "home" | "tasks";
/** The card's heading (the app's protocols.timeline.band.*). */
const SMART_TITLE: Record<SmartCategory, string> = { hygiene: "Hygiene", wellness: "Wellness", fitness: "Fitness", supplements: "Supplements", meal: "Meal & Drink", work: "Work", home: "Home", tasks: "Tasks" };
/** The folded parent row's name, with the phase in front (the app's protocol:smartGroup.<band>.<category>). */
const SMART_PARENT_TITLE: Record<SmartCategory, string> = { hygiene: "Hygiene", wellness: "Wellness", fitness: "Fitness", supplements: "Supplements", meal: "Meal", work: "Work", home: "Home", tasks: "Tasks" };
const SUBTYPE_TO_SMART: Record<string, SmartCategory> = { hygiene: "hygiene", wellness: "wellness", reflection: "wellness", finance: "home", planning: "tasks", work: "work", home: "home", tasks: "tasks", exercise: "fitness", supplement: "supplements", meal: "meal", beverage: "meal", drink: "meal", snack: "meal" };
const SMART_CATEGORY_FALLBACK: Record<string, SmartCategory> = { supplement: "supplements", supplements: "supplements", consume: "meal", do: "wellness" };
const SMART_TYPE_FALLBACK: Record<string, SmartCategory> = { supplement: "supplements", consume: "meal", recipe: "meal", product: "supplements", activity: "wellness", rule: "wellness" };
function smartCategoryFor(it: HomeItem): SmartCategory {
  const sub = (it.subtype || "").toLowerCase().trim();
  if (SUBTYPE_TO_SMART[sub]) return SUBTYPE_TO_SMART[sub];
  const cat = (it.category || "").toLowerCase().trim();
  if (SMART_CATEGORY_FALLBACK[cat]) return SMART_CATEGORY_FALLBACK[cat];
  // The name, before the coarse item type: "Strength Session" and "Morning Run" carry no subtype and are Fitness, "Morning
  // Hygiene" is Hygiene. The patterns are the app's own and want lower case; a sleep step is never filed by its name.
  const name = categorizeFull(it) === "sleep" ? "" : (it.display_name || "").toLowerCase();
  if (name) {
    if (HYGIENE_NAME_RE.test(name)) return "hygiene";
    if (SPORT_NAME_RE.test(name)) return "fitness";
  }
  const type = (it.item_type || "").toLowerCase().trim();
  return SMART_TYPE_FALLBACK[type] || "wellness";
}
const SMART_TINT: Record<SmartCategory, CatKey> = { hygiene: "do", wellness: "do", fitness: "do", supplements: "supplements", meal: "consume", work: "do", home: "do", tasks: "do" };
const TASK_LANE = new Set<SmartCategory>(["work", "home", "tasks"]);
/** The app's grouping window: a step joins the card of its kind when it starts within an hour of that card's first step. */
const GROUP_WINDOW_MIN = 60;
/** A folded meal group is named for the meal of its part of the day (the app's protocol:smartGroup.<period>.meal). */
const PARENT_MEAL_NAME: Record<string, string> = { Morning: "Breakfast", Afternoon: "Lunch", Evening: "Dinner" };
/** Steps in clock order, each with the sub-steps under it kept together. */
const inClockOrder = (items: HomeItem[]): HomeItem[] => toBlocks(items).sort((a, b) => orderKey(a.it) - orderKey(b.it)).flatMap((b) => [b.it, ...b.kids]);
/**
 * The cards of one part of the day, as the app builds them (dayRows): a step joins the latest card of its kind (category and
 * smart category) that started within an hour of it, else opens a new one; cards that start on the same minute merge into
 * the first; a meal slot (Breakfast, Lunch…) names its card. Cards run in clock order, Wake first and Sleep last.
 */
function buildSmartBands(list: HomeItem[], tod: string): Band[] {
  interface Group { cat: CatKey; smart: SmartCategory; items: HomeItem[]; startMin: number | null; slot: string | null }
  const bands: Band[] = [];
  const groups: Group[] = [];
  const latest = new Map<string, Group>();
  let current: Group | undefined;
  for (const it of [...list].sort((a, b) => orderKey(a) - orderKey(b))) {
    const cat = categorizeFull(it);
    if (cat === "sleep") {
      current = undefined;
      bands.push({ cat: "sleep", slot: null, firstMin: parseHM(it.time)?.mins ?? null, order: orderKey(it), time: it.time, label: "SLEEP", items: [it] });
      continue;
    }
    if (it.indent && current) { current.items.push(it); continue; } // a sub-step stays in its step's card
    const smart = smartCategoryFor(it);
    const slot = cat === "consume" ? mealSlot(it.group_name) : null;
    const minute = parseHM(it.slotTime ?? it.time)?.mins ?? null;
    const bucket = `${cat}|${smart}`;
    const prev = latest.get(bucket);
    if (prev && (minute == null || prev.startMin == null || minute - prev.startMin <= GROUP_WINDOW_MIN)) {
      prev.items.push(it);
      if (!prev.slot && slot) prev.slot = slot;
      current = prev;
    } else {
      current = { cat, smart, items: [it], startMin: minute, slot };
      groups.push(current);
      latest.set(bucket, current);
    }
  }
  const hosts = new Map<string, Group>();
  for (const g of groups) {
    if (g.startMin != null) {
      const at = `${g.startMin}|${TASK_LANE.has(g.smart) ? "task" : "health"}`;
      const host = hosts.get(at);
      if (host) { host.items.push(...g.items); continue; }
      hosts.set(at, g);
    }
    const items = inClockOrder(g.items);
    bands.push({ cat: SMART_TINT[g.smart], slot: "smart", smart: g.smart, mealSlot: g.slot, firstMin: g.startMin, order: orderKey(items[0]), time: items[0].slotTime ?? items[0].time, label: (g.slot ?? SMART_TITLE[g.smart]).toUpperCase(), parentLabel: g.smart === "meal" ? PARENT_MEAL_NAME[tod] : `${tod} ${SMART_PARENT_TITLE[g.smart]}`, items });
    g.items = items;
  }
  // A merged-in card's steps arrived after the band was built: put every band's steps in clock order.
  for (const band of bands) if (band.slot === "smart") band.items = inClockOrder(band.items);
  // Wake leads the morning and the other sleep rows (bedtime, "Sleep in complete darkness") close the day; the cards between run by the clock.
  const rank = (b: Band): [number, number] => (b.cat === "sleep" ? (b.items.some(isWake) ? [0, 0] : [2, b.order]) : [1, b.firstMin ?? Infinity]);
  return bands.sort((a, b) => { const [ra, ta] = rank(a), [rb, tb] = rank(b); return ra - rb || (ta === tb ? 0 : ta < tb ? -1 : 1); });
}

/* ───────── a row and its sub-steps ───────── */
interface Block { it: HomeItem; kids: HomeItem[] }
/** A step and the indented sub-steps that follow it. */
function toBlocks(items: HomeItem[]): Block[] {
  const out: Block[] = [];
  for (const it of items) {
    if (it.indent && out.length) out[out.length - 1].kids.push(it);
    else out.push({ it, kids: [] });
  }
  return out;
}
const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A name that makes a group a sleep one: it is never folded into a parent row (the app's canFoldGroup). */
const SLEEPY_NAME = /\b(sleep|wake|bed|nap)\b/i;
/** "20min", "1h20min": the app's durationLabel. */
function durLabel(m: number): string {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h}h${r}min` : `${h}h`;
}
/** "5HRS FREE": the app's compactDurationLabel, then the word. */
function freeLabel(min: number): string {
  if (min < 60) return `${Math.round(min)}MIN FREE`;
  const h = Math.round((min / 60) * 10) / 10;
  return `${h}${h === 1 ? "HR" : "HRS"} FREE`;
}
/** A step with no length of its own takes this long where the app measures time (calendarEvent's DEFAULT_DURATION_MINUTES). */
const DEFAULT_DURATION = 10;
const MIN_FREE_MIN = 20;       // a stretch shorter than this is not offered to plan into
const WIND_DOWN_MAX_MIN = 90;  // the run-up to bed, up to this long, is wind-down and not free time
/**
 * The app's spare-time slot (spliceSectionFreeTime): one per part of the day, the first free stretch of at least 20 minutes
 * between the end of Wake and bedtime (the night is not spare time), in windows morning from wake to noon, afternoon 12–17,
 * evening 17 to midnight. A short stretch that runs into bedtime is wind-down and is not offered.
 */
function sectionFreeSlots(bands: Band[], wakeHour: number): Partial<Record<Tod, { start: number; end: number }>> {
  const occupied: Array<[number, number]> = [];
  let bedMin: number | null = null;
  let wakeEnd: number | null = null;
  for (const band of bands) {
    const start = parseHM(band.time)?.mins;
    if (start == null) continue;
    let end = start;
    for (const it of band.items) { const at = parseHM(it.time)?.mins; if (at != null) end = Math.max(end, at + (it.duration_minutes ?? DEFAULT_DURATION)); }
    end = Math.max(end, start + 1); // a step takes at least a minute, or the free stretch would run straight through it
    occupied.push([start, end]);
    if (band.cat === "sleep") {
      // The night's two ends: bedtime is a bed step, or a sleep step from 18:00 that is not a wake; anything else of sleep is the wake.
      if (band.items.some(isBed) || (!band.items.some(isWake) && start >= 18 * 60)) bedMin = Math.min(bedMin ?? start, start);
      else wakeEnd = Math.min(wakeEnd ?? end, end);
    }
  }
  if (wakeEnd != null) occupied.push([0, wakeEnd]);
  if (bedMin != null) occupied.push([bedMin, 24 * 60]);
  const merged: Array<[number, number]> = [];
  for (const iv of occupied.sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else merged.push([iv[0], iv[1]]);
  }
  const windows: Array<[Tod, number, number]> = [["Morning", Math.min(wakeHour * 60, 12 * 60), 12 * 60], ["Afternoon", 12 * 60, 17 * 60], ["Evening", 17 * 60, 24 * 60]];
  const out: Partial<Record<Tod, { start: number; end: number }>> = {};
  for (const [tod, from, to] of windows) {
    let cursor = from;
    let stretch: { start: number; end: number } | null = null;
    for (const [a, b] of merged) {
      if (b <= cursor) continue;
      if (a > cursor) { stretch = { start: cursor, end: Math.min(a, to) }; break; }
      cursor = Math.max(cursor, b);
      if (cursor >= to) break;
    }
    if (!stretch && cursor < to) stretch = { start: cursor, end: to };
    if (!stretch || stretch.end - stretch.start < MIN_FREE_MIN) continue;
    if (bedMin != null && stretch.end >= bedMin && stretch.end - stretch.start <= WIND_DOWN_MAX_MIN) continue;
    out[tod] = stretch;
  }
  return out;
}

/** What a row's round pill is for an activity, from its name (the app's getActivityPillConfig). */
function activityPill(name: string): { Icon: LucideIcon; label: string } {
  const n = name.toLowerCase();
  if (/\bcycl|cycling|\bbike\b|spin/.test(n)) return { Icon: Bike, label: "Ride" };
  if (/\brun\b|running|jog|sprint|marathon|treadmill/.test(n)) return { Icon: Footprints, label: "Run" };
  if (/\bwalk\b|walking|\bhike\b|hiking/.test(n)) return { Icon: MapIcon, label: "Walk" };
  if (/\bswim|pool[\s-]?lap|backstroke|breaststroke|freestyle|butterfly[\s-]?stroke/.test(n)) return { Icon: Waves, label: "Swim" };
  if (/journal|gratitude|reflect|write|note[\s-]?taking|diary/.test(n)) return { Icon: NotebookPen, label: "Journal" };
  if (/squat|deadlift|bench|\bpress\b|curl|pull[\s-]?up|push[\s-]?up|lunge|dumbbell|barbell|weight[\s-]?train|strength|\blift|gym|reps?\b|sets?\b|raise|row\b|fly\b/.test(n)) return { Icon: Repeat, label: "Reps" };
  if (/sauna|steam[\s-]?room/.test(n)) return { Icon: Flame, label: "Sauna" };
  if (/cold[\s-]?shower|cold[\s-]?plunge|ice[\s-]?bath|cryo|contrast[\s-]?shower/.test(n)) return { Icon: Snowflake, label: "Cold" };
  if (/meditat|mindful|breath|pranayama/.test(n)) return { Icon: Wind, label: "Start" };
  if (/yoga|stretch|mobility|flexibility|pilates/.test(n)) return { Icon: Activity, label: "Flow" };
  if (/red[\s-]?light|infrared|blue[\s-]?light|photobiomodulat/.test(n)) return { Icon: Lightbulb, label: "Light" };
  return { Icon: Timer, label: "Track" };
}
/** What kind of row it is for the controls: the stored type, else what the scope says; a step with neither is an activity. */
const rowType = (it: HomeItem): string => it.item_type || (it.scope === "consume" ? "consume" : it.scope === "supplement" ? "supplement" : "activity");
/** The round tracker pill an unfinished activity row carries (the app's: any activity that is not a sleep anchor). */
const trackerOf = (it: HomeItem) => (rowType(it) === "activity" && categorizeFull(it) !== "sleep" && !isWake(it) && !isBed(it) ? activityPill(it.display_name || "") : null);
/** The duration pill ("5m", "1h30m") of a row that is not an activity or a consume row: the app's parseDuration. */
const durationPillOf = (it: HomeItem): string | null => {
  const m = it.duration_minutes;
  if (!m || rowType(it) === "consume" || rowType(it) === "activity") return null;
  return m >= 60 ? (m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${m % 60}m`) : `${m}m`;
};
/** The glyph by a row's time: Calendar for a one-off, Repeat for everything that recurs; a made-up row has none. */
const recurrenceOf = (it: HomeItem): "repeat" | "calendar" | null => (it.virtual ? null : it.recurrence_type === "one_off" ? "calendar" : "repeat");
/** a mixed with b, t of the way (the app's mixHex); a colour that is not #rrggbb is returned as it is. */
function mixHex(a: string, b: string, t: number): string {
  const hex = /^#[0-9a-f]{6}$/i;
  if (!hex.test(a) || !hex.test(b)) return a;
  const ch = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** The app's twelve-colour item wheel (src/design-system/utils/listHue.ts): a done row, rail and capsule take the next hue in day order. */
const LIST_HUES = ["#8B5CC7", "#B953A3", "#D65378", "#E85555", "#E3753D", "#C3881F", "#A39425", "#74A02E", "#3BA764", "#269E8E", "#2B94B8", "#477DCE", "#6868D8"];
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** White ink on a hue when it reads (contrast >= 3), else the app's dark ink. */
const tickInkOn = (hex: string) => (1.05 / (luminance(hex) + 0.05) >= 3 ? "#FFFFFF" : "#10161D");
const withAlpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
const DOTTED = (color: string) => `repeating-linear-gradient(180deg, ${color} 0 5px, transparent 5px 10px)`;

/* ───────── date helpers for header + week strip ───────── */
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WD_FULL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round((date.getTime() - firstThu.getTime()) / (7 * 24 * 3600 * 1000));
}
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

/** The app's semantic colours (src/design-system/theme/palettes.ts), light and dark. */
function makeUi(dark: boolean) {
  return dark ? {
    page: "#000000", surface: "#1C1C1E", panel: "#2A2A2D", row: "#000000", itemBorder: "#34343A",
    text: "#FFFFFF", muted: "#9E9EA4", faint: "#6C6C71", border: "#2E2E31", divider: "#242426",
    checkBorder: "#FFFFFF", selected: "#FFFFFF", onSelected: "#111827", itemSurface: "#1C1C1E",
    pill: "rgba(255,255,255,0.239)", tab: "rgba(255,255,255,0.078)", subWash: "rgba(0,0,0,0.5)", addWash: "rgba(0,0,0,0.22)",
    section: "#FFFFFF", dock: "#1C1C1E", plus: "#FFFFFF", plusInk: "#000000", rowShadow: "none",
  } : {
    page: "#F2F4F7", surface: "#FFFFFF", panel: "#F6F8FA", row: "#FFFFFF", itemBorder: "#E5E7EB",
    text: "#111827", muted: "#6B7280", faint: "#9CA3AF", border: "#E5E7EB", divider: "#EEF1F4",
    checkBorder: "#E5E7EB", selected: "#111827", onSelected: "#FFFFFF", itemSurface: "#FFFFFF",
    pill: "rgba(0,0,0,0.11)", tab: "rgba(0,0,0,0.035)", subWash: "rgba(255,255,255,0.6)", addWash: "rgba(255,255,255,0.28)",
    section: "#374151", dock: "#FFFFFF", plus: "#111827", plusInk: "#F2F4F7", rowShadow: "0 1px 2px rgba(0,0,0,0.05)",
  };
}
type Ui = ReturnType<typeof makeUi>;

const Tick = ({ size, ink }: { size: number; ink: string }) => <Check size={size} color={ink} strokeWidth={3} />;

/** A sub-step (a child of a block): the app's TimelineSubStep. It borrows its tracker pill and recurrence glyph from the rules of a row, and ticks in its group's hue. */
function SubStepRow({ it, ui, hue }: { it: HomeItem; ui: Ui; hue: string }) {
  const Ico = iconFor(it).Icon;
  const done = !!it.done;
  const track = done ? null : trackerOf(it);
  const glyph = recurrenceOf(it);
  const Glyph = glyph === "calendar" ? Calendar : Repeat;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "4px 12px", marginLeft: 10, borderRadius: 12, background: ui.subWash, boxSizing: "border-box" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <Ico size={14} strokeWidth={1.75} color={ui.muted} style={{ flexShrink: 0 }} />
          <span title={it.display_name} style={{ fontSize: 13, fontWeight: 500, color: ui.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "break-word" }}>{it.display_name}</span>
        </div>
        {it.time && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, fontSize: 11, color: ui.muted, fontVariantNumeric: "tabular-nums" }}>{fmtTime(it.time)}{glyph && <Glyph size={11} strokeWidth={2} color={ui.faint} />}</div>}
      </div>
      {track && <span title={track.label} style={{ width: 26, height: 26, borderRadius: 13, border: `1px solid ${ui.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" }}><track.Icon size={13} strokeWidth={2.2} color={ui.muted} /></span>}
      <span style={{ width: 18, height: 18, borderRadius: 6, border: `2px solid ${done ? hue : ui.muted}`, background: done ? hue : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" }}>
        {done && <Check size={10} color={ui.surface} strokeWidth={3} />}
      </span>
    </div>
  );
}

/** The dashed "Add" row at the end of a block (the app shows it on a stored block you can add to, never on a folded smart-list parent). */
function AddRow({ ui }: { ui: Ui }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "4px 12px", marginLeft: 10, borderRadius: 12, border: `1px dashed ${ui.border}`, background: ui.addWash, boxSizing: "border-box" }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: ui.faint }}>Add</span>
      <Plus size={18} strokeWidth={2.5} color={ui.faint} />
    </div>
  );
}

/** The spare-time slot of a part of the day: how long it is free, with a plus to add into it. */
function FreeSlot({ ui, label }: { ui: Ui; label: string }) {
  return (
    <div style={{ position: "relative", padding: `0 16px 8px ${MT.rowContentX}px` }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 28, top: 33, width: 16, height: 16, borderRadius: 8, border: `1.5px solid ${ui.muted}`, background: ui.surface, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", zIndex: 3 }}><Plus size={8} strokeWidth={2.5} color={ui.muted} /></span>
      <div style={{ borderRadius: MT.groupRadius, background: ui.panel, padding: "8px 8px 8px" }}>
        <div style={{ position: "relative", height: 50, border: `1px dashed ${ui.itemBorder}`, borderRadius: 14, background: ui.itemSurface, display: "flex", alignItems: "center", padding: "0 14px", boxSizing: "border-box" }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: ui.muted, textTransform: "uppercase" }}>{label}</span>
          <Plus size={18} strokeWidth={2.5} color={ui.text} style={{ position: "absolute", right: 14 }} />
        </div>
      </div>
    </div>
  );
}

/* ───────── the screen ───────── */
export function ProtocolHomeScreen({
  protocolName,
  items,
  date = new Date(),
  done = 0,
  scale: scaleProp = "fit",
  anchors = true,
  imageUrl = JOHN_AVATAR,
  showDetails: showDetailsProp = true,
  theme = "light",
  profileName = "John Ferreira",
  grouping = "smart",
  smartListMode = "card",
  addRows = false,
  dayMarks,
}: {
  /** Per-date marks under the week strip, as the app draws them (cycle) plus an optional moon glyph. */
  dayMarks?: (date: Date) => { cycle?: "period" | "fertile" | "ovulation" | null; moon?: string | null };
  /** 'smart' groups by phase + category like the mobile smart lists. */
  grouping?: "time" | "smart";
  /** The app's smart-list preference: 'card' keeps each group a card of rows; 'parent' folds a group of two or more into one parent row with its steps under it. */
  smartListMode?: "card" | "parent";
  /** Draw the dashed "Add" row under a step that has sub-steps, as the app does where you can edit. */
  addRows?: boolean;
  protocolName: string;
  items: HomeItem[];
  date?: Date;
  done?: number;
  /** Protocol cover image, shown as the header avatar. */
  imageUrl?: string | null;
  /** How big the app UI is drawn. "fit" (the default) lays it out at a real phone's 393px width and shrinks it to the frame, so rows wrap exactly as in the app; a number sets the scale directly (1 = real-phone size). */
  scale?: number | "fit";
  /** Book-end the day with the grey Sleep anchors (off for a clean checked-off demo). */
  anchors?: boolean;
  /** Initial state of the in-frame "Details" toggle (each step's description + child checklist). */
  showDetails?: boolean;
  /** Mirrors the app's system appearance. */
  theme?: "light" | "dark";
  profileName?: string;
}) {
  // "fit": measure the frame this sits in and scale a 393px-wide phone to it.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(0.8);
  useLayoutEffect(() => {
    if (scaleProp !== "fit") return;
    const el = rootRef.current;
    if (!el) return;
    const measure = () => { const w = el.clientWidth; if (w > 0) setFitScale(Math.min(1.2, Math.max(0.4, w / 393))); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scaleProp]);
  const scale = scaleProp === "fit" ? fitScale : scaleProp;
  // In-frame toggle for per-step descriptions + child do/don't lines (mirrors the app's showDetails), and each group's own Info toggle.
  const [showDetails, setShowDetails] = useState(showDetailsProp);
  const [groupDetails, setGroupDetails] = useState<Record<string, boolean>>({});
  // book-end the day with grey Sleep anchors (End Sleep / Start Sleep), like the app
  const allItems = anchors ? withSleepAnchors(inheritParentSlot(items)) : inheritParentSlot(items);
  // sleep window (hours slept = bedtime → wake) — shown on the anchor cards
  const sleepWin = computeSleepWindow(allItems.map((i) => ({
    display_name: i.display_name,
    scheduled_time: i.time ?? null,
    category: i.category ?? null,
    sleep_anchor: i.sleep_anchor,
  })));

  // wake hour = End Sleep / Wake item's hour, clamped 0..11, else 5
  let wakeHour = 5;
  for (const it of allItems) {
    if (isWake(it)) {
      const hm = parseHM(it.time);
      if (hm) { wakeHour = Math.min(11, Math.max(0, hm.h)); break; }
    }
  }

  const todOrder: Tod[] = ["Morning", "Afternoon", "Evening"];
  const byTod: Record<Tod, HomeItem[]> = { Morning: [], Afternoon: [], Evening: [] };
  for (const it of allItems) byTod[todForItem(it, wakeHour)].push(it);

  // Parent mode: a smart group of two or more steps (none holding sub-steps, none a meal slot, none a sleep step) becomes one parent row.
  const sections = todOrder.map((tod) => {
    const bands = (grouping === "smart" ? buildSmartBands(byTod[tod], tod) : buildBands(byTod[tod])).map((band) => {
      const blocks = toBlocks(band.items);
      const foldable = smartListMode === "parent" && band.slot === "smart" && band.cat !== "sleep" && !band.mealSlot && blocks.length >= 2 && blocks.every((b) => !b.kids.length)
        && !band.items.some((i) => SLEEPY_NAME.test(i.display_name || "") || categorizeFull(i) === "sleep");
      if (!foldable) return { band, blocks, folded: false };
      const starts = band.items.map((i) => parseHM(i.slotTime ?? i.time)?.mins).filter((m): m is number => m != null);
      const ends = band.items.map((i) => { const m = parseHM(i.slotTime ?? i.time)?.mins; return m == null ? null : m + (i.duration_minutes ?? DEFAULT_DURATION); }).filter((m): m is number => m != null);
      const first = band.items[0];
      const parent: HomeItem = { ...first, display_name: titleCase(band.parentLabel || band.label.toLowerCase()), duration_minutes: starts.length ? Math.max(...ends) - Math.min(...starts) : null, description: null, children: undefined, indent: false, image_url: null, repeat: false, done: band.items.every((i) => i.done), virtual: true };
      return { band, blocks: [{ it: parent, kids: band.items.map((i) => ({ ...i, indent: true })) }], folded: true };
    });
    return { tod, bands };
  });

  // The hue wheel turns once per row as the rows are drawn (top to bottom; a sub-step has none of its own, it takes its group's first).
  const hueOf = new Map<HomeItem, string>();
  let wheel = 0;
  for (const { bands } of sections) for (const { blocks } of bands) for (const { it } of blocks) hueOf.set(it, LIST_HUES[wheel++ % LIST_HUES.length]);
  const hue = (it: HomeItem) => hueOf.get(it) ?? LIST_HUES[0];
  // The spare-time slot of each part of the day, measured against Wake and bedtime (so only where the day is book-ended).
  const freeSlots = anchors ? sectionFreeSlots(sections.flatMap(({ bands }) => bands.map(({ band }) => band)), wakeHour) : {};

  // The current mobile strip begins on the selected day, keeping the selected
  // circle on the shared avatar/timeline axis (Tue→Mon in the reference).
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(date); d.setDate(date.getDate() + i); return d; });
  const today = new Date();

  const weekLine = `WEEK ${isoWeek(date)}`;
  const dark = theme === "dark";
  const ui = makeUi(dark);
  const wake = allItems.find(isWake);
  const nightDone = !!wake?.done;
  // The night container: a hollow column drawn in the text colour until the night is confirmed, then filled from the wake row's hue.
  const nightHue = wake ? hue(wake) : LIST_HUES[0];
  const nightStroke = nightDone ? 2 : 1;
  const nightStyle = nightDone
    ? { background: `linear-gradient(180deg, ${nightHue}, ${nightHue})`, border: `${nightStroke}px solid ${nightHue}` }
    : { background: "transparent", border: `${nightStroke}px solid ${ui.text}` };
  // A step still to come draws its rail and capsule outline in its own hue softened toward the neutral (the app's spineTone).
  const futureTone = (h: string) => mixHex(h, dark ? ui.muted : ui.faint, 0.55);
  const futureOpacity = dark ? 0.95 : 0.72;

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0, overflow: "hidden", background: ui.page }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "top left", display: "flex", flexDirection: "column", fontFamily: POPPINS, color: ui.text, overflow: "hidden", background: ui.page }}>
      {/* status bar */}
      <div style={{ padding: "18px 22px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, color: ui.muted }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.1 }}>{WD[date.getDay()]} {date.getDate()} {MON[date.getMonth()]}</span>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>7:20 pm</span>
      </div>

      {/* Fixed profile/calendar header with an independently scrolling timeline. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", margin: `0 ${MT.screenCardInset}px`, borderRadius: "20px 20px 0 0", background: ui.surface, display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", zIndex: 10, flexShrink: 0, paddingTop: 12, background: ui.surface, boxShadow: dark ? "0 5px 12px rgba(0,0,0,0.2)" : "0 5px 12px rgba(15,23,42,0.06)" }}>
        {/* The selected-day column terminates at the fixed day header. */}
        <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.nodeWidth / 2, top: 84, bottom: 0, width: MT.nodeWidth, borderBottom: 0, borderRadius: `${MT.nodeWidth / 2}px ${MT.nodeWidth / 2}px 0 0`, boxSizing: "border-box", zIndex: 0, ...nightStyle, borderBottomWidth: 0 }} />
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, padding: `0 ${MT.headerPadX}px`, marginBottom: 2, gap: 8, flexShrink: 0, position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: MT.headerLeadPad, flexShrink: 1, minWidth: 0 }}>
            <span style={{ width: MT.avatarSize, height: MT.avatarSize, borderRadius: MT.avatarSize / 2, background: "#E5E7EB", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {imageUrl
                ? <OptimizedImage src={imageUrl} alt="" aspectRatio={1} widths={THUMB_WIDTHS} sizes={`${MT.avatarSize}px`} style={{ height: "100%" }} />
                : <User size={13} color="#4B5563" strokeWidth={1.5} />}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: ui.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 126 }}>{profileName}</span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: ui.muted, whiteSpace: "nowrap" }}>{weekLine}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {[
              { Icon: Timer, label: "Timer" },
              { Icon: Apple, label: "Nutrition" },
            ].map(({ Icon, label }) => <button key={label} type="button" title={label} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${ui.border}`, background: ui.panel, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: ui.muted }}><Icon size={15} strokeWidth={2} /></button>)}
            <button type="button" title="Details" aria-pressed={showDetails} onClick={() => setShowDetails((v) => !v)} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${ui.border}`, background: ui.panel, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: ui.faint }}><Ellipsis size={16} strokeWidth={2} /></button>
          </div>
        </div>

        {/* WEEK STRIP */}
        <div style={{ display: "flex", justifyContent: "flex-start", padding: "2px 0 2px 12px", overflow: "hidden", flexShrink: 0, minHeight: 64, position: "relative", zIndex: 3 }}>
          {/* the thin connector the circles thread along */}
          <span aria-hidden="true" style={{ position: "absolute", left: 36, right: 0, top: 38, height: 1.5, background: ui.divider, zIndex: 0 }} />
          {week.map((d, i) => {
            const isToday = sameDay(d, today);
            const isSelected = sameDay(d, date);
            const strong = isToday || isSelected;
            return (
              <div key={i} style={{ width: 48, flex: "0 0 48px", display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 0", position: "relative", zIndex: isSelected ? 2 : 1 }}>
                <span style={{ fontSize: 10, fontWeight: strong ? 600 : 500, letterSpacing: 0.6, textTransform: "uppercase", color: strong || i > 0 ? ui.text : ui.muted, marginBottom: 4 }}>{WD[d.getDay()]}</span>
                <span style={{ width: 32, height: 32, borderRadius: 16, background: isSelected || isToday ? ui.surface : (i > 0 ? ui.panel : ui.surface), border: isSelected ? "none" : `2px solid ${ui.divider}`, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", position: "relative", zIndex: 2 }}>
                  {isSelected && <>
                    <span aria-hidden="true" style={{ position: "absolute", left: -2, top: -2, width: 36, height: 36, borderRadius: 18, border: `${nightStroke}px solid ${nightDone ? nightHue : ui.text}`, boxSizing: "border-box" }} />
                    <span aria-hidden="true" style={{ position: "absolute", inset: 3, borderRadius: 13, background: ui.selected }} />
                  </>}
                  <span style={{ position: "relative", fontSize: 14, fontWeight: strong ? 600 : 500, color: isSelected ? ui.onSelected : ui.text, fontVariantNumeric: "tabular-nums" }}>{d.getDate()}</span>
                </span>
                {dayMarks && (() => { const m = dayMarks(d); return (
                  // Mark row (mobile CycleDayMark): period bar, fertile dots, ovulation sparkle; moon glyph beside.
                  <span style={{ height: 10, marginTop: 3, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    {m.cycle === "period" && <span style={{ width: 16, height: 2.5, borderRadius: 2, background: "#F87171" }} />}
                    {m.cycle === "fertile" && <span style={{ width: 16, display: "inline-flex", justifyContent: "space-between" }}>{[0, 1, 2].map((k) => <span key={k} style={{ width: 3, height: 3, borderRadius: 2, background: "#14B8A6" }} />)}</span>}
                    {m.cycle === "ovulation" && <Sparkles size={10} color="#14B8A6" strokeWidth={2} />}
                    {m.moon && <span style={{ fontSize: 9, lineHeight: 1 }}>{m.moon}</span>}
                  </span>
                ); })()}
              </div>
            );
          })}
        </div>

        {/* the day's divider: the selected day, left-aligned, as the app draws it */}
        <div style={{ margin: `6px 16px 12px ${MT.rowContentX}px`, borderRadius: 14, background: ui.selected, color: ui.onSelected, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, position: "relative", zIndex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.9 }}>{WD_FULL[date.getDay()]} • {date.getDate()} {MON[date.getMonth()]}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8 }}>TODAY</span>
        </div>
        </div>

        <div className="phone-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 0 108px", position: "relative" }}>
        {/* One day spine, matching mobile: a thin dotted line (a future day), broken only by the row capsules. */}
        <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.railWidth / 2, top: 0, bottom: 0, width: MT.railWidth, background: DOTTED(dark ? ui.muted : ui.faint), opacity: dark ? 0.95 : 0.72, zIndex: 0 }} />

        {/* SECTIONS */}
        {sections.length === 0 && (
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 12, padding: "48px 0" }}>No steps scheduled</div>
        )}
        {sections.map(({ tod, bands }, si) => {
          // The spare-time slot sits where its own free time begins: in front of the first card that starts at or after it, else last.
          const slot = freeSlots[tod];
          const slotAt = slot ? bands.findIndex(({ band }) => { const m = parseHM(band.time)?.mins; return m != null && m >= slot.start; }) : -1;
          const freeRow = slot ? <FreeSlot ui={ui} label={freeLabel(slot.end - slot.start)} /> : null;
          return (
          <div key={tod} style={{ position: "relative", zIndex: 1, marginTop: si > 0 ? 16 : 0 }}>
            {si > 0 && <span aria-hidden="true" style={{ position: "absolute", top: -9, left: 0, right: 0, height: 1.5, backgroundImage: `repeating-linear-gradient(90deg, ${ui.faint} 0 5px, transparent 5px 10px)`, opacity: 0.5 }} />}
            <div style={{ padding: `2px 16px 4px ${MT.itemOriginX}px`, minHeight: 22, display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: ui.section, textTransform: "uppercase" }}>{tod}</span>
            </div>

            {bands.map(({ band, blocks, folded }, bi) => {
              const GroupIcon = band.smart === "hygiene" ? Droplet : CATEGORY_TINTS[band.cat].Icon;
              const all = blocks.flatMap((b) => [b.it, ...b.kids]);
              const complete = all.length > 0 && all.every((item) => item.done);
              const isSleepBand = band.cat === "sleep";
              // The card names what it holds; sleep and a folded group have no header (the folded parent row is the header).
              const showHeader = !isSleepBand && !folded && (!!band.smart || !!band.slot || band.items.length > 1);
              const groupKey = `${tod}:${bi}:${band.label}`;
              // Descriptions show when Details is on and the group's own Info is open (open until closed); the master gates every group.
              const groupOpen = groupDetails[groupKey] ?? true;
              const detailsOn = showDetails && groupOpen;
              const first = blocks[0].it;
              const groupHue = hue(first); // a sub-step ticks in its group's first hue
              const surface = complete ? `linear-gradient(90deg, ${withAlpha(groupHue, dark ? 0.24 : 0.11)}, ${withAlpha(hue(blocks[blocks.length - 1].it), dark ? 0.24 : 0.11)})` : ui.panel;
              const foreground = complete ? groupHue : ui.muted;
              return (
                <Fragment key={bi}>
                {bi === slotAt && freeRow}
                <div style={{ position: "relative", padding: `0 16px 8px ${MT.rowContentX}px` }}>
                  <div style={{ borderRadius: MT.groupRadius, paddingBottom: MT.groupPadBottom, background: surface, position: "relative" }}>
                    {/* card header: what the group holds, and its Info toggle */}
                    {showHeader && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${MT.groupHeaderPadY}px 14px`, minHeight: 42, boxSizing: "border-box" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <GroupIcon size={12} strokeWidth={2} color={foreground} />
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: foreground, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{band.label}</span>
                      </span>
                      <button type="button" aria-label={`${titleCase(band.label.toLowerCase())} details`} aria-pressed={detailsOn} onClick={() => setGroupDetails((s) => ({ ...s, [groupKey]: !groupOpen }))} style={{ width: 22, height: 22, padding: 0, border: 0, background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Info size={13} strokeWidth={2} color={detailsOn ? ui.text : ui.faint} /></button>
                    </div>}
                    {/* items */}
                    <div style={{ padding: showHeader ? "0 8px 2px" : `${MT.singletonPadTop}px 8px 2px`, display: "flex", flexDirection: "column", gap: MT.groupItemGap }}>
                      {blocks.map(({ it, kids }, ii) => {
                        const ic = iconFor(it);
                        const ItemIcon = ic.Icon;
                        const wakeRow = isWake(it), bedRow = isBed(it);
                        const isDone = it.done !== undefined ? !!it.done : (kids.length > 0 && kids.every((k) => k.done));
                        const h = hue(it);
                        const recurrence = recurrenceOf(it);
                        const Glyph = recurrence === "calendar" ? Calendar : Repeat;
                        const track = wakeRow || bedRow ? null : trackerOf(it);
                        const pillText = wakeRow || bedRow ? null : durationPillOf(it);
                        const sleepNight = sleepWin.durationLabel && (wakeRow || bedRow) ? sleepWin.durationLabel.replace(/\s+/g, "") : null;
                        const dur = it.duration_minutes || 0;
                        const capsuleH = wakeRow || bedRow ? 52 : dur <= 35 ? 48 : Math.min(72, Math.round(48 + (dur - 35) * 0.8));
                        const isBlock = kids.length > 0;
                        const hasDetail = detailsOn && (!!it.description || !!it.children?.length);
                        return (
                          <div key={ii} style={{ position: "relative", minHeight: 56 }}>
                            {/* the rail through this step: solid in its hue once done, else dotted like a day still to come */}
                            <span style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.railWidth / 2, top: 0, bottom: ii === blocks.length - 1 ? -16 : -6, width: MT.railWidth, background: isDone ? h : DOTTED(futureTone(h)), opacity: isDone ? 1 : futureOpacity }} />
                            {/* Bedtime mirrors wake: the night column continues below the capsule. */}
                            {bedRow && <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.nodeWidth / 2, top: 2 + capsuleH - 1, height: 100, width: MT.nodeWidth, WebkitMaskImage: "linear-gradient(180deg, #000 35%, transparent)", maskImage: "linear-gradient(180deg, #000 35%, transparent)", borderTop: 0, boxSizing: "border-box", zIndex: 1, ...nightStyle, borderTopWidth: 0 }} />}
                            {/* Day → wake bridge: continues the selected-day column from the fixed header down into the wake capsule. */}
                            {wakeRow && <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.nodeWidth / 2, top: -2000, height: 2002, width: MT.nodeWidth, boxSizing: "border-box", zIndex: 1, ...nightStyle, borderTopWidth: 0, borderBottomWidth: 0 }} />}
                            {/* The capsule on the lane: a block's spans the card and its sub-steps. */}
                            <span style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.nodeWidth / 2, top: isBlock ? 0 : 28 - capsuleH / 2, ...(isBlock ? { bottom: 0 } : { height: capsuleH }), width: MT.nodeWidth, borderRadius: wakeRow ? `0 0 ${MT.nodeWidth / 2}px ${MT.nodeWidth / 2}px` : bedRow ? `${MT.nodeWidth / 2}px ${MT.nodeWidth / 2}px 0 0` : MT.nodeWidth / 2, overflow: "hidden", ...(wakeRow || bedRow ? { background: nightDone ? nightHue : "transparent", border: `${nightStroke}px solid ${nightDone ? nightHue : ui.text}`, borderTopWidth: wakeRow ? 0 : nightStroke, borderBottomWidth: bedRow ? 0 : nightStroke } : isDone ? { background: withAlpha(h, 0.8), border: 0 } : { background: ui.row, border: `1px solid ${futureTone(h)}` }), boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                              {!isDone && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: `${ui.muted}14` }} />}
                              {it.image_url && !/recipe_water-|openfoodfacts/i.test(it.image_url) && !wakeRow && !bedRow
                                ? <OptimizedImage src={it.image_url} alt="" proportional widths={THUMB_WIDTHS} sizes={`${isBlock ? 160 : Math.max(MT.nodeWidth, capsuleH)}px`} style={{ position: "relative", opacity: isDone ? 1 : 0.72 }} imgStyle={{ filter: isDone ? "none" : "grayscale(1)" }} />
                                : wakeRow ? <Sun size={15} strokeWidth={2.2} color={isDone ? "#FFFFFF" : ui.muted} style={{ position: "relative" }} />
                                  : <ItemIcon size={15} strokeWidth={2.2} color={isDone ? "#FFFFFF" : ui.muted} style={{ position: "relative" }} />}
                            </span>
                            {/* the step's card */}
                            <div style={{ borderRadius: 12, background: ui.row, border: dark ? `1px solid ${ui.itemBorder}` : "none", boxShadow: ui.rowShadow, overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 50, padding: "9px 10px", boxSizing: "border-box" }}>
                                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 5, minWidth: 0 }}>
                                    <ItemIcon size={16} strokeWidth={1.75} color={ui.muted} style={{ flexShrink: 0, marginTop: 0.5 }} />
                                    <span title={it.display_name} style={{ flex: "1 1 0", minWidth: 0, fontSize: 14, fontWeight: 600, lineHeight: "17px", color: ui.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "break-word" }}>{it.display_name}</span>
                                  </div>
                                  {/* time tab, repeat glyph, then how long */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 2, minWidth: 0 }}>
                                    {it.time && <span style={{ padding: "3px 8px", borderRadius: 999, background: ui.tab, fontSize: 11, lineHeight: "15px", fontWeight: 500, color: ui.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtTime(it.time)}</span>}
                                    {recurrence && <Glyph size={11} strokeWidth={2} color={ui.faint} style={{ marginLeft: 2, flexShrink: 0 }} />}
                                    {!wakeRow && !bedRow && dur > 0 && rowType(it) === "activity" && <span style={{ marginLeft: 6, fontSize: 11, lineHeight: "15px", color: isDone ? ui.muted : ui.faint, whiteSpace: "nowrap" }}>{durLabel(dur)}</span>}
                                  </div>
                                </div>
                                <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, minHeight: 26 }}>
                                  {sleepNight && <span style={{ minWidth: 36, height: 24, borderRadius: 12, padding: "0 8px", background: ui.pill, fontSize: 11, fontWeight: 500, color: dark ? ui.text : "#6B7280", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{sleepNight}</span>}
                                  {wakeRow && <span style={{ width: 22, height: 22, borderRadius: 11, marginLeft: 6, background: ui.pill, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><NotebookPen size={12} strokeWidth={2.2} color={ui.text} /></span>}
                                  {pillText && <span style={{ minWidth: 36, height: 24, borderRadius: 12, padding: "0 8px", background: ui.pill, fontSize: 11, fontWeight: 500, color: dark ? ui.text : "#6B7280", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{pillText}</span>}
                                  {track && !isDone && <span title={track.label} style={{ width: 26, height: 26, borderRadius: 13, background: ui.pill, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><track.Icon size={13} strokeWidth={2.2} color={dark ? ui.text : ui.muted} /></span>}
                                  <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: isDone ? h : "transparent", border: `1.5px solid ${isDone ? h : ui.checkBorder}`, boxSizing: "border-box" }}>
                                    {isDone && <Tick size={16} ink={tickInkOn(h)} />}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {hasDetail && (
                              <div style={{ marginTop: 4, borderRadius: 12, padding: "7px 12px", background: dark ? "#242427" : "rgba(229,231,235,0.58)", border: "1px solid rgba(148,163,184,0.10)" }}>
                                {it.description && <div style={{ fontSize: 10, lineHeight: 1.45, fontWeight: 400, color: ui.muted }}>{it.description}</div>}
                                {it.children && it.children.length > 0 && (
                                  <div style={{ marginTop: it.description ? 5 : 0, display: "flex", flexDirection: "column", gap: 4 }}>
                                    {it.children.map((c, ci) => (
                                      <div key={ci} style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
                                        <span style={{ width: 4, height: 4, borderRadius: 2, background: ui.faint, flexShrink: 0, marginTop: 5, opacity: 0.75 }} />
                                        <span style={{ fontSize: 10, color: ui.muted, lineHeight: 1.4 }}>{c}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* sub-steps under their parent, then the Add row */}
                            {isBlock && <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
                              {kids.map((k, ki) => <SubStepRow key={ki} it={k} ui={ui} hue={groupHue} />)}
                              {addRows && !folded && <AddRow ui={ui} />}
                            </div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                </Fragment>
              );
            })}
            {slot && slotAt === -1 && freeRow}
          </div>
          );
        })}

        </div>
      </div>

      {/* floating TAB BAR */}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 10, zIndex: 50, isolation: "isolate", display: "flex", alignItems: "center", borderRadius: 56, background: ui.dock, border: `1px solid ${ui.border}`, boxShadow: dark ? "0 -4px 20px rgba(0,0,0,0.34)" : "0 -4px 20px rgba(15,23,42,0.08)", padding: "8px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, justifyContent: "space-around" }}>
          {[
            { I: GitCommitVertical, label: "Home", active: true },
            { I: ListChecks, label: "Tasks", active: false },
            { I: Repeat, label: "Routines", active: false },
            { I: TrendingUp, label: "Stats", active: false },
            { I: ShoppingBasket, label: "Supplies", active: false },
          ].map(({ I, label, active }) => (
            <div key={label} style={{ width: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <I size={24} strokeWidth={active ? 1.5 : 1} color={active ? ui.selected : ui.faint} />
              <span style={{ fontSize: 9, lineHeight: "12px", fontWeight: 400, marginTop: 2, color: active ? ui.selected : ui.faint }}>{label}</span>
            </div>
          ))}
        </div>
        <span style={{ width: 56, height: 56, borderRadius: 28, background: ui.plus, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 4, flexShrink: 0, boxShadow: "0 4px 6px rgba(0,0,0,0.25)" }}>
          <Plus size={28} strokeWidth={1} color={ui.plusInk} />
        </span>
      </div>
    </div>
    </div>
  );
}
