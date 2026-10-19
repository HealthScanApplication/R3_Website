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
import { useState } from "react";
import {
  User, ChartNoAxesCombined, ShoppingBasket, ListChecks, Plus, Repeat, Check, Sparkles,
  Timer, Apple, Ellipsis, SlidersHorizontal, RefreshCw, Sun,
} from "lucide-react";
import {
  CATEGORY_TINTS, itemIcon, type CatKey, type ProtocolItem as CatItem,
} from "../../config/protocolCategories";
import { computeSleepWindow } from "../../utils/sleepWindow";
import { getItemTod, parseHM, type SimpleTod } from "../../protocolDomain/timeOfDay";
import { mealSlotName } from "../../protocolDomain/mealSlot";
import { isSleepItemByName } from "../../protocolDomain/category";
import { claimsBedAnchor, claimsWakeAnchor } from "../../protocolDomain/sleepAnchorClaim";
import { MOBILE_CATEGORY_TINTS, MOBILE_TIMELINE as MT } from "./mobileTimelineContract";

const POPPINS = '"Poppins", system-ui, -apple-system, sans-serif';
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
  return parseHM(it.time)?.mins ?? 5e8;
}
// An indented sub-item stays with the item above it: it takes that parent's time, slot and list, so grouping by part
// of the day and sorting by time never separate the two (the stable sorts then keep it right under its parent).
function inheritParentSlot(items: HomeItem[]): HomeItem[] {
  let parent: HomeItem | undefined;
  return items.map((it) => {
    if (!it.indent) { parent = it; return it; }
    return parent ? { ...it, time: parent.time, group_name: parent.group_name, category: parent.category, subtype: parent.subtype } : it;
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
    ...(hasEnd ? [] : [{ display_name: "End Sleep", item_type: "activity", category: "sleep", sleep_anchor: "wake", time: wakeTime } as HomeItem]),
    ...items,
    ...(hasStart ? [] : [{ display_name: "Start Sleep", item_type: "activity", category: "sleep", sleep_anchor: "bed", time: "22:00" } as HomeItem]),
  ];
}

type Tod = SimpleTod;
const todForItem = (it: HomeItem, wakeHour: number): Tod =>
  getItemTod({ group_name: it.group_name, scheduled_time: it.time, display_name: it.display_name, category: it.category }, wakeHour);

interface Band { cat: CatKey; slot: string | null; firstMin: number | null; order: number; time?: string | null; label: string; items: HomeItem[] }
function buildBands(list: HomeItem[]): Band[] {
  const sorted = [...list].sort((a, b) => orderKey(a) - orderKey(b));
  const bands: Band[] = [];
  for (const it of sorted) {
    const cat = categorizeFull(it);
    const slot = mealSlot(it.group_name);
    const m = parseHM(it.time)?.mins ?? null;
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
   A group is a function of (time-of-day phase, subtype): "Morning Hygiene",
   "Evening Meal". Sleep anchors stay their own unprefixed "Sleep" group. */
type SmartCategory = "hygiene" | "wellness" | "fitness" | "supplements" | "meal" | "work" | "home" | "tasks";
const SMART_ORDER: SmartCategory[] = ["hygiene", "wellness", "fitness", "supplements", "meal", "work", "home", "tasks"];
const SMART_TITLE: Record<SmartCategory, string> = { hygiene: "Hygiene", wellness: "Wellness", fitness: "Fitness", supplements: "Supplements", meal: "Meal", work: "Work", home: "Home", tasks: "Tasks" };
const SUBTYPE_TO_SMART: Record<string, SmartCategory> = { hygiene: "hygiene", wellness: "wellness", reflection: "wellness", finance: "home", planning: "tasks", work: "work", home: "home", tasks: "tasks", exercise: "fitness", supplement: "supplements", meal: "meal", beverage: "meal", drink: "meal", snack: "meal" };
const SMART_CATEGORY_FALLBACK: Record<string, SmartCategory> = { supplement: "supplements", supplements: "supplements", consume: "meal", do: "wellness" };
const SMART_TYPE_FALLBACK: Record<string, SmartCategory> = { supplement: "supplements", consume: "meal", recipe: "meal", product: "supplements", activity: "wellness", rule: "wellness" };
function smartCategoryFor(it: HomeItem): SmartCategory {
  const sub = (it.subtype || "").toLowerCase().trim();
  if (SUBTYPE_TO_SMART[sub]) return SUBTYPE_TO_SMART[sub];
  const cat = (it.category || "").toLowerCase().trim();
  if (SMART_CATEGORY_FALLBACK[cat]) return SMART_CATEGORY_FALLBACK[cat];
  const type = (it.item_type || "").toLowerCase().trim();
  return SMART_TYPE_FALLBACK[type] || "wellness";
}
const SMART_TINT: Record<SmartCategory, CatKey> = { hygiene: "do", wellness: "do", fitness: "do", supplements: "supplements", meal: "consume", work: "do", home: "do", tasks: "do" };
function buildSmartBands(list: HomeItem[], tod: string): Band[] {
  const bands: Band[] = [];
  const sleepItems = list.filter((it) => categorizeFull(it) === "sleep");
  const rest = list.filter((it) => categorizeFull(it) !== "sleep");
  const byCat = new Map<SmartCategory, HomeItem[]>();
  for (const it of rest) { const c = smartCategoryFor(it); byCat.set(c, [...(byCat.get(c) || []), it]); }
  const sortItems = (xs: HomeItem[]) => [...xs].sort((a, b) => orderKey(a) - orderKey(b));
  for (const it of sortItems(sleepItems)) bands.push({ cat: "sleep", slot: null, firstMin: parseHM(it.time)?.mins ?? null, order: orderKey(it), time: it.time, label: "SLEEP", items: [it] });
  for (const c of SMART_ORDER) {
    const items = byCat.get(c);
    if (!items?.length) continue;
    const sorted = sortItems(items);
    bands.push({ cat: SMART_TINT[c], slot: "smart", firstMin: parseHM(sorted[0].time)?.mins ?? null, order: orderKey(sorted[0]), time: sorted[0].time, label: SMART_TITLE[c].toUpperCase() /* the part of the day is its own header above */, items: sorted });
  }
  // Wake leads the morning; every other sleep band (bedtime, "Sleep in complete darkness") closes
  // the day. Smart groups sit between, in category order.
  const rank = (b: Band) => b.cat === "sleep" ? (b.items.some(isWake) ? -1 : 1000) : SMART_ORDER.indexOf(b.label.split(" ").pop()!.toLowerCase() as SmartCategory);
  return bands.sort((a, b) => rank(a) - rank(b));
}

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

/* ───────── the screen ───────── */
export function ProtocolHomeScreen({
  protocolName,
  items,
  date = new Date(),
  done = 0,
  scale = 0.85,
  anchors = true,
  imageUrl = JOHN_AVATAR,
  showDetails: showDetailsProp = true,
  theme = "light",
  profileName = "John Ferreira",
  grouping = "smart",
  dayMarks,
}: {
  /** Per-date marks under the week strip, as the app draws them (cycle) plus an optional moon glyph. */
  dayMarks?: (date: Date) => { cycle?: "period" | "fertile" | "ovulation" | null; moon?: string | null };
  /** 'smart' groups by phase + category like the mobile smart lists. */
  grouping?: "time" | "smart";
  protocolName: string;
  items: HomeItem[];
  date?: Date;
  done?: number;
  /** Protocol cover image, shown as the header avatar. */
  imageUrl?: string | null;
  /** Shrink the whole app UI to fit the device frame more naturally (1 = real-phone size). */
  scale?: number;
  /** Book-end the day with the grey Sleep anchors (off for a clean checked-off demo). */
  anchors?: boolean;
  /** Initial state of the in-frame "Details" toggle (each step's description + child checklist). */
  showDetails?: boolean;
  /** Mirrors the app's system appearance. */
  theme?: "light" | "dark";
  profileName?: string;
}) {
  // In-frame toggle for per-step descriptions + child do/don't lines (mirrors the app's showDetails).
  const [showDetails, setShowDetails] = useState(showDetailsProp);
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
  const sections = todOrder
    .map((tod) => ({ tod, bands: grouping === "smart" ? buildSmartBands(byTod[tod], tod) : buildBands(byTod[tod]) }))
    // All three day parts always show; an empty one gets an "Add" slot (as in the app).
    ;

  // The current mobile strip begins on the selected day, keeping the selected
  // circle on the shared avatar/timeline axis (Tue→Mon in the reference).
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(date); d.setDate(date.getDate() + i); return d; });
  const today = new Date();

  const weekLine = `WEEK ${isoWeek(date)}`;
  const headerDate = `${WD_FULL[date.getDay()]} · ${date.getDate()} ${MON[date.getMonth()]}`;
  const dark = theme === "dark";
  const ui = dark ? {
    outside: "#000000", surface: "#1C1C1E", panel: "#29292C", card: "#000000",
    text: "#F7F7F8", muted: "#98989F", faint: "#5D5D63", border: "#343438",
    dayPill: "#FFFFFF", dayPillText: "#111827", dock: "#1C1C1E", plus: "#FFFFFF", plusInk: "#111827",
  } : {
    outside: "#EEEEEF", surface: "#FFFFFF", panel: "#F4F6F8", card: "#FFFFFF",
    text: "#101827", muted: "#6B7280", faint: "#A5ADBA", border: "#E2E6EB",
    dayPill: "#101827", dayPillText: "#FFFFFF", dock: "rgba(255,255,255,0.96)", plus: "#101827", plusInk: "#FFFFFF",
  };
  const purple = "#8C55D6";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: ui.outside }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "top left", display: "flex", flexDirection: "column", fontFamily: POPPINS, color: ui.text, overflow: "hidden", background: ui.outside }}>
      {/* status bar */}
      <div style={{ padding: "18px 22px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, color: ui.muted }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.1 }}>{WD[date.getDay()]} {date.getDate()} {MON[date.getMonth()]}</span>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>7:20 pm</span>
      </div>

      {/* Fixed profile/calendar header with an independently scrolling timeline. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", margin: `0 ${MT.screenCardInset}px`, borderRadius: "22px 22px 0 0", background: ui.surface, display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", zIndex: 10, flexShrink: 0, paddingTop: 13, background: ui.surface, boxShadow: dark ? "0 5px 12px rgba(0,0,0,0.2)" : "0 5px 12px rgba(15,23,42,0.06)" }}>
        {/* The selected-day column terminates at the fixed day header. */}
        <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.nodeWidth / 2, top: 85, bottom: 0, width: MT.nodeWidth, background: `linear-gradient(180deg, ${purple} 0%, #965BD2 54%, #A96EAE 100%)`, borderLeft: `1.5px solid ${purple}`, borderRight: `1.5px solid ${purple}`, boxSizing: "border-box", opacity: 0.96, zIndex: 0 }} />
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, padding: `0 ${MT.headerPadX}px`, marginBottom: 6, gap: 8, flexShrink: 0, position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: MT.headerLeadPad, flexShrink: 1, minWidth: 0 }}>
            <span style={{ width: MT.avatarSize, height: MT.avatarSize, borderRadius: MT.avatarSize / 2, background: "#E5E7EB", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {imageUrl
                ? <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <User size={13} color="#4B5563" strokeWidth={1.5} />}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-start", minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: ui.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 126 }}>{profileName}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1.1, color: ui.muted, whiteSpace: "nowrap" }}>{weekLine}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {[
              { Icon: Timer, label: "Timer" },
              { Icon: Apple, label: "Nutrition" },
            ].map(({ Icon, label }) => <button key={label} type="button" title={label} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${ui.border}`, background: ui.panel, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: ui.muted }}><Icon size={15} strokeWidth={2} /></button>)}
            <button type="button" title="Protocol menu" onClick={() => setShowDetails((v) => !v)} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${ui.border}`, background: ui.panel, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: ui.muted }}><Ellipsis size={16} strokeWidth={2} /></button>
          </div>
        </div>

        {/* WEEK STRIP */}
        <div style={{ display: "flex", justifyContent: "flex-start", padding: "2px 0 10px 14px", overflow: "hidden", flexShrink: 0, minHeight: 53, position: "relative", zIndex: 3 }}>
          {week.map((d, i) => {
            const isToday = sameDay(d, today);
            const isSelected = sameDay(d, date);
            const circleBg = isToday || isSelected ? (dark ? "#F7F7F8" : "#101827") : ui.panel;
            const filled = isToday || isSelected;
            return (
              <div key={i} style={{ width: 44, flex: "0 0 44px", display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0", position: "relative", zIndex: isSelected ? 2 : 1 }}>
                <span style={{ fontSize: 9.5, fontWeight: filled ? 700 : 600, letterSpacing: 0.6, textTransform: "uppercase", color: filled ? ui.text : ui.muted, marginBottom: 4 }}>{WD[d.getDay()]}</span>
                <span style={{ width: 32, height: 32, borderRadius: 16, background: circleBg, border: isSelected ? `3px solid ${purple}` : `2px solid ${ui.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", position: "relative", zIndex: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: filled ? (dark ? "#111827" : "#FFFFFF") : ui.text, fontVariantNumeric: "tabular-nums" }}>{d.getDate()}</span>
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

        <div style={{ margin: `0 15px 10px ${MT.rowContentX}px`, borderRadius: 18, background: ui.dayPill, color: ui.dayPillText, padding: "10px 14px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textAlign: "center", flexShrink: 0, position: "relative", zIndex: 1 }}>{headerDate} · TODAY</div>
        </div>

        <div className="phone-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 0 108px", position: "relative" }}>
        {/* One day spine, matching mobile. Per-row colour segments paint over
            this base rail, but section and group gaps can no longer break it. */}
        <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.railWidth / 2, top: 0, bottom: 0, width: MT.railWidth, background: dark ? "#5D5D63" : "#9CA3AF", opacity: 0.62, zIndex: 0 }} />

        {/* SECTIONS */}
        {sections.length === 0 && (
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 12, padding: "48px 0" }}>No steps scheduled</div>
        )}
        {sections.map(({ tod, bands }) => (
          <div key={tod} style={{ position: "relative", zIndex: 1 }}>
            <div style={{ padding: `8px 16px 7px ${MT.itemOriginX}px`, minHeight: 24, display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: "#374151", textTransform: "uppercase" }}>{tod}</span>
            </div>

            {bands.every((band) => band.cat === "sleep") && (
              <div style={{ position: "relative", padding: `0 16px 10px ${MT.rowContentX}px` }}>
                <div style={{ minHeight: 48, border: `1.5px dashed ${ui.faint}`, borderRadius: dark ? 12 : MT.groupRadius, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: ui.muted, fontSize: 12, fontWeight: 600 }}>
                  <Plus size={13} strokeWidth={2} /> Add to {tod.toLowerCase()}
                </div>
              </div>
            )}
            {bands.map((band, bi) => {
              const tint = CATEGORY_TINTS[band.cat];
              const GroupIcon = tint.Icon;
              const complete = band.items.length > 0 && band.items.every((item) => item.done);
              const showHeader = band.items.length > 1 || band.cat === "sleep" || !!band.slot;
              const bandTint = MOBILE_CATEGORY_TINTS[dark ? "dark" : "light"][band.cat];
              const darkPurple = "#9A5BE1";
              const darkPurpleSurface = "#352446";
              const completedSleepSurface = dark ? "#352446" : "#F0E8FA";
              const completedFg = band.cat === "sleep" ? purple : bandTint.fg;
              const completedBg = band.cat === "sleep" ? completedSleepSurface : bandTint.bg;
              const surface = complete
                ? completedBg
                : ui.panel;
              const foreground = complete
                ? completedFg
                : ui.muted;
              return (
                <div key={bi} style={{ position: "relative", padding: `0 16px 10px ${MT.rowContentX}px` }}>
                  <div style={{ borderRadius: dark ? 12 : MT.groupRadius, paddingBottom: MT.groupPadBottom, background: surface, position: "relative" }}>
                    {/* band header */}
                    {showHeader && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${MT.groupHeaderPadY}px 14px` }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <GroupIcon size={12} strokeWidth={2} color={foreground} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.75, color: foreground, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{band.label}</span>
                      </span>
                    </div>}
                    {/* items */}
                    <div style={{ padding: showHeader ? "0 8px 2px" : `${MT.singletonPadTop}px 8px 2px`, display: "flex", flexDirection: "column", gap: MT.groupItemGap }}>
                      {band.items.map((it, ii) => {
                        const ic = iconFor(it);
                        const ItemIcon = ic.Icon;
                        const isDone = !!it.done;
                        const mobileTint = bandTint;
                        const sleepExtra = sleepWin.durationLabel && isWake(it) ? `${sleepWin.durationLabel} sleep`
                          : sleepWin.durationLabel && isBed(it) ? `${sleepWin.durationLabel} until wake` : null;
                        // Titles are verb + noun ("Go cycling"), so the line under them reads on: "at 7:30am for 20 min".
                        // Sleep anchors keep the mobile "7:00am · 8h 30m sleep" form.
                        const sub = isWake(it) || isBed(it)
                          ? [fmtTime(it.time), sleepExtra].filter(Boolean).join(" · ")
                          : [it.time ? `at ${fmtTime(it.time)}` : null, it.duration_minutes ? `for ${it.duration_minutes} min` : null].filter(Boolean).join(" ");
                        const nodeH = isWake(it) || isBed(it) ? 66 : Math.max(34, Math.min(48, 34 + ((it.duration_minutes || 0) / 15) * 3));
                        const hasDetail = showDetails && (!!it.description || !!it.children?.length);
                        return (
                          <div key={ii} style={{ position: "relative", minHeight: Math.max(48, nodeH), paddingLeft: it.indent ? 16 : 0 }}>
                            {/* Media capsule shares the lane axis; time stays in the card metadata. */}
                            <span style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.railWidth / 2, top: 0, bottom: ii === band.items.length - 1 ? -12 : -6, width: MT.railWidth, background: isDone ? completedFg : ui.muted, opacity: 0.75 }} />
                            {/* Day → wake bridge: continues the selected-day column from the fixed header down
                                into the wake capsule. Extends upward and is clipped by the scrolling timeline,
                                so it meets the header column exactly and scrolls with the day like mobile. */}
                            {/* Bedtime mirrors wake: the night column continues below the capsule. */}
                            {isBed(it) && <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.nodeWidth / 2, top: 2 + nodeH - 1, height: 100, width: MT.nodeWidth, background: `linear-gradient(180deg, ${purple} 0%, #965BD2 100%)`, WebkitMaskImage: "linear-gradient(180deg, #000 35%, transparent)", maskImage: "linear-gradient(180deg, #000 35%, transparent)", borderLeft: `1.5px solid ${purple}`, borderRight: `1.5px solid ${purple}`, boxSizing: "border-box", zIndex: 1 }} />}
                            {isWake(it) && <span aria-hidden="true" style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.nodeWidth / 2, top: -2000, height: 2002, width: MT.nodeWidth, background: `linear-gradient(180deg, #A96EAE 0%, #A96EAE calc(100% - 110px), #965BD2 calc(100% - 50px), ${purple} 100%)`, borderLeft: `1.5px solid ${purple}`, borderRight: `1.5px solid ${purple}`, boxSizing: "border-box", zIndex: 1 }} />}
                            {!it.indent && <span style={{ position: "absolute", left: MT.axisX - MT.itemOriginX - MT.nodeWidth / 2, top: 2, width: MT.nodeWidth, height: nodeH, borderRadius: isWake(it) ? `0 0 ${MT.nodeWidth / 2}px ${MT.nodeWidth / 2}px` : isBed(it) ? `${MT.nodeWidth / 2}px ${MT.nodeWidth / 2}px 0 0` : MT.nodeWidth / 2, overflow: "hidden", background: isWake(it) || isBed(it) ? purple : (isDone ? completedFg : ui.card), border: `1.5px solid ${isWake(it) || isBed(it) ? purple : (isDone ? completedFg : ui.muted)}`, borderTopWidth: isWake(it) ? 0 : 1.5, display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                              {it.image_url && !/recipe_water-|openfoodfacts/i.test(it.image_url)
                                ? <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: isDone ? "none" : "grayscale(1)", opacity: isDone ? 1 : 0.72 }} />
                                : isWake(it) ? <Sun size={16} strokeWidth={1.8} color="#FFFFFF" />
                                  : <ItemIcon size={15} strokeWidth={1.8} color={isDone ? "#FFFFFF" : "#9CA3AF"} />}
                            </span>}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, minHeight: isWake(it) || isBed(it) ? 54 : 48, background: ui.card, borderRadius: dark ? 10 : MT.itemRadius, padding: "8px 9px 8px 11px", boxShadow: dark ? "none" : "0 1px 2px rgba(17,24,39,0.04)" }}>
                            <div style={{ flex: "1 1 0", minWidth: 0, overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 5, minWidth: 0, overflow: "hidden" }}>
                                <span title={it.display_name} style={{ flex: "1 1 0", minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: isDone ? ui.muted : ui.text, textDecoration: isDone ? "line-through" : "none", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "break-word" }}>{it.display_name}</span>
                                {it.repeat && <Repeat size={10} color="#9CA3AF" strokeWidth={2} style={{ flexShrink: 0 }} />}
                              </div>
                              {sub && <div style={{ fontSize: 10, fontWeight: 400, color: isDone ? "#C4C4C0" : "#9CA3AF", textDecoration: isDone ? "line-through" : "none", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
                            </div>
                            <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: isDone ? purple : ui.card, border: isDone ? `1px solid ${purple}` : `1.5px solid ${ui.border}` }}>
                              {isDone && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                            </span>
                            </div>
                            {hasDetail && (
                              <div style={{ marginTop: 4, borderRadius: dark ? 10 : 12, padding: "7px 12px", background: isDone ? completedBg : (dark ? "#242427" : "rgba(229,231,235,0.58)"), border: `1px solid ${isDone ? completedFg + "24" : (dark ? "rgba(148,163,184,0.10)" : "rgba(148,163,184,0.10)")}` }}>
                                {it.description && <div style={{ fontSize: 10, lineHeight: 1.45, fontWeight: 400, color: isDone ? completedFg : ui.muted }}>{it.description}</div>}
                                {it.children && it.children.length > 0 && (
                                  <div style={{ marginTop: it.description ? 5 : 0, display: "flex", flexDirection: "column", gap: 4 }}>
                                    {it.children.map((c, ci) => (
                                      <div key={ci} style={{ display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0 }}>
                                        <span style={{ width: 4, height: 4, borderRadius: 2, background: isDone ? completedFg : ui.faint, flexShrink: 0, marginTop: 5, opacity: 0.75 }} />
                                        <span style={{ fontSize: 10, color: isDone ? completedFg : ui.muted, lineHeight: 1.4 }}>{c}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        </div>
      </div>

      {/* floating TAB BAR */}
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 8, zIndex: 50, isolation: "isolate", display: "flex", alignItems: "center", borderRadius: 40, background: dark ? "#1C1C1E" : "#FFFFFF", border: `1px solid ${ui.border}`, boxShadow: dark ? "0 -6px 24px rgba(0,0,0,0.34)" : "0 -6px 24px rgba(15,23,42,0.14)", padding: "8px 5px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, justifyContent: "space-around" }}>
          {[
            { I: SlidersHorizontal, label: "Home", active: true },
            { I: ListChecks, label: "Tasks", active: false },
            { I: RefreshCw, label: "Routines", active: false },
            { I: ChartNoAxesCombined, label: "Stats", active: false },
            { I: ShoppingBasket, label: "Supplies", active: false },
          ].map(({ I, label, active }) => (
            <div key={label} style={{ width: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 38, height: 30, borderRadius: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", background: active ? ui.panel : "transparent" }}>
                <I size={19} strokeWidth={active ? 2 : 1.4} color={active ? ui.text : ui.muted} />
              </span>
              <span style={{ fontSize: 8.5, fontWeight: 400, marginTop: 2, color: active ? ui.text : ui.muted }}>{label}</span>
            </div>
          ))}
        </div>
        <span style={{ width: 48, height: 48, borderRadius: 24, background: ui.plus, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 4, flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
          <Plus size={24} strokeWidth={1.6} color={ui.plusInk} />
        </span>
      </div>
    </div>
    </div>
  );
}
