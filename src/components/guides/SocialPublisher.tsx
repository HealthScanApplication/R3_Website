import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { CalendarClock, Check, ExternalLink, Facebook, Instagram, Loader2, Youtube } from 'lucide-react';
import {
  beginGuideSocialOAuth, completeGuideSocialOAuth, createGuideSocialPost, listGuideBrands, listGuideSocialConnections, listGuideSocialPosts,
  type GuideBrand, type GuideProfile, type GuideSocialConnection, type GuideSocialPost, type SocialPlatform,
} from '../../utils/guidePortal';

const TikTokMark = ({ size = 18 }: { size?: number }) => <span aria-hidden="true" style={{ fontSize: size, fontWeight: 800, lineHeight: 1 }}>♪</span>;
const platforms: { id: SocialPlatform; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
  { id: 'tiktok', label: 'TikTok', Icon: TikTokMark },
  { id: 'youtube', label: 'YouTube', Icon: Youtube },
];
const ink = '#F5F2EA', muted = '#B8B6AF', line = 'rgba(245,242,234,.24)', acid = '#C7D8A3', panel = '#11120F';
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 42, border: `1px solid ${line}`, background: '#090A08', color: ink, padding: '10px 12px', font: '13px "EuclidCircularA", sans-serif' };
const label: React.CSSProperties = { display: 'block', color: muted, fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 };

