/*
 * Protocol admin CRUD — targets the REAL production tables `protocols` and
 * `protocol_items` over Supabase PostgREST.
 *
 * IMPORTANT: the legacy admin "Protocols" tab pointed at `catalog_protocols`,
 * which does NOT exist in the live database (404). Routines/protocols actually
 * live in `protocols` (+ `protocol_items`). This module is the single source of
 * truth for reading and writing them from the admin panel.
 *
 * Writes require a valid admin session (accessToken). Reads of public protocols
 * fall back to the anon key. Both projectId/publicAnonKey follow the selected
 * environment (staging | production) via ../utils/supabase/info.
 */
import { projectId, publicAnonKey } from './supabase/info';
import { gateProtocolItem } from './protocolGate';
import { enforceProtocolRules, isWakeTitle, ruleGroupFor, ruleRowFields, END_SLEEP, START_SLEEP, type Anchor, type RuleGroup, type RuleIssue } from './protocolRules';
import {
  recipeMatchesSlot, recipeMealBucket, slotNameToBucket,
  descriptiveMealSlot, slotDescriptors, parsePrepMinutes, type SlotDescriptors,
} from '../protocolDomain/mealSlot';

const rest = () => `https://${projectId}.supabase.co/rest/v1`;

export interface AdminProtocol {
  id: string;
  user_id?: string | null;
  name: string;
  description: string | null;
  category: string | null;
  type: string | null;
  target_gender: string | null;
  creator: string | null;
  source: string | null;
  image_url: string | null;
  health_score: number | null;
  total_days: number | null;
  is_suggested: boolean | null;
  is_active: boolean | null;
  is_public: boolean | null;
  start_time: string | null;
  sort_order: number | null;
  updated_at?: string | null;
  profile_role?: 'self' | 'partner' | 'child' | null;
  profile_name?: string | null;
  profile_image_url?: string | null;
  schedule_basis?: 'calendar' | 'menstrual_cycle' | 'lunar_cycle' | null;
  builder_kind?: 'diet' | 'fitness' | 'personal' | null;
  builder_config?: any;
  source_protocol_ids?: string[] | null;
}

export interface AdminProtocolItem {
  id: string;
  protocol_id: string;
  display_name: string | null;
  item_type: string | null;   // supplement | consume | recipe | activity | product
  kind: string | null;        // action | rule_do | rule_dont
  scope: string | null;
  scheduled_time: string | null; // 'HH:MM:SS'
  duration_minutes: number | null;
  group_name: string | null;
  day_number: number | null;
  sort_order: number | null;
  parent_protocol_item_id: string | null; // child description items point at their parent
  has_children: boolean | null;
  category: string | null;   // consume | do | sleep | supplement
  subtype: string | null;    // consume: meal|drink|snack|beverage · do: hygiene|wellness|exercise
  hidden: boolean | null;    // kept in the protocol but hidden from the day view
  enabled: boolean | null;
  notes: string | null;
  media_image_url: string | null;
  media_audio_url: string | null;
  amount: number | string | null;
  amount_unit: string | null;
  frequency_override: string | null;
  recurrence_interval_unit: string | null;
  notifications_enabled: boolean | null;
  notification_lead_minutes: number | null;
  sets: number | null;
  reps: number | null;
  reps_display: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  weight_display: string | null;
  rest_seconds: number | null;
  work_seconds: number | null;
  rounds: number | null;
  intensity: string | null;
  distance_value: number | null;
  distance_unit: string | null;
  load_type: string | null;
  intensity_variants: unknown[] | Record<string, unknown> | null;
  selected_intensity: string | null;
  filter: Record<string, unknown> | null;
  catalog_recipe_id: string | null;
  source_child_protocol_id?: string | null;
  catalog_product_id: string | null;
  catalog_activity_id: string | null;
  catalog_ingredient_id: string | null;
  supplement_id: string | null;
  // cadence / recurrence (read by the mobile app's itemShowsOnDate + day_number cycle)
  recurrence_type: string | null;            // daily | weekly | biweekly | monthly | custom | one_off
  recurrence_days_of_week: number[] | null;  // 0..6 = Sun..Sat (weekly/biweekly)
  recurrence_interval_days: number | null;   // every N days (custom)
  recurrence_start_date: string | null;      // ISO date anchor
  recurrence_end_date: string | null;        // ISO date bound
  scheduled_date: string | null;             // ISO date — one_off items
}

export interface AIProtocolDraft {
  summary: string;
  /** `tips` on the bedtime step become rule_do children of it (the app's do-checklist). */
  steps: {
    title: string; time: string | null; category: string; notes: string; day_number: number; duration_minutes: number | null;
    /** rule_do children (the app's do-checklist in the item card). */
    tips?: string[];
    /** rule_dont children. */
    donts?: string[];
    /** Anchor instead of a clock time; resolved by enforceProtocolRules. */
    anchor?: Anchor | null; offset_minutes?: number | null;
    /** 'rule' = top-level do/don't rows for that day (Rules & Avoidances), no time. */
    kind?: 'action' | 'rule';
    ruleGroup?: RuleGroup;
    mealSlot?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
    issues?: RuleIssue[];
  }[];
}

