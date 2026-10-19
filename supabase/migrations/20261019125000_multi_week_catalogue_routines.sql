-- Multi-week catalogue routines: weekly patterns for training plans, day phases for staged cleanses. Copies get their own task_key and re-running it is safe.
-- Applied on staging (mofhvoudjxinvpplsytd) 2026-10-19. Report: docs/audits/multi-week-routines-2026-10-19.md
-- App model (mobile useActiveProtocol): an item with day_number shows only on cycle day
-- ((days since activation) % protocols.total_days) + 1; weekly items use recurrence_days_of_week (0 = Sun) with day_number NULL.
begin;
-- ===== (b) weekly patterns =====
-- Golden Era Workout: double split Mon/Tue/Thu/Fri, core Mon-Sat, Sunday rest. Leg day (Wed/Sat) has no items yet: see report.
-- AM Chest & Back: weekly [1, 2, 4, 5]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[1, 2, 4, 5]::int[], day_number=null
  where id = any(array['b977afd6-72d1-4a7f-bad2-5215840e5a23'::uuid,'9c496364-c03c-40f1-8bfb-d8aa769544ff'::uuid,'08e71d90-0178-4622-b230-6f859f24c571'::uuid,'101cf217-e5e2-42bf-befd-eb9aa07dc03c'::uuid,'868cc330-1587-47cb-ab63-3bfe4f6e2edd'::uuid,'08480c1d-9d18-4b51-8b00-a8f28962d031'::uuid,'0205edab-020e-4e99-b64a-cb4ea980d1f2'::uuid,'b9c69628-7334-432b-985f-f515210612d9'::uuid]) or parent_protocol_item_id = any(array['b977afd6-72d1-4a7f-bad2-5215840e5a23'::uuid,'9c496364-c03c-40f1-8bfb-d8aa769544ff'::uuid,'08e71d90-0178-4622-b230-6f859f24c571'::uuid,'101cf217-e5e2-42bf-befd-eb9aa07dc03c'::uuid,'868cc330-1587-47cb-ab63-3bfe4f6e2edd'::uuid,'08480c1d-9d18-4b51-8b00-a8f28962d031'::uuid,'0205edab-020e-4e99-b64a-cb4ea980d1f2'::uuid,'b9c69628-7334-432b-985f-f515210612d9'::uuid]);
-- PM Shoulders & Arms: weekly [1, 2, 4, 5]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[1, 2, 4, 5]::int[], day_number=null
  where id = any(array['e068de0a-f317-490f-b975-8d904133a896'::uuid,'7aa4378b-74ee-4e2d-8d82-3e46f00dd6ad'::uuid,'10053793-2ca3-4747-9e64-c86506efa98c'::uuid,'7c296d82-8101-4c45-8081-ffecb3dbb95f'::uuid,'6fde825b-be76-4215-b67d-699e9ebe02c1'::uuid,'fbd0d68f-ba5c-48b4-a89a-068d297a4cbe'::uuid,'a200e34e-6ca1-40a5-992f-1f24f9e4f97e'::uuid]) or parent_protocol_item_id = any(array['e068de0a-f317-490f-b975-8d904133a896'::uuid,'7aa4378b-74ee-4e2d-8d82-3e46f00dd6ad'::uuid,'10053793-2ca3-4747-9e64-c86506efa98c'::uuid,'7c296d82-8101-4c45-8081-ffecb3dbb95f'::uuid,'6fde825b-be76-4215-b67d-699e9ebe02c1'::uuid,'fbd0d68f-ba5c-48b4-a89a-068d297a4cbe'::uuid,'a200e34e-6ca1-40a5-992f-1f24f9e4f97e'::uuid]);
-- Core: weekly [1, 2, 3, 4, 5, 6]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[1, 2, 3, 4, 5, 6]::int[], day_number=null
  where id = any(array['f5419f90-4c56-49ec-aa07-14424390a51f'::uuid,'49733a57-f034-4cef-baf5-70fc5b3df087'::uuid]) or parent_protocol_item_id = any(array['f5419f90-4c56-49ec-aa07-14424390a51f'::uuid,'49733a57-f034-4cef-baf5-70fc5b3df087'::uuid]);
