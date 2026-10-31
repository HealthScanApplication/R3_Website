-- Keep Barbara O'Neill's public offer names, protocol names and value-path labels aligned.
-- This is a title-only migration: linked steps, products, PDFs and offer delivery records retain their ids.

begin;

update public.protocols
set name = 'Self Heal by Design', updated_at = now()
where name = 'Whole-Day Natural Wellness Routine';

update public.protocols
set name = 'Misty Mountain Cleanse Routine', updated_at = now()
where name = '7-Day Apple Juice and Olive Oil Protocol';

update public.guide_offers
set title = 'Self Heal by Design'
where title = 'Whole-Day Natural Wellness Routine';

update public.guide_offers
set title = 'Misty Mountain Cleanse Routine'
where title = '7-Day Apple Juice and Olive Oil Protocol';

update public.guide_value_ramps
set name = 'Self Heal by Design', updated_at = now()
where name = 'Whole-Day Natural Wellness Routine';

update public.guide_value_ramps
set name = 'Misty Mountain Cleanse Routine', updated_at = now()
where name = '7-Day Apple Juice and Olive Oil Protocol';

-- Some environments still expose the compatibility catalogue table used by older share links.
do $$
begin
  if to_regclass('public.catalog_protocols') is not null then
    execute $sql$
      update public.catalog_protocols
      set name = case name
        when 'Whole-Day Natural Wellness Routine' then 'Self Heal by Design'
        when '7-Day Apple Juice and Olive Oil Protocol' then 'Misty Mountain Cleanse Routine'
        else name
      end
      where name in ('Whole-Day Natural Wellness Routine', '7-Day Apple Juice and Olive Oil Protocol')
    $sql$;
  end if;
end $$;

commit;
