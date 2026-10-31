-- Official Barbara O'Neill US shop mappings for Tre Lune products.
-- Regional storefront selection is strict: products absent from this list are not shown to US visitors.
with us(catalog_product_id, product_handle, variant_id, price_cents) as (values
  ('trelune_wild_yam_cream_bundle', 'wild-yam-cream-bundle-original-male-teen', '58130651906429', 16499),
  ('trelune_wild_yam_cream_teen', 'wild-yam-cream-teen-release-27th-april-copy', '58085949407613', 5999),
  ('trelune_wild_yam_cream_male', 'wild-yam-cream-male-release-27th-april', '58085949374845', 5999),
  ('trelune_wild_yam_cream', 'wild-yam-cream-tre-lune', '56334477033853', 5999),
  ('trelune_earthbless_oat_honey_goat_milk_soap', 'golden-grain-honey-oat-goat-milk-soap-earth-bless', '57328086909309', 1299),
  ('trelune_earthbless_goat_milk_soap', 'bare-beauty-goat-milk-soap-earth-bless', '57328122757501', 1199),
  ('trelune_comfrey_salve', 'comfrey-salve-tre-lune', '57327932473725', 2999),
  ('trelune_earthbless_peace_please_hemorrhoid_oil', 'peace-please-earth-bless-copy', '57363084837245', 7499),
  ('trelune_castor_oil', 'organic-castor-oil-tre-lune', '56532020724093', 1999),
  ('trelune_self_heal_by_design', 'self-heal-by-design', '56203302175101', 3000),
  ('trelune_reishi_tincture', 'immune-support-reishi', '57240235442557', 2499),
  ('trelune_digest_support_tincture', 'digest-support-tincture', '57240361337213', 4699),
  ('trelune_colon_support_tincture', 'colon-supporttincture', '57240277811581', 4499),
  ('trelune_baja_gold_mineral_salt_fine', 'baja-gold-mineral-sea-salt', '56334105608573', 1699),
  ('trelune_baja_gold_minerals', 'baja-gold-mineral-sea-salt-1lb-copy', '56334172782973', 2499),
  ('trelune_baja_gold_mineral_salt_natural_grain', 'baja-gold-mineral-sea-salt-5lb', '56334123762045', 4599),
  ('trelune_sustain_me_by_barbara_oneill', 'sustain-me', '56040492695933', 5000)
)
update public.guide_products product
set regional_storefronts = coalesce(product.regional_storefronts, '{}'::jsonb) || jsonb_build_object('US', jsonb_build_object(
  'shop_domain', 'www.barbaraoneill.com',
  'product_handle', us.product_handle,
  'variant_id', us.variant_id,
  'currency', 'USD',
  'price_cents', us.price_cents
))
from us
where product.catalog_product_id = us.catalog_product_id;
