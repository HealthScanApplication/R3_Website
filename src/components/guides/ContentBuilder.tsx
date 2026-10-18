import { useEffect, useMemo, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { ContentStudio, type PostBrand, type StudioOffer } from './ContentStudio';
import type { AdminProtocol } from '../../utils/protocolAdmin';
import { listGuideBrands, type GuideBrand, type GuideOffer, type GuideProfile, type GuideRecipe } from '../../utils/guidePortal';
import { brandKitOf, ctaColours } from '../../utils/brandKit';

// Guardian dark tokens (same values as GuidePortal.tsx).
const ink = '#F5F2EA';
const muted = '#B8B6AF';
const line = 'rgba(245,242,234,0.24)';
const panel = '#11120F';
const acid = '#C7D8A3';
const serif = '"CanelaText", "Canela Text", Georgia, serif';
const sans = '"EuclidCircularA", "DM Sans", "Helvetica Neue", Arial, sans-serif';
const input: React.CSSProperties = { width: '100%', height: 40, boxSizing: 'border-box', border: `1px solid ${line}`, background: '#0D0E0C', color: ink, borderRadius: 2, padding: '0 11px', fontFamily: sans, fontSize: 13, outline: 'none' };
const label: React.CSSProperties = { display: 'block', color: muted, fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7, lineHeight: 1.35 };
const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? acid : line}`, background: on ? 'rgba(199,216,163,.14)' : 'transparent', color: on ? acid : ink, borderRadius: 999, padding: '7px 12px', fontFamily: sans, fontSize: 11, fontWeight: 700, cursor: 'pointer' });

type Source = 'none' | 'offer' | 'protocol' | 'recipe';

const money = (cents: number, currency: string) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(cents / 100); } catch { return `${Math.round(cents / 100)} ${currency}`; } };

/**
 * Standalone Content builder: the same R³ social templates as the Offers step, but the Guardian
 * picks what the posts are about — an offer, a Protocol, a recipe, or nothing in particular.
 */
export function ContentBuilder({ profile, offers, protocols, recipes }: { profile: GuideProfile; offers: GuideOffer[]; protocols: AdminProtocol[]; recipes: GuideRecipe[] }) {
  const [source, setSource] = useState<Source>(offers.length ? 'offer' : 'none');
  const [pickedId, setPickedId] = useState('');
  const [touched, setTouched] = useState(false);
  // Offers load after the page opens: default to the first offer unless the Guardian already chose.
  useEffect(() => { if (!touched && offers.length && source === 'none') setSource('offer'); }, [offers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [audience, setAudience] = useState('Everyone');
  const [problem, setProblem] = useState(profile.specialties?.[0] || 'Wellbeing');
  const options = source === 'offer' ? offers.map((o) => ({ id: o.id, name: o.title }))
    : source === 'protocol' ? protocols.map((p) => ({ id: p.id, name: p.name }))
    : source === 'recipe' ? recipes.map((r) => ({ id: r.id, name: r.title })) : [];
  const picked = options.find((o) => o.id === pickedId) || options[0] || null;

  const studioOffers = useMemo<StudioOffer[]>(() => {
    if (source === 'offer') {
      const chosen = offers.find((o) => o.id === picked?.id);
      const rest = offers.filter((o) => o.id !== chosen?.id);
      return [chosen, ...rest].filter(Boolean).map((o) => ({ title: o!.title, free: o!.access_model !== 'paid', price: o!.access_model === 'paid' ? money(o!.price_cents, o!.currency) : undefined, description: o!.description || undefined }));
    }
    if (source === 'protocol') { const p = protocols.find((x) => x.id === picked?.id); return p ? [{ title: p.name, free: !!p.is_public, description: p.description || undefined }] : []; }
    if (source === 'recipe') { const r = recipes.find((x) => x.id === picked?.id); return r ? [{ title: r.title, free: true, description: r.description || undefined }] : []; }
    return [{ title: `${problem} with ${profile.display_name}`, free: true }];
  }, [source, picked?.id, offers, protocols, recipes, problem, profile.display_name]);

  const siteUrl = `/guardians/${profile.slug}`;
  // Brand look: the R³ template, or any saved brand that has a brand kit (defaults to the primary brand's kit).
  const [brands, setBrands] = useState<GuideBrand[]>([]);
  const [brandId, setBrandId] = useState<string | null>(null);
  useEffect(() => {
    listGuideBrands(profile.user_id).then((list) => {
      const kitted = list.filter((b) => b.social_links?.brand_font);
      setBrands(kitted);
      const primary = kitted.find((b) => b.is_primary) || kitted.find((b) => b.kind === 'personal');
      if (primary?.id) setBrandId((current) => current ?? primary.id!);
    }).catch(() => setBrands([]));
  }, [profile.user_id]);
  const postBrand = useMemo<PostBrand | null>(() => {
    const b = brands.find((x) => x.id === brandId);
    if (!b) return null;
    const kit = brandKitOf(b.social_links);
    return { name: b.name, font: kit.font, cta: ctaColours(kit).primary, logo: b.logo_url };
  }, [brands, brandId]);

  return <div>
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 26 }}>
      <div style={{ width: 64, height: 64, border: `1px solid ${line}`, display: 'grid', placeItems: 'center' }}><Clapperboard size={26} color={acid} /></div>
      <div><div style={{ ...label, color: acid, margin: 0 }}>Build</div><h1 style={{ fontFamily: serif, fontSize: 52, fontWeight: 300, margin: '6px 0 4px' }}>Content builder</h1><p style={{ color: muted, margin: 0, fontSize: 13, maxWidth: 640, lineHeight: 1.5 }}>Create stories, posts and thumbnails in the R³ template, about an offer, a Protocol, a recipe, or just your topic.</p></div>
    </div>
    <div style={{ border: `1px solid ${line}`, background: panel, padding: 16, marginBottom: 14, display: 'grid', gap: 14 }}>
      <div><span style={label}>Post about</span><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {([['offer', `Offer (${offers.length})`], ['protocol', `Protocol (${protocols.length})`], ['recipe', `Recipe (${recipes.length})`], ['none', 'Nothing specific']] as const).map(([id, text]) => <button key={id} type="button" onClick={() => { setTouched(true); setSource(id); setPickedId(''); }} style={chip(source === id)}>{text}</button>)}
      </div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        {source !== 'none' && <label><span style={label}>{source === 'offer' ? 'Offer' : source === 'protocol' ? 'Protocol' : 'Recipe'}</span>
          {options.length ? <select style={input} value={picked?.id || ''} onChange={(e) => setPickedId(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            : <div style={{ color: muted, fontSize: 12, paddingTop: 10 }}>None yet. Create one first, or pick “Nothing specific”.</div>}
        </label>}
        <label><span style={label}>Audience</span><input style={input} value={audience} onChange={(e) => setAudience(e.target.value)} /></label>
        <label><span style={label}>Problem or goal</span><input style={input} value={problem} onChange={(e) => setProblem(e.target.value)} /></label>
        <label><span style={label}>Brand look</span><select aria-label="Brand look" style={input} value={brandId || ''} onChange={(e) => setBrandId(e.target.value || null)}>
          <option value="">ROUTINE³ template</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name} · {brandKitOf(b.social_links).font}</option>)}
        </select>{!brands.length && <span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 5 }}>Add a brand kit in the Site builder to use your font, colours and logo.</span>}</label>
      </div>
    </div>
    <ContentStudio key={`${source}-${picked?.id || ''}`} creator={profile.display_name} audience={audience} problem={problem} siteUrl={siteUrl} offers={studioOffers} heading={picked && source !== 'none' ? `Create posts about ${picked.name}` : 'Create posts about your topic'} brand={postBrand} />
  </div>;
}
