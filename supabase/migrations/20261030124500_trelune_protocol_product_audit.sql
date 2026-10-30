-- Tre Lune catalogue -> Barbara O'Neill routine audit.
--
-- Sources reviewed 2026-10-30: official Tre Lune product labels/pages.  A
-- product is added as a routine step only when the label supplies a practical
-- use. Bundles and books remain commerce/reference links so their contents are
-- not accidentally repeated as extra doses.

begin;

create temporary table trelune_step_map (
  protocol_id uuid not null,
  catalog_product_id text not null,
  display_name text not null,
  scheduled_time time,
  parent_name text,
  category text not null,
  subtype text not null,
  sort_order integer not null,
  notes text not null
) on commit drop;

insert into trelune_step_map values
-- Whole-day foundation: practical daily/conditional uses.
('b0eb1100-0000-0000-0000-000000000001','trelune_earthbless_goat_milk_soap','Shower or wash with gentle unscented soap','07:10','Morning hygiene','hygiene','wash',10,'Choose this unscented face-and-body bar for a gentle daily wash. Wet skin and bar, lather in the hands, wash, rinse well and dry. Choose either this bar or the oat-and-honey bar; do not use both. Patch test first and stop if irritation occurs.'),
('b0eb1100-0000-0000-0000-000000000001','trelune_earthbless_oat_honey_goat_milk_soap','Optional oat-and-honey wash for dry skin','21:30','Evening hygiene','hygiene','wash',10,'Alternative to the unscented bar when gentle exfoliation is wanted. Wet skin and bar, lather lightly over face or body, rinse well and dry. Do not scrub irritated or broken skin. Contains goat milk, honey and oats.'),
('b0eb1100-0000-0000-0000-000000000001','trelune_baja_gold_minerals','Use liquid ocean minerals as labelled','07:20',null,'nutrition','mineral',310,'Label method: take 1/2 teaspoon under the tongue, hold for one minute, then swallow. The label also permits adding it to drinking water or using it as an oral rinse. Do not combine this with a bundle as an extra dose.'),
('b0eb1100-0000-0000-0000-000000000001','trelune_digest_support_tincture','Choose digest tincture before a meal','12:15',null,'nutrition','herbal',320,'Choose the tincture OR Digest Support Tea, not both. Label method: dilute 1/2 teaspoon (2.5 mL / one dropper) in 1/4 cup warm water before a meal. Contains alcohol and herbs; check medicines, pregnancy and allergies with a pharmacist or clinician.'),
('b0eb1100-0000-0000-0000-000000000001','trelune_reishi_tincture','Take reishi tincture as labelled','20:30',null,'nutrition','herbal',330,'Label method: 1-2 droppers per day, under the tongue or in water/juice. Do not duplicate this step when using the Daily Ritual Bundle. Check medicines, pregnancy, surgery and mushroom allergy with a pharmacist or clinician.'),
('b0eb1100-0000-0000-0000-000000000001','trelune_earthbless_remineralize_magnesium_oil','Optional magnesium-oil body care','21:30','Evening hygiene','hygiene','topical',11,'Optional topical step. Follow the product label, patch test first, keep away from eyes and broken or freshly shaved skin, and rinse if it stings persistently.'),
('b0eb1100-0000-0000-0000-000000000001','trelune_comfrey_salve','Optional salve after activity','20:45',null,'recovery','topical',340,'Use only when wanted for body care: massage a thin layer onto intact skin over a tired area. External use only; avoid broken skin, eyes and mouth. Patch test first and wash hands after use.'),

