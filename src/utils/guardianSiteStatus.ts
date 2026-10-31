import type { GuideStatus } from './guidePortal';

/**
 * What a Guardian's site is doing right now, in one place, so the All sites cards, the publish bars in the site
 * build and the Sites overview in the workspace can never disagree.
 *
 * How publishing really works:
 *  - The profile site is live only when guide_profiles.status is 'approved'. A Guardian cannot set that: saving
 *    from the portal keeps the stored status and asks the Routine³ team for a check (requestGuardianReview), and
 *    an admin then approves ('approved') or unpublishes ('paused').
 *  - The offer funnel is a value ramp under the profile (/guardians/<slug>/value-ramp/<slug>). Its status is
 *    'published' as soon as the Guardian publishes, but the public policy also requires the profile to be approved,
 *    so a published ramp on a profile that is not approved is not live.
 */
export type SiteStatusKey = 'draft' | 'in_review' | 'published' | 'unpublished';
export type SiteStatusTone = 'draft' | 'review' | 'live' | 'muted';
export type SiteStatus = { key: SiteStatusKey; label: string; live: boolean; tone: SiteStatusTone };
export type RampStatus = 'draft' | 'published';

const DRAFT: SiteStatus = { key: 'draft', label: 'Draft', live: false, tone: 'draft' };
const IN_REVIEW: SiteStatus = { key: 'in_review', label: 'In review', live: false, tone: 'review' };
const PUBLISHED: SiteStatus = { key: 'published', label: 'Published', live: true, tone: 'live' };
const UNPUBLISHED: SiteStatus = { key: 'unpublished', label: 'Unpublished', live: false, tone: 'muted' };

/**
 * Pass only profileStatus for the profile site. Pass rampStatus as well for an offer funnel (use 'draft' when that
 * offer path has not been saved yet). An unknown or missing profile status counts as a draft.
 */
export function siteStatus(profileStatus: GuideStatus | null | undefined, rampStatus?: RampStatus | null): SiteStatus {
  const profile = profileStatus === 'approved' ? PUBLISHED
    : profileStatus === 'submitted' ? IN_REVIEW
    : profileStatus === 'paused' ? UNPUBLISHED
    : DRAFT;
  if (rampStatus === undefined) return profile;
  // Offer funnel: it can only be live when the profile site is; otherwise it shows the profile's state.
  if (!profile.live) return profile;
  return rampStatus === 'published' ? PUBLISHED : DRAFT;
}

export type SitePublishAction = { label: string; busyLabel: string; hint: string };

/**
 * The one publish action in the site build. It is the same for both sites because one save publishes the profile
 * site and the offer funnel together. Only the wording depends on whether the profile is already live.
 */
export function sitePublishAction(profileStatus: GuideStatus | null | undefined): SitePublishAction {
  if (profileStatus === 'approved') return { label: 'Update live site', busyLabel: 'Updating', hint: 'Saves your changes to the live profile site and offer path.' };
  if (profileStatus === 'submitted') return { label: 'Resubmit for review', busyLabel: 'Sending', hint: 'The Routine³ team is checking your site. Saving again keeps it in the queue.' };
  return { label: 'Request publish', busyLabel: 'Sending', hint: 'Saves both sites and asks the Routine³ team for a quick check before they go live.' };
}
