-- Fitness routines: fill DERIVABLE training data on the published fitness catalogue Protocols
-- (user_id null, public, active, category fitness/strength/recovery/mobility/cardio/hiit).
-- Only fills NULL fields from what the row already says (title, notes, parent); never invents weights.
-- Idempotent: every UPDATE is guarded by "field is null". Re-running changes nothing.
-- Set dry_run := true to run inside a transaction that raises with the counts and rolls back.
do $$
declare
  dry_run boolean := false;
  n_bw int; n_bar int; n_db int; n_kb int; n_mach int; n_band int;
  n_sets int; n_dist int; n_disp int; n_time int; n_scope int;
begin
  create temp table _fp on commit drop as
    select id from protocols
    where user_id is null and is_public and is_active
      and lower(category) in ('fitness','strength','recovery','mobility','cardio','hiit');

  create temp table _ex on commit drop as
    select i.id, i.display_name as t, coalesce(i.notes,'') as n, a.category as acat
    from protocol_items i
    join _fp on _fp.id = i.protocol_id
    left join catalog_activities a on a.id = i.catalog_activity_id
    where i.subtype = 'exercise' and coalesce(i.kind,'') not in ('rule','rule_do','rule_dont')
      and coalesce(i.hidden,false) = false;

  -- 1. load_type from the exercise name. "Weighted"/"heavy"/"weight belt" in title or notes = has a load: left for the user.
  update protocol_items i set load_type = 'barbell' from _ex e
   where i.id = e.id and i.load_type is null
     and e.t ~* '(\mbarbell\M|\mbench press\M|\mt-bar row\M)';
  get diagnostics n_bar = row_count;

  update protocol_items i set load_type = 'dumbbell' from _ex e
   where i.id = e.id and i.load_type is null
     and (e.t ~* '\mdumbbell' or (e.t ~* 'farmer' and e.n ~* '\mdumbbells?\M'));
  get diagnostics n_db = row_count;

  update protocol_items i set load_type = 'kettlebell' from _ex e
   where i.id = e.id and i.load_type is null and e.t ~* '\mkettlebell';
  get diagnostics n_kb = row_count;

  update protocol_items i set load_type = 'machine' from _ex e
   where i.id = e.id and i.load_type is null
     and e.t ~* '(\mleg press\M|\mleg extension\M|\mcable\M|\mrope pushdown\M)';
  get diagnostics n_mach = row_count;

  update protocol_items i set load_type = 'band' from _ex e
   where i.id = e.id and i.load_type is null and e.t ~* '\mbanded\M';
  get diagnostics n_band = row_count;

  update protocol_items i set load_type = 'bodyweight' from _ex e
   where i.id = e.id and i.load_type is null
     and e.t !~* '\mweighted\M' and e.n !~* '(\mweighted\M|weight belt|add weight|\mheavy\M|\mbands?\M|dumbbell|kettlebell)'
     and (
       e.t ~* '(push-?ups?|pull-?ups?|\mdips\M|burpees|mountain climbers|box jumps|squat jumps|\mplanks?\M|plank hold|hanging (leg|knee) raises?|floor wipers|walking lunges|high knees|ab wheel|bosu|dead bugs|deep squat hold|dead & active hangs|crawling|get-up transitions|locomotion flow|jumping & soft landings|balancing)'
       or e.acat = 'Stretch'
       or e.t ~* '(stretch|yoga|mobility|warm-?up|cool-?down|pliability|pigeon pose|child''s pose|forward fold|thoracic opener)'
     );
  get diagnostics n_bw = row_count;

  -- 2. Sets × reps / sets × time from notes when sets is empty ("3 × 10", "3 × 30 s"). Ranges ("6–10 ×") are skipped.
  update protocol_items i set
      sets = (regexp_match(e.n, '^\s*(\d+)\s*[x×]\s*(\d+)'))[1]::int,
      reps = case when e.n ~* '^\s*\d+\s*[x×]\s*\d+\s*(s|sec|secs|seconds)\M' or e.n ~* '^\s*\d+\s*[x×]\s*\d+\s*m\M' then i.reps
                  else coalesce(i.reps, (regexp_match(e.n, '^\s*\d+\s*[x×]\s*(\d+)'))[1]::int) end,
      work_seconds = case when e.n ~* '^\s*\d+\s*[x×]\s*\d+\s*(s|sec|secs|seconds)\M'
                  then coalesce(i.work_seconds, (regexp_match(e.n, '^\s*\d+\s*[x×]\s*(\d+)'))[1]::int) else i.work_seconds end
    from _ex e
   where i.id = e.id and i.sets is null and e.n ~ '^\s*\d+\s*[x×]\s*\d+' and e.n !~ '^\s*\d+\s*[–-]';
  get diagnostics n_sets = row_count;

  -- 3. Distance repeats ("10x50m", "4x40m", "6 × 200m", "12x400m") → sets + distance.
  update protocol_items i set
      sets = coalesce(i.sets, (regexp_match(e.n, '^\s*(\d+)\s*[x×]\s*\d+\s*m\M'))[1]::int),
      distance_value = (regexp_match(e.n, '^\s*\d+\s*[x×]\s*(\d+)\s*m\M'))[1]::numeric,
      distance_unit = 'm'
    from _ex e
   where i.id = e.id and i.distance_value is null and e.n ~* '^\s*\d+\s*[x×]\s*\d+\s*m\M';
  get diagnostics n_dist = row_count;

  -- 4. Sets with no reps, where the notes say how many: "to failure", "max reps", pyramid "30, 12, 10, 8, 6 reps".
  update protocol_items i set reps_display = case
        when e.n ~* 'to (absolute )?failure|x\s*failure' then 'To failure'
        when e.n ~* 'max reps' then 'Max reps'
        else regexp_replace((regexp_match(e.n, 'pyramid:\s*([\d,\s]+)\s*reps', 'i'))[1], '\s*,\s*', '-', 'g') end
    from _ex e
   where i.id = e.id and i.sets is not null and i.reps is null and i.reps_display is null and i.work_seconds is null
     and (e.n ~* 'to (absolute )?failure|x\s*failure|max reps' or e.n ~* 'pyramid:\s*[\d,\s]+reps');
  get diagnostics n_disp = row_count;

  -- 5. Child steps with no time take their parent's time (every other child step in these routines already does).
  update protocol_items c set scheduled_time = p.scheduled_time
    from protocol_items p, _fp
   where c.protocol_id = _fp.id and c.parent_protocol_item_id = p.id
     and c.scheduled_time is null and p.scheduled_time is not null
     and coalesce(c.kind,'') not in ('rule','rule_do','rule_dont');
  get diagnostics n_time = row_count;

  -- 6. Unscoped top-level exercise rules → 'outside' (how the other 59 exercise rules are scoped).
  update protocol_items i set scope = 'outside'
    from _fp
   where i.protocol_id = _fp.id and i.kind in ('rule_do','rule_dont') and i.scope is null
     and i.subtype = 'exercise' and i.parent_protocol_item_id is null;
  get diagnostics n_scope = row_count;

  if dry_run then
    raise exception 'DRY RUN (rolled back) load_type: bodyweight=% barbell=% dumbbell=% kettlebell=% machine=% band=% | sets_from_notes=% distance=% reps_display=% child_time=% rule_scope=%',
      n_bw, n_bar, n_db, n_kb, n_mach, n_band, n_sets, n_dist, n_disp, n_time, n_scope;
  end if;
  raise notice 'load_type: bodyweight=% barbell=% dumbbell=% kettlebell=% machine=% band=% | sets_from_notes=% distance=% reps_display=% child_time=% rule_scope=%',
    n_bw, n_bar, n_db, n_kb, n_mach, n_band, n_sets, n_dist, n_disp, n_time, n_scope;
end $$;
