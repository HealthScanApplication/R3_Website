-- 20261019120000 added hygiene sets and sleep anchors (End/Start Sleep) to every catalogue Protocol.
-- They belong only to hygiene/beauty routines (hygiene) and sleep/wellness routines (sleep); elsewhere
-- the website shows them as suggested daily basics instead. Remove the ones that migration added.
DELETE FROM public.protocol_items i
USING public.protocols p
WHERE p.id = i.protocol_id
  AND p.user_id IS NULL
  AND i.created_at::date = '2026-10-19'
  AND (
    (i.subtype = 'hygiene' AND lower(coalesce(p.category, '')) NOT IN ('hygiene', 'oral care', 'personal care', 'beauty', 'skin & face', 'skin', 'hair'))
    OR ((i.subtype = 'sleep' OR i.category = 'sleep') AND lower(coalesce(p.category, '')) NOT IN ('sleep', 'wellness'))
  );
