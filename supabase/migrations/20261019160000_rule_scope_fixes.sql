-- Loose rules about food, drink or supplements belong in that rule group (shared protocolRules.ruleGroupFor /
-- ruleRowFields), so the app files them under Consume or Supplements. From docs/audits/protocol-compliance-2026-10-19.md.
UPDATE public.protocol_items i SET scope = f.scope, category = f.category, subtype = f.subtype
FROM (VALUES
  ('de46fa40-737c-4a05-9bc2-c24ca0db9f49'::uuid, 'supplement', 'supplement', 'supplement'),  -- Check label: T. chebula
  ('360756ba-1e11-4801-8237-198a53f78b0d'::uuid, 'consume', 'consume', 'meal'),  -- No salt with high BP
  ('0716b524-a031-4639-a707-90036df12f6f'::uuid, 'consume', 'consume', 'meal'),  -- Build meals from whole foods
  ('1c5a7fff-220a-4e8d-b9ef-83d88251ebd4'::uuid, 'consume', 'consume', 'meal'),  -- Vegetables & fruit at every meal
  ('4b10c47f-be09-4b8d-840c-6c9866a73de4'::uuid, 'consume', 'consume', 'meal'),  -- Don't graze between meals
  ('4fdc2e12-aa3a-4614-9e5a-57ac937bb330'::uuid, 'consume', 'consume', 'meal'),  -- Avoid ultra-processed food
  ('9b5d5e08-622f-4e32-8b02-80b78183d16b'::uuid, 'consume', 'consume', 'meal'),  -- No late eating
  ('a80e759c-fd3d-42e1-bdaf-461da38de30b'::uuid, 'supplement', 'supplement', 'supplement'),  -- No binders near supplements
  ('95a9f438-9f7f-431e-9974-8281fb24a6d2'::uuid, 'supplement', 'supplement', 'supplement'),  -- Fewer supplements, not more
  ('43d9c477-3d32-4b4c-93f0-9fa374f5b2ec'::uuid, 'consume', 'consume', 'meal'),  -- 4 meals, 3–5 h apart
  ('405c2cee-7fd2-4e70-837f-f7d18e51a7d4'::uuid, 'consume', 'consume', 'meal'),  -- 25–50 g protein per meal
  ('c53e250a-f464-411f-b4a9-ec3614d7b72c'::uuid, 'consume', 'consume', 'meal'),  -- Protein-rich dairy
  ('0d709355-c4b4-4eee-b1fc-06b3ab01a4a4'::uuid, 'consume', 'consume', 'meal'),  -- Healthy whole-food fats
  ('fe556c62-ca7a-4352-b246-49961d0e18e4'::uuid, 'consume', 'consume', 'drink')  -- No sugary drinks or alcohol
) AS f(id, scope, category, subtype)
WHERE i.id = f.id;
