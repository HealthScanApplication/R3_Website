# Multi-week catalogue routines: audit, 2026-10-19

**Scope:** 22 catalogue Protocols on STAGING (`mofhvoudjxinvpplsytd`, `protocols.user_id IS NULL`) whose name or description says N days or N weeks, while every item has `day_number` NULL or 1.
**Status:** applied on STAGING 2026-10-19 (9 protocols now hold 484 items, matching the dry run). Production is not touched.
**Migration:** `supabase/migrations/20261019120000_multi_week_catalogue_routines.sql`

## How the app reads days (mobile `useActiveProtocol`, `protocolDayNumber`)

- **Cycle day.** The cycle day is `(local days since activation % protocols.total_days) + 1`. An item with a `day_number` shows only on that cycle day. NULL means every day. If `total_days` is NULL or ≤ 1, there is no day filter at all.
- **Weekly items.** These use `recurrence_type='weekly'` plus `recurrence_days_of_week` (0 = Sun) with `day_number` NULL. This is the same shape the website's Fitness planner writes (`protocolBuilders.ts` `weekly()`).
- **No day ranges.** A phase covering days 15–42 therefore needs one row per day. `week_number` exists on `protocol_items` but is metadata only; the day view does not filter on it.
  - Phased items are copied per day: the original row becomes the first day of its range.
  - Follow-up worth considering: an app-side `day_from`/`day_to` (or a filter on `week_number`) would remove the copies.
- **Rules.** Rules under weekly items get the same weekdays as their parent.

## Classification

### (a) Same every day: fine as is (11, with 21-Day Dry Brushing below)

| Protocol | Why |
|---|---|
| Matthew Walker Sleep Protocol | Nightly sleep hygiene; "7 days/week" means every day |
| Prenatal Wellness | Daily routine |
| Postnatal Recovery | Daily routine; gradual return to fitness is guidance, not a schedule |
| Gut Healing | "4–8 weeks" of the same daily habits. Its `End Sleep` day_number 1 is left alone (sleep-anchor gotcha) |
| 28-Day Herbal Protocol | Same herbs daily for 28 days (`total_days` 28) |
| 3-Week Herbal Tea Protocol | Kidney tea daily for 21 days |
| Seasonal Herbal Reset | Same daily items for about 18 days |
| Functional-Medicine Daily Routine | Daily; "30 days elimination" is a diet rule |
| Intermittent Fasting + Protein Pacing | Same eating rhythm every day |
| Monthly Blood Panel Prep | A single 24-hour prep (`total_days` 1) |

**One cleanup in the migration:** 7-Day Whole-Foods Plan has `day_number=1` on every item and no `total_days`. It works today, but setting `total_days=7` later would hide everything after day 1, so the migration sets these to NULL. Class (a).

### (b) Weekly pattern (6)

| Protocol | Draft week | Gaps (need content, not done here) |
|---|---|---|
| Golden Era Workout | AM Chest & Back + PM Shoulders & Arms on Mon/Tue/Thu/Fri; core Mon–Sat; Sun rest | Wed/Sat leg day has no items |
| Marathon Training Protocol | Mon recovery and yoga; Tue warm-up, sprints, cool-down, ice bath; Wed easy run; Thu drills and tempo; Fri cross-train; Sat recovery jog and shake-out; Sun long run, gel, ice bath. Dynamic stretch Wed/Sun; static stretch Tue/Thu/Sun | The duplicate 16:30 "Long Run" next to "Long Distance Run" is **hidden** (not deleted). 16-week progression is not modelled |
| Half Marathon Training | Tue intervals block; Mon/Thu strength; Wed swim; **new** Easy Run Thu/Sat 06:30, 40 min; **new** Long Run Sun 07:00, 90 min; Fri rest | New runs are copies of "Cool-Down Jog" with the same activity link. 12-week taper not modelled |
| The Rock Iron Paradise Workout | Fasted cardio Mon–Sat; legs block Mon/Thu; Sunday cheat meal on Sunday only | Push and pull days have no items |
| Weekly Gut Health Reset | All 7 rules become Sunday-only (it is "one gut day a week") | No action items |
| Wolverine Prep Protocol | **Not drafted:** it has 0 action items (5 rules only) | Needs a full 12-week programme written |

Daily items in these protocols stay daily: meals, supplements, foam rolling, sleep.

### (c) Phases (3)

| Protocol | Phases |
|---|---|
| 7-Day Apple Juice and Olive Oil (O'Neill) | `total_days` → 7. Apple juice, bitter tea and castor-oil pack stay daily. The flush items (Epsom drink, olive oil, lie on right side) → day 7 only. These flush items are currently `hidden=true` and stay hidden. **Partner content: please confirm before applying** |
| Candida Cleanse Protocol (56 days) | P1 days 1–14: biofilm disruptors (nattokinase, serrapeptase, NAC). P2 days 15–42: biofilm plus antifungals (caprylic, oregano, pau d'arco) and the die-off note. P3 days 43–56: probiotic and S. boulardii |
| Whole30 Elimination (40 days) | "Reintroduce one food" only on days 31–40 (it currently shows from day 1) |

### Commas in the names (2, read separately)

- **21-Day Dry Brushing, Rebounding and Herbs Protocol** is class (a). It runs the same lymph routine every day for 21 days, so it is fine as is.
- **Lemon, Maple Syrup and Cayenne Fast** (`total_days` 16) is class (c) but **not drafted**. The description has 3 ease-in days, a 10-day fast and 3 ease-out days. The items don't cover that:
  - The lemonade itself only exists as rules.
  - There are no ease-in or ease-out meals.
  - The salt-water flush belongs to the fast days only.

  It needs content first: lemonade drink items for days 4–13, ease-in and ease-out meals, and the flush on days 4–13.

## Dry run (staging, `DO … RAISE EXCEPTION`)

Run on 2026-10-19 and rolled back, so nothing was committed:

```
DRY RUN OK before=216 after=484 inserted=268 weekly=73 day_numbered=279
7-Day Apple Juice=28; 7-Day Whole-Foods=12; Candida Cleanse=270; Golden Era=35; Half Marathon=43;
Marathon=43; The Rock=31; Weekly Gut Health Reset=7; Whole30=15
```

The counts match the expected values: 257 Candida copies, 9 Whole30 copies and 2 new Half Marathon runs, 268 in total.

> **Read this before approving:** Candida Cleanse goes from 13 to **270 rows**, which is 257 of the 268 new rows. The cause is that the app has no day-range filter, so every phased item is copied once per day. If that is too heavy, there is a lighter option: phase only the antifungals (days 15–42) and the probiotics (days 43–56), and keep the biofilm items daily. That is about 107 rows. A better long-term fix is an app-side day range, after which the copies can be removed.

## To apply (after your OK)

1. Staging: run the migration file.
2. Check two things in the app: a Candida activation shows the biofilm items only on days 1–14, and Golden Era on a Wednesday shows no chest/back session.
3. Production only as a separate, approved step.
