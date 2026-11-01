/*
 * The public "Ask" section of a Guardian's site: a few published, sourced answers and a way into the members-only Q&A forum.
 * Visitors can read these answers; asking questions and reading the forum needs the Guardian's membership (a paid community offer).
 * With no published answers and no membership on offer, the section is not shown.
 */
import { useEffect, useState } from 'react';
import { getGuideForumTeaser, type GuideForumTeaser, type GuideProfile } from '../../utils/guidePortal';
import { formatOfferPrice } from '../../utils/treatOffers';

const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';

export function forumHref(guardianSlug: string, channelSlug: string): string {
  return `/guardians/${encodeURIComponent(guardianSlug)}/community/${encodeURIComponent(channelSlug)}`;
}

/** The call to action: names the price when a membership is for sale, and says so plainly when it is not yet. */
export function forumCta(teaser: GuideForumTeaser): { label: string; note: string } {
  if (!teaser.membersOnly) return { label: 'Open the forum', note: 'Free to join.' };
  const offer = teaser.membershipOffer;
  if (!offer) return { label: 'Join the challenge', note: 'Membership opens soon.' };
  return { label: 'Join the challenge', note: `Membership ${formatOfferPrice(offer.price_cents, offer.currency, 'paid')}.` };
}

export function GuardianForumTeaser({ profile, pagePadding }: { profile: GuideProfile; pagePadding: string }) {
  const [teaser, setTeaser] = useState<GuideForumTeaser | null>(null);
  useEffect(() => {
    let live = true;
    getGuideForumTeaser(profile.user_id).then((result) => { if (live) setTeaser(result); }).catch(() => {});
    return () => { live = false; };
  }, [profile.user_id]);
  if (!teaser || (!teaser.questions.length && !teaser.membershipOffer)) return null;
  const cta = forumCta(teaser);
  const ink = '#11120F', muted = '#5F5E57', line = 'rgba(17,18,15,.22)', accent = '#667245';
  return (
    <section id="ask" data-forum-teaser aria-label={`Ask ${profile.display_name}`} style={{ background: '#FFFFFF', color: ink, padding: `clamp(72px,10vw,124px) ${pagePadding}` }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ color: accent, fontFamily: sans, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Questions and answers</div>
        <h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(40px,6vw,72px)', lineHeight: 1, margin: '14px 0 12px' }}>Ask {profile.display_name}.</h2>
        <p style={{ color: muted, fontFamily: sans, fontSize: 15, lineHeight: 1.6, maxWidth: 620, margin: '0 0 28px' }}>Members ask in the challenge forum and {profile.display_name} answers. Here is a taste of what has been asked.</p>
        {teaser.questions.length > 0 ? (
          <div style={{ display: 'grid', gap: 0, border: `1px solid ${line}`, marginBottom: 28 }}>
            {teaser.questions.map((item) => (
              <details key={item.id} data-forum-question style={{ borderBottom: `1px solid ${line}`, padding: '18px 20px' }}>
                <summary style={{ cursor: 'pointer', fontFamily: serif, fontSize: 24, lineHeight: 1.2 }}>{item.question}</summary>
                <p style={{ color: muted, fontFamily: sans, fontSize: 14, lineHeight: 1.65, margin: '12px 0 0' }}>{item.answer}</p>
                {item.exact_quote && <blockquote style={{ borderLeft: `2px solid ${accent}`, margin: '14px 0 0', padding: '4px 14px', fontFamily: serif, fontSize: 19 }}>“{item.exact_quote}”{item.source_url && <> <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ color: accent, fontFamily: sans, fontSize: 11, fontWeight: 700 }}>{item.source_title || 'Source'}</a></>}</blockquote>}
              </details>
            ))}
          </div>
        ) : (
          <p data-forum-empty style={{ fontFamily: serif, fontSize: 24, margin: '0 0 28px' }}>Be the first to ask.</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <a href={forumHref(profile.slug, teaser.channelSlug)} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 46, padding: '0 22px', border: `1px solid ${ink}`, background: ink, color: '#FFFFFF', fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none' }}>{cta.label}</a>
          <span style={{ color: muted, fontFamily: sans, fontSize: 13 }}>{cta.note}</span>
        </div>
      </div>
    </section>
  );
}
