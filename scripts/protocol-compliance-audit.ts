/*
 * Catalogue Protocol compliance audit — reads an export, writes a markdown report, never touches the database.
 *   npx tsx scripts/protocol-compliance-audit.ts protocols.json items.json > report.md
 * protocols.json: [{id, name, description, category, total_days, tags}]; items.json: protocol_items rows.
 *
 * Checks every Protocol against the shared protocol logic:
 *   - routineStandard.standardiseProtocol (cleanup, theme-aware): every change or flag it would make;
 *   - rules: a loose rule about a product, food or drink must sit with its group (supplements / consume / drinks);
 *   - truth: the name and description agree with the steps (time of day, length in days, empty or step-less).
 */
import { readFileSync } from 'fs';
import { standardiseProtocol, type Row } from '../src/utils/routineStandard';
import { ruleGroupFor } from '../src/utils/protocolRules';
import { routinePeriod } from '../src/utils/protocolBuilders';

type P = { id: string; name: string; description: string | null; category: string | null; total_days: number | null; tags: string[] | null };
const protocols: P[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const items: (Row & { protocol_id: string; recurrence_type?: string | null })[] = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const byProtocol = new Map<string, typeof items>();
for (const r of items) byProtocol.set(r.protocol_id, [...(byProtocol.get(r.protocol_id) || []), r]);

const mins = (t?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const isRule = (r: Row) => !!r.kind?.startsWith('rule');
type Finding = { protocol: string; check: string; detail: string };
const findings: Finding[] = [];
const add = (p: P, check: string, detail: string) => findings.push({ protocol: p.name, check, detail });

for (const p of protocols) {
  const rows = (byProtocol.get(p.id) || []).filter((r) => !r.hidden);
  const actions = rows.filter((r) => !isRule(r));
  if (!actions.length) { add(p, 'truth', 'No steps (only rules or empty)'); continue; }
  if (!(p.description || '').trim()) add(p, 'truth', 'No description');

  // Shared standard: anything it would change or flag is a deviation from the protocol logic.
  for (const c of standardiseProtocol(rows, 'cleanup', p.category)) add(p, c.action === 'flag' ? 'standard flag' : `standard ${c.action}`, `${rows.find((r) => r.id === c.item_id)?.display_name || c.insert?.display_name || ''} — ${c.reason}`);

  // Rules: a loose rule about supplements / food / drink belongs in that group, not as a general rule.
  for (const r of rows.filter((x) => isRule(x) && !x.parent_protocol_item_id)) {
    const text = r.display_name || '';
    // An activity rule that mentions meals ("Walk after eating") stays with the activity; a herbal tea may be a supplement.
    if (/^(daily )?(walk|run|stretch|move|breathe|rest|sleep)\b/i.test(text)) continue;
    const g = ruleGroupFor(text);
    const scope = String(r.scope || '');
    if (g === 'drinks' && scope === 'supplement' && /\b(tea|tonic|drink|water)\b/i.test(text)) continue;
    if (g === 'supplements' && scope !== 'supplement') add(p, 'rule group', `“${r.display_name}” is a supplements rule but has scope ${scope || 'none'}`);
    if ((g === 'consume' || g === 'drinks') && scope !== 'consume') add(p, 'rule group', `“${r.display_name}” is a ${g} rule but has scope ${scope || 'none'}`);
  }

  // Truth: the name's time of day matches when the steps happen.
  const period = routinePeriod({ name: p.name, description: p.description, tags: p.tags || [], totalDays: p.total_days });
  const times = actions.map((r) => mins(r.scheduled_time)).filter((m): m is number => m != null && !/sleep/i.test(''));
  const share = (lo: number, hi: number) => times.length ? times.filter((m) => m >= lo && m < hi).length / times.length : 1;
  if (period === 'Morning' && share(0, 12 * 60) < 0.6) add(p, 'truth', `Named for the morning but ${Math.round((1 - share(0, 720)) * 100)}% of timed steps are after 12:00`);
  if (period === 'Evening' && share(17 * 60, 24 * 60) < 0.6) add(p, 'truth', `Named for the evening but ${Math.round((1 - share(1020, 1440)) * 100)}% of timed steps are before 17:00`);
  if (period === 'Midday' && share(11 * 60, 16 * 60) < 0.5) add(p, 'truth', 'Named for midday but most timed steps are outside 11:00–16:00');
  // Length: a multi-day name or description needs day-specific or weekly steps.
  const multiDay = /^(\d+ (days|weeks|months)|Week|Month)$/.test(period);
  const varied = rows.some((r) => (r.day_number || 0) > 1 || r.recurrence_type === 'weekly');
  if (multiDay && !varied) add(p, 'truth', `Says ${period} but every step is the same each day`);
  if (p.total_days && p.total_days > 1 && Math.max(0, ...rows.map((r) => r.day_number || 0)) > p.total_days) add(p, 'truth', `Steps run past total_days (${p.total_days})`);
  if (actions.some((r) => mins(r.scheduled_time) == null && !r.parent_protocol_item_id)) add(p, 'truth', `${actions.filter((r) => mins(r.scheduled_time) == null && !r.parent_protocol_item_id).length} top-level steps have no time`);
}

const byCheck = new Map<string, number>();
for (const f of findings) byCheck.set(f.check, (byCheck.get(f.check) || 0) + 1);
const clean = protocols.filter((p) => !findings.some((f) => f.protocol === p.name)).length;
const out: string[] = [`# Protocol compliance audit`, '', `${protocols.length} catalogue Protocols · ${clean} fully compliant · ${findings.length} findings`, '', '| Check | Findings |', '|---|---|'];
for (const [k, n] of [...byCheck].sort((a, b) => b[1] - a[1])) out.push(`| ${k} | ${n} |`);
const names = [...new Set(findings.map((f) => f.protocol))].sort();
for (const n of names) {
  out.push('', `## ${n}`);
  for (const f of findings.filter((x) => x.protocol === n)) out.push(`- **${f.check}** — ${f.detail}`);
}
process.stdout.write(out.join('\n') + '\n');
