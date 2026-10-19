/*
 * Routine layout standard — DRY RUN over an export (reads JSON, writes CSV, never touches the database).
 *   node dist.js protocol_items.json protocols.json > standard-dryrun.csv   (protocols.json: [{id, category}] — basics only for their own routines)
 */
import { readFileSync } from 'fs';
import { standardiseProtocol, isCalendarEntry, type Row } from '../src/utils/routineStandard';

const rows: (Row & { protocol_id: string })[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// Categories are required: without them every routine would be judged as unknown and asked for sleep and hygiene basics.
if (!process.argv[3]) { process.stderr.write('Usage: node dist.js protocol_items.json protocols.json\n'); process.exit(1); }
const themes = new Map<string, string | null>((JSON.parse(readFileSync(process.argv[3], 'utf8')) as Array<{ id: string; category: string | null }>).map((p) => [p.id, p.category]));
const csv = (v: unknown) => `"${(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')).replace(/"/g, '""')}"`;
const byId = new Map(rows.map((r) => [r.id, r]));
const byProtocol = new Map<string, Row[]>();
for (const r of rows) byProtocol.set(r.protocol_id, [...(byProtocol.get(r.protocol_id) || []), r]);
const out = [['protocol_id', 'item_id', 'item_title', 'action', 'field', 'from', 'to', 'reason'].join(',')];
for (const [pid, items] of byProtocol) {
  // Protocols that are all planner entries (trips, events) are left alone entirely.
  const tops = items.filter((r) => !r.parent_protocol_item_id && !r.hidden);
  if (tops.length && tops.filter((r) => isCalendarEntry(r.display_name || '')).length / tops.length > 0.5) continue;
  for (const c of standardiseProtocol(items, 'cleanup', themes.get(pid))) {
    out.push([pid, c.item_id, byId.get(c.item_id)?.display_name ?? c.insert?.display_name ?? '', c.action, c.field ?? (c.insert ? 'new row' : ''), c.from, c.to ?? (c.insert ? c.insert : ''), c.reason].map(csv).join(','));
  }
}
process.stdout.write(out.join('\n') + '\n');
