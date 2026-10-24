import { expect, it, vi } from 'vitest';

const select = vi.hoisted(() => vi.fn());
vi.mock('../supabase/client', () => ({
  getSupabaseClient: () => ({ from: () => ({ select: (columns: string) => { select(columns); return { eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }; } }) }),
}));
import { listPublicGuardianOffers } from '../guidePortal';

it('the public offers list asks for the cover photo, or the /guardians cards could never show one', async () => {
  await listPublicGuardianOffers();
  expect(select).toHaveBeenCalledTimes(1);
  expect(String(select.mock.calls[0][0]).split(',')).toContain('cover_url');
});