-- Marathon Training: Mon recovery, Tue speed, Wed easy, Thu tempo, Fri cross-train, Sat easy+shake-out, Sun long run
-- Mon recovery: weekly [1]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[1]::int[], day_number=null
  where id = any(array['1a4c6303-fa39-4ba3-a473-13a68f599bcb'::uuid,'8f2c5737-de5f-4eb7-90d1-38bb23f16096'::uuid,'4ce4cf21-2372-49be-b5a0-ee44069d7778'::uuid]) or parent_protocol_item_id = any(array['1a4c6303-fa39-4ba3-a473-13a68f599bcb'::uuid,'8f2c5737-de5f-4eb7-90d1-38bb23f16096'::uuid,'4ce4cf21-2372-49be-b5a0-ee44069d7778'::uuid]);
-- Tue+Thu warm-up drills: weekly [2, 4]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[2, 4]::int[], day_number=null
  where id = any(array['233f9f49-4903-47a8-93bf-2f147c2143bf'::uuid]) or parent_protocol_item_id = any(array['233f9f49-4903-47a8-93bf-2f147c2143bf'::uuid]);
-- Tue speed: weekly [2]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[2]::int[], day_number=null
  where id = any(array['838cf917-3794-4326-aaf1-81d8d5cd51de'::uuid,'2cb64358-318d-46a4-8584-8858193d744c'::uuid]) or parent_protocol_item_id = any(array['838cf917-3794-4326-aaf1-81d8d5cd51de'::uuid,'2cb64358-318d-46a4-8584-8858193d744c'::uuid]);
-- Ice bath Tue+Sun: weekly [0, 2]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[0, 2]::int[], day_number=null
  where id = any(array['1b65eed9-7d0f-42d7-ae45-840ddd234f48'::uuid]) or parent_protocol_item_id = any(array['1b65eed9-7d0f-42d7-ae45-840ddd234f48'::uuid]);
-- Wed easy run: weekly [3]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[3]::int[], day_number=null
  where id = any(array['07cd025d-c870-4253-a73c-d58cc24c67a9'::uuid]) or parent_protocol_item_id = any(array['07cd025d-c870-4253-a73c-d58cc24c67a9'::uuid]);
-- Dynamic stretch Wed+Sun: weekly [0, 3]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[0, 3]::int[], day_number=null
  where id = any(array['12425677-a415-45cf-9389-88fd165a3dcb'::uuid]) or parent_protocol_item_id = any(array['12425677-a415-45cf-9389-88fd165a3dcb'::uuid]);
-- Thu tempo: weekly [4]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[4]::int[], day_number=null
  where id = any(array['ba9fd9f5-c02d-4e2d-9367-23be4d20ee3e'::uuid]) or parent_protocol_item_id = any(array['ba9fd9f5-c02d-4e2d-9367-23be4d20ee3e'::uuid]);
-- Static stretching Tue/Thu/Sun: weekly [0, 2, 4]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[0, 2, 4]::int[], day_number=null
  where id = any(array['dbfdc3fa-a97c-4f0e-8120-9cf201d5dea8'::uuid]) or parent_protocol_item_id = any(array['dbfdc3fa-a97c-4f0e-8120-9cf201d5dea8'::uuid]);
-- Fri cross-train: weekly [5]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[5]::int[], day_number=null
  where id = any(array['d96e6bcb-5c81-4036-9b38-05a62dfec290'::uuid]) or parent_protocol_item_id = any(array['d96e6bcb-5c81-4036-9b38-05a62dfec290'::uuid]);
-- Sat easy + shake-out: weekly [6]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[6]::int[], day_number=null
  where id = any(array['dc0e1714-0ead-444c-890a-60e0e5afd307'::uuid,'4d4f7292-9a39-454a-af2d-f4ce6d7be7c6'::uuid]) or parent_protocol_item_id = any(array['dc0e1714-0ead-444c-890a-60e0e5afd307'::uuid,'4d4f7292-9a39-454a-af2d-f4ce6d7be7c6'::uuid]);