-- Targeted routine products.
('b0eb1100-0000-0000-0000-0000000000a1','trelune_wild_yam_cream','Apply women''s wild-yam cream — morning','07:15','Morning hygiene','hygiene','topical',10,'Label method: apply 2 pumps to soft skin and rotate sites. Use morning and evening for 3 weeks, then rest for 1 week. Topical use only; patch test first. Check pregnancy, breastfeeding, hormone-sensitive conditions and medicines with a clinician or pharmacist.'),
('b0eb1100-0000-0000-0000-0000000000a1','trelune_wild_yam_cream','Apply women''s wild-yam cream — evening','21:30','Evening hygiene','hygiene','topical',12,'Second labelled application: 2 pumps on a different soft-skin site. Follow the 3-weeks-on, 1-week-rest cycle. Do not add another dose when buying the Hormonal Balance or family bundle.'),
('b0eb1100-0000-0000-0000-0000000000a2','trelune_wild_yam_cream_male','Apply men''s wild-yam cream — morning','07:15','Morning hygiene','hygiene','topical',10,'Label method: apply 2 pumps to soft skin and rotate sites. The male label says to use continuously rather than taking a monthly break. Topical use only; patch test first and check medicines or hormone-sensitive conditions with a clinician or pharmacist.'),
('b0eb1100-0000-0000-0000-0000000000a2','trelune_wild_yam_cream_male','Apply men''s wild-yam cream — evening','21:30','Evening hygiene','hygiene','topical',12,'Second labelled application: 2 pumps on a different soft-skin site. Do not add another dose when purchasing the family bundle.'),
('b0eb1100-0000-0000-0000-0000000000a3','trelune_wild_yam_cream_teen','Apply teen wild-yam cream — morning','07:15','Morning hygiene','hygiene','topical',10,'Label method: apply 2 pumps to soft skin and rotate sites. Female teens use 3 weeks on and 1 week rest; the male-teen label says daily without a break. Topical use only; patch test first and involve a parent/guardian and clinician for medicine or hormone concerns.'),
('b0eb1100-0000-0000-0000-0000000000a3','trelune_wild_yam_cream_teen','Apply teen wild-yam cream — evening','21:30','Evening hygiene','hygiene','topical',12,'Second labelled application: 2 pumps on a different soft-skin site. Do not add another dose when purchasing the family bundle.'),
('b0eb1100-0000-0000-0000-000000000007','trelune_digest_tea','Choose digest tea before a meal','12:15',null,'nutrition','herbal',310,'Choose this tea OR Digest Support Tincture, not both. Label preparation: simmer 1 teaspoon herbs in 1 cup water for 10 minutes with the lid on; cool and strain. Warm and drink 60 mL 10-15 minutes before a meal. Refrigerate prepared tea for no more than 5 days.'),
('b0eb1100-0000-0000-0000-000000000007','trelune_colon_tea','Optional colon tea before bed','21:00',null,'nutrition','herbal',320,'Conditional, short-term option rather than a universal daily step. Label preparation: simmer 1 teaspoon in 1.5 cups water for 5 minutes, cool and strain, then take before bed. Contains cascara and buckthorn stimulant-laxative herbs; do not combine with Colon Support Tincture. Ask a clinician/pharmacist first for pregnancy, bowel disease, abdominal pain, dehydration, electrolyte/kidney/heart concerns or medicines.'),
('b0eb1100-0000-0000-0000-000000000007','trelune_earthbless_peace_please_hemorrhoid_oil','Optional external comfort oil','21:30','Evening hygiene','hygiene','topical',13,'Conditional external-use step only when needed. Follow the bottle directions, patch test first, wash hands before and after, and stop if irritation occurs. Seek medical care for significant pain, persistent symptoms or rectal bleeding.'),
('b0eb1100-0000-0000-0000-000000000004','trelune_reishi_tincture','Optional reishi tincture as labelled','20:30',null,'nutrition','herbal',310,'Optional product, not a treatment for infection. Label method: 1-2 droppers per day, under the tongue or in water/juice. Check medicines, pregnancy, surgery and mushroom allergy with a pharmacist or clinician.'),
('b0eb1100-0000-0000-0000-000000000005','trelune_digest_tea','Optional digest tea before a meal','12:15',null,'nutrition','herbal',310,'Choose tea OR tincture. Simmer 1 teaspoon in 1 cup water for 10 minutes with the lid on, cool, strain, then drink 60 mL warm 10-15 minutes before a meal. Refrigerate prepared tea for no more than 5 days.'),
('b0eb1100-0000-0000-0000-000000000006','trelune_castor_oil','Prepare the external castor-oil pack','20:00',null,'recovery','topical',310,'External traditional self-care step: saturate a clean cloth, place over the intended intact-skin area, cover to protect clothing and rest 30-60 minutes. Patch test first; do not ingest or apply to eyes, broken skin or during pregnancy without clinician advice.'),
('b0eb1100-0000-0000-0000-000000000007','trelune_castor_oil','Optional external castor-oil pack','20:00',null,'recovery','topical',330,'Optional external traditional self-care step, not a substitute for evaluating persistent abdominal symptoms. Saturate a clean cloth, place over intact skin, cover and rest 30-60 minutes. Patch test first; do not ingest or use during pregnancy without clinician advice.');

-- Create catalogue-linked routine rows without duplicating any existing link/name.
insert into public.protocol_items (
  id, protocol_id, item_type, display_name, kind, category, subtype, scope,
  scheduled_time, sort_order, recurrence_type, hidden, enabled, notes,
  group_name, parent_protocol_item_id, catalog_product_id
)
select
  gen_random_uuid(), m.protocol_id, 'product', m.display_name, 'action',
  m.category, m.subtype, 'everyone', m.scheduled_time, m.sort_order,
  'daily', false, true, m.notes,
  coalesce(m.parent_name, 'Tre Lune products'), parent_item.id, m.catalog_product_id
from trelune_step_map m
left join lateral (
  select pi.id
  from public.protocol_items pi
  where pi.protocol_id = m.protocol_id
    and pi.parent_protocol_item_id is null
    and lower(pi.display_name) = lower(m.parent_name)
  order by pi.id
  limit 1
) parent_item on m.parent_name is not null
where exists (select 1 from public.protocols p where p.id = m.protocol_id)
  and exists (select 1 from public.catalog_products cp where cp.id = m.catalog_product_id)
  and not exists (
    select 1 from public.protocol_items pi
    where pi.protocol_id = m.protocol_id
      and pi.catalog_product_id = m.catalog_product_id
      and lower(pi.display_name) = lower(m.display_name)
  );

