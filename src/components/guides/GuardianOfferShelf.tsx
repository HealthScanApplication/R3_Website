/*
 * The public "Treats" and "Talks" sections of a Guardian's site: their offers of kind 'treat' and 'talk', as cards with the
 * category and length, the description, the price in its own currency and a way to book. Everything comes from the Guardian's
 * offers (managed in their admin); with none published, the section is not shown.
 */
import { useMemo, useState } from 'react';
import type { GuideOffer, GuideProfile } from '../../utils/guidePortal';
import { KIND_LABEL, formatMinutes, groupByCategory, parseOfferMeta, type TreatKind } from '../../utils/treatOffers';
import { useDisplayMoney } from '../../utils/displayMoney';

const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';

const THEMES: Record<TreatKind, { id: string; bg: string; ink: string; muted: string; line: string; accent: string; card: string; heading: string; intro: string }> = {
  talk: { id: 'talks', bg: '#F2EFE7', ink: '#11120F', muted: '#5F5E57', line: 'rgba(17,18,15,.22)', accent: '#667245', card: '#FFFFFF', heading: 'Talks and lectures', intro: 'Talks, lectures and workshops you can come to. Choose one to reserve a place.' },
  treat: { id: 'treats', bg: '#11150F', ink: '#F2EFE7', muted: '#B8B6AF', line: 'rgba(242,239,231,.26)', accent: '#C7D8A3', card: '#171B14', heading: 'Treats', intro: 'Spa and wellness treatments. Pick one to book it.' },
};

/** Where "Book" goes: the offer's own booking link, else an email to the Guardian that names the treat. */
export function bookingHref(profile: Pick<GuideProfile, 'contact_email' | 'display_name'>, offer: Pick<GuideOffer, 'title' | 'booking_url' | 'kind'>): string | null {
  if (offer.booking_url && /^https?:\/\//i.test(offer.booking_url)) return offer.booking_url;
  const to = (profile.contact_email || '').trim();
  if (!to) return null;
  return `mailto:${to}?subject=${encodeURIComponent(`${KIND_LABEL[offer.kind as TreatKind]?.one || 'Booking'}: ${offer.title}`)}`;
}

export function GuardianOfferShelf({ kind, profile, offers, pagePadding }: { kind: TreatKind; profile: GuideProfile; offers: GuideOffer[]; pagePadding: string }) {
  const theme = THEMES[kind];
  const money = useDisplayMoney();
  const published = useMemo(() => offers.filter((offer) => offer.kind === kind && offer.status === 'published'), [offers, kind]);
  const groups = useMemo(() => groupByCategory(published), [published]);
  const [filter, setFilter] = useState('all');
  if (!published.length) return null;
  const shown = filter === 'all' ? groups : groups.filter((group) => group.category === filter);
  const categories = groups.map((group) => group.category).filter(Boolean);
  const label = KIND_LABEL[kind];
  return (
    <section id={theme.id} aria-label={`${profile.display_name}'s ${label.many.toLowerCase()}`} style={{ background: theme.bg, color: theme.ink, padding: `clamp(72px,10vw,124px) ${pagePadding}` }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ color: theme.accent, fontFamily: sans, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label.many} · {published.length}</div>
        <h2 style={{ fontFamily: serif, fontWeight: 300, fontSize: 'clamp(40px,6vw,72px)', lineHeight: 1, margin: '14px 0 12px' }}>{theme.heading}</h2>
        <p style={{ color: theme.muted, fontFamily: sans, fontSize: 15, lineHeight: 1.6, maxWidth: 620, margin: '0 0 28px' }}>{theme.intro}</p>
        {categories.length > 1 && (
          <div role="group" aria-label={`Filter ${label.many.toLowerCase()} by type`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
            {['all', ...categories].map((category) => (
              <button key={category} type="button" aria-pressed={filter === category} onClick={() => setFilter(category)} style={{ minHeight: 36, padding: '0 14px', border: `1px solid ${filter === category ? theme.ink : theme.line}`, background: filter === category ? theme.ink : 'transparent', color: filter === category ? theme.bg : theme.ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>{category === 'all' ? 'All' : category}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gap: 44 }}>
          {shown.map((group) => (
            <div key={group.category || 'other'}>
              {categories.length > 1 && group.category && <h3 style={{ fontFamily: sans, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: theme.accent, margin: '0 0 14px' }}>{group.category}</h3>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,290px),1fr))', gap: 16 }}>
                {group.offers.map((offer) => {
                  const meta = parseOfferMeta(offer.description);
                  const href = bookingHref(profile, offer);
                  const price = offer.access_model === 'free' || !offer.price_cents ? 'Free' : money(offer.price_cents, offer.currency || 'AUD'); // follows the page's currency and language picker
                  return (
                    <article key={offer.id} data-offer-card={offer.kind} style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 230, padding: 20, border: `1px solid ${theme.line}`, background: theme.card }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: sans, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: theme.accent }}>
                        <span>{meta.category || label.one}</span>
                        {meta.minutes ? <span data-offer-minutes style={{ color: theme.muted }}>{formatMinutes(meta.minutes)}</span> : null}
                      </div>
                      <h4 style={{ fontFamily: serif, fontWeight: 300, fontSize: 25, lineHeight: 1.12, margin: 0 }}>{offer.title}</h4>
                      {meta.text && <p style={{ margin: 0, color: theme.muted, fontFamily: sans, fontSize: 13.5, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{meta.text}</p>}
                      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
                        <strong data-offer-price style={{ fontFamily: sans, fontSize: 20, fontWeight: 600 }}>{price}</strong>
                        {href && <a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} aria-label={`${label.verb} ${offer.title}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 16px', border: `1px solid ${theme.ink}`, color: theme.bg, background: theme.ink, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none' }}>{label.verb}</a>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