-- Sun long run + gel: weekly [0]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[0]::int[], day_number=null
  where id = any(array['fc57b5d5-7e5c-4d8a-9bc8-1ac38e4a1c6c'::uuid,'58a14a7b-e70d-459f-81f0-ea1e1822fff7'::uuid]) or parent_protocol_item_id = any(array['fc57b5d5-7e5c-4d8a-9bc8-1ac38e4a1c6c'::uuid,'58a14a7b-e70d-459f-81f0-ea1e1822fff7'::uuid]);
-- Duplicate afternoon 'Long Run' (16:30) next to 'Long Distance Run': hidden, not deleted
update protocol_items set hidden=true where id='c93d5bcd-55b7-4658-9947-2f83443b8efe';
-- Half Marathon: Tue intervals, Mon/Thu strength, Wed swim, Thu/Sat easy run (new), Sun long run (new), Fri rest
-- Tue intervals block: weekly [2]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[2]::int[], day_number=null
  where id = any(array['72b2a0ad-5b5a-44e0-9c72-a407d150699b'::uuid,'8ade70d5-450c-4ea5-b06a-34933b059c41'::uuid,'b65008a9-3119-4ff5-add7-83c47bab4ebc'::uuid]) or parent_protocol_item_id = any(array['72b2a0ad-5b5a-44e0-9c72-a407d150699b'::uuid,'8ade70d5-450c-4ea5-b06a-34933b059c41'::uuid,'b65008a9-3119-4ff5-add7-83c47bab4ebc'::uuid]);
-- Strength Mon/Thu: weekly [1, 4]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[1, 4]::int[], day_number=null
  where id = any(array['044ba642-744b-49f8-a01d-c28d2075db43'::uuid]) or parent_protocol_item_id = any(array['044ba642-744b-49f8-a01d-c28d2075db43'::uuid]);
-- Swim Wed: weekly [3]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[3]::int[], day_number=null
  where id = any(array['bef443ed-d9b9-4563-b88a-05411dcc5d75'::uuid]) or parent_protocol_item_id = any(array['bef443ed-d9b9-4563-b88a-05411dcc5d75'::uuid]);
-- new: Easy Run [4, 6]
insert into protocol_items select (jsonb_populate_record(null::protocol_items, to_jsonb(i) || jsonb_build_object(
  'id', gen_random_uuid(), 'task_key', case when i.task_key is null then null else i.task_key || ':easy-run' end, 'display_name', 'Easy Run', 'group_name', 'Easy Run', 'notes', 'Zone 2, conversational pace. 6-8 km.', 'scheduled_time', '06:30:00',
  'duration_minutes', 40, 'recurrence_type', 'weekly', 'recurrence_days_of_week', '[4, 6]'::jsonb, 'day_number', null, 'sort_order', i.sort_order + 100))).*
  from protocol_items i where i.id = 'b65008a9-3119-4ff5-add7-83c47bab4ebc' and not exists (select 1 from protocol_items x where x.protocol_id = i.protocol_id and x.display_name = 'Easy Run' and x.recurrence_type = 'weekly');
-- new: Long Run [0]
insert into protocol_items select (jsonb_populate_record(null::protocol_items, to_jsonb(i) || jsonb_build_object(
  'id', gen_random_uuid(), 'task_key', case when i.task_key is null then null else i.task_key || ':long-run' end, 'display_name', 'Long Run', 'group_name', 'Long Run', 'notes', 'Weekly long run at easy pace. Build from 10 km towards 18-20 km over the plan.', 'scheduled_time', '07:00:00',
  'duration_minutes', 90, 'recurrence_type', 'weekly', 'recurrence_days_of_week', '[0]'::jsonb, 'day_number', null, 'sort_order', i.sort_order + 100))).*
  from protocol_items i where i.id = 'b65008a9-3119-4ff5-add7-83c47bab4ebc' and not exists (select 1 from protocol_items x where x.protocol_id = i.protocol_id and x.display_name = 'Long Run' and x.recurrence_type = 'weekly');
