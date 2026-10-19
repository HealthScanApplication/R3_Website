/*
 * Catalogue Protocol variety — reads a staging export, writes a migration + a dry run + per-protocol stats.
 * Never touches the database.
 *   npx tsx scripts/protocol-variety.ts <dir with q1.json q2.json q3.json q4.json> <out dir>
 * q1: protocols (id,name,description,category,tags,total_days,in_multiweek) · q2: protocol_items · q3: catalog_recipes ·
 * q4: catalog_activities. Protocols owned by the multi-week session (in_multiweek) are skipped.
 * Writes: migration.sql, dryrun.sql, stats.json, items-after.json (for the compliance audit "after" run).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { planVariety, ruleFitFlags, dietFlagsOf, DEFAULT_LENGTH, type VRow, type Insert } from '../src/utils/protocolVariety';

const [dir, out] = process.argv.slice(2);
const load = (f: string) => { const d = JSON.parse(readFileSync(join(dir, f), 'utf8')); return Array.isArray(d) && d[0]?.json_agg ? d[0].json_agg : d; };
const protocols: { id: string; name: string; description: string | null; category: string | null; tags: string[] | null; total_days: number | null; in_multiweek: boolean }[] = load('q1.json');
const items: (VRow & { protocol_id: string })[] = load('q2.json');
const recipes = load('q3.json'), activities = load('q4.json');

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lit = (v: unknown) => q(JSON.stringify(v));
// The multi-week session's 22, matched with punctuation ignored ("Lemon, Maple Syrup…" = "Lemon Maple Syrup…").
const MULTIWEEK = ['Matthew Walker Sleep Protocol','Golden Era Workout','Wolverine Prep Protocol','Prenatal Wellness','7-Day Apple Juice and Olive Oil Protocol','Candida Cleanse Protocol','Gut Healing','Marathon Training Protocol','28-Day Herbal Protocol','Half Marathon Training','3-Week Herbal Tea Protocol','Lemon Maple Syrup and Cayenne Fast','Seasonal Herbal Reset','21-Day Dry Brushing Rebounding and Herbs Protocol','7-Day Whole-Foods Plan','Whole30 Elimination Protocol','Functional-Medicine Daily Routine','The Rock Iron Paradise Workout','Weekly Gut Health Reset','Intermittent Fasting + Protein Pacing','Monthly Blood Panel Prep','Postnatal Recovery'];
const loose = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const p of protocols) if (MULTIWEEK.map(loose).includes(loose(p.name))) p.in_multiweek = true;
// Over a month: an authored programme (40 / 90 days) — length kept, no generated days (listed in the report).
const long = protocols.filter((p) => !p.in_multiweek && (p.total_days || 0) > 28);
const targets = protocols.filter((p) => !p.in_multiweek && !long.includes(p));
const stats: any[] = [];
const sql: string[] = [];
const after: any[] = items.map((r) => ({ ...r }));
const afterById = new Map(after.map((r) => [r.id, r]));

for (const p of targets) {
  const rows = items.filter((r) => r.protocol_id === p.id);
  const len = p.total_days && p.total_days > 1 ? p.total_days : DEFAULT_LENGTH;
  const plan = planVariety(rows, recipes, activities, { totalDays: len, theme: p.category, uuid: randomUUID, dietFlags: dietFlagsOf(p) });
  const parents = plan.inserts.filter((i) => !i.set.parent_protocol_item_id || !plan.inserts.some((x) => x.id === i.set.parent_protocol_item_id));
  const kids = plan.inserts.filter((i) => !parents.includes(i));
  stats.push({ name: p.name, id: p.id, from_days: p.total_days, to_days: len, items_before: rows.length, day1_pinned: plan.updates.length, inserted: plan.inserts.length,
    linked_slots: plan.updates.filter((u) => u.set.catalog_recipe_id).length, meals: new Set(plan.inserts.filter((i) => i.set.catalog_recipe_id).map((i) => i.source_id)).size,
    exercises: new Set(plan.inserts.filter((i) => i.set.catalog_activity_id || i.set.sets || i.set.duration_minutes).map((i) => i.source_id)).size,
    notes: plan.notes, rule_flags: ruleFitFlags(rows, p) });
  sql.push(`-- ${p.name}: total_days ${p.total_days ?? 'null'} -> ${len}; ${plan.updates.length} pinned to day 1, ${plan.inserts.length} day copies`);
  if (p.total_days !== len) sql.push(`update protocols set total_days = ${len} where id = ${q(p.id)} and user_id is null;`);
  if (plan.updates.length) sql.push(`update protocol_items set day_number = 1 where id = any(array[${plan.updates.map((u) => q(u.id)).join(',')}]::uuid[]);`);
  const ins = (list: Insert[]) => list.length && sql.push(`insert into protocol_items select (jsonb_populate_record(null::protocol_items, to_jsonb(i) || v.o::jsonb || jsonb_build_object('id', v.id, 'task_key', i.task_key || ':d' || (v.o::jsonb->>'day_number')))).*
  from (values ${list.map((i) => `(${q(i.id)}::uuid, ${q(i.source_id)}::uuid, ${lit(i.set)})`).join(',\n    ')}) v(id, src, o) join protocol_items i on i.id = v.src;`);
  ins(parents); ins(kids);
  for (const u of plan.updates) Object.assign(afterById.get(u.id), u.set);
  for (const i of plan.inserts) after.push({ ...afterById.get(i.source_id), ...i.set, id: i.id });
}

const ids = targets.map((p) => q(p.id)).join(',');
const body = sql.join('\n');
writeFileSync(join(out, 'migration.sql'), `-- Catalogue Protocol variety (2026-10-19): Length (total_days, default 2 weeks) + day-specific meals/exercises.
-- Generated by scripts/protocol-variety.ts from a staging export. STAGING ONLY until approved. Skips the 22 multi-week protocols.
begin;
${body}
commit;
`);
writeFileSync(join(out, 'dryrun.sql'), `-- DRY RUN, STAGING ONLY. Rolls back via RAISE EXCEPTION carrying counts.
do $dry$
declare before_n int; after_n int; per text;
begin
  select count(*) into before_n from protocol_items where protocol_id = any(array[${ids}]::uuid[]);
${body}
  select count(*) into after_n from protocol_items where protocol_id = any(array[${ids}]::uuid[]);
  select string_agg(p.name || '=' || p.total_days || 'd/' || (select count(*) from protocol_items i where i.protocol_id = p.id), '; ' order by p.name) into per
    from protocols p where p.id = any(array[${ids}]::uuid[]);
  raise exception 'DRY RUN OK before=% after=% inserted=% | %', before_n, after_n, after_n - before_n, per;
end $dry$;
`);
writeFileSync(join(out, 'stats.json'), JSON.stringify({ stats, skipped_long: long.map((p) => `${p.name} (${p.total_days} days)`), skipped_multiweek: protocols.filter((p) => p.in_multiweek).length }, null, 1));
writeFileSync(join(out, 'items-after.json'), JSON.stringify(after));
console.log(`${targets.length} protocols, ${stats.reduce((a, s) => a + s.inserted, 0)} inserts, ${stats.reduce((a, s) => a + s.day1_pinned, 0)} pinned`);
