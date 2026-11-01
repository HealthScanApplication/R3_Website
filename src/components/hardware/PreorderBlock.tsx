import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { oura } from '../../config/ouraTheme';
import { getGuardianStripeConfiguration } from '../../utils/guardianStripe';
import { captureWaitlistEmail, confirmPreorder, createPreorderIntent } from '../../utils/hardwarePreorder';
import { mountPayment as defaultMountPayment } from '../../utils/hardwareStripe';
import type { MountPayment, PaymentHandle } from '../../utils/hardwareStripe';
import { BackerBar } from './BackerBar';
import type { MiniShots } from './scene/miniScene';
import { PREORDER_TERMS, PRODUCTS, formatUsd } from './copy';
import type { ProductKey } from './copy';

type Step = 'details' | 'payment' | 'success' | 'processing';
type Props = { mountPayment?: MountPayment; stripeConfig?: { enabled: boolean; error: string | null }; variant?: 'section' | 'hero' };

const ACCENT = '#C7D99F';
const ERROR = '#F3A89A';
const HERO_ERROR = '#9a3412';
const MSG_START = 'Could not start checkout. Please try again.';
const MSG_NETWORK = 'Network problem — check your connection and try again.';
const MSG_PROCESSING = "Your payment is processing. Please don't pay again — check your card statement for the result.";
const MSG_UNCONFIRMED = "We couldn't confirm your payment yet. Please don't pay again — check your card statement before trying again.";
const MSG_CLOSED = 'The first batch is closed.';
const HERO_FONT = '"Archivo", "Inter", sans-serif';
// Same visual treatment as the homepage editorial waitlist row (UniversalWaitlist variant="editorial").
// Type matches the header's Dashboard / Sign out cells (Header.tsx lockupCell): same face, size, tracking and colour.
const heroLabel: React.CSSProperties = {
  fontFamily: HERO_FONT, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: oura.body,
};
const heroInput: React.CSSProperties = {
  fontFamily: HERO_FONT, fontSize: 11, fontWeight: 600, letterSpacing: 'normal', color: oura.body,
  flex: 1, minWidth: 150, maxWidth: 260, height: 42, boxSizing: 'border-box', background: 'rgba(255,255,255,0.16)',
  border: '1px solid #FFFFFF', borderRight: 'none', borderRadius: '2px 0 0 2px', padding: '0 14px', outline: 'none',
};
// Placeholder mirrors the button label type exactly (uppercase, tracked); the typed value stays as-typed.
const HERO_PLACEHOLDER_CSS = `.r3-hw-preorder-email::placeholder { color: ${oura.body}; opacity: 1; font-family: ${HERO_FONT}; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }`;
const heroButton = (disabled: boolean): React.CSSProperties => ({
  ...heroLabel, background: '#FFFFFF', border: '1px solid #FFFFFF', borderRadius: '0 2px 2px 0', height: 42, boxSizing: 'border-box',
  padding: '0 16px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  whiteSpace: 'nowrap', cursor: disabled ? 'default' : 'pointer',
});
const heroCaption: React.CSSProperties = { margin: 0, fontFamily: HERO_FONT, fontSize: 11, lineHeight: 1.5, color: ed.ink };
// All hero small print sits centred along the bottom of the hero (the hero's content box is its positioning parent).
const heroFinePrint: React.CSSProperties = {
  position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'clamp(14px, 3vh, 28px)',
  width: 'min(720px, calc(100% - 40px))', display: 'grid', gap: 6, textAlign: 'center',
};
// The three snapshots are drawn once per page load (one short-lived WebGL context) and shared by every block.
let miniShotsPromise: Promise<MiniShots | null> | null = null;
function loadMiniShots(): Promise<MiniShots | null> {
  miniShotsPromise ??= (async () => {
    try {
      if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null; // tests: no WebGL, no console noise
      const c = document.createElement('canvas');
      if (!(c.getContext('webgl2') || c.getContext('webgl'))) return null;
      const m = await import('./scene/miniScene');
      return await m.renderMiniShots('/models/r3-ring.stl', '/models/r3-clip-watch.bin');
    } catch { return null; }
  })();
  return miniShotsPromise;
}
function useMiniShots(enabled: boolean): MiniShots | null {
  const [shots, setShots] = useState<MiniShots | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadMiniShots().then((v) => { if (!cancelled) setShots(v); });
    return () => { cancelled = true; };
  }, [enabled]);
  return shots;
}
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  minHeight: 60, border: 0, borderRadius: 0, background: ACCENT, color: ed.dark, padding: '0 26px',
  fontFamily: GRO, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .55 : 1,
});
const ghostButton: React.CSSProperties = {
  minHeight: 48, border: `1px solid ${ed.onDarkHair}`, borderRadius: 0, background: 'transparent', color: ed.onDark,
  padding: '0 18px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer',
};

