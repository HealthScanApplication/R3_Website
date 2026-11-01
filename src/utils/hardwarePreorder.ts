import { projectId, publicAnonKey } from './supabase/info';
import { ReferralUtils } from './useReferral';
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

/**
 * Adds the email to the same waitlist the homepage and Guardian sign-up use (make-server `email-waitlist`), so a
 * visitor who starts a preorder and leaves before paying is still captured. Best effort: it never blocks or fails checkout.
 */
export async function captureWaitlistEmail(email: string): Promise<void> {
  try {
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/email-waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
      keepalive: true, // finishes even if the visitor leaves the page while checkout starts
      body: JSON.stringify({ email, name: email.split('@')[0], referralCode: ReferralUtils.getPendingReferral() }),
    });
    if (res.ok) { try { localStorage.setItem('healthscan_user_email', email); } catch { /* storage is optional */ } }
  } catch { /* the preorder carries on without it */ }
}