export function SocialPublisher({ profile }: { profile: GuideProfile }) {
  const [brands, setBrands] = useState<GuideBrand[]>([]);
  const [connections, setConnections] = useState<GuideSocialConnection[]>([]);
  const [posts, setPosts] = useState<GuideSocialPost[]>([]);
  const [brandId, setBrandId] = useState('');
  const [selected, setSelected] = useState<SocialPlatform[]>(['instagram']);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'still' | 'video'>('still');
  const [scheduledAt, setScheduledAt] = useState(() => { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); return d.toISOString().slice(0, 16); });
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const reload = async () => {
    const [b, c, p] = await Promise.all([listGuideBrands(profile.user_id), listGuideSocialConnections(profile.user_id).catch(() => []), listGuideSocialPosts(profile.user_id).catch(() => [])]);
    setBrands(b); setConnections(c); setPosts(p); setBrandId((current) => current || b.find((x) => x.is_primary)?.id || b[0]?.id || '');
  };
  useEffect(() => { reload().catch((error) => setMessage(error.message)); }, [profile.user_id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Returning from a platform: finish the connection as this signed-in user, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('social');
    if (!result) return;
    const state = params.get('social_state'), code = params.get('social_code'), failure = params.get('social_error');
    ['social', 'platform', 'social_state', 'social_code', 'social_error'].forEach((k) => params.delete(k));
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
    if (result === 'error') { setMessage(failure || 'The platform did not allow the connection.'); return; }
    if (result === 'pending' && state && code) {
      setBusy('connect'); setMessage('Finishing connection…');
      completeGuideSocialOAuth(state, code)
        .then((done) => { setMessage(`${done.account_label || 'Account'} connected.`); return reload(); })
        .catch((error) => setMessage(error instanceof Error ? error.message : 'Could not finish connecting the account.'))
        .finally(() => setBusy(''));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const connection = useMemo(() => new Map(connections.filter((x) => !brandId || x.brand_id === brandId).map((x) => [x.platform, x])), [connections, brandId]);
  const connect = async (platform: SocialPlatform) => {
    setBusy(platform); setMessage('');
    try { window.location.assign(await beginGuideSocialOAuth(platform, brandId || null)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not start account connection.'); }
    finally { setBusy(''); }
  };
  const schedule = async () => {
    if (!mediaUrl.trim() || !selected.length || !scheduledAt) { setMessage('Add media, at least one channel, and a publish time.'); return; }
    setBusy('schedule'); setMessage('');
    try {
      const saved = await createGuideSocialPost(profile.user_id, { brand_id: brandId || null, title: title.trim(), caption: caption.trim(), media_url: mediaUrl.trim(), media_type: mediaType, platforms: selected, scheduled_at: new Date(scheduledAt).toISOString(), timezone });
      setPosts((current) => [...current, saved].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)));
      setTitle(''); setCaption(''); setMediaUrl(''); setMessage('Post added to the publishing queue.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not schedule the post.'); }
    finally { setBusy(''); }
  };
  return <section style={{ marginTop: 28, border: `1px solid ${line}`, background: panel, color: ink, padding: 22 }}>
    <span style={{ ...label, color: acid }}>Publish & schedule</span>
    <h2 style={{ margin: '6px 0', font: '400 34px "CanelaText", Georgia, serif' }}>Your social publishing desk.</h2>
    <p style={{ margin: '0 0 20px', color: muted, fontSize: 12, lineHeight: 1.6 }}>Connect with each platform’s official sign-in. ROUTINE³ never asks for or stores your social password. Access tokens remain server-side and can be revoked.</p>
    <label><span style={label}>Publishing brand</span><select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={field}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 9, margin: '14px 0 24px' }}>{platforms.map(({ id, label: name, Icon }) => { const linked = connection.get(id)?.status === 'connected'; return <button key={id} type="button" onClick={() => connect(id)} disabled={busy === id} style={{ minHeight: 54, border: `1px solid ${linked ? acid : line}`, background: linked ? 'rgba(199,216,163,.1)' : '#090A08', color: ink, padding: '0 13px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}><Icon size={18} /><span style={{ textAlign: 'left', flex: 1 }}><strong style={{ display: 'block', fontSize: 12 }}>{name}</strong><small style={{ color: linked ? acid : muted }}>{linked ? connection.get(id)?.account_handle || 'Connected' : 'Connect with OAuth'}</small></span>{busy === id ? <Loader2 size={15} className="guardian-image-loader" /> : linked ? <Check size={15} /> : <ExternalLink size={14} />}</button>; })}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,.7fr)', gap: 20 }}>
      <div style={{ display: 'grid', gap: 11 }}>
        <label><span style={label}>Post title · internal</span><input value={title} onChange={(e) => setTitle(e.target.value)} style={field} /></label>
        <label><span style={label}>Caption</span><textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} style={{ ...field, resize: 'vertical' }} /></label>
        <label><span style={label}>Generated or uploaded media URL</span><input type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…/image.jpg or video.mp4" style={field} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label><span style={label}>Media</span><select value={mediaType} onChange={(e) => setMediaType(e.target.value as 'still' | 'video')} style={field}><option value="still">Still image</option><option value="video">Video</option></select></label><label><span style={label}>Publish at · {timezone}</span><input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={field} /></label></div>
        <div><span style={label}>Channels</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{platforms.map(({ id, label: name }) => <button key={id} type="button" aria-pressed={selected.includes(id)} onClick={() => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id])} style={{ border: `1px solid ${selected.includes(id) ? acid : line}`, background: selected.includes(id) ? 'rgba(199,216,163,.1)' : 'transparent', color: selected.includes(id) ? acid : ink, padding: '8px 11px', cursor: 'pointer' }}>{name}</button>)}</div></div>
        <button type="button" onClick={schedule} disabled={busy === 'schedule'} style={{ minHeight: 46, border: 0, background: ink, color: '#090A08', fontWeight: 800, cursor: 'pointer' }}>{busy === 'schedule' ? 'Scheduling…' : 'Schedule post →'}</button>
        {message && <p role="status" style={{ margin: 0, color: message.includes('queue') ? acid : '#E8B86A', fontSize: 11 }}>{message}</p>}
      </div>
      <div><span style={label}>Queue · {posts.length}</span><div style={{ display: 'grid', gap: 8 }}>{posts.length ? posts.map((post) => <article key={post.id} style={{ border: `1px solid ${line}`, padding: 12, background: '#090A08' }}><span style={{ display: 'flex', gap: 8, alignItems: 'center', color: acid, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}><CalendarClock size={13} />{new Date(post.scheduled_at).toLocaleString()}</span><strong style={{ display: 'block', marginTop: 8, fontSize: 12 }}>{post.title || post.caption.slice(0, 52) || 'Untitled post'}</strong><small style={{ color: muted }}>{post.platforms.join(' · ')} · {post.status}</small></article>) : <p style={{ color: muted, fontSize: 11 }}>No posts scheduled yet.</p>}</div></div>
    </div>
  </section>;
}
