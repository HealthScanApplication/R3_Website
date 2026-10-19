# Published Protocol audit against the routine standard (staging, 2026-10-19)

Read-only. Checked every published catalogue Protocol (user_id null, public, active; hidden items skipped) with `standardiseProtocol` from `src/utils/routineStandard.ts`, the approved 2026-10-15 standard: wake, then Morning / Afternoon / Evening, then smart lists (hygiene, drinks, wellness, fitness, supplements, meal, work, home, tasks), then sets, items, bedtime. Also checked that every step links to a catalogue record (activity, recipe, product, ingredient or supplement), so its website page has details.

**133 Protocols, 3376 items (1616 steps, 1760 rules). Fully compliant: 0.**

## What is missing, across all Protocols

| Count | Finding |
|---:|---|
| 564 | items whose group name is a raw code (e.g. "WorkoutX fd10a70c"), in 62 Protocols: Tony Robbins Evening Routine, Hailey Bieber Glazed Skin Routine, Marathon Training Protocol, Triathlon Prep, Half Marathon Training, Navy SEAL Mental Performance Protocol |
| 82 | steps not linked to any catalogue record (no detail page) |
| 26 | steps with no time (cannot be placed in Morning / Afternoon / Evening) |
| 128 | flag: No morning hygiene set — proposal: Scrape tongue, Brush teeth, Floss t |
| 126 | flag: No evening hygiene set — proposal: Remove makeup, Floss teeth, Brush t |
| 119 | flag: No wake item (End Sleep) — add one |
| 98 | flag: No bedtime item (Start Sleep) — add one |
| 70 | flag: No duration or set info |
| 3 | flag: Custom group “Morning Ritual” — proposed slot Breakfast |
| 2 | update: rounds parsed from title |
| 1 | flag: Custom group “Nutrition Protocol” — proposed slot Dinner |
| 1 | flag: Custom group “Morning Cleanse” — proposed slot Breakfast |
| 1 | flag: Custom group “Skin Nutrition” — proposed slot Breakfast |
| 1 | flag: Custom group “Cleanse” — proposed slot Lunch |
| 1 | flag: Second wake item (“End Sleep”) — keep one End Sleep |

## How it could be fixed

- **Automatic (safe):** add End Sleep / Start Sleep anchors; add the standard morning and evening hygiene sets as new linked activity items; move rounds/sets parsed from titles into set fields; strip the trailing code from group names ("Legs D3 dc4caa01" → "Legs", "WorkoutX fd10a70c" → "Workout"). The standard allows builders to fill these defaults.
- **Needs a decision per Protocol:** the unlinked steps (map each to an activity, recipe or product, or make it a rule), untimed steps, custom group names, and steps with no duration or set info.

## Per Protocol (worst first)

