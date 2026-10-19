-- A herbal tonic and psyllium fibre taken in water are binders/supplements, not meals or drinks.
-- Re-file them under Supplements (item_type/category/subtype supplement), with the supplement time slot
-- instead of the meal slot they were pegged to.
UPDATE public.protocol_items i
SET item_type = 'supplement', category = 'supplement', subtype = 'supplement', scope = NULL,
    group_name = CASE i.group_name WHEN 'Breakfast' THEN 'Morning' WHEN 'Lunch' THEN 'Midday' WHEN 'Dinner' THEN 'Evening' ELSE i.group_name END
FROM public.protocols p
WHERE p.id = i.protocol_id AND p.user_id IS NULL AND i.kind = 'action'
  AND i.id IN ('a439d061-7002-4665-ba04-99cb02d2244a', 'b26362bc-9a14-499f-95c8-946af8740fee',
               '8e6726e6-8d90-461c-bd0e-b18dbf25b4d2', '61669cd0-dd6e-4dc3-ad80-9f449c4ef87e');