function starterProtocolDraft(message: string): AIProtocolDraft {
  const sleepFocused = /sleep|insomnia|bedtime|menopause/i.test(message);
  const safety = 'Adjust to individual ability and stop if symptoms worsen. Seek clinical advice for persistent, severe, or concerning symptoms.';
  // Titles are short verb + noun actions; timing lives in time/duration. Sleep is the wake and
  // bedtime pair only, with sleep-environment advice as bullets in the bedtime notes.
  const steps = sleepFocused ? [
    { title: 'Wake up', time: '07:00', category: 'sleep', notes: `Keep the wake time consistent throughout the week, including after a disrupted night. ${safety}`, duration_minutes: null },
    { title: 'Get morning daylight', time: '07:30', category: 'do', notes: 'Spend time outdoors or near bright natural light soon after waking. Use an accessible alternative when outdoor conditions are unsuitable.', duration_minutes: 20 },
    { title: 'Go walking', time: '12:30', category: 'do', notes: 'Walk, do mobility work, or another appropriate activity at a conversational effort. Adapt duration and intensity to current capacity.', duration_minutes: 20 },
    { title: 'Stop caffeine', time: '14:00', category: 'consume', notes: 'Choose caffeine-free drinks after this point. Earlier timing may suit people who are particularly sensitive to caffeine.', duration_minutes: null },
    { title: 'Wind down', time: '21:30', category: 'do', notes: 'Use a repeatable low-stimulation routine such as reading, gentle breathing, or relaxation. Avoid activities that increase alertness.', duration_minutes: 30 },
    { title: 'Go to bed', time: '22:30', category: 'sleep', notes: `Begin the sleep opportunity at a consistent time. ${safety}`, duration_minutes: null, tips: ['Keep the room dark', 'Keep the bedroom cool', 'Prepare comfortable bedding'] },
  ] : [
    { title: 'Set an intention', time: '08:00', category: 'do', notes: `Choose one realistic action that supports the selected goal. ${safety}`, duration_minutes: 5 },
    { title: 'Go walking', time: '10:00', category: 'do', notes: 'Choose an accessible activity and adapt the duration and intensity to current capacity.', duration_minutes: 20 },
    { title: 'Eat a balanced lunch', time: '12:30', category: 'consume', notes: 'Use familiar foods and account for allergies, intolerances, cultural preferences, and clinical advice.', duration_minutes: null },
    { title: 'Take a recovery pause', time: '15:30', category: 'do', notes: 'Pause for breathing, stretching, hydration, or another low-risk recovery practice.', duration_minutes: 10 },
    { title: 'Review progress', time: '20:30', category: 'do', notes: `Record what was completed and any symptoms or barriers. ${safety}`, duration_minutes: 5 },
  ];
  return {
    summary: 'The live AI route was unavailable, so ROUTINE³ created a conservative starter draft from the selected profile. Review and personalise every step before publishing.',
    steps: steps.map((step) => ({ ...step, day_number: 1 })),
  };
}

type DraftStep = AIProtocolDraft['steps'][number];
/**
 * Runs the shared item rules (utils/protocolRules.ts) over an AI draft. Sleep becomes the app's two
 * anchors, "End Sleep" and "Start Sleep"; other sleep advice and any do/don't guidance becomes rule
 * children of the step it governs (tips = rule_do, donts = rule_dont), which the app shows as the
 * do-checklist inside the card (mobile timeline/subTaskRows.ts, "contextual rules"). Meals lose
 * their verb, vague practices become concrete, and every step gets a time.
 * (Name kept: callers already import it.)
 */
export function foldSleepSteps(steps: DraftStep[]): DraftStep[] {
  const ruled = enforceProtocolRules(steps.map((step) => ({
    ...step, group: step.category === 'supplement' ? 'supplements' : step.category, dos: step.tips || [], donts: step.donts || [],
    anchor: step.anchor || null, offsetMinutes: step.offset_minutes ?? null, durationMinutes: step.duration_minutes, windowKey: String(step.day_number || 1),
  })));
  const order = (step: DraftStep) => step.title === END_SLEEP ? -1 : step.title === START_SLEEP ? 1 : 0;
  return ruled.map(({ group: _g, dos, donts, durationMinutes, offsetMinutes: _o, windowKey: _w, link: _l, ...step }) => ({
    ...step, tips: dos, donts, duration_minutes: durationMinutes ?? null,
  } as DraftStep)).sort((a, b) => order(a) - order(b));
}

