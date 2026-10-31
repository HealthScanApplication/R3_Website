/**
 * SocialAccountsPanel — one place to see and manage the Routine³ (R³) brand
 * social accounts (Instagram, TikTok, Facebook, X, YouTube).
 *
 * Accounts themselves are created by a person on each platform (signup needs
 * the owner's email/phone and bot checks); this panel tracks what exists, the
 * handle, the owner login email, and a setup checklist. Never store passwords
 * or tokens here — use the password manager. Backed by public.r3_social_accounts
 * (admin-only RLS via is_healthscan_admin()).
 */
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseClient } from '../../utils/supabase/client';

type Platform = 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube';
type Status = 'not_created' | 'created' | 'verified' | 'needs_attention';

interface SocialAccount {
  platform: Platform;
  handle: string;
  profile_url: string;
  status: Status;
  login_email: string;
  two_factor_enabled: boolean;
  bio_set: boolean;
  avatar_set: boolean;
  notes: string;
}

const PLATFORMS: { id: Platform; label: string; signup: string; url: (h: string) => string }[] = [
  { id: 'instagram', label: 'Instagram', signup: 'https://www.instagram.com/accounts/emailsignup/', url: (h) => `https://www.instagram.com/${h}/` },
  { id: 'tiktok', label: 'TikTok', signup: 'https://www.tiktok.com/signup', url: (h) => `https://www.tiktok.com/@${h}` },
  { id: 'facebook', label: 'Facebook Page', signup: 'https://www.facebook.com/pages/create', url: (h) => `https://www.facebook.com/${h}` },
  { id: 'x', label: 'X', signup: 'https://x.com/i/flow/signup', url: (h) => `https://x.com/${h}` },
  { id: 'youtube', label: 'YouTube', signup: 'https://www.youtube.com/create_channel', url: (h) => `https://www.youtube.com/@${h}` },
];

const STATUS_LABEL: Record<Status, string> = {
  not_created: 'Not created',
  created: 'Created',
  verified: 'Verified & live',
  needs_attention: 'Needs attention',
};

const inputCls = 'sb-input';
const btnCls = 'sb-btn';

export function SocialAccountsPanel(): React.ReactElement {
  const [rows, setRows] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getSupabaseClient().from('r3_social_accounts').select('*');
    if (err) setError(err.message);
    else {
      const order = PLATFORMS.map((p) => p.id);
      setRows(((data ?? []) as SocialAccount[]).sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = (platform: Platform, change: Partial<SocialAccount>) =>
    setRows((rs) => rs.map((r) => (r.platform === platform ? { ...r, ...change } : r)));

  const save = async (row: SocialAccount) => {
    setSavingId(row.platform);
    const { platform, ...fields } = row;
    const { error: err } = await getSupabaseClient()
      .from('r3_social_accounts')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('platform', platform);
    setSavingId(null);
    if (err) toast.error(`Save failed: ${err.message}`);
    else toast.success(`${PLATFORMS.find((p) => p.id === platform)?.label} saved`);
  };

  const live = rows.filter((r) => r.status === 'verified').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--sb-text)' }}>Routine³ social accounts</h2>
          <p className="text-xs" style={{ color: 'var(--sb-muted, #888)' }}>
            {live} of {PLATFORMS.length} live. Create each account with the Sign up button, then mark it here. Passwords belong in your password manager, not in this panel.
          </p>
        </div>
        <button type="button" className={btnCls} onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>

      {error && (
        <div className="rounded border p-3 text-sm" style={{ borderColor: 'var(--sb-border)' }}>
          Could not load accounts: {error}. If the table is missing, apply migration 20261031120000_r3_social_accounts.sql.
        </div>
      )}

      {rows.map((row) => {
        const meta = PLATFORMS.find((p) => p.id === row.platform)!;
        const url = row.profile_url || meta.url(row.handle);
        return (
          <div key={row.platform} className="rounded border p-3 space-y-2" style={{ borderColor: 'var(--sb-border)' }}>
            <div className="flex items-center justify-between">
              <strong style={{ color: 'var(--sb-text)' }}>{meta.label}</strong>
              <div className="flex gap-2">
                {row.status === 'not_created' && (
                  <a className={btnCls} href={meta.signup} target="_blank" rel="noopener noreferrer">
                    Sign up <ExternalLink size={12} />
                  </a>
                )}
                {row.status !== 'not_created' && (
                  <a className={btnCls} href={url} target="_blank" rel="noopener noreferrer">
                    Open profile <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <select className={inputCls} value={row.status} onChange={(e) => patch(row.platform, { status: e.target.value as Status })}>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <input className={inputCls} placeholder="handle" value={row.handle}
                onChange={(e) => patch(row.platform, { handle: e.target.value.replace(/^@/, ''), profile_url: meta.url(e.target.value.replace(/^@/, '')) })} />
              <input className={inputCls} placeholder="profile URL" value={row.profile_url}
                onChange={(e) => patch(row.platform, { profile_url: e.target.value })} />
              <input className={inputCls} placeholder="owner login email" value={row.login_email}
                onChange={(e) => patch(row.platform, { login_email: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--sb-text)' }}>
              {([['two_factor_enabled', '2FA on'], ['avatar_set', 'Logo set'], ['bio_set', 'Bio + link set']] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1">
                  <input type="checkbox" checked={row[key]} onChange={(e) => patch(row.platform, { [key]: e.target.checked })} /> {label}
                </label>
              ))}
              <input className={`${inputCls} flex-1`} placeholder="notes" value={row.notes}
                onChange={(e) => patch(row.platform, { notes: e.target.value })} />
              <button type="button" className={btnCls} onClick={() => void save(row)} disabled={savingId === row.platform}>
                {savingId === row.platform ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default SocialAccountsPanel;
