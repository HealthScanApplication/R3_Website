/*
 * Under an offer that delivers a routine, on the Guardian's public page: the routine's own steps, laid out the way the
 * routine browser lays them out on the right (by day and part of the day, each smart list with its rules).
 *
 * The offer → routine link is owner-only (guide_offer_routines), so the page finds the routine the way onboarding names
 * it: the Guardian's routine whose name is the offer's title, when there is exactly one. A visitor sees it only when that
 * routine is published; the Guardian, signed in, sees their own draft too. No match, no steps, or a failed read: nothing.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { routineSteps, type RoutineStep } from '../../utils/protocolBuilders';
import { RoutineStepsPanel } from './CatalogBrowsers';

const squash = (text: string) => text.toLowerCase().replace(/^r3\s*protocol\s*>\s*/i, '').replace(/[^a-z0-9]+/g, '');

export interface OfferRoutine { id: string; name: string; total_days: number | null; description: string | null }

/** The one routine whose name is the offer's title, or null when there is none or more than one. */
export function matchOfferRoutine(offerTitle: string, routines: OfferRoutine[]): OfferRoutine | null {
  const wanted = squash(offerTitle);
  if (!wanted) return null;
  const hits = routines.filter((routine) => squash(routine.name) === wanted);
  return hits.length === 1 ? hits[0] : null;
}

/** The Guardian's routines a reader may see: published ones, plus every one when the reader is the Guardian. */
export async function listGuardianRoutines(guideId: string, accessToken: string | null): Promise<OfferRoutine[]> {
  const own = !!accessToken;
  const url = `https://${projectId}.supabase.co/rest/v1/protocols?select=id,name,total_days,description&user_id=eq.${encodeURIComponent(guideId)}&is_active=not.is.false${own ? '' : '&is_public=eq.true'}`;
  const res = await fetch(url, { headers: { apikey: publicAnonKey, Authorization: `Bearer ${accessToken || publicAnonKey}` } });
  if (!res.ok) throw new Error(`Could not list routines (${res.status})`);
  return (await res.json()) as OfferRoutine[];
}

const ink = '#F5F2EA', acid = '#C7D8A3';

export function OfferProtocolItems({ guideId, offerTitle }: { guideId: string; offerTitle: string }) {
  const { user, accessToken } = useAuth();
  // Only the Guardian's own session may read drafts; anyone else reads what is published.
  const token = user?.id === guideId ? accessToken || null : null;
  const [found, setFound] = useState<{ routine: OfferRoutine; steps: RoutineStep[] } | null>(null);
  useEffect(() => {
    let live = true;
    setFound(null);
    (async () => {
      try {
        const routine = matchOfferRoutine(offerTitle, await listGuardianRoutines(guideId, token));
        if (!routine) return;
        const steps = await routineSteps(token || publicAnonKey, routine.id);
        if (live && steps.length) setFound({ routine, steps });
      } catch { /* the page is fine without it */ }
    })();
    return () => { live = false; };
  }, [guideId, offerTitle, token]);
  if (!found) return null;
  return <section aria-label={`What is inside ${found.routine.name}`} style={{ border: `1px solid rgba(199,216,163,.4)`, background: '#141611', color: ink, padding: 14, textAlign: 'left' }}>
    <div style={{ color: acid, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Inside this routine</div>
    <RoutineStepsPanel accessToken={token || publicAnonKey} steps={found.steps} description={found.routine.description} totalDays={found.routine.total_days} />
  </section>;
}
