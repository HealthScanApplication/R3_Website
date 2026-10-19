-- Keep health_score derived from health_score_base and elements_hazardous (20261019130000) after edits.
-- A directly written health_score (admin editor, imports) is taken as the new base; the stored
-- score is then always base minus the hazard penalty, so a new high hazard lowers it at once.
CREATE OR REPLACE FUNCTION public.health_score_hazard_penalty(hazards jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(40, COALESCE(sum(CASE e.value->>'level' WHEN 'high' THEN 12 WHEN 'moderate' THEN 6 WHEN 'medium' THEN 6 WHEN 'low' THEN 2 ELSE 0 END), 0))
  FROM jsonb_each(CASE WHEN jsonb_typeof(hazards) = 'object' THEN hazards ELSE '{}' END) e
$$;

CREATE OR REPLACE FUNCTION public.health_score_derive()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.health_score_base := COALESCE(NEW.health_score_base, NEW.health_score);
  ELSIF NEW.health_score IS DISTINCT FROM OLD.health_score AND NEW.health_score_base IS NOT DISTINCT FROM OLD.health_score_base THEN
    NEW.health_score_base := NEW.health_score;
  END IF;
  NEW.health_score := CASE WHEN NEW.health_score_base IS NULL THEN NULL
    ELSE GREATEST(0, round(NEW.health_score_base - public.health_score_hazard_penalty(NEW.elements_hazardous))) END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_health_score_derive ON public.catalog_ingredients;
CREATE TRIGGER trg_health_score_derive BEFORE INSERT OR UPDATE OF health_score, health_score_base, elements_hazardous
  ON public.catalog_ingredients FOR EACH ROW EXECUTE FUNCTION public.health_score_derive();
DROP TRIGGER IF EXISTS trg_health_score_derive ON public.catalog_recipes;
CREATE TRIGGER trg_health_score_derive BEFORE INSERT OR UPDATE OF health_score, health_score_base, elements_hazardous
  ON public.catalog_recipes FOR EACH ROW EXECUTE FUNCTION public.health_score_derive();
