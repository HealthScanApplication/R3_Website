-- Unify Tre Lune's product catalogue photography with the generated square
-- botanical art direction used by the Guardian storefront. The public files
-- ship with the web app; relative paths work on local, staging and production.
with generated_images (id, image_path) as (
  values
    ('trelune_total_digestive_support_bundle', '/images/trelune/generated/trelune_total_digestive_support_bundle.jpg'),
    ('trelune_wild_yam_cream_bundle', '/images/trelune/generated/trelune_wild_yam_cream_bundle.jpg'),
    ('trelune_baja_gold_family_mineral_bundle', '/images/trelune/generated/trelune_baja_gold_family_mineral_bundle.jpg'),
    ('trelune_premium_baja_bundle', '/images/trelune/generated/trelune_premium_baja_bundle.jpg'),
    ('trelune_daily_ritual_bundle', '/images/trelune/generated/trelune_daily_ritual_bundle.jpg'),
    ('trelune_baja_gold_mineral_salt_fine', '/images/trelune/generated/trelune_baja_gold_mineral_salt_fine.jpg'),
    ('trelune_baja_gold_minerals', '/images/trelune/generated/trelune_baja_gold_minerals.jpg'),
    ('trelune_wild_yam_cream_teen', '/images/trelune/generated/trelune_wild_yam_cream_teen.jpg'),
    ('trelune_wild_yam_cream_male', '/images/trelune/generated/trelune_wild_yam_cream_male.jpg'),
    ('trelune_earthbless_oat_honey_goat_milk_soap', '/images/trelune/generated/trelune_earthbless_oat_honey_goat_milk_soap.jpg'),
    ('trelune_earthbless_goat_milk_soap', '/images/trelune/generated/trelune_earthbless_goat_milk_soap.jpg'),
    ('trelune_earthbless_remineralize_magnesium_oil', '/images/trelune/generated/trelune_earthbless_remineralize_magnesium_oil.jpg'),
    ('trelune_book_bundle', '/images/trelune/generated/trelune_book_bundle.jpg'),
    ('trelune_hormonal_balance_bundle', '/images/trelune/generated/trelune_hormonal_balance_bundle.jpg'),
    ('trelune_home_remedies_bundle', '/images/trelune/generated/trelune_home_remedies_bundle.jpg'),
    ('trelune_comfrey_salve', '/images/trelune/generated/trelune_comfrey_salve.jpg'),
    ('trelune_earthbless_peace_please_hemorrhoid_oil', '/images/trelune/generated/trelune_earthbless_peace_please_hemorrhoid_oil.jpg'),
    ('trelune_castor_oil', '/images/trelune/generated/trelune_castor_oil.jpg'),
    ('trelune_self_heal_by_design', '/images/trelune/generated/trelune_self_heal_by_design.jpg'),
    ('trelune_reishi_tincture', '/images/trelune/generated/trelune_reishi_tincture.jpg'),
    ('trelune_digest_support_tincture', '/images/trelune/generated/trelune_digest_support_tincture.jpg'),
    ('trelune_colon_support_tincture', '/images/trelune/generated/trelune_colon_support_tincture.jpg'),
    ('trelune_baja_gold_mineral_salt_natural_grain', '/images/trelune/generated/trelune_baja_gold_mineral_salt_natural_grain.jpg'),
    ('trelune_wild_yam_cream', '/images/trelune/generated/trelune_wild_yam_cream.jpg'),
    ('trelune_colon_tea', '/images/trelune/generated/trelune_colon_tea.jpg'),
    ('trelune_digest_tea', '/images/trelune/generated/trelune_digest_tea.jpg'),
    ('trelune_sustain_me_by_barbara_oneill', '/images/trelune/generated/trelune_sustain_me_by_barbara_oneill.jpg')
)
update public.catalog_products as product
set image_url = image.image_path,
    image_primary_url = image.image_path,
    raw_data = coalesce(product.raw_data, '{}'::jsonb) || jsonb_build_object(
      'generated_image_style', 'trelune_botanical_20261030',
      'original_image_url', coalesce(product.image_primary_url, product.image_url)
    )
from generated_images as image
where product.id = image.id;

with generated_images (id, image_path) as (
  select id, '/images/trelune/generated/' || id || '.jpg'
  from public.catalog_products
  where id like 'trelune\_%' escape '\'
)
update public.guide_products as product
set image_url = image.image_path,
    updated_at = now()
from generated_images as image
where product.catalog_product_id = image.id;
