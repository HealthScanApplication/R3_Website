-- Protocol content fixes (2026-10-20), from the all-protocol scan:
--  1. Wolverine Prep Protocol had only rules: give it a real weekly training template (and an honest description).
--  2. Weekly Gut Health Reset had only rules: its three instructions become Sunday steps.
--  3. Marathon and Half Marathon: say plainly that they give one repeating week, with progression rules.
--  4. Length: 7-Day Whole-Foods Plan = 7 days, Gut Healing = 28 days (a 4-week block, repeated to 8).
--  5. Bare rule titles ("Strength Training", "Drink Water", "Meal") carry their note's meaning, or are hidden when empty.
-- Idempotent; catalogue protocols only (user_id IS NULL).

-- 5. bare rule titles (done first so Wolverine's own rules are covered)
UPDATE public.protocol_items i SET display_name = 'Progressive overload: add weight or reps'
FROM public.protocols p WHERE p.id = i.protocol_id AND p.user_id IS NULL AND i.kind LIKE 'rule%' AND i.parent_protocol_item_id IS NULL
  AND i.display_name = 'Strength Training' AND i.notes = 'Add weight or reps.';
UPDATE public.protocol_items i SET display_name = 'Drink 3 L+ of water on training days'
FROM public.protocols p WHERE p.id = i.protocol_id AND p.user_id IS NULL AND i.kind LIKE 'rule%' AND i.parent_protocol_item_id IS NULL
  AND i.display_name = 'Drink Water' AND i.notes = '3L+ water on training days';
UPDATE public.protocol_items i SET display_name = 'Drink 2 L+ of water a day'
FROM public.protocols p WHERE p.id = i.protocol_id AND p.user_id IS NULL AND i.kind LIKE 'rule%' AND i.parent_protocol_item_id IS NULL
  AND i.display_name = 'Drink Water' AND i.notes = 'Aim for 2L+.';
UPDATE public.protocol_items i SET hidden = true
FROM public.protocols p WHERE p.id = i.protocol_id AND p.user_id IS NULL AND i.kind LIKE 'rule%' AND i.parent_protocol_item_id IS NULL
  AND i.display_name = 'Meal' AND i.notes = 'Daily target.';

DO $$
DECLARE pid uuid;
BEGIN
  -- 1. Wolverine Prep Protocol
  SELECT id INTO pid FROM public.protocols WHERE user_id IS NULL AND name = 'Wolverine Prep Protocol' LIMIT 1;
  IF pid IS NOT NULL THEN
    UPDATE public.protocols SET description = 'A physique-prep template inspired by the principles reported around Hugh Jackman''s Wolverine preparation: heavy compound lifts, progressive overload, intermittent fasting and high-protein eating. The exact programme is not public, so this is a four-day lifting week with a conditioning day and two rest days, to repeat and progress over about 12 weeks. Add weight or reps when a session feels controlled. Not affiliated with or endorsed by Hugh Jackman. Educational, not medical advice.',
      source_attribution = 'Principles from public interviews; the weekly template is an editorial synthesis, not his actual programme.', total_days = NULL
    WHERE id = pid;
    IF NOT EXISTS (SELECT 1 FROM public.protocol_items WHERE protocol_id = pid AND kind = 'action') THEN
      INSERT INTO public.protocol_items (id, protocol_id, item_type, display_name, kind, category, subtype, scope, scheduled_time, duration_minutes, sort_order, recurrence_type, recurrence_days_of_week, hidden, enabled, notes, group_name, catalog_activity_id, catalog_recipe_id, sets, reps) VALUES
    (gen_random_uuid(), pid, 'activity', 'Barbell Bench Press', 'action', 'do', 'exercise', NULL, '17:30:00'::time, 12, 100, 'weekly', ARRAY[1]::int[], false, true, NULL, 'Chest and triceps', 'activity_barbell_bench_press', NULL, 4, 6),
    (gen_random_uuid(), pid, 'activity', 'Barbell Incline Bench Press', 'action', 'do', 'exercise', NULL, '17:42:00'::time, 12, 101, 'weekly', ARRAY[1]::int[], false, true, NULL, 'Chest and triceps', 'activity_barbell_incline_bench_press', NULL, 4, 8),
    (gen_random_uuid(), pid, 'activity', 'Dip', 'action', 'do', 'exercise', NULL, '17:54:00'::time, 12, 102, 'weekly', ARRAY[1]::int[], false, true, NULL, 'Chest and triceps', 'activity_dip', NULL, 3, 10),
    (gen_random_uuid(), pid, 'activity', 'Cable Tricep Pushdown', 'action', 'do', 'exercise', NULL, '18:06:00'::time, 12, 103, 'weekly', ARRAY[1]::int[], false, true, NULL, 'Chest and triceps', 'activity_cable_tricep_pushdown', NULL, 3, 12),
    (gen_random_uuid(), pid, 'activity', 'Barbell Deadlift', 'action', 'do', 'exercise', NULL, '17:30:00'::time, 12, 104, 'weekly', ARRAY[2]::int[], false, true, NULL, 'Back and biceps', 'activity_barbell_deadlift', NULL, 4, 5),
    (gen_random_uuid(), pid, 'activity', 'Barbell Bent-Over Row', 'action', 'do', 'exercise', NULL, '17:42:00'::time, 12, 105, 'weekly', ARRAY[2]::int[], false, true, NULL, 'Back and biceps', 'activity_protocol_barbell_bentover_row_5_sets_x_12_reps_chest_to_bar', NULL, 4, 8),
    (gen_random_uuid(), pid, 'activity', 'Chin-Up', 'action', 'do', 'exercise', NULL, '17:54:00'::time, 12, 106, 'weekly', ARRAY[2]::int[], false, true, NULL, 'Back and biceps', 'activity_chin_up', NULL, 3, 8),
    (gen_random_uuid(), pid, 'activity', 'Dumbbell Bicep Curl', 'action', 'do', 'exercise', NULL, '18:06:00'::time, 12, 107, 'weekly', ARRAY[2]::int[], false, true, NULL, 'Back and biceps', 'activity_dumbbell_bicep_curl', NULL, 3, 12),
    (gen_random_uuid(), pid, 'activity', 'Barbell Back Squat', 'action', 'do', 'exercise', NULL, '17:30:00'::time, 12, 108, 'weekly', ARRAY[3]::int[], false, true, NULL, 'Legs', 'activity_barbell_back_squat', NULL, 4, 6),
    (gen_random_uuid(), pid, 'activity', 'Barbell Romanian Deadlift', 'action', 'do', 'exercise', NULL, '17:42:00'::time, 12, 109, 'weekly', ARRAY[3]::int[], false, true, NULL, 'Legs', 'activity_barbell_romanian_deadlift', NULL, 4, 8),
    (gen_random_uuid(), pid, 'activity', 'Lunge', 'action', 'do', 'exercise', NULL, '17:54:00'::time, 12, 110, 'weekly', ARRAY[3]::int[], false, true, NULL, 'Legs', 'activity_lunge', NULL, 3, 10),
    (gen_random_uuid(), pid, 'activity', 'Hip Thrust', 'action', 'do', 'exercise', NULL, '18:06:00'::time, 12, 111, 'weekly', ARRAY[3]::int[], false, true, NULL, 'Legs', 'activity_hip_thrust', NULL, 3, 10),
    (gen_random_uuid(), pid, 'activity', 'Barbell Overhead Press', 'action', 'do', 'exercise', NULL, '17:30:00'::time, 12, 112, 'weekly', ARRAY[4]::int[], false, true, NULL, 'Shoulders', 'activity_barbell_overhead_press', NULL, 4, 6),
    (gen_random_uuid(), pid, 'activity', 'Dumbbell Lateral Raise', 'action', 'do', 'exercise', NULL, '17:42:00'::time, 12, 113, 'weekly', ARRAY[4]::int[], false, true, NULL, 'Shoulders', 'activity_dumbbell_lateral_raise', NULL, 3, 12),
    (gen_random_uuid(), pid, 'activity', 'Face Pull', 'action', 'do', 'exercise', NULL, '17:54:00'::time, 12, 114, 'weekly', ARRAY[4]::int[], false, true, NULL, 'Shoulders', 'activity_face_pull', NULL, 3, 15),
    (gen_random_uuid(), pid, 'activity', 'Farmer''s Carry', 'action', 'do', 'exercise', NULL, '18:06:00'::time, 12, 115, 'weekly', ARRAY[4]::int[], false, true, NULL, 'Shoulders', 'activity_func_farmers_carry', NULL, 3, NULL),
    (gen_random_uuid(), pid, 'activity', 'Incline Treadmill', 'action', 'do', 'exercise', NULL, '17:30:00'::time, 30, 116, 'weekly', ARRAY[5]::int[], false, true, 'Steady conditioning, kept easy enough to recover for the next lift.', 'Conditioning', 'activity_protocol_incline_treadmill_5_degree_incline_32_mph_4050_min_fas', NULL, NULL, NULL),
    (gen_random_uuid(), pid, 'activity', 'Intermittent Fasting 16:8', 'action', 'do', 'wellness', NULL, '12:00:00'::time, NULL, 117, 'daily', NULL::int[], false, true, 'Eating window 12:00 to 20:00; fast for the other 16 hours.', 'Eating window', 'fasting_16_8', NULL, NULL, NULL),
    (gen_random_uuid(), pid, 'recipe', 'Grilled Chicken Breast', 'action', 'consume', 'meal', NULL, '12:30:00'::time, 25, 118, 'daily', NULL::int[], false, true, NULL, 'Lunch', NULL, 'recipe_grilled_chicken_breast', NULL, NULL),
    (gen_random_uuid(), pid, 'recipe', 'Protein Shake', 'action', 'consume', 'snack', NULL, '16:30:00'::time, 5, 119, 'daily', NULL::int[], false, true, 'Protein before or after lifting.', 'Snack', NULL, 'recipe_protein_shake', NULL, NULL),
    (gen_random_uuid(), pid, 'recipe', 'Steak and veg', 'action', 'consume', 'meal', NULL, '19:00:00'::time, 30, 120, 'daily', NULL::int[], false, true, NULL, 'Dinner', NULL, 'recipe_mkt_steak_and_veg', NULL, NULL),
    (gen_random_uuid(), pid, 'rule', 'High protein at every meal', 'rule_do', 'consume', 'meal', 'consume', NULL::time, NULL, 130, 'daily', NULL::int[], false, true, NULL, NULL, NULL, NULL, NULL, NULL);
    END IF;
  END IF;

  -- 2. Weekly Gut Health Reset: the three instructions become Sunday steps
  SELECT id INTO pid FROM public.protocols WHERE user_id IS NULL AND name = 'Weekly Gut Health Reset' LIMIT 1;
  IF pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.protocol_items WHERE protocol_id = pid AND kind = 'action') THEN
    UPDATE public.protocol_items SET kind = 'action', item_type = 'consume', category = 'consume', subtype = 'meal', scope = NULL, display_name = 'Kefir or yoghurt', scheduled_time = '08:00', duration_minutes = 5, group_name = 'Breakfast'
      WHERE protocol_id = pid AND display_name = 'Fermented Foods Day';
    UPDATE public.protocol_items SET kind = 'action', item_type = 'consume', category = 'consume', subtype = 'meal', scope = NULL, display_name = 'Prebiotic fibre boost', scheduled_time = '12:35', duration_minutes = 5, group_name = 'Lunch'
      WHERE protocol_id = pid AND display_name = 'Prebiotic Fibre Boost';
    UPDATE public.protocol_items SET kind = 'action', item_type = 'supplement', category = 'supplement', subtype = 'supplement', scope = NULL, display_name = 'Digestive enzyme with your largest meal', scheduled_time = '19:00', duration_minutes = 1, group_name = 'Evening'
      WHERE protocol_id = pid AND display_name = 'Digestive Enzyme Support';
    INSERT INTO public.protocol_items (id, protocol_id, item_type, display_name, kind, category, subtype, scope, scheduled_time, duration_minutes, sort_order, recurrence_type, recurrence_days_of_week, hidden, enabled, notes, group_name, catalog_activity_id, catalog_recipe_id, sets, reps) VALUES
      (gen_random_uuid(), pid, 'consume', 'Kimchi or sauerkraut', 'action', 'consume', 'meal', NULL, '12:30'::time, 5, 20, 'weekly', ARRAY[0]::int[], false, true, 'With lunch: a small serving of kimchi or sauerkraut.', 'Lunch', NULL, NULL, NULL, NULL),
      (gen_random_uuid(), pid, 'consume', 'Miso soup', 'action', 'consume', 'meal', NULL, '19:00'::time, 10, 21, 'weekly', ARRAY[0]::int[], false, true, 'With dinner. Each fermented food has different probiotic strains.', 'Dinner', NULL, NULL, NULL, NULL);
  END IF;

  -- 3. Marathon / Half Marathon: one repeating week, with progression rules
  FOR pid IN SELECT id FROM public.protocols WHERE user_id IS NULL AND name IN ('Marathon Training Protocol', 'Half Marathon Training') LOOP
    UPDATE public.protocols SET description = description || ' This routine gives one repeating training week for the full plan: add distance and effort week by week, cut back every fourth week and taper before race day.'
      WHERE id = pid AND description NOT LIKE '%repeating training week%';
    IF NOT EXISTS (SELECT 1 FROM public.protocol_items WHERE protocol_id = pid AND display_name = 'Cut back every fourth week') THEN
      INSERT INTO public.protocol_items (id, protocol_id, item_type, display_name, kind, category, subtype, scope, scheduled_time, duration_minutes, sort_order, recurrence_type, recurrence_days_of_week, hidden, enabled, notes, group_name, catalog_activity_id, catalog_recipe_id, sets, reps) VALUES
        (gen_random_uuid(), pid, 'rule', 'Add 1 to 2 km to the long run most weeks', 'rule_do', 'do', NULL, 'outside', NULL, NULL, 900, 'weekly', ARRAY[0,1,2,3,4,5,6]::int[], false, true, NULL, NULL, NULL, NULL, NULL, NULL),
        (gen_random_uuid(), pid, 'rule', 'Cut back every fourth week', 'rule_do', 'do', NULL, 'outside', NULL, NULL, 901, 'weekly', ARRAY[0,1,2,3,4,5,6]::int[], false, true, NULL, NULL, NULL, NULL, NULL, NULL),
        (gen_random_uuid(), pid, 'rule', 'Taper your running volume in the last weeks before race day', 'rule_do', 'do', NULL, 'outside', NULL, NULL, 902, 'weekly', ARRAY[0,1,2,3,4,5,6]::int[], false, true, NULL, NULL, NULL, NULL, NULL, NULL);
    END IF;
  END LOOP;
END $$;

-- 4. Length
UPDATE public.protocols SET total_days = 7 WHERE user_id IS NULL AND name = '7-Day Whole-Foods Plan' AND total_days IS NULL;
UPDATE public.protocols SET total_days = 28 WHERE user_id IS NULL AND name = 'Gut Healing' AND total_days IS NULL;
