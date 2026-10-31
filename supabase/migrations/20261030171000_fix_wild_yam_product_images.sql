update public.catalog_products set
  image_url = case id
    when 'trelune_wild_yam_cream_teen' then 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamTeen-FrontInternational_shopify.webp?v=1776704396'
    when 'trelune_wild_yam_cream_male' then 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamMale-FrontInternational_shopify_9b83c6b5-fc66-4f8f-bc56-5976bb665e05.webp?v=1776704766'
  end,
  image_primary_url = case id
    when 'trelune_wild_yam_cream_teen' then 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamTeen-FrontInternational_shopify.webp?v=1776704396'
    when 'trelune_wild_yam_cream_male' then 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamMale-FrontInternational_shopify_9b83c6b5-fc66-4f8f-bc56-5976bb665e05.webp?v=1776704766'
  end
where id in ('trelune_wild_yam_cream_teen','trelune_wild_yam_cream_male');

update public.guide_products set image_url = case catalog_product_id
  when 'trelune_wild_yam_cream_teen' then 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamTeen-FrontInternational_shopify.webp?v=1776704396'
  when 'trelune_wild_yam_cream_male' then 'https://cdn.shopify.com/s/files/1/0912/6196/0527/files/TreLuneWildYamMale-FrontInternational_shopify_9b83c6b5-fc66-4f8f-bc56-5976bb665e05.webp?v=1776704766'
end
where catalog_product_id in ('trelune_wild_yam_cream_teen','trelune_wild_yam_cream_male');