/** Saves a ruled draft step: the action (or top-level rule rows) plus its rule_do / rule_dont children. */
export async function saveDraftStep(accessToken: string, protocolId: string, step: DraftStep, sortOrder: number, parentId?: string): Promise<AdminProtocolItem | null> {
  const subtype = step.category === 'sleep' ? 'sleep' : step.category === 'consume' ? 'meal' : step.category === 'supplement' ? 'supplement' : 'wellness';
  const base = { protocol_id: protocolId, scope: null, group_name: step.mealSlot || null, day_number: step.day_number || 1, category: step.category, subtype, hidden: false, enabled: true, recurrence_type: 'daily' };
  const itemType = step.category === 'consume' ? 'consume' : step.category === 'supplement' ? 'supplement' : 'activity';
  let parent: AdminProtocolItem | null = null;
  if (step.kind === 'rule') {
    // Top-level rules for that day: the app lists them under Rules & Avoidances, grouped by scope.
    const rows = [...(step.tips || []).map((name) => ['rule_do', name]), ...(step.donts || []).map((name) => ['rule_dont', name])];
    if (!rows.length) rows.push(['rule_do', step.title]);
    const groupRule = ruleRowFields(step.ruleGroup || ruleGroupFor(`${step.title} ${rows.map((r) => r[1]).join(' ')}`, step.category === 'consume' ? 'meal' : step.category));
    for (const [k, [kind, name]] of rows.entries()) await createProtocolItem(accessToken, { ...base, ...groupRule, display_name: name, kind, item_type: groupRule.category === 'consume' ? 'consume' : itemType, scheduled_time: null, duration_minutes: null, sort_order: sortOrder + k, parent_protocol_item_id: null, has_children: false, notes: k === 0 ? [step.title, step.notes].filter(Boolean).join(' — ') : '' } as any);
    return null;
  }
  const hasKids = Boolean(step.tips?.length || step.donts?.length);
  if (!parentId) {
    parent = await createProtocolItem(accessToken, { ...base, display_name: step.title, kind: 'action', item_type: itemType, scheduled_time: step.time ? `${step.time}:00` : null, duration_minutes: step.duration_minutes, sort_order: sortOrder, parent_protocol_item_id: null, has_children: hasKids, notes: step.notes } as any);
    parentId = parent.id;
  }
  const kids = [...(step.tips || []).map((name) => ['rule_do', name]), ...(step.donts || []).map((name) => ['rule_dont', name])];
  for (const [k, [kind, name]] of kids.entries()) await createProtocolItem(accessToken, { ...base, display_name: name, kind, item_type: itemType, scheduled_time: null, duration_minutes: null, sort_order: k + 1, parent_protocol_item_id: parentId, has_children: false, notes: '' } as any);
  return parent;
}