-- The Rock Iron Paradise: fasted cardio Mon-Sat, legs block Mon/Thu (push/pull days have no items yet: see report), cheat meal Sunday
-- Fasted cardio Mon-Sat: weekly [1, 2, 3, 4, 5, 6]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[1, 2, 3, 4, 5, 6]::int[], day_number=null
  where id = any(array['149b3c02-424c-412b-aa1d-19ee0b9f1ab6'::uuid]) or parent_protocol_item_id = any(array['149b3c02-424c-412b-aa1d-19ee0b9f1ab6'::uuid]);
-- Legs Mon/Thu: weekly [1, 4]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[1, 4]::int[], day_number=null
  where id = any(array['3be36075-69b2-4811-95c9-d16e3f853792'::uuid,'7f5135b2-48de-4db2-9a34-b3bc4257fd40'::uuid,'196896eb-887b-4e1c-8e8d-c4153cbc3a73'::uuid,'be8b50de-a28f-4867-af46-5d4db4d53cd2'::uuid,'0b01eb82-805e-45dc-9297-a78d9b1eafb1'::uuid,'37486ba6-6609-4b76-8f95-ac95cae667e4'::uuid,'b0639380-9d22-406e-8a6b-7badb1590393'::uuid]) or parent_protocol_item_id = any(array['3be36075-69b2-4811-95c9-d16e3f853792'::uuid,'7f5135b2-48de-4db2-9a34-b3bc4257fd40'::uuid,'196896eb-887b-4e1c-8e8d-c4153cbc3a73'::uuid,'be8b50de-a28f-4867-af46-5d4db4d53cd2'::uuid,'0b01eb82-805e-45dc-9297-a78d9b1eafb1'::uuid,'37486ba6-6609-4b76-8f95-ac95cae667e4'::uuid,'b0639380-9d22-406e-8a6b-7badb1590393'::uuid]);
-- Sunday cheat meal: weekly [0]
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[0]::int[], day_number=null
  where id = any(array['4581793a-0851-406d-8db7-379f869687aa'::uuid]) or parent_protocol_item_id = any(array['4581793a-0851-406d-8db7-379f869687aa'::uuid]);
-- Weekly Gut Health Reset: one gut day a week (Sunday) instead of every day
update protocol_items set recurrence_type='weekly', recurrence_days_of_week=array[0]::int[], day_number=null where protocol_id='e0000000-0000-0000-0000-000000000010';

-- ===== (c) phases =====
-- 7-Day Apple Juice and Olive Oil: prep items stay daily; the flush (Epsom, olive oil, right side) only on day 7
update protocols set total_days=7 where id='b0eb1100-0000-0000-0000-000000000006';
update protocol_items set day_number=7 where id = any(array['30c492a9-8384-4dff-a8af-64b300329e58'::uuid,'1e58a34b-a761-4d79-a220-83b3b4def209'::uuid,'56408324-f573-4f17-84f0-fbf591fa86ed'::uuid]);
-- Candida Cleanse (56 days): P1 biofilm 1-14, P2 biofilm + antifungals 15-42, P3 rebuild 43-56
-- Biofilm disruptors: days 1-42 (original row = day 1, copies for 2-42)
update protocol_items set day_number=1, recurrence_type='daily', recurrence_days_of_week=null where id = any(array['d27b8d8e-f686-4dbb-a5bb-740c78fe3253'::uuid,'83637bc5-3fda-4280-b67c-91ab434f5220'::uuid,'66ea3f23-6000-4c69-a69d-0ae3a431c370'::uuid]);
insert into protocol_items select (jsonb_populate_record(null::protocol_items,
  to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'day_number', d, 'task_key', case when i.task_key is null then null else i.task_key || ':d' || d end))).*
  from protocol_items i cross join generate_series(2,42) d where i.id = any(array['d27b8d8e-f686-4dbb-a5bb-740c78fe3253'::uuid,'83637bc5-3fda-4280-b67c-91ab434f5220'::uuid,'66ea3f23-6000-4c69-a69d-0ae3a431c370'::uuid]) and not exists (select 1 from protocol_items x where x.protocol_id = i.protocol_id and x.display_name = i.display_name and x.day_number = d and x.parent_protocol_item_id is not distinct from i.parent_protocol_item_id);
