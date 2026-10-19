-- Database-level guard on protocol_items: the minimum the ROUTINE³ app needs to render a step.
-- Every writer (website, app, AI edge functions, SQL) passes through it.
--   HARD (raise): rules whose failure makes the app hide the row for good. Enforced on INSERT, and on UPDATE only
--     when the row met the rule before, so legacy rows can still be edited while they are being fixed.
--     R2 blank display_name · R3 day_number outside 1..total_days · R4a self-parent · R4b parent in another
--     protocol · R4c nested deeper than one level
--   SOFT (log only): the app falls back, so legacy data is logged to protocol_item_guard_log instead.
--     R1 unknown item_type · R5 top-level action without a time · R6 catalogue link missing for its item_type
-- Dry run: run the file with the final COMMIT replaced by the DO block at the bottom (it raises with counts).
begin;

create table if not exists public.protocol_item_guard_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  protocol_item_id uuid,
  protocol_id uuid,
  op text not null,
  rule text not null,
  detail text,
  writer text default current_user
);
alter table public.protocol_item_guard_log enable row level security; -- service role / SQL only

create or replace function public.protocol_item_guard_violations(r public.protocol_items)
returns table(rule text, hard boolean, detail text) language plpgsql stable as $$
declare total int; par public.protocol_items;
begin
  select p.total_days into total from public.protocols p where p.id = r.protocol_id;
  if r.item_type not in ('activity','recipe','product','supplement','consume','ingredient','rule') then
    return query select 'R1', false, 'unknown item_type ' || r.item_type; end if;
  if btrim(coalesce(r.display_name, '')) = '' then return query select 'R2', true, 'blank display_name'; end if;
  if r.day_number is not null and coalesce(total, 1) > 1 and (r.day_number < 1 or r.day_number > total) then
    return query select 'R3', true, format('day_number %s outside 1..%s', r.day_number, total); end if;
  if r.parent_protocol_item_id is not null then
    if r.parent_protocol_item_id = r.id then return query select 'R4a', true, 'parent is itself';
    else
      select * into par from public.protocol_items where id = r.parent_protocol_item_id;
      if found and par.protocol_id <> r.protocol_id then return query select 'R4b', true, 'parent in another protocol'; end if;
      if found and par.parent_protocol_item_id is not null and par.parent_protocol_item_id <> par.id then
        return query select 'R4c', true, 'parent is itself a child'; end if;
    end if;
  end if;
  if r.kind = 'action' and r.parent_protocol_item_id is null and r.scheduled_time is null then
    return query select 'R5', false, 'top-level action without a time'; end if;
  if r.kind = 'action' and ((r.item_type = 'activity' and r.catalog_activity_id is null)
     or (r.item_type = 'recipe' and r.catalog_recipe_id is null) or (r.item_type = 'product' and r.catalog_product_id is null)
     or (r.item_type = 'ingredient' and r.catalog_ingredient_id is null)) then
    return query select 'R6', false, r.item_type || ' without catalogue link'; end if;
end $$;

create or replace function public.protocol_items_guard() returns trigger language plpgsql as $$
declare v record; was_ok boolean;
begin
  for v in select * from public.protocol_item_guard_violations(new) loop
    if v.hard then
      was_ok := tg_op = 'INSERT' or not exists (select 1 from public.protocol_item_guard_violations(old) o where o.rule = v.rule);
      if was_ok then
        raise exception 'protocol_items guard %: % (item %)', v.rule, v.detail, coalesce(new.display_name, new.id::text)
          using errcode = 'check_violation';
      end if;
    end if;
    insert into public.protocol_item_guard_log(protocol_item_id, protocol_id, op, rule, detail)
    values (new.id, new.protocol_id, tg_op, v.rule, v.detail);
  end loop;
  return new;
end $$;

drop trigger if exists protocol_items_guard on public.protocol_items;
create trigger protocol_items_guard before insert or update on public.protocol_items
  for each row execute function public.protocol_items_guard();

commit;

-- DRY RUN (replace the COMMIT above with this block; it always rolls back):
-- do $$ declare s text; begin
--   select string_agg(rule || '=' || n, ', ' order by rule) into s from (
--     select v.rule, count(*) n from public.protocol_items i, public.protocol_item_guard_violations(i) v group by v.rule) t;
--   raise exception 'DRY RUN, rolled back. Existing rows per rule: %', coalesce(s, 'none');
-- end $$;