-- Commerce placement. Every catalogue product is attached only where its
-- contents/use fit; bundles link to the same routine as their components but
-- are not emitted as another action.
create temporary table trelune_protocol_links (
  catalog_product_id text not null,
  protocol_id uuid not null,
  position integer not null
) on commit drop;

insert into trelune_protocol_links values
('trelune_total_digestive_support_bundle','b0eb1100-0000-0000-0000-000000000007',10),
('trelune_wild_yam_cream_bundle','b0eb1100-0000-0000-0000-0000000000a1',10),
('trelune_wild_yam_cream_bundle','b0eb1100-0000-0000-0000-0000000000a2',10),
('trelune_wild_yam_cream_bundle','b0eb1100-0000-0000-0000-0000000000a3',10),
('trelune_baja_gold_family_mineral_bundle','b0eb1100-0000-0000-0000-000000000001',20),
('trelune_premium_baja_bundle','b0eb1100-0000-0000-0000-000000000001',21),
('trelune_daily_ritual_bundle','b0eb1100-0000-0000-0000-000000000001',22),
('trelune_baja_gold_mineral_salt_fine','b0eb1100-0000-0000-0000-000000000001',30),
('trelune_baja_gold_minerals','b0eb1100-0000-0000-0000-000000000001',31),
('trelune_wild_yam_cream_teen','b0eb1100-0000-0000-0000-0000000000a3',30),
('trelune_wild_yam_cream_male','b0eb1100-0000-0000-0000-0000000000a2',30),
('trelune_earthbless_oat_honey_goat_milk_soap','b0eb1100-0000-0000-0000-000000000001',40),
('trelune_earthbless_goat_milk_soap','b0eb1100-0000-0000-0000-000000000001',41),
('trelune_earthbless_remineralize_magnesium_oil','b0eb1100-0000-0000-0000-000000000001',42),
('trelune_book_bundle','b0eb1100-0000-0000-0000-000000000001',50),
('trelune_hormonal_balance_bundle','b0eb1100-0000-0000-0000-0000000000a1',50),
('trelune_home_remedies_bundle','b0eb1100-0000-0000-0000-000000000001',51),
('trelune_comfrey_salve','b0eb1100-0000-0000-0000-000000000001',60),
('trelune_earthbless_peace_please_hemorrhoid_oil','b0eb1100-0000-0000-0000-000000000007',60),
('trelune_castor_oil','b0eb1100-0000-0000-0000-000000000006',61),
('trelune_castor_oil','b0eb1100-0000-0000-0000-000000000007',61),
('trelune_castor_oil','b0eb1100-0000-0000-0000-0000000000a1',61),
('trelune_self_heal_by_design','b0eb1100-0000-0000-0000-000000000001',70),
('trelune_reishi_tincture','b0eb1100-0000-0000-0000-000000000004',70),
('trelune_reishi_tincture','b0eb1100-0000-0000-0000-000000000001',71),
('trelune_digest_support_tincture','b0eb1100-0000-0000-0000-000000000007',72),
('trelune_digest_support_tincture','b0eb1100-0000-0000-0000-000000000001',73),
('trelune_colon_support_tincture','b0eb1100-0000-0000-0000-000000000007',74),
('trelune_baja_gold_mineral_salt_natural_grain','b0eb1100-0000-0000-0000-000000000001',75),
('trelune_wild_yam_cream','b0eb1100-0000-0000-0000-0000000000a1',76),
('trelune_colon_tea','b0eb1100-0000-0000-0000-000000000007',77),
('trelune_digest_tea','b0eb1100-0000-0000-0000-000000000007',78),
('trelune_digest_tea','b0eb1100-0000-0000-0000-000000000005',79),
('trelune_sustain_me_by_barbara_oneill','b0eb1100-0000-0000-0000-000000000001',80);

insert into public.guide_product_protocols (product_id, protocol_id, position)
select gp.id, l.protocol_id, l.position
from trelune_protocol_links l
join public.guide_profiles profile on profile.slug = 'barbara-oneill'
join public.guide_products gp
  on gp.guide_id = profile.user_id
 and gp.catalog_product_id = l.catalog_product_id
join public.protocols p on p.id = l.protocol_id
on conflict (product_id, protocol_id) do update set position = excluded.position;

-- Store the audit classification and official instruction provenance with each
-- catalogue record so the UI/import pipeline can explain the placement.
update public.catalog_products cp
set raw_data = coalesce(cp.raw_data, '{}'::jsonb) || jsonb_build_object(
  'routine_audit', jsonb_build_object(
    'reviewed_at', '2026-10-30',
    'source', 'Official Tre Lune product page/label',
    'placement', case
      when cp.id like '%bundle%' then 'commerce_bundle_no_duplicate_step'
      when cp.id in ('trelune_self_heal_by_design','trelune_sustain_me_by_barbara_oneill') then 'reference_only'
      when cp.id in ('trelune_comfrey_salve','trelune_earthbless_peace_please_hemorrhoid_oil','trelune_colon_tea','trelune_colon_support_tincture') then 'conditional_optional'
      else 'routine_or_alternative'
    end
  )
)
where cp.id like 'trelune_%';

commit;
