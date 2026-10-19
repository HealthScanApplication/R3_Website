-- Health score lowered by recorded hazards, so a food with high lead or cadmium can't read 100.
-- Points off: high 12, moderate/medium 6, low 2, trace 0; capped at 40, floor 0.
-- The pre-penalty score is kept in health_score_base and the score is always derived from it,
-- so re-running this does not stack the penalty.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_ingredients','catalog_recipes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS health_score_base numeric', t);
    EXECUTE format('COMMENT ON COLUMN public.%I.health_score_base IS %L', t, 'Health score before the hazard penalty; health_score = base minus penalty (20261019130000).');
    EXECUTE format('UPDATE public.%I SET health_score_base = health_score WHERE health_score_base IS NULL AND health_score IS NOT NULL', t);
    EXECUTE format($q$
      UPDATE public.%1$I x SET health_score = GREATEST(0, round(x.health_score_base - LEAST(40, COALESCE((
        SELECT sum(CASE e.value->>'level' WHEN 'high' THEN 12 WHEN 'moderate' THEN 6 WHEN 'medium' THEN 6 WHEN 'low' THEN 2 ELSE 0 END)
        FROM jsonb_each(CASE WHEN jsonb_typeof(x.elements_hazardous) = 'object' THEN x.elements_hazardous ELSE '{}' END) e), 0))))
      WHERE x.health_score_base IS NOT NULL$q$, t);
  END LOOP;
END $$;
