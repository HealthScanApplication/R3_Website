-- Generic fasting routines for the Diet section: a 21-day Daniel Fast (new), and safety rules on the existing
-- Water Fasting and Dry Fasting protocols. Educational content, not medical advice.
DO $$
DECLARE src public.protocols; pid uuid := 'd4a1e1f0-0000-4000-8000-000000000021';
  water uuid; dry uuid; meal_ids uuid[] := ARRAY[]::uuid[]; i int := 0;
BEGIN
  SELECT * INTO src FROM public.protocols WHERE user_id IS NULL AND name = 'Water Fasting Protocol' LIMIT 1;
  water := src.id;
  SELECT id INTO dry FROM public.protocols WHERE user_id IS NULL AND name = 'Dry Fasting • Protocol' LIMIT 1;

  -- Daniel Fast: copy the catalogue row shape from the water fast, then set its own fields.
  IF NOT EXISTS (SELECT 1 FROM public.protocols WHERE id = pid) THEN
    INSERT INTO public.protocols SELECT (jsonb_populate_record(NULL::public.protocols, to_jsonb(src) || jsonb_build_object(
      'id', pid, 'name', 'Daniel Fast · 21 Days', 'category', 'Diet', 'total_days', 21, 'is_public', true, 'is_active', true,
      'tags', jsonb_build_array('fasting', 'plant-based', 'daniel-fast'), 'image_url', NULL,
      'description', 'A 21-day partial fast based on Daniel 10:2–3: whole plant foods only and water to drink. Every day: vegetables, fruit, whole grains, legumes, nuts and seeds; no meat, fish, dairy or eggs, no added sugar or sweeteners, no yeast-leavened bread, no processed or deep-fried food, no caffeine or alcohol. Educational content — not medical advice; ask a doctor first if you are pregnant, diabetic or on medication.',
      'created_at', now(), 'updated_at', now()))).*;
    -- Daily steps (every day of the 21).
    INSERT INTO public.protocol_items (id, protocol_id, item_type, display_name, kind, category, subtype, scope, scheduled_time, duration_minutes, sort_order, recurrence_type, hidden, enabled, notes)
    VALUES
      (gen_random_uuid(), pid, 'consume', 'Water on rising', 'action', 'consume', 'drink', 'consume', '07:00', 2, 1, 'daily', false, true, 'A large glass of water.'),
      (gen_random_uuid(), pid, 'recipe', 'Oats with berries and walnuts', 'action', 'consume', 'meal', 'consume', '08:00', 15, 2, 'daily', false, true, 'Rolled oats cooked in water, fresh berries, walnuts. No sugar or honey.'),
      (gen_random_uuid(), pid, 'recipe', 'Bean and vegetable bowl with brown rice', 'action', 'consume', 'meal', 'consume', '12:30', 25, 3, 'daily', false, true, 'Black beans, roasted vegetables, brown rice, olive oil and lemon.'),
      (gen_random_uuid(), pid, 'recipe', 'Fruit and raw almonds', 'action', 'consume', 'snack', 'consume', '16:00', 10, 4, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'recipe', 'Lentil and vegetable stew', 'action', 'consume', 'meal', 'consume', '19:00', 30, 5, 'daily', false, true, 'Lentils, carrots, celery, tomato, herbs; serve with unleavened flatbread if wanted.'),
      (gen_random_uuid(), pid, 'activity', 'Prayer or reflection', 'action', 'do', 'wellness', 'inside', '21:00', 15, 6, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'consume', 'Water only to drink', 'rule_do', 'consume', 'drink', 'consume', NULL, NULL, 7, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'consume', 'Whole plant foods only', 'rule_do', 'consume', 'meal', 'consume', NULL, NULL, 8, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'consume', 'No meat, fish, dairy or eggs', 'rule_dont', 'consume', 'meal', 'consume', NULL, NULL, 9, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'consume', 'No added sugar or sweeteners', 'rule_dont', 'consume', 'meal', 'consume', NULL, NULL, 10, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'consume', 'No yeast-leavened bread', 'rule_dont', 'consume', 'meal', 'consume', NULL, NULL, 11, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'consume', 'No processed or deep-fried food', 'rule_dont', 'consume', 'meal', 'consume', NULL, NULL, 12, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'consume', 'No caffeine or alcohol', 'rule_dont', 'consume', 'drink', 'consume', NULL, NULL, 13, 'daily', false, true, NULL),
      (gen_random_uuid(), pid, 'activity', 'Ask a doctor first if pregnant, diabetic or on medication', 'rule_do', 'do', NULL, 'outside', NULL, NULL, 14, 'daily', false, true, NULL);
  END IF;

  -- Safety rules on the water and dry fasts (added once).
  IF water IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.protocol_items WHERE protocol_id = water AND display_name = 'Not for pregnancy, diabetes, eating disorders or under 18') THEN
    INSERT INTO public.protocol_items (id, protocol_id, item_type, display_name, kind, category, subtype, scope, sort_order, recurrence_type, hidden, enabled)
    VALUES (gen_random_uuid(), water, 'activity', 'Not for pregnancy, diabetes, eating disorders or under 18', 'rule_dont', 'do', NULL, 'outside', 900, 'daily', false, true),
           (gen_random_uuid(), water, 'activity', 'Ask a doctor before fasting over 24 hours', 'rule_do', 'do', NULL, 'outside', 901, 'daily', false, true),
           (gen_random_uuid(), water, 'consume', 'Break the fast slowly with light food', 'rule_do', 'consume', 'meal', 'consume', 902, 'daily', false, true),
           (gen_random_uuid(), water, 'activity', 'Stop if dizzy, faint or unwell', 'rule_do', 'do', NULL, 'outside', 903, 'daily', false, true);
  END IF;
  IF dry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.protocol_items WHERE protocol_id = dry AND display_name = 'Not for pregnancy, diabetes, kidney problems or under 18') THEN
    INSERT INTO public.protocol_items (id, protocol_id, item_type, display_name, kind, category, subtype, scope, sort_order, recurrence_type, hidden, enabled)
    VALUES (gen_random_uuid(), dry, 'activity', 'Not for pregnancy, diabetes, kidney problems or under 18', 'rule_dont', 'do', NULL, 'outside', 900, 'daily', false, true),
           (gen_random_uuid(), dry, 'activity', 'Never longer than 24 hours without medical supervision', 'rule_dont', 'do', NULL, 'outside', 901, 'daily', false, true),
           (gen_random_uuid(), dry, 'activity', 'Stop if dizzy, confused or your urine turns dark', 'rule_do', 'do', NULL, 'outside', 902, 'daily', false, true),
           (gen_random_uuid(), dry, 'consume', 'Rehydrate slowly with water when you end it', 'rule_do', 'consume', 'drink', 'consume', 903, 'daily', false, true);
  END IF;
END $$;