| Protocol | Category | Steps | Unlinked | Untimed | Flags | Examples of unlinked steps |
|---|---|---:|---:|---:|---:|---|
| Healer Labs 40-Day Detox | Detox | 121 | 21 | 13 | 2 | Morning hygiene; Breakfast meal; Lunch meal; Walk or mobility |
| Full Body Workout | Muscle Group | 9 | 9 | 8 | 5 | Full Body; Warm up; Do goblet squats; Do push-ups |
| Elite Tennis Training Routine | Fitness | 23 | 6 | 5 | 4 | Do Bosu ball planks; Core & Stability; Do banded Pallof presses; Do Bosu single-leg balance |
| Centenarian Decathlon Training | Longevity | 21 | 3 | 0 | 5 | Review glucose data; Check HRV; Check glucose |
| Weekly Fitness Check | Health | 4 | 2 | 0 | 6 | Take progress photos; Take body measurements |
| Breathwork & Cold-Exposure Method | Performance | 18 | 3 | 0 | 3 | Log breath-hold times; Say your commitment; Warm up after cold exposure |
| Cardio & Endurance | module | 7 | 0 | 0 | 11 |  |
| Focus & Brain | module | 7 | 0 | 0 | 11 |  |
| Calm & Breath | module | 7 | 0 | 0 | 11 |  |
| Strength & Conditioning | module | 6 | 0 | 0 | 10 |  |
| Timeless Beauty Protocol | Beauty | 22 | 1 | 0 | 7 | Log water intake |
| Sacred Geometry & Solfeggio Daily Practice | wellness | 11 | 2 | 0 | 4 | Visualise fractal geometry; Meditate 15 minutes |
| Ayurvedic Panchakarma (home version) | Cleanse | 8 | 1 | 0 | 7 | Castor Oil Purgation |
| Mobility & Flow | module | 6 | 0 | 0 | 9 |  |
| Zac Efron Baywatch Prep | Fitness | 22 | 2 | 0 | 3 | Workout 1; Start Sleep |
| Hard-Discipline Morning Routine | Morning | 17 | 2 | 0 | 3 | Review the day in the mirror; End Sleep |
| Fitness Foundation | program | 5 | 0 | 0 | 9 |  |
| Men's Health Foundation | program | 7 | 0 | 0 | 9 |  |
| Navy SEAL Mental Performance Protocol | Performance | 19 | 2 | 0 | 2 | Visualise the session; End Sleep |
| VO2 Max Interval Training | Hiit | 1 | 1 | 0 | 5 | Run VO2 max intervals |
| Morning Routine | wellness | 3 | 1 | 0 | 5 | Write 3 gratitudes |
| Whole30 Elimination Protocol | Health | 1 | 1 | 0 | 5 | Reintroduce one food |
| Pineal Gland Decalcification | Detox | 1 | 1 | 0 | 4 | Haritaki & Rock Salt Tonic |
| 5am Club | Morning | 15 | 1 | 0 | 4 | End Sleep |
| Sprint Intervals | Cardio | 3 | 1 | 0 | 4 | Jog to warm up |
| Tony Robbins Evening Routine | Evening | 12 | 1 | 0 | 4 | Close Emotional Loops |
| Triathlon Prep | Fitness | 30 | 1 | 0 | 4 | Practise T1 transitions |
| Intermittent Fasting + Protein Pacing | Health | 10 | 1 | 0 | 4 | Walk 10 minutes after lunch |
| Elite Fight Camp • Workout | Fitness | 20 | 1 | 0 | 4 | Flexibility & Mobility |
| Child Nutrition • 4 to 5 Years | kids | 8 | 1 | 0 | 4 | Play a sport |
| Natural Movement | Fitness | 14 | 1 | 0 | 4 | Run barefoot-style |
| Functional-Medicine Daily Routine | Health | 14 | 1 | 0 | 4 | Review health metrics |
| Postnatal Recovery | Women | 8 | 1 | 0 | 4 | Do pelvic floor exercises |
| 21-Day Dry Brushing, Rebounding and Herbs Protocol | Cleanse | 9 | 0 | 0 | 7 |  |
| Whole-Day Natural Wellness Routine | wellness | 31 | 2 | 0 | 0 | Write 3 gratitudes; Suggested product |
| The Rock Iron Paradise Workout | Fitness | 18 | 1 | 0 | 3 | End Sleep |
| 5-Bullet Morning | Morning | 16 | 1 | 0 | 3 | Coffee |
| Optimal Morning Routine | Morning | 13 | 1 | 0 | 3 | Walk 15 minutes |
| Child Nutrition • 3 to 4 Years | kids | 9 | 1 | 0 | 3 | Play actively 30 minutes |
| Michael Phelps Training Protocol | Fitness | 23 | 1 | 0 | 3 | Rehearse mentally |
| Dr. Rhonda Patrick Micronutrient Protocol | Health | 16 | 1 | 0 | 3 | Review blood panel |
| Longevity • Morning | Morning | 8 | 1 | 0 | 3 | Morning Supplements |
| Meals & Nutrition | module | 4 | 0 | 0 | 6 |  |
| Longevity • Monthly | Health | 10 | 1 | 0 | 3 | Measure body composition |
| Teen Girls' Daily Wellness Routine | wellness | 29 | 1 | 0 | 2 | Write 3 gratitudes |
| 7-Day Whole-Foods Plan | Detox | 8 | 0 | 0 | 5 |  |
| 7-Day Apple Juice and Olive Oil Protocol | Detox | 1 | 0 | 0 | 5 |  |
| Evening Wind-Down | wellness | 5 | 0 | 0 | 5 |  |
| Men's Daily Wellness Routine | wellness | 31 | 1 | 0 | 2 | Write 3 gratitudes |
| Hailey Bieber Glazed Skin Routine | Beauty | 23 | 0 | 0 | 5 |  |
| David Sinclair • Midday Reset | midday | 9 | 0 | 0 | 5 |  |
| Pull Day Workout | Strength | 1 | 0 | 0 | 5 |  |
| Longevity • Midday Reset | midday | 7 | 0 | 0 | 5 |  |
| Leg Day Workout | Strength | 1 | 0 | 0 | 5 |  |
| Push Day Workout | Strength | 1 | 0 | 0 | 5 |  |
| David Beckham Morning Routine | Morning | 18 | 0 | 0 | 5 |  |
| Seasonal Whole-Foods Reset | Detox | 1 | 0 | 0 | 5 |  |
| Evening Protocol | Evening | 20 | 1 | 0 | 2 | Apply Somnifix Mouth Tape |
| Weight Loss • Caloric Deficit | Fitness | 8 | 0 | 0 | 5 |  |
| Chris Hemsworth Centr Protocol | Fitness | 19 | 0 | 0 | 5 |  |
| Fibre and Hydration Routine | Cleanse | 15 | 0 | 0 | 5 |  |
| Muscle Gain • Caloric Surplus | Fitness | 6 | 0 | 0 | 5 |  |
| Cold & Flu Support | wellness | 1 | 0 | 0 | 5 |  |
| Shadow King Workout | Fitness | 11 | 0 | 0 | 4 |  |
| Dental Hygiene | wellness | 6 | 0 | 0 | 4 |  |
| Midday Reset | wellness | 1 | 0 | 0 | 4 |  |
| Skin Barrier Minimalist | Beauty | 6 | 0 | 0 | 4 |  |
| K-Beauty • Full-Day | Beauty | 12 | 0 | 0 | 4 |  |
| Midday Anti-Inflammatory Plate | midday | 6 | 0 | 0 | 4 |  |
| Pony • Glass Skin Makeup Prep | Beauty | 5 | 0 | 0 | 4 |  |
| Midday Cold & Breath Block | midday | 7 | 0 | 0 | 4 |  |
| Midday Focus | midday | 6 | 0 | 0 | 4 |  |
| Daily Health | General Health | 6 | 0 | 0 | 4 |  |
| Longevity • Midday Training | midday | 8 | 0 | 0 | 4 |  |
| Facial Exercises | Skin & Face | 12 | 0 | 0 | 4 |  |
| Sleep & Recovery | Sleep | 5 | 0 | 0 | 4 |  |
| Tony Robbins • Midday Reset | midday | 8 | 0 | 0 | 4 |  |
| Toddler Nutrition • 1 to 2 Years | kids | 9 | 0 | 0 | 4 |  |
| Child Nutrition • 2 to 3 Years | kids | 8 | 0 | 0 | 4 |  |
| Longevity | Health | 50 | 1 | 0 | 1 | Measure body composition |
| Wick Combat Workout | Fitness | 11 | 0 | 0 | 4 |  |
| 28-Day Herbal Protocol | Cleanse | 10 | 0 | 0 | 4 |  |
| Thor Workout | Fitness | 11 | 0 | 0 | 4 |  |
| Wolverine Workout | Fitness | 20 | 0 | 0 | 4 |  |
| Deep Stretching Session | Fitness | 7 | 0 | 0 | 4 |  |
| Ocean Warrior Workout | Fitness | 11 | 0 | 0 | 4 |  |
| Golden Era Workout | Fitness | 24 | 0 | 0 | 4 |  |
| Morning Movement Flow | Morning | 4 | 0 | 0 | 4 |  |
| Oral & Hygiene | module | 4 | 0 | 0 | 4 |  |
| Rocky Balboa Training | Fitness | 10 | 0 | 0 | 4 |  |
| 300 Spartan Workout | Fitness | 16 | 0 | 0 | 4 |  |
| Dr. Rhonda Patrick • Midday Stack | midday | 8 | 0 | 0 | 4 |  |
| Enhanced Combat Fitness | Fitness | 11 | 0 | 0 | 4 |  |
| Wolverine Prep Protocol | Fitness | 0 | 0 | 0 | 4 |  |
| Night Vigilante Workout | Fitness | 11 | 0 | 0 | 4 |  |
| Baby Nutrition • 0 to 1 Year | kids | 9 | 0 | 0 | 4 |  |
| Chlorella, Spirulina and Cilantro Protocol | Detox | 10 | 0 | 0 | 4 |  |
| Prenatal Wellness | Women | 9 | 0 | 0 | 4 |  |
| K-Beauty • Morning | Beauty | 7 | 0 | 0 | 4 |  |
| K-Beauty • Evening | Beauty | 10 | 0 | 0 | 4 |  |
| 3-Week Herbal Tea Protocol | Cleanse | 9 | 0 | 0 | 4 |  |
| HIIT Workout | Fitness | 7 | 0 | 0 | 4 |  |
| Morning Supplement Stack | Supplements | 5 | 0 | 0 | 4 |  |
| Functional Training Circuit | Fitness | 7 | 0 | 0 | 4 |  |
| Weekly Gut Health Reset | midday | 0 | 0 | 0 | 4 |  |
| Monthly Blood Panel Prep | Health | 3 | 0 | 0 | 4 |  |
| Monthly 3-Day Supplement Plan | Detox | 3 | 0 | 0 | 4 |  |
| Tim Ferriss • Midday Reset | midday | 6 | 0 | 0 | 4 |  |
| Sunrise Energizer | Morning | 5 | 0 | 0 | 4 |  |
| K-Beauty • Midday | Beauty | 4 | 0 | 0 | 4 |  |
| The 10-Step Korean Skincare | Beauty | 10 | 0 | 0 | 4 |  |
| Afternoon Focus Stack | midday | 4 | 0 | 0 | 4 |  |
| Post-Race Recovery Protocol | Recovery | 19 | 0 | 0 | 3 |  |
| Gut Healing | wellness | 1 | 0 | 0 | 3 |  |
| Marathon Training Protocol | Fitness | 32 | 0 | 0 | 3 |  |
| Half Marathon Training | Fitness | 19 | 0 | 0 | 3 |  |
| Tom Brady TB12 Method | Fitness | 21 | 0 | 0 | 3 |  |
| Performance Recovery Protocol | Recovery | 20 | 0 | 0 | 3 |  |
| Marathon Protocol | Fitness | 17 | 0 | 0 | 3 |  |
| LeBron James Recovery | Recovery | 20 | 0 | 0 | 3 |  |
| Superman Prep Workout | Fitness | 30 | 0 | 0 | 3 |  |
| Water Fasting Protocol | Detox | 8 | 0 | 0 | 3 |  |
| Anti-Aging Protocol | Longevity | 10 | 0 | 0 | 3 |  |
| Weekly Recovery Day | Recovery | 7 | 0 | 0 | 3 |  |
| Matthew Walker Sleep Protocol | Evening | 11 | 0 | 0 | 3 |  |
| Essential Morning Routine | Morning | 8 | 0 | 0 | 3 |  |
| Seasonal Herbal Reset | Cleanse | 11 | 0 | 0 | 3 |  |
| Daily Basics | wellness | 2 | 0 | 0 | 2 |  |
| Korean Glass Skin Ritual | Beauty | 4 | 0 | 0 | 2 |  |
| 5-Phase Life Reset | Detox | 6 | 0 | 0 | 2 |  |
| Women's Daily Wellness Routine | wellness | 25 | 0 | 0 | 2 |  |
| Elite Daily | Fitness | 23 | 0 | 0 | 2 |  |
| Longevity • Weekly | Health | 49 | 0 | 0 | 1 |  |