export async function buildProtocolWithAI(accessToken: string, protocolId: string, message: string): Promise<AIProtocolDraft> {
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/guides/build-protocol`, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify({ protocolId, message }),
  });
  if (res.status === 404) {
    const detail = await res.clone().json().catch(() => null) as { error?: string; message?: string } | null;
    const reason = `${detail?.error || ''} ${detail?.message || ''}`;
    if (!/protocol not found/i.test(reason)) return starterProtocolDraft(message);
  }
  return handle(res, 'Build protocol with AI');
}

/**
 * Revise an existing protocol from a plain-language instruction. The AI gets the current steps
 * and returns the complete revised list; steps are matched by title and updated in place, new
 * ones are added, and dropped ones are HIDDEN (never deleted) so nothing is lost.
 */
export async function updateProtocolWithAI(
  accessToken: string,
  protocolId: string,
  instruction: string,
  items: AdminProtocolItem[],
  sources = '',
): Promise<{ summary: string; updated: number; added: number; hidden: number }> {
  const tops = items.filter((it) => (it.kind === 'action' || !it.kind) && !it.parent_protocol_item_id && !it.hidden);
  const current = tops.map((it) => `- ${it.display_name} | ${it.scheduled_time?.slice(0, 5) || 'no time'} | ${it.category || 'do'} | ${(it.notes || '').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
  const message = `Revise this existing Protocol. Return the COMPLETE revised list of steps: keep every step that should stay with exactly the same title, change only what the instruction asks.\n\nInstruction: ${instruction.trim()}\n\nCurrent steps (title | time | category | notes):\n${current || '(none yet)'}${sources ? `\n\nReference material:\n${sources}` : ''}`;
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/guides/build-protocol`, {
    method: 'POST', headers: headers(accessToken), body: JSON.stringify({ protocolId, message }),
  });
  const draft = await handle(res, 'Update protocol with AI') as AIProtocolDraft;
  const steps = foldSleepSteps(draft.steps || []);
  const key = (t: string) => t.trim().toLowerCase();
  const byTitle = new Map(tops.map((it) => [key(it.display_name || ''), it]));
  // Sleep anchors match by role, so "Wake up" → "End Sleep" is a rename, not hide + add.
  const sleepTops = tops.filter((it) => it.category === 'sleep');
  const wakeItem = sleepTops.find((it) => isWakeTitle(it.display_name || '')) || null;
  const bedItem = sleepTops.filter((it) => it !== wakeItem).sort((a, b) => (b.scheduled_time || '').localeCompare(a.scheduled_time || ''))[0] || null;
  const kept = new Set<string>();
  let updated = 0, added = 0;
  for (const [index, step] of steps.entries()) {
    const match = byTitle.get(key(step.title)) || (step.title === END_SLEEP ? wakeItem : step.title === START_SLEEP ? bedItem : null) || undefined;
    const time = step.time ? `${step.time}:00` : null;
    if (step.kind === 'rule') { await saveDraftStep(accessToken, protocolId, step, tops.length + index + 1); added++; continue; }
    if (match) {
      kept.add(match.id);
      if ((match.display_name || '') !== step.title || (match.scheduled_time || null) !== time || (match.notes || '') !== (step.notes || '') || (match.duration_minutes ?? null) !== (step.duration_minutes ?? null)) {
        await updateProtocolItem(accessToken, match.id, { display_name: step.title, scheduled_time: time, notes: step.notes, duration_minutes: step.duration_minutes });
        updated++;
      }
      const existingKids = new Set(items.filter((it) => it.parent_protocol_item_id === match.id).map((it) => key(it.display_name || '')));
      const fresh = { ...step, tips: (step.tips || []).filter((t) => !existingKids.has(key(t))), donts: (step.donts || []).filter((t) => !existingKids.has(key(t))) };
      if (fresh.tips.length || fresh.donts.length) await saveDraftStep(accessToken, protocolId, fresh, 1, match.id);
    } else {
      await saveDraftStep(accessToken, protocolId, step, tops.length + index + 1);
      added++;
    }
  }
  const dropped = tops.filter((it) => !kept.has(it.id));
  for (const it of dropped) await updateProtocolItem(accessToken, it.id, { hidden: true });
  return { summary: draft.summary || '', updated, added, hidden: dropped.length };
}

const PROTOCOL_COLS =
  'id,user_id,name,description,category,type,target_gender,creator,source,image_url,health_score,total_days,is_suggested,is_active,is_public,start_time,sort_order,updated_at,profile_role,profile_name,profile_image_url,schedule_basis';
let legacyProtocolColumns = false;
const LEGACY_PROTOCOL_COLS = PROTOCOL_COLS.split(',').filter((column) => !['profile_role', 'profile_name', 'profile_image_url', 'schedule_basis'].includes(column)).join(',');
const ITEM_COLS =
  'id,protocol_id,display_name,item_type,kind,scope,scheduled_time,duration_minutes,group_name,day_number,sort_order,parent_protocol_item_id,has_children,category,subtype,hidden,enabled,notes,media_image_url,media_audio_url,amount,amount_unit,frequency_override,catalog_recipe_id,catalog_product_id,catalog_activity_id,catalog_ingredient_id,supplement_id,recurrence_type,recurrence_days_of_week,recurrence_interval_days,recurrence_interval_unit,recurrence_start_date,recurrence_end_date,scheduled_date,notifications_enabled,notification_lead_minutes,sets,reps,reps_display,weight_value,weight_unit,weight_display,rest_seconds,work_seconds,rounds,intensity,distance_value,distance_unit,load_type,intensity_variants,selected_intensity,filter';
const LEGACY_ITEM_COLS = ITEM_COLS.split(',').filter((column) => !column.startsWith('media_')).join(',');

function headers(accessToken: string, extra: Record<string, string> = {}) {
  return {
    apikey: publicAnonKey,
    Authorization: `Bearer ${accessToken || publicAnonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function handle(res: Response, ctx: string): Promise<any> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`${ctx} failed (${res.status}): ${detail || res.statusText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function first<T>(rows: T | T[]): T {
  return Array.isArray(rows) ? rows[0] : rows;
}

/** All protocols, suggested ones first, then by sort order / name. */
export async function listProtocols(accessToken: string, ownerId?: string | null): Promise<AdminProtocol[]> {
  const suffix =
    // An owner's list hides archived (is_active = false) protocols, e.g. retired duplicates.
    (ownerId ? `&user_id=eq.${encodeURIComponent(ownerId)}&is_active=not.is.false` : '') +
    `&order=is_suggested.desc.nullslast,sort_order.asc.nullslast,name.asc`;
  // Environments without the profile columns (Staging's protocols is a view) answer 42703; remember that so we stop retrying.
  let res = await fetch(`${rest()}/protocols?select=${legacyProtocolColumns ? LEGACY_PROTOCOL_COLS : PROTOCOL_COLS}${suffix}`, { headers: headers(accessToken) });
  if (!res.ok && !legacyProtocolColumns) {
    const failure = await res.clone().json().catch(() => null) as { code?: string; message?: string } | null;
    if (failure?.code === '42703') { legacyProtocolColumns = true; res = await fetch(`${rest()}/protocols?select=${LEGACY_PROTOCOL_COLS}${suffix}`, { headers: headers(accessToken) }); }
  }
  return (await handle(res, 'List protocols')) || [];
}

const protocolNameKey = (name: string) => name.replace(/^R3\s+Protocol\s*>\s*/i, '').trim().toLowerCase();

/**
 * Reuse the owner's active protocol with the same name (ignoring an "R3 Protocol >" prefix and
 * case) instead of creating another. The Guardian builder keeps its working protocol only in
 * memory, so every reload + "Build Protocol" or publish used to mint a duplicate.
 */
export async function findOrCreateProtocol(
  accessToken: string,
  protocol: Partial<AdminProtocol> & { name: string; user_id: string },
): Promise<AdminProtocol> {
  const existing = await listProtocols(accessToken, protocol.user_id).catch(() => [] as AdminProtocol[]);
  const match = existing.find((row) => protocolNameKey(row.name || '') === protocolNameKey(protocol.name));
  return match || createProtocol(accessToken, protocol);
}

export async function createProtocol(
  accessToken: string,
  protocol: Partial<AdminProtocol> & { name: string; user_id: string },
): Promise<AdminProtocol> {
  const res = await fetch(`${rest()}/protocols`, {
    method: 'POST',
    headers: headers(accessToken, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      description: '', category: 'Health', type: 'daily', target_gender: 'all',
      total_days: 14, is_suggested: false, is_public: false, is_active: true,
      ...protocol,
    }),
  });
  return first(await handle(res, 'Create protocol'));
}

/** Steps for one protocol, ordered chronologically like the app's day view. */
export async function listProtocolItems(
  accessToken: string,
  protocolId: string,
): Promise<AdminProtocolItem[]> {
  const request = (columns: string) => fetch(
    `${rest()}/protocol_items?protocol_id=eq.${protocolId}&select=${columns}` +
    `&order=scheduled_time.asc.nullslast,sort_order.asc.nullslast`,
    { headers: headers(accessToken) },
  );
  let res = await request(ITEM_COLS);
  if (!res.ok) {
    const failure = await res.clone().json().catch(() => null) as { code?: string; message?: string } | null;
    const missingMediaColumn = failure?.code === '42703' && /protocol_items\.media_(image|audio)_url/.test(failure.message || '');
    if (missingMediaColumn) res = await request(LEGACY_ITEM_COLS);
  }
  const items = ((await handle(res, 'List protocol steps')) || []) as Partial<AdminProtocolItem>[];
  return items.map((item) => ({ ...item, media_image_url: item.media_image_url ?? null, media_audio_url: item.media_audio_url ?? null } as AdminProtocolItem));
}

export async function updateProtocol(
  accessToken: string,
  id: string,
  patch: Partial<AdminProtocol>,
): Promise<AdminProtocol> {
  const res = await fetch(`${rest()}/protocols?id=eq.${id}`, {
    method: 'PATCH',
    headers: headers(accessToken, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  return first(await handle(res, 'Update protocol'));
}

export async function updateProtocolItem(
  accessToken: string,
  id: string,
  patch: Partial<AdminProtocolItem>,
): Promise<AdminProtocolItem> {
  // Hard gate: a patch that touches the title, time, slot or kind is checked against the stored row.
  let body: Partial<AdminProtocolItem> = patch;
  if (['display_name', 'scheduled_time', 'group_name', 'category', 'subtype', 'kind'].some((k) => k in patch)) {
    const current = await fetch(`${rest()}/protocol_items?id=eq.${id}&select=${ITEM_COLS}`, { headers: headers(accessToken) })
      .then((r) => (r.ok ? r.json() : [])).then((rows) => rows?.[0]).catch(() => undefined);
    body = gateProtocolItem(patch, current).item as Partial<AdminProtocolItem>;
  }
  const res = await fetch(`${rest()}/protocol_items?id=eq.${id}`, {
    method: 'PATCH',
    headers: headers(accessToken, { Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  return first(await handle(res, 'Update step'));
}

export async function createProtocolItem(
  accessToken: string,
  item: Partial<AdminProtocolItem>,
): Promise<AdminProtocolItem> {
  // Hard gate: every new row on the website goes through the same item rules as the AI builders.
  const gated = gateProtocolItem(item).item;
  const res = await fetch(`${rest()}/protocol_items`, {
    method: 'POST',
    headers: headers(accessToken, { Prefer: 'return=representation' }),
    body: JSON.stringify(gated),
  });
  return first(await handle(res, 'Create step'));
}

export async function deleteProtocolItem(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${rest()}/protocol_items?id=eq.${id}`, {
    method: 'DELETE',
    headers: headers(accessToken),
  });
  await handle(res, 'Delete step');
}

/* ───────── catalog linking (recipes / products / activities / supplements) ───────── */
export type CatalogKind = 'recipe' | 'ingredient' | 'product' | 'activity' | 'supplement';
export interface CatalogHit { id: string; name: string; image: string | null; price?: number | null; buyUrl?: string | null; healthScore?: number | null }
interface CatCfg { table: string; fk: keyof AdminProtocolItem; nameCols: string[]; imgCols: string[]; buyCols?: string[]; extraCols?: string[] }
// Only columns that actually exist on each table (a bad column 400s the whole select).
export const CATALOG_CFG: Record<CatalogKind, CatCfg> = {
  recipe: { table: 'catalog_recipes', fk: 'catalog_recipe_id', nameCols: ['name_common'], imgCols: ['image_url', 'image_primary_url', 'images'], extraCols: ['meal_slot', 'health_score', 'tags', 'dietary_info', 'prep_time', 'is_group', 'type'] },
  // catalog_ingredients has no `name` column (Staging): asking for it 400s every ingredient search.
  ingredient: { table: 'catalog_ingredients', fk: 'catalog_ingredient_id', nameCols: ['name_common'], imgCols: ['image_url', 'image_primary_url', 'images'] },
  product: { table: 'catalog_products', fk: 'catalog_product_id', nameCols: ['name_common', 'name_brand', 'market_name', 'name'], imgCols: ['image_url', 'image_primary_url', 'image', 'images'], buyCols: ['price_usd', 'affiliate_link_amazon', 'affiliate_link_shopify', 'purchase_url', 'affiliate_url'] },
  activity: { table: 'catalog_activities', fk: 'catalog_activity_id', nameCols: ['name'], imgCols: ['image_url', 'image_primary_url', 'primary_image_url'] },
  supplement: { table: 'hs_supplements', fk: 'supplement_id', nameCols: ['name'], imgCols: ['image_url'] },
};
const ALL_FKS: (keyof AdminProtocolItem)[] = ['catalog_recipe_id', 'catalog_ingredient_id', 'catalog_product_id', 'catalog_activity_id', 'supplement_id'];
const catalogCols = (cfg: CatCfg) => ['id', ...cfg.nameCols, ...cfg.imgCols, ...(cfg.buyCols || []), ...(cfg.extraCols || [])].join(',');

function mapHit(cfg: CatCfg, row: any): CatalogHit {
  const name = cfg.nameCols.map((c) => row[c]).find(Boolean) || 'Untitled';
  let image: string | null = null;
  for (const c of cfg.imgCols) {
    const v = row[c];
    if (!v) continue;
    image = c === 'images' ? (Array.isArray(v) ? v[0] : typeof v === 'string' ? v : null) : v;
    if (image) break;
  }
  const hit: CatalogHit = { id: row.id, name, image };
  if (cfg.buyCols) {
    hit.price = row.price_usd ?? null;
    hit.buyUrl = row.affiliate_link_amazon || row.affiliate_link_shopify || row.purchase_url || row.affiliate_url || null;
  }
  if ('health_score' in row) hit.healthScore = typeof row.health_score === 'number' ? row.health_score : null;
  return hit;
}

/* ── slot-aware recipe suggestion (broad/descriptive meal slots) ──
 * Ranks recipes for a slot like "Lunch", "Nutritious Lunch" or "High-Protein
 * Dinner": base = health_score, plus boosts for descriptors parsed from the slot
 * name against the recipe's tags / dietary_info / prep_time. Only reads columns
 * that exist on catalog_recipes. Mirrors the mobile fetchSlotRecipeSuggestions
 * pipeline (fetch top 80 → match bucket → main-meal fallback) + descriptor rank. */
function scoreRecipe(r: any, d: SlotDescriptors): number {
  const base = typeof r.health_score === 'number' ? r.health_score : 50;
  let s = base;
  const tags = new Set((Array.isArray(r.tags) ? r.tags : []).map((t: any) => String(t).toLowerCase()));
  const di = (r.dietary_info && typeof r.dietary_info === 'object') ? r.dietary_info : {};
  if (d.nutritious) s += base * 0.3;
  if (d.protein) s += (tags.has('protein') || tags.has('high_protein') || tags.has('high-protein')) ? 25 : (di.contains_meat ? 12 : 0);
  if (d.quick) { const p = parsePrepMinutes(r.prep_time); s += (p != null && p <= 15) ? 20 : 0; }
  if (d.vegan) s += (di.vegan || tags.has('vegan') || tags.has('plant_based') || tags.has('plant-based')) ? 40 : 0;
  if (d.keto) s += (di.keto || di.low_carb || tags.has('keto') || tags.has('low_carb') || tags.has('low-carb')) ? 30 : 0;
  if (d.light) s += (tags.has('light') || tags.has('low_cal') || tags.has('low-cal')) ? 15 : 0;
  return s;
}

async function suggestRecipesForSlot(accessToken: string, cfg: CatCfg, slotName: string, limit: number): Promise<CatalogHit[]> {
  const base = descriptiveMealSlot(slotName) ?? slotName;
  const d = slotDescriptors(slotName);
  const url = `${rest()}/${cfg.table}?select=${catalogCols(cfg)}`
    + `&is_published=eq.true`
    + `&image_url=not.is.null`
    + `&or=(is_group.is.null,is_group.eq.false)`
    + `&order=health_score.desc.nullslast`
    + `&limit=80`;
  const res = await fetch(url, { headers: headers(accessToken) });
  const rows: any[] = (await handle(res, `Suggest ${cfg.table}`)) || [];
  const usable = rows.filter((r) => r.type !== 'group' && r.is_group !== true);
  const score = (r: any) => scoreRecipe(r, d);
  const slotBucket = slotNameToBucket(base);
  // Exact bucket match beats an 'anytime' wildcard match, so a real Lunch recipe
  // outranks a high-scoring anytime puree that merely fits every slot.
  const exact = (r: any) => (recipeMealBucket(r.meal_slot) === slotBucket ? 1 : 0);
  const matched = usable.filter((r) => recipeMatchesSlot(r.meal_slot, base))
    .sort((a, b) => (exact(b) - exact(a)) || (score(b) - score(a)));
  // Fallback stays slot-appropriate: never surface a Beverage/Snack recipe for a main meal.
  const isMainMeal = slotBucket === 'Morning' || slotBucket === 'Afternoon' || slotBucket === 'Evening';
  const fallbackPool = (isMainMeal
    ? usable.filter((r) => { const b = recipeMealBucket(r.meal_slot); return b !== 'Beverages' && b !== 'Snacks'; })
    : usable).filter((r) => !matched.includes(r)).sort((a, b) => score(b) - score(a));
  const ranked = [...matched, ...fallbackPool]; // matched first (both already score-sorted), disjoint
  // Variety: cap recipes sharing the same first tag to 2 so a slot isn't all smoothies.
  const out: any[] = [];
  const tagCount = new Map<string, number>();
  for (const r of ranked) {
    if (out.length >= limit) break;
    const t0 = (Array.isArray(r.tags) && r.tags.length) ? String(r.tags[0]).toLowerCase() : '';
    if (t0 && (tagCount.get(t0) || 0) >= 2) continue;
    if (t0) tagCount.set(t0, (tagCount.get(t0) || 0) + 1);
    out.push(r);
  }
  if (out.length < limit) for (const r of ranked) { if (out.length >= limit) break; if (!out.includes(r)) out.push(r); }
  return out.slice(0, limit).map((r) => mapHit(cfg, r));
}

/** Search a catalog by name (empty query → top suggestions). When `slotName` is
 *  given for recipes and there is no typed query, returns slot-aware ranked
 *  suggestions (e.g. for a "Nutritious Lunch" meal slot) instead of alpha order. */
export async function searchCatalog(accessToken: string, kind: CatalogKind, query: string, limit = 8, slotName?: string): Promise<CatalogHit[]> {
  const cfg = CATALOG_CFG[kind];
  const q = query.trim();
  if (kind === 'recipe' && slotName && !q) {
    return suggestRecipesForSlot(accessToken, cfg, slotName, limit);
  }
  let url = `${rest()}/${cfg.table}?select=${catalogCols(cfg)}&limit=${limit}`;
  if (kind === 'recipe') url += '&is_published=eq.true';
  if (q) {
    const or = cfg.nameCols.map((c) => `${c}.ilike.*${encodeURIComponent(q)}*`).join(',');
    url += `&or=(${or})`;
  } else {
    url += `&order=${cfg.nameCols[0]}.asc.nullslast`;
  }
  const res = await fetch(url, { headers: headers(accessToken) });
  const rows = (await handle(res, `Search ${cfg.table}`)) || [];
  return (rows as any[]).map((r) => mapHit(cfg, r));
}

/** Resolve linked catalog records in one shot (for display + preview images). */
export async function getCatalogByIds(accessToken: string, kind: CatalogKind, ids: string[]): Promise<CatalogHit[]> {
  if (!ids.length) return [];
  const cfg = CATALOG_CFG[kind];
  const res = await fetch(`${rest()}/${cfg.table}?id=in.(${ids.join(',')})&select=${catalogCols(cfg)}`, { headers: headers(accessToken) });
  const rows = (await handle(res, `Get ${cfg.table}`)) || [];
  return (rows as any[]).map((r) => mapHit(cfg, r));
}

/** Which catalog kind (if any) an item is currently linked to. */
export function linkedKind(item: AdminProtocolItem): CatalogKind | null {
  if (item.catalog_recipe_id) return 'recipe';
  if (item.catalog_ingredient_id) return 'ingredient';
  if (item.catalog_product_id) return 'product';
  if (item.catalog_activity_id) return 'activity';
  if (item.supplement_id) return 'supplement';
  return null;
}
/** Patch that sets one catalog FK and clears the others. */
export function linkPatch(kind: CatalogKind | null, id: string | null): Partial<AdminProtocolItem> {
  const patch: any = {};
  for (const fk of ALL_FKS) patch[fk] = null;
  if (kind && id) patch[CATALOG_CFG[kind].fk] = id;
  return patch;
}

/** The primary editable name column for a catalog kind. */
export function catalogNameCol(kind: CatalogKind): string {
  return CATALOG_CFG[kind].nameCols[0];
}

/** Patch arbitrary fields on a linked catalog record via the admin edge function (service role). */
export async function updateCatalogFields(accessToken: string, kind: CatalogKind, id: string, updates: Record<string, any>): Promise<void> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/admin/catalog/update`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: CATALOG_CFG[kind].table, id, updates }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `Update failed (${res.status})`);
}

/** Set image_url on a linked catalog record (thin wrapper over updateCatalogFields). */
export async function updateCatalogImage(accessToken: string, kind: CatalogKind, id: string, imageUrl: string): Promise<string> {
  await updateCatalogFields(accessToken, kind, id, { image_url: imageUrl });
  return imageUrl;
}

/** Delete a catalog record via the admin edge function (service role). */
export async function deleteCatalogRecord(accessToken: string, kind: CatalogKind, id: string): Promise<void> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/admin/catalog/delete`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: CATALOG_CFG[kind].table, id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `Delete failed (${res.status})`);
}

