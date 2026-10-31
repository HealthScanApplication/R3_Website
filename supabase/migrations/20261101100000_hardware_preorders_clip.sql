-- The R³ Clip is now sold on its own, beside the R³ Ring and the Ring + Clip bundle.
alter table public.hardware_preorders drop constraint if exists hardware_preorders_product_check;
alter table public.hardware_preorders add constraint hardware_preorders_product_check check (product in ('ring', 'clip', 'bundle'));
