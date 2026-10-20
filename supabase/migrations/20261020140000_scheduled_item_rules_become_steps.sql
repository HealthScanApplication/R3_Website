-- Ten catalogue "Do:" rules only name a supplement or a drink and carry a day or a time: they are steps that lost
-- their time, so the app listed them as "Do: Chlorella" under that day's rules with nothing to tick off.
--   Monthly 3-Day Supplement Plan: Chlorella (day 2), Milk Thistle and N-Acetyl Cysteine (day 3), Drink Water (days 1-3)
--   Full-Day Retreat Reset: four "Pinch of Whole Salt" doses (already timed)
-- Each becomes an action. Day, group, notes and product links are kept. Chlorella, Milk Thistle and NAC say "with
-- food / with meals", so they go to lunch (12:30); Drink Water to the morning (08:00); the salt doses keep their times.
-- Water is a drink. Day-2 water carried an import note ("Duplicate of Duplicate name ...") that is replaced with the
-- same guidance as days 1 and 3. Left alone on purpose: day instructions (e.g. "Milk Thistle dose 2x", "Gentle Start"),
-- the hidden salt dose, and the standing kit-style supplement rules that have no day and no time.
-- Replay-safe: the match needs kind = 'rule_do', which no longer holds afterwards; fewer than 10 rows (another
-- environment) only logs a notice.
DO $$
DECLARE
  expected CONSTANT int := 10;
  changed int;
BEGIN
  UPDATE public.protocol_items i
  SET kind = 'action',
      scope = NULL,
      scheduled_time = coalesce(i.scheduled_time, CASE i.display_name WHEN 'Drink Water' THEN time '08:00' ELSE time '12:30' END),
      subtype = CASE WHEN i.category = 'consume' THEN 'drink' ELSE i.subtype END,
      notes = CASE WHEN i.notes LIKE 'Duplicate of Duplicate name%' THEN 'Keep water at 3+ litres.' ELSE i.notes END
  FROM public.protocols p
  WHERE p.id = i.protocol_id AND p.user_id IS NULL
    AND i.kind = 'rule_do' AND i.parent_protocol_item_id IS NULL AND NOT coalesce(i.hidden, false)
    AND i.id IN (
      '04f054de-0ecb-4633-b6a8-eaf354b1e9dc', 'e23480e5-e54e-418c-a896-f5ef74946dcc', '0c6e3e41-cda9-4d89-b69e-ab71f989e154',
      '423fa61c-5f60-4b1d-b060-1d01fce4000e', 'e053622d-ea2b-4a9d-ada9-83bcd8ea76ad', 'a0a32a72-33c7-4350-888f-15f7436bbd76',
      'b7029a9f-f301-4583-ae8d-5d3cbd0c2017', 'ca6e3ab2-b14a-48b1-ab53-58243c77e1bb', '4c7e2180-3330-47d9-ba10-cfd4d7cfa467', '7decc56b-421e-4333-9a97-a96eb1eaa7c9');
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed > expected THEN
    RAISE EXCEPTION 'scheduled item rules: changed % rows, expected at most %', changed, expected;
  ELSIF changed < expected THEN
    RAISE NOTICE 'scheduled item rules: changed % of % rows (the rest are already steps or absent here)', changed, expected;
  END IF;
END $$;
