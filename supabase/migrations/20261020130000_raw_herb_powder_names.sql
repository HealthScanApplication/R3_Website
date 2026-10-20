-- Catalogue supplement steps that name only a raw plant part ("Burdock Root", "Psyllium Husk") now say the form
-- they are taken in: "Burdock Root Powder". The step names are the only thing renamed; the shared generic
-- products stay as they are because other steps use them in another form (Dr. Sebi's "Burdock Root Capsule").
-- The Polish name gets the matching "w proszku" so the two languages agree.
--
-- Scope: catalogue protocols only (user_id is null), supplement steps that are not rules, named exactly one of the
-- ten plants below. Left alone on purpose: steps that already name a form (Capsule, Tincture, Extract, Shake ...),
-- dosed or standardised products (Ashwagandha, Turmeric/curcumin, Lion's Mane, Milk Thistle Extract) and algae
-- (Chlorella, Spirulina), which are as often tablets. Replay-safe: once renamed, the exact-name match finds nothing.
DO $$
DECLARE
  expected CONSTANT int := 38;
  changed int;
BEGIN
  WITH herbs(name) AS (VALUES
    ('Burdock Root'), ('Dandelion Root'), ('Psyllium Husk'), ('Cascara Sagrada'), ('Sarsaparilla Root'),
    ('Red Clover'), ('Pau D''arco'), ('Echinacea'), ('Shatavari'), ('Triphala'))
  UPDATE public.protocol_items i
  SET display_name = i.display_name || ' Powder',
      translations = CASE WHEN i.translations #>> '{pl,display_name}' IS NOT NULL
        THEN jsonb_set(i.translations, '{pl,display_name}', to_jsonb((i.translations #>> '{pl,display_name}') || ' w proszku'))
        ELSE i.translations END
  FROM public.protocols p, herbs h
  WHERE p.id = i.protocol_id AND p.user_id IS NULL AND i.category = 'supplement'
    AND coalesce(i.kind, '') !~ '^rule' AND i.display_name = h.name;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed NOT IN (0, expected) THEN
    RAISE EXCEPTION 'raw herb powder names: changed % steps, expected % (or 0 on replay)', changed, expected;
  END IF;
END $$;