/** Merge a duplicate catalog record into a survivor — re-points protocol links +
 *  recipe↔ingredient junctions onto the survivor, then deletes the duplicate.
 *  Returns per-table re-point counts.
 *
 *  Done CLIENT-SIDE via PostgREST (no edge-function dependency, so it can't 404 on
 *  a stale deploy). protocol_items + catalog_recipe_ingredients writes require the
 *  is_healthscan_admin() RLS policies — see migration
 *  20260625_catalog_recipe_ingredients_admin_write_rls.sql. The duplicate delete
 *  goes through the service-role /delete endpoint (also handles KV products). */
export async function mergeCatalogRecords(accessToken: string, kind: CatalogKind, survivorId: string, duplicateId: string): Promise<Record<string, number>> {
  if (!survivorId || !duplicateId || survivorId === duplicateId) throw new Error('Pick two different records');
  // One atomic RPC (SECURITY DEFINER) re-points every FK referencing the table —
  // junctions, element links, and the self-referential parent_ingredient_id that
  // would otherwise block the delete — de-dups colliding rows, then deletes the
  // duplicate. See migration 20260625_merge_catalog_records_rpc.sql.
  const res = await fetch(`${rest()}/rpc/merge_catalog_records`, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify({ p_table: CATALOG_CFG[kind].table, p_survivor: survivorId, p_duplicate: duplicateId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 404) throw new Error('Merge function not found — apply migration supabase/migrations/20260625_merge_catalog_records_rpc.sql, then retry.');
    throw new Error(`Merge failed (${res.status}): ${detail || res.statusText}`);
  }
  return (await res.json().catch(() => ({}))) || {};
}

/** Mirror a merge that already ran on staging onto PRODUCTION (via the edge
 *  function, which holds the prod service key). Folds each duplicate into the
 *  survivor on prod and upserts the merged survivor row. Call only from staging. */
export async function mergeCatalogRecordsOnProd(
  accessToken: string, kind: CatalogKind, survivorId: string, duplicateIds: string[], survivorRow: any,
): Promise<Record<string, number>> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/admin/catalog/merge-prod`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: CATALOG_CFG[kind].table, survivorId, duplicateIds, survivorRow }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `Prod sync failed (${res.status})`);
  return data.repointed || {};
}

/** How many protocol_items across ALL protocols reference this catalog record (for delete warnings). */
export async function countProtocolRefs(accessToken: string, kind: CatalogKind, id: string): Promise<number> {
  const fk = CATALOG_CFG[kind].fk;
  const res = await fetch(`${rest()}/protocol_items?${fk}=eq.${id}&select=id`, {
    method: 'GET',
    headers: headers(accessToken, { Prefer: 'count=exact' }),
  });
  // PostgREST returns the count in Content-Range: 0-24/123
  const cr = res.headers.get('content-range');
  if (cr && cr.includes('/')) { const n = parseInt(cr.split('/')[1], 10); if (!Number.isNaN(n)) return n; }
  const rows = (await handle(res, 'Count refs')) || [];
  return Array.isArray(rows) ? rows.length : 0;
}

/** Upload protocol media through the admin edge function; returns the public URL. */
export async function uploadProtocolImage(accessToken: string, file: File, bucket = 'catalog-media'): Promise<string> {
  const url = `https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/admin/storage/upload`;
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.publicUrl;
}
