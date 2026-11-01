import { projectId, publicAnonKey } from './supabase/info';
import type { ProductKey } from '../components/hardware/copy';

const base = `https://${projectId}.supabase.co/functions/v1/hardware-preorders`;
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || 'Request failed.');
  return data as T;
}
export const fetchBackerCount = () => call<{ paid: number; goal: number; deadline: string; status: string }>({ action: 'count' });
export const createPreorderIntent = (product: ProductKey, email: string, name?: string) =>
  call<{ purchase_id: string; client_secret: string; amount_cents: number; currency: string }>({ action: 'intent', product, email, name });
export const confirmPreorder = (purchaseId: string) => call<{ status: string }>({ action: 'confirm', purchase_id: purchaseId });
