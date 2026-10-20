import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CircleSlash, Clapperboard, Package, Salad } from 'lucide-react';
import { ContentStudio, type PostBrand, type StudioOffer } from './ContentStudio';
import { VideoStudio } from './VideoStudio';
import type { AdminProtocol } from '../../utils/protocolAdmin';
import { listGuideBrands, type GuideBrand, type GuideOffer, type GuideProfile, type GuideRecipe } from '../../utils/guidePortal';
import { brandKitOf, ctaColours } from '../../utils/brandKit';
import { TargetPicker } from './TargetPicker';
import { defaultAudience, describeAudience, solutionScore, type Audience, type Focus } from '../../utils/audienceTaxonomy';
import { createRoutineShareLink, getRoutineShareLink, listOfferRoutines, postLinkTarget, routineMayBeLinked } from '../../utils/routineShare';

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
  // 01 audience → 02 problem or goal → 03 solution: each step narrows the next.
  const [audienceSel, setAudienceSel] = useState<Audience>(defaultAudience);
  const [focus, setFocus] = useState<Focus | null>(profile.specialties?.[0] ? { kind: 'goal', area: 'health', label: profile.specialties[0] } : null);
  const audience = describeAudience(audienceSel);
  const problem = focus?.label || 'Wellbeing';
  const all = source === 'offer' ? offers.map((o) => ({ id: o.id, name: o.title, text: `${o.title} ${o.description || ''}` }))
    : source === 'protocol' ? protocols.map((p) => ({ id: p.id, name: p.name, text: `${p.name} ${p.description || ''}` }))
    : source === 'recipe' ? recipes.map((r) => ({ id: r.id, name: r.title, text: `${r.title} ${r.description || ''}` })) : [];
  // Solutions that match the problem/goal (and audience) first; the best match is the default pick.
  const options = all.map((o) => ({ ...o, score: solutionScore(o.text, focus, audienceSel) })).sort((a, b) => b.score - a.score);
  const matching = options.filter((o) => o.score > 0);
  const picked = options.find((o) => o.id === pickedId) || options[0] || null;

  const studioOffers = useMemo<StudioOffer[]>(() => {
    if (source === 'offer') {
      const chosen = offers.find((o) => o.id === picked?.id);
      const rest = offers.filter((o) => o.id !== chosen?.id);
      return [chosen, ...rest].filter(Boolean).map((o) => ({ title: o!.title, free: o!.access_model !== 'paid', price: o!.access_model === 'paid' ? money(o!.price_cents, o!.currency) : undefined, description: o!.description || undefined }));
    }
    if (source === 'protocol') { const p = protocols.find((x) => x.id === picked?.id); return p ? [{ title: p.name, free: !!p.is_public, description: p.description || undefined, days: p.total_days }] : []; }
    if (source === 'recipe') { const r = recipes.find((x) => x.id === picked?.id); return r ? [{ title: r.title, free: true, description: r.description || undefined, ingredients: r.ingredients?.length || null, minutes: (r.prep_time || 0) + (r.cook_time || 0) || null }] : []; }
    return [{ title: `${problem} with ${profile.display_name}`, free: true }];
  }, [source, picked?.id, offers, protocols, recipes, problem, profile.display_name]);

  const pageUrl = `/guardians/${profile.slug}`;
  // The routine the posts are about: the picked Protocol, or the Protocol the picked offer delivers (Offers > Share routine link).
  const [offerRoutines, setOfferRoutines] = useState<Record<string, string>>({});
  useEffect(() => { listOfferRoutines(profile.user_id).then(setOfferRoutines).catch(() => setOfferRoutines({})); }, [profile.user_id, offers.length]);
  const pickedOffer = source === 'offer' ? offers.find((o) => o.id === picked?.id) : undefined;
  const routineId = source === 'protocol' ? picked?.id : pickedOffer ? offerRoutines[pickedOffer.id] : undefined;
  const routineName = protocols.find((p) => p.id === routineId)?.name;
  const mayLinkRoutine = routineMayBeLinked(pickedOffer);
  const [routineToken, setRoutineToken] = useState<string | null>(null);
  const [useRoutine, setUseRoutine] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');
  // A routine that already has a link uses it by default. Nothing is created until the Guardian asks for it.
  useEffect(() => {
    let live = true;
    setRoutineToken(null); setUseRoutine(false); setLinkError('');
    if (routineId && mayLinkRoutine) getRoutineShareLink(routineId).then((token) => { if (live) { setRoutineToken(token); setUseRoutine(!!token); } }).catch(() => undefined);
    return () => { live = false; };
  }, [routineId, mayLinkRoutine]);
  async function chooseRoutineLink() {
    if (!routineId) return;
    setLinkBusy(true); setLinkError('');
    try { const token = routineToken || await createRoutineShareLink(routineId); setRoutineToken(token); setUseRoutine(true); }
    catch (error: any) { setLinkError(error?.message || 'Could not create the routine link.'); }
    finally { setLinkBusy(false); }
  }
  const routineLinked = useRoutine && mayLinkRoutine && !!routineToken;
  const siteUrl = postLinkTarget({ guardianSlug: profile.slug, routineToken, useRoutine: routineLinked });
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
    return { name: b.name, font: kit.font, cta: ctaColours(kit).primary, logo: b.logo_url, kit };
  }, [brands, brandId]);
  // The same brand kit (and its brief: visual language, palette) steers the video prompt.
  const videoBrand = useMemo(() => {
    const b = brands.find((x) => x.id === brandId);
    return b ? { name: b.name, kit: brandKitOf(b.social_links) } : null;
  }, [brands, brandId]);

  return <div>
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 26 }}>
      <div style={{ width: 64, height: 64, border: `1px solid ${line}`, display: 'grid', placeItems: 'center' }}><Clapperboard size={26} color={acid} /></div>
      <div><div style={{ ...label, color: acid, margin: 0 }}>Build</div><h1 style={{ fontFamily: serif, fontSize: 52, fontWeight: 300, margin: '6px 0 4px' }}>Content builder</h1><p style={{ color: muted, margin: 0, fontSize: 13, maxWidth: 640, lineHeight: 1.5 }}>Create stories, posts, thumbnails and short videos about an offer, a Protocol, a recipe, or just your topic.</p></div>
    </div>
    <div style={{ border: `1px solid ${line}`, background: panel, padding: 16, marginBottom: 14, display: 'grid', gap: 14 }}>
      <TargetPicker audience={audienceSel} onAudience={setAudienceSel} focus={focus} onFocus={(f) => { setFocus(f); setPickedId(''); }} />
      <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }}>
        <div style={{ ...label, color: acid, marginBottom: 10 }}>03 · Solution</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
          {([['offer', `Offer (${offers.length})`, Package], ['protocol', `Protocol (${protocols.length})`, BookOpen], ['recipe', `Recipe (${recipes.length})`, Salad], ['none', 'Nothing specific', CircleSlash]] as const).map(([id, text, Icon]) => <button key={id} type="button" onClick={() => { setTouched(true); setSource(id); setPickedId(''); }} style={{ ...chip(source === id), display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon size={13} strokeWidth={1.8} aria-hidden="true" />{text}</button>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          {source !== 'none' && <label><span style={label}>{source === 'offer' ? 'Offer' : source === 'protocol' ? 'Protocol' : 'Recipe'}{focus && matching.length ? ` · ${matching.length} match ${focus.label.toLowerCase()}` : ''}</span>
            {options.length ? <select style={input} value={picked?.id || ''} onChange={(e) => setPickedId(e.target.value)}>
              {matching.length > 0 && <optgroup label={`Matches ${focus?.label || ''}`}>{matching.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>}
              {matching.length < options.length && <optgroup label={matching.length ? 'Other' : 'All'}>{options.filter((o) => o.score === 0).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>}
            </select>
              : <div style={{ color: muted, fontSize: 12, paddingTop: 10 }}>None yet. Create one first, or pick “Nothing specific”.</div>}
            {focus && options.length > 0 && !matching.length && <span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 5 }}>Nothing here mentions {focus.label.toLowerCase()} yet. Build one for it, or post about your topic.</span>}
          </label>}
          <label><span style={label}>Brand look</span><select aria-label="Brand look" style={input} value={brandId || ''} onChange={(e) => setBrandId(e.target.value || null)}>
            <option value="">ROUTINE³ template</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name} · {brandKitOf(b.social_links).font}</option>)}
          </select>{!brands.length && <span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 5 }}>Add a brand kit in the Site builder to use your font, colours and logo.</span>}</label>
        </div>
        {routineId && <div style={{ marginTop: 14 }}>
          <span style={label}>QR and link go to</span>
          <div role="group" aria-label="QR and link go to" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button type="button" aria-pressed={!routineLinked} onClick={() => setUseRoutine(false)} style={chip(!routineLinked)}>Your page</button>
            <button type="button" aria-pressed={routineLinked} disabled={!mayLinkRoutine || linkBusy} onClick={chooseRoutineLink} style={{ ...chip(routineLinked), opacity: mayLinkRoutine ? 1 : 0.5, cursor: mayLinkRoutine ? 'pointer' : 'not-allowed' }}>{linkBusy ? 'Creating link…' : routineToken ? 'Routine in the app' : 'Routine in the app · create link'}</button>
          </div>
          <span style={{ display: 'block', color: muted, fontSize: 10, marginTop: 5 }}>{mayLinkRoutine ? `Opens ${routineName ? `“${routineName}”` : 'the routine'} in R³ so the visitor can add it, even though it is not published.` : 'A paid offer keeps your page as the link, so the routine is not given away. Send the routine link from Offers to people who bought.'}</span>
          {linkError && <span role="alert" style={{ display: 'block', color: '#E8B86A', fontSize: 11, marginTop: 5 }}>{linkError}</span>}
        </div>}
      </div>
    </div>
    <ContentStudio key={`${source}-${picked?.id || ''}`} creator={profile.display_name} avatar={profile.avatar_url} audience={audience} problem={problem} siteUrl={siteUrl} pageUrl={pageUrl} offers={studioOffers} kind={source} heading={picked && source !== 'none' ? `Create posts about ${picked.name}` : 'Create posts about your topic'} brand={postBrand} />
    <VideoStudio creator={profile.display_name} avatar={profile.avatar_url} audience={audience} problem={problem} focusKind={focus?.kind} offer={source !== 'none' ? studioOffers[0]?.title : undefined} free={studioOffers[0]?.free} kind={source} copyOffer={source !== 'none' ? studioOffers[0] : null} siteUrl={siteUrl} pageUrl={pageUrl} brandName={videoBrand?.name} kit={videoBrand?.kit} brandId={brandId} postBrand={postBrand} />
  </div>;
}
