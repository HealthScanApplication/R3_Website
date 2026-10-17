import { projectId, publicAnonKey } from './supabase/info';
import type { GuideRecipe } from './guidePortal';
import { per100FromRow } from './guideRecipeAI';
export function copyBuilderConfig<T>(config: T): T { return structuredClone(config); }
export function privateRecipeFields(source: Record<string, any>, ownerId: string, id: string): Record<string, any> {
  const { created_at, updated_at, ...fields } = copyBuilderConfig(source);
  return { ...fields, id, created_by_user_id: ownerId, cloned_from_recipe_id: source.id, is_published: false, publication_approved_at: null };
}
export interface ProtocolChild { parent_protocol_id: string; child_protocol_id: string; owner_id: string; kind: 'diet' | 'fitness'; source_protocol_id?: string | null }
async function request(token: string, path: string, body?: unknown) {
  const response = await fetch(`https://${projectId}.supabase.co/rest/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? null : response.json();
}
export const listProtocolChildren = (token: string, parentId: string): Promise<ProtocolChild[]> => request(token, `protocol_children?parent_protocol_id=eq.${encodeURIComponent(parentId)}&select=*`);
/**
 * The master routine a Diet or Fitness plan belongs to, and its plan of the other kind (the Diet plan for a
 * Fitness plan and vice versa). Null when the plan is not attached to a master Protocol.
 */
export async function findLinkedPlan(token: string, childId: string, kind: 'diet' | 'fitness'): Promise<{ parentId: string; siblingId: string | null } | null> {
  const links: ProtocolChild[] = await request(token, `protocol_children?child_protocol_id=eq.${encodeURIComponent(childId)}&select=*`);
  const parentId = links[0]?.parent_protocol_id;
  if (!parentId) return null;
  const other = kind === 'diet' ? 'fitness' : 'diet';
  const sibling = (await listProtocolChildren(token, parentId)).find((c) => c.kind === other && c.child_protocol_id !== childId);
  return { parentId, siblingId: sibling?.child_protocol_id ?? null };
}
export const cloneProtocolChild =(token: string, parentId: string, sourceId: string): Promise<string> => request(token, 'rpc/clone_protocol_child', { p_parent: parentId, p_source: sourceId });
export const syncProtocolChild = (token: string, childId: string): Promise<void> => request(token, 'rpc/sync_protocol_child', { p_child: childId });
export async function customizeProtocolRecipe(token: string, protocolId: string, itemId: string): Promise<GuideRecipe> {
  const result = await request(token, 'rpc/customize_protocol_recipe', { p_protocol: protocolId, p_item: itemId });
  const recipe: GuideRecipe = Array.isArray(result) ? result[0] : result;
  if (!recipe?.id) throw new Error('The private recipe copy could not be opened.');
  const ids = [...new Set(recipe.ingredients.filter((item: any) => item?.ingredient_id && !item.per100_source && !item.per100?.micros).map((item: any) => String(item.ingredient_id)))];
  const rows = ids.length ? await request(token, `catalog_ingredients?select=id,nutrition_per_100g,elements_beneficial,elements_hazardous,allergens,calories_per_100g&id=${encodeURIComponent(`in.(${ids.map((id) => JSON.stringify(id)).join(',')})`)}`) : [];
  const sources = new Map(rows.map((row: any) => [row.id, row]));
  return { ...recipe, ingredients: recipe.ingredients.map((item: any) => item?.per100_source || sources.has(item?.ingredient_id)
    ? { ...item, per100: per100FromRow(item.per100_source || sources.get(item.ingredient_id)) }
    : item?.per100 && !item.per100.micros ? { ...item, per100: per100FromRow({ nutrition_per_100g: item.per100 }) } : item) };
}
export const ensureGuideRecipeCatalog = (token: string, id: string): Promise<string> => request(token, 'rpc/ensure_guide_recipe_catalog', { p_guide: id });
