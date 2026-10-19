-- The guard's log helper must not be callable through the API. It was SECURITY DEFINER with EXECUTE granted to
-- `authenticated`, and PostgREST exposes public functions as /rest/v1/rpc/..., so any signed-in user could insert arbitrary
-- rows into protocol_item_guard_log (fake entries, or a flood). The trigger does not need that grant once the trigger
-- function itself runs as its owner and writes the log directly.
-- Same rules as 20261019130000_protocol_items_guard.sql; only the way soft violations are logged changes.
create or replace function public.protocol_items_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare v record; was_ok boolean;
begin
  -- Moving a row that has children: it may not become a child itself (children would be nested twice, R4c), and
  -- may not change protocol (children would point into another protocol, R4b). Their own triggers never run.
  if tg_op = 'UPDATE' and (new.parent_protocol_item_id is distinct from old.parent_protocol_item_id or new.protocol_id <> old.protocol_id)
     and exists (select 1 from public.protocol_items c where c.parent_protocol_item_id = new.id and c.id <> new.id) then
    if new.parent_protocol_item_id is not null and new.parent_protocol_item_id <> new.id then
      raise exception 'protocol_items guard R4c: item has children, so it cannot become a child (item %)', coalesce(new.display_name, new.id::text) using errcode = 'check_violation';
    end if;
    if new.protocol_id <> old.protocol_id then
      raise exception 'protocol_items guard R4b: item has children in protocol %, move them too (item %)', old.protocol_id, coalesce(new.display_name, new.id::text) using errcode = 'check_violation';
    end if;
  end if;
  for v in select * from public.protocol_item_guard_violations(new) loop
    if v.hard then
      was_ok := tg_op = 'INSERT' or not exists (select 1 from public.protocol_item_guard_violations(old) o where o.rule = v.rule);
      if was_ok then
        raise exception 'protocol_items guard %: % (item %)', v.rule, v.detail, coalesce(new.display_name, new.id::text)
          using errcode = 'check_violation';
      end if;
    end if;
    insert into public.protocol_item_guard_log(protocol_item_id, protocol_id, op, rule, detail, writer) values (new.id, new.protocol_id, tg_op, v.rule, v.detail, session_user);
  end loop;
  return new;
end $$;

revoke all on function public.protocol_item_guard_log_write(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.protocol_item_guard_log_write(uuid, uuid, text, text, text) to service_role;