-- Antifungals: days 15-42 (original row = day 15, copies for 16-42)
update protocol_items set day_number=15, recurrence_type='daily', recurrence_days_of_week=null where id = any(array['355e45dd-745b-460d-a053-129941bd3d70'::uuid,'120f5dcc-3a25-45ae-bd04-76f29ffe290d'::uuid,'1a8a25da-9b02-41e9-a433-6587bd3ffd9e'::uuid]);
insert into protocol_items select (jsonb_populate_record(null::protocol_items,
  to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'day_number', d, 'task_key', case when i.task_key is null then null else i.task_key || ':d' || d end))).*
  from protocol_items i cross join generate_series(16,42) d where i.id = any(array['355e45dd-745b-460d-a053-129941bd3d70'::uuid,'120f5dcc-3a25-45ae-bd04-76f29ffe290d'::uuid,'1a8a25da-9b02-41e9-a433-6587bd3ffd9e'::uuid]) and not exists (select 1 from protocol_items x where x.protocol_id = i.protocol_id and x.display_name = i.display_name and x.day_number = d and x.parent_protocol_item_id is not distinct from i.parent_protocol_item_id);
-- Die-off note: days 15-42 (original row = day 15, copies for 16-42)
update protocol_items set day_number=15, recurrence_type='daily', recurrence_days_of_week=null where id = any(array['9eec1253-c3fa-4d86-b5d2-8160e25f07ef'::uuid]);
insert into protocol_items select (jsonb_populate_record(null::protocol_items,
  to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'day_number', d, 'task_key', case when i.task_key is null then null else i.task_key || ':d' || d end))).*
  from protocol_items i cross join generate_series(16,42) d where i.id = any(array['9eec1253-c3fa-4d86-b5d2-8160e25f07ef'::uuid]) and not exists (select 1 from protocol_items x where x.protocol_id = i.protocol_id and x.display_name = i.display_name and x.day_number = d and x.parent_protocol_item_id is not distinct from i.parent_protocol_item_id);
-- Probiotics: days 43-56 (original row = day 43, copies for 44-56)
update protocol_items set day_number=43, recurrence_type='daily', recurrence_days_of_week=null where id = any(array['d5bc8ed8-de4e-4cbd-96e7-eabf09d68c28'::uuid,'ffe981c8-5607-480d-9a4b-df5e210b6090'::uuid]);
insert into protocol_items select (jsonb_populate_record(null::protocol_items,
  to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'day_number', d, 'task_key', case when i.task_key is null then null else i.task_key || ':d' || d end))).*
  from protocol_items i cross join generate_series(44,56) d where i.id = any(array['d5bc8ed8-de4e-4cbd-96e7-eabf09d68c28'::uuid,'ffe981c8-5607-480d-9a4b-df5e210b6090'::uuid]) and not exists (select 1 from protocol_items x where x.protocol_id = i.protocol_id and x.display_name = i.display_name and x.day_number = d and x.parent_protocol_item_id is not distinct from i.parent_protocol_item_id);
-- Whole30 (40 days): 'Reintroduce one food' only in the reintroduction days 31-40
-- Reintroduction: days 31-40 (original row = day 31, copies for 32-40)
update protocol_items set day_number=31, recurrence_type='daily', recurrence_days_of_week=null where id = any(array['c83b71ce-5e79-49c5-900f-724f9f67cadd'::uuid]);
insert into protocol_items select (jsonb_populate_record(null::protocol_items,
  to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(), 'day_number', d, 'task_key', case when i.task_key is null then null else i.task_key || ':d' || d end))).*
  from protocol_items i cross join generate_series(32,40) d where i.id = any(array['c83b71ce-5e79-49c5-900f-724f9f67cadd'::uuid]) and not exists (select 1 from protocol_items x where x.protocol_id = i.protocol_id and x.display_name = i.display_name and x.day_number = d and x.parent_protocol_item_id is not distinct from i.parent_protocol_item_id);

-- ===== (a) cleanup: stray day_number=1 on protocols without total_days (would hide items if total_days is ever set) =====
update protocol_items set day_number=null where protocol_id = 'b0000000-0000-0000-0000-000000000005' and day_number=1;
commit;
