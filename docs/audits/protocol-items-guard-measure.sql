-- Read-only: rows on staging that would fail each protocol_items guard rule.
with pi as (select i.*, p.total_days from public.protocol_items i join public.protocols p on p.id = i.protocol_id)
select 'R1 unknown item_type' rule, count(*) from pi where item_type not in ('activity','recipe','product','supplement','consume','ingredient','rule')
union all select 'R2 blank display_name', count(*) from pi where btrim(display_name) = ''
union all select 'R3 day_number out of range (hidden every day)', count(*) from pi where day_number is not null and coalesce(total_days,1) > 1 and (day_number < 1 or day_number > total_days)
union all select 'R4a self-parent', count(*) from pi where parent_protocol_item_id = id
union all select 'R4b parent in another protocol', count(*) from pi c join public.protocol_items par on par.id = c.parent_protocol_item_id where par.protocol_id <> c.protocol_id
union all select 'R4c grandchild (nested >1, never rendered)', count(*) from pi c join public.protocol_items par on par.id = c.parent_protocol_item_id where par.parent_protocol_item_id is not null and par.parent_protocol_item_id <> par.id
union all select 'R5 top-level action without time', count(*) from pi where kind = 'action' and parent_protocol_item_id is null and scheduled_time is null
union all select 'R6 catalogue link missing for item_type', count(*) from pi where kind = 'action' and (
  (item_type = 'activity' and catalog_activity_id is null) or (item_type = 'recipe' and catalog_recipe_id is null)
  or (item_type = 'product' and catalog_product_id is null) or (item_type = 'ingredient' and catalog_ingredient_id is null));
