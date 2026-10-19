-- House image quota must be reserved before the (slow, billed) OpenAI call, not logged after it: otherwise several
-- simultaneous requests from one Guardian all pass the check and are all billed to the house key.
-- reserve_house_image takes a per-user advisory lock, counts today's live house images (pending or completed) and
-- inserts a 'pending' row only while under the limit. The function marks it completed or failed afterwards. A pending
-- row keeps counting however old it is: if the function died after OpenAI may have charged, the slot stays used until
-- someone reconciles the row.
alter table public.guardian_image_jobs drop constraint if exists guardian_image_jobs_status_check;
alter table public.guardian_image_jobs add constraint guardian_image_jobs_status_check check (status in ('pending', 'completed', 'failed'));

create or replace function public.reserve_house_image(p_user uuid, p_limit int, p_model text, p_aspect text, p_quality text, p_usd numeric, p_prompt text)
returns uuid language plpgsql as $$
declare used int; job uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('guardian_image_jobs:' || p_user::text, 0));
  select count(*) into used from public.guardian_image_jobs
    where user_id = p_user and source = 'house' and mock = false and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      and status in ('pending', 'completed');
  if used >= p_limit then return null; end if;
  insert into public.guardian_image_jobs (user_id, source, model, aspect_ratio, quality, usd, prompt, mock, status)
    values (p_user, 'house', p_model, p_aspect, p_quality, p_usd, p_prompt, false, 'pending') returning id into job;
  return job;
end $$;
revoke all on function public.reserve_house_image(uuid, int, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.reserve_house_image(uuid, int, text, text, text, numeric, text) to service_role;