export function PreorderBlock({ mountPayment = defaultMountPayment, stripeConfig, variant = 'section' }: Props) {
  const hero = variant === 'hero';
  // Over the light hero video the small print needs more contrast than the section's soft tone.
  const soft = hero ? ed.ink : ed.onDarkSoft;
  const config = stripeConfig ?? getGuardianStripeConfiguration();
  const shots = useMiniShots(hero);
  const [product, setProduct] = useState<ProductKey>(hero ? 'bundle' : 'ring');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('details');
  const [intent, setIntent] = useState<{ purchaseId: string; clientSecret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [batch, setBatch] = useState<{ status: string; deadline: string } | null>(null);
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PaymentHandle | null>(null);
  const busyRef = useRef(false);
  const mountRef = useRef(mountPayment);
  mountRef.current = mountPayment;

  const selected = PRODUCTS[product];
  const price = formatUsd(selected.priceCents);
  const deadlineMs = batch ? new Date(batch.deadline).getTime() : NaN;
  const closed = !!batch && (batch.status !== 'open' || (!Number.isNaN(deadlineMs) && !(deadlineMs > Date.now())));
  const endsOn = batch && !closed && !Number.isNaN(deadlineMs) ? dateFormat.format(new Date(batch.deadline)) : '';

  // Mount the Payment Element while on step 2. Cleanup destroys it (leaving step 2 or unmounting);
  // a handle that resolves after cleanup is destroyed instead of leaked.
  useEffect(() => {
    if (step !== 'payment' || !intent || !containerRef.current) return;
    let cancelled = false;
    mountRef.current(containerRef.current, intent.clientSecret).then(
      (handle) => {
        if (cancelled) { handle.destroy(); return; }
        handleRef.current = handle;
        setReady(true);
      },
      (err) => {
        if (cancelled) return;
        setReady(false);
        setError(err instanceof Error ? err.message : MSG_START);
        setIntent(null);
        setStep('details');
      },
    );
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
      setReady(false);
    };
  }, [step, intent]);

  const begin = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || busyRef.current || !config.enabled || closed) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      // Same email capture as the Guardian / homepage sign-up, in parallel with starting checkout (never blocks it).
      try { void Promise.resolve(captureWaitlistEmail(trimmed)).catch(() => {}); } catch { /* optional */ }
      const res = await createPreorderIntent(product, trimmed, undefined);
      if (!res || typeof res.client_secret !== 'string' || typeof res.purchase_id !== 'string' || !res.client_secret || !res.purchase_id) {
        setError(MSG_START);
        return;
      }
      setIntent({ purchaseId: res.purchase_id, clientSecret: res.client_secret });
      setStep('payment');
    } catch (err) {
      setError(err instanceof TypeError ? MSG_NETWORK : err instanceof Error ? err.message : MSG_START);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const pay = async () => {
    const handle = handleRef.current;
    if (!handle || !intent || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    let charged = false;
    try {
      await handle.confirm(email.trim());
      charged = true;
      const { status } = await confirmPreorder(intent.purchaseId);
      if (status === 'paid') {
        setRefreshKey((k) => k + 1);
        setStep('success');
      } else if (status === 'pending') {
        setStep('processing');
      } else {
        setError('Payment did not complete.');
      }
    } catch (err) {
      if (charged) {
        // Stripe accepted the payment but the server check failed: never offer a retry (could double-charge).
        setError(MSG_UNCONFIRMED);
        setStep('processing');
      } else {
        setError(err instanceof Error ? err.message : 'Payment failed.');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const changeDetails = () => {
    handleRef.current?.destroy();
    handleRef.current = null;
    setReady(false);
    setIntent(null);
    setError('');
    setStep('details');
  };

  const eyebrow: React.CSSProperties = { margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACCENT };
  const detailsDisabled = busy || !config.enabled || closed;

  return (
    <div
      data-variant={variant}
      style={hero
        ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, color: ed.ink, maxWidth: 640 }
        : { display: 'grid', gap: 20, color: ed.onDark }}
    >
      {hero ? (
        <div hidden aria-hidden="true">
          <BackerBar refreshKey={refreshKey} onData={(d) => setBatch({ status: d.status, deadline: d.deadline })} />
        </div>
      ) : (
        <BackerBar refreshKey={refreshKey} onData={(d) => setBatch({ status: d.status, deadline: d.deadline })} />
      )}

      {step !== 'success' && step !== 'processing' && (
        <div style={hero ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginBottom: 14 } : { display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {((hero ? ['bundle', 'ring', 'clip'] : Object.keys(PRODUCTS)) as ProductKey[]).map((key) => {
            const p = PRODUCTS[key];
            const on = key === product;
            return (
              <React.Fragment key={key}>
              {/* The package comes first in the hero, set apart from the single devices by a divider. */}
              <button
                type="button"
                aria-pressed={on}
                aria-label={hero ? `${p.name} ${formatUsd(p.priceCents)}` : undefined}
                disabled={step === 'payment' || busy || (step === 'details' && closed)}
                onClick={() => setProduct(key)}
                style={hero ? {
                  background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: HERO_FONT, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flex: '0 0 auto',
                  letterSpacing: '0.12em', textTransform: 'uppercase', color: ed.ink,
                  fontWeight: on ? 700 : 500, opacity: on ? 1 : .7,
                } : { ...ghostButton, border: `1px solid ${on ? ed.onDark : ed.onDarkHair}`, background: on ? ed.onDark : 'transparent', color: on ? ed.dark : ed.onDark }}
              >
                {hero && shots && <img src={shots[key]} alt="" aria-hidden="true" width={28} height={28} style={{ display: 'block', width: 28, height: 28, flex: '0 0 auto', opacity: on ? 1 : .75 }} />}
                {hero ? (
                  <span style={{ display: 'grid', justifyItems: 'start', gap: 2 }}>
                    <span style={on ? { textDecoration: 'underline', textUnderlineOffset: 4 } : undefined}>{p.name.replace('R³ ', '')} {formatUsd(p.priceCents)}</span>
                    <s aria-hidden="true" style={{ opacity: .55, fontWeight: 400, fontSize: 10 }}>{formatUsd(p.regPriceCents)}</s>
                  </span>
                ) : <><span>{p.name} {formatUsd(p.priceCents)}</span> <s style={{ opacity: .6, fontWeight: 400 }}>{formatUsd(p.regPriceCents)}</s></>}
              </button>
              {hero && key === 'bundle' && <span aria-hidden="true" data-testid="preorder-divider" style={{ width: 1, alignSelf: 'stretch', minHeight: 28, background: 'rgba(22,20,15,0.32)', margin: '0 4px' }} />}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {step === 'details' && endsOn && !hero && (
        <p style={{ margin: 0, fontFamily: GRO, fontSize: 13, color: soft }}>Campaign ends {endsOn}.</p>
      )}

      {step === 'details' && (
        <form onSubmit={begin} aria-label="Hardware preorder" className={hero ? 'r3-compact r3-lockup' : undefined} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: hero ? 10 : 14 }}>
          <label htmlFor="preorder-email" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Email address</label>
          {hero ? (
            <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
              <style>{HERO_PLACEHOLDER_CSS}</style>
              <input
                id="preorder-email" className="r3-hw-preorder-email" type="email" required autoComplete="email" value={email}
                disabled={closed} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
                style={heroInput}
              />
              <button type="submit" disabled={detailsDisabled} style={heroButton(detailsDisabled)}>
                {busy ? 'Starting…' : 'Reserve'}
              </button>
            </div>
          ) : (
            <input
              id="preorder-email" type="email" required autoComplete="email" value={email}
              disabled={closed} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address"
              style={{ minHeight: 60, minWidth: 0, border: `1px solid ${ed.onDarkHair}`, borderRadius: 0, background: 'rgba(255,255,255,.04)', color: ed.onDark, padding: '0 20px', fontFamily: GRO, fontSize: 15, outlineOffset: 3 }}
            />
          )}
          {!hero && closed && <p role="status" style={{ margin: 0, fontFamily: GRO, fontSize: 13, color: soft }}>{MSG_CLOSED}</p>}
          {!hero && !config.enabled && <p role="status" style={{ margin: 0, fontFamily: GRO, fontSize: 13, color: soft }}>{config.error || 'Preorders open soon.'}</p>}
          {!hero && (
            <button type="submit" disabled={detailsDisabled} style={primaryButton(detailsDisabled)}>
              {busy ? 'Starting…' : 'Continue to payment'}
            </button>
          )}
        </form>
      )}

      {step === 'payment' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={hero ? heroCaption : { ...eyebrow, margin: 0 }}>{selected.name} · {price}</p>
          <div ref={containerRef} style={{ minHeight: hero ? 280 : 120 }} />
          <button type="button" onClick={pay} disabled={!ready || busy} style={hero ? { ...heroButton(!ready || busy), justifySelf: 'start' } : primaryButton(!ready || busy)}>
            {busy ? 'Processing…' : `Pay ${price}${hero ? ' →' : ''}`}
          </button>
          <button type="button" onClick={changeDetails} disabled={busy} style={hero ? { ...heroCaption, background: 'none', border: 0, padding: 0, justifySelf: 'start', textDecoration: 'underline', cursor: 'pointer' } : ghostButton}>Change details</button>
        </div>
      )}

      {step === 'success' && (
        <p role="status" style={{ margin: 0, fontFamily: DISPLAY, fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', lineHeight: 1.1, color: hero ? ed.ink : ACCENT }}>
          You're in — {selected.name} reserved.
        </p>
      )}
      {step === 'processing' && (
        <p role="status" style={{ margin: 0, fontFamily: GRO, fontSize: 15, lineHeight: 1.5, color: hero ? ed.ink : ed.onDark }}>{error || MSG_PROCESSING}</p>
      )}

      {error && step !== 'processing' && <p role="alert" style={{ margin: 0, fontFamily: GRO, fontSize: 13, color: hero ? HERO_ERROR : ERROR }}>{error}</p>}

      {hero ? (
        <div data-testid="preorder-fine-print" style={heroFinePrint}>
          {step === 'details' && endsOn && <p style={heroCaption}>Campaign ends {endsOn}.</p>}
          {step === 'details' && closed && <p role="status" style={heroCaption}>{MSG_CLOSED}</p>}
          {step === 'details' && !config.enabled && <p role="status" style={heroCaption}>{config.error || 'Preorders open soon.'}</p>}
          <p style={heroCaption}>{PREORDER_TERMS}</p>
        </div>
      ) : (
        <p style={{ margin: 0, fontFamily: GRO, fontSize: 13, lineHeight: 1.55, color: soft }}>
          {PREORDER_TERMS}
        </p>
      )}
    </div>
  );
}
