import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { DISPLAY, GRO, ed } from '../../config/editorialTheme';
import { getGuardianStripeConfiguration } from '../../utils/guardianStripe';
import { confirmPreorder, createPreorderIntent } from '../../utils/hardwarePreorder';
import { mountPayment as defaultMountPayment } from '../../utils/hardwareStripe';
import type { MountPayment, PaymentHandle } from '../../utils/hardwareStripe';
import { BackerBar } from './BackerBar';
import { PRODUCTS, SHIP_WINDOW, formatUsd } from './copy';
import type { ProductKey } from './copy';

type Step = 'details' | 'payment' | 'success' | 'processing';
type Props = { mountPayment?: MountPayment; stripeConfig?: { enabled: boolean; error: string | null } };

const ACCENT = '#C7D99F';
const ERROR = '#F3A89A';
const MSG_START = 'Could not start checkout. Please try again.';
const MSG_NETWORK = 'Network problem — check your connection and try again.';
const MSG_PROCESSING = "Your payment is processing. We'll email you as soon as it's confirmed.";
const MSG_UNCONFIRMED = "We couldn't confirm your payment yet. Please don't pay again — we'll email you as soon as it's confirmed.";

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  minHeight: 60, border: 0, borderRadius: 0, background: ACCENT, color: ed.dark, padding: '0 26px',
  fontFamily: GRO, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .55 : 1,
});
const ghostButton: React.CSSProperties = {
  minHeight: 48, border: `1px solid ${ed.onDarkHair}`, borderRadius: 0, background: 'transparent', color: ed.onDark,
  padding: '0 18px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer',
};

export function PreorderBlock({ mountPayment = defaultMountPayment, stripeConfig }: Props) {
  const config = stripeConfig ?? getGuardianStripeConfiguration();
  const [product, setProduct] = useState<ProductKey>('ring');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('details');
  const [intent, setIntent] = useState<{ purchaseId: string; clientSecret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PaymentHandle | null>(null);
  const busyRef = useRef(false);
  const mountRef = useRef(mountPayment);
  mountRef.current = mountPayment;

  const selected = PRODUCTS[product];
  const price = formatUsd(selected.priceCents);

  // Mount the Payment Element while on step 2. Cleanup destroys it (leaving step 2 or unmounting);
  // a handle that resolves after cleanup is destroyed instead of leaked.
  useEffect(() => {
    if (step !== 'payment' || !intent || !containerRef.current) return;
    let cancelled = false;
    mountRef.current(containerRef.current, intent.clientSecret).then(
      (handle) => {
        if (cancelled) { handle.destroy(); return; }
        handleRef.current = handle;
      },
      (err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : MSG_START);
        setIntent(null);
        setStep('details');
      },
    );
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [step, intent]);

  const begin = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || busyRef.current || !config.enabled) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
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
    setIntent(null);
    setError('');
    setStep('details');
  };

  const eyebrow: React.CSSProperties = { margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACCENT };
  const detailsDisabled = busy || !config.enabled;

  return (
    <div style={{ display: 'grid', gap: 20, color: ed.onDark }}>
      <BackerBar refreshKey={refreshKey} />

      {step !== 'success' && step !== 'processing' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(PRODUCTS) as ProductKey[]).map((key) => {
            const p = PRODUCTS[key];
            const on = key === product;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={step === 'payment' || busy}
                onClick={() => setProduct(key)}
                style={{ ...ghostButton, border: `1px solid ${on ? ed.onDark : ed.onDarkHair}`, background: on ? ed.onDark : 'transparent', color: on ? ed.dark : ed.onDark }}
              >
                {p.name} {formatUsd(p.priceCents)} <s style={{ opacity: .6, fontWeight: 400 }}>{formatUsd(p.regPriceCents)}</s>
              </button>
            );
          })}
        </div>
      )}

      {step === 'details' && (
        <form onSubmit={begin} aria-label="Hardware preorder" style={{ display: 'grid', gap: 14 }}>
          <label htmlFor="preorder-email" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Email address</label>
          <input
            id="preorder-email" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address"
            style={{ minHeight: 60, minWidth: 0, border: `1px solid ${ed.onDarkHair}`, borderRadius: 0, background: 'rgba(255,255,255,.04)', color: ed.onDark, padding: '0 20px', fontFamily: GRO, fontSize: 15, outlineOffset: 3 }}
          />
          {!config.enabled && <p role="status" style={{ margin: 0, fontFamily: GRO, fontSize: 13, color: ed.onDarkSoft }}>{config.error || 'Preorders open soon.'}</p>}
          <button type="submit" disabled={detailsDisabled} style={primaryButton(detailsDisabled)}>
            {busy ? 'Starting…' : 'Continue to payment'}
          </button>
        </form>
      )}

      {step === 'payment' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ ...eyebrow, margin: 0 }}>{selected.name} · {price}</p>
          <div ref={containerRef} style={{ minHeight: 120 }} />
          <button type="button" onClick={pay} disabled={busy} style={primaryButton(busy)}>
            {busy ? 'Processing…' : `Pay ${price}`}
          </button>
          <button type="button" onClick={changeDetails} disabled={busy} style={ghostButton}>Change details</button>
        </div>
      )}

      {step === 'success' && (
        <p role="status" style={{ margin: 0, fontFamily: DISPLAY, fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', lineHeight: 1.1, color: ACCENT }}>
          You're in — {selected.name} reserved.
        </p>
      )}
      {step === 'processing' && (
        <p role="status" style={{ margin: 0, fontFamily: GRO, fontSize: 15, lineHeight: 1.5, color: ed.onDark }}>{error || MSG_PROCESSING}</p>
      )}

      {error && step !== 'processing' && <p role="alert" style={{ margin: 0, fontFamily: GRO, fontSize: 13, color: ERROR }}>{error}</p>}

      <p style={{ margin: 0, fontFamily: GRO, fontSize: 13, lineHeight: 1.55, color: ed.onDarkSoft }}>
        Full payment today. {SHIP_WINDOW}. If we don't reach the first-batch goal by the deadline, you're refunded in full.
      </p>
    </div>
  );
}
