import React, { FormEvent, useState } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { DISPLAY, GRO, ed } from '../config/editorialTheme';
import { RingArt as NoteRingArt, ClipArt as HeartCameraArt } from './hardware/DeviceArt';

type HardwareChoice = 'note' | 'heart' | 'both';

const choiceLabel: Record<HardwareChoice, string> = {
  note: 'R³ Note',
  heart: 'R³ Heart',
  both: 'Both devices',
};

function ChoiceButton({ choice, selected, onClick }: { choice: HardwareChoice; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        minHeight: 48,
        border: `1px solid ${selected ? ed.onDark : ed.onDarkHair}`,
        background: selected ? ed.onDark : 'transparent',
        color: selected ? ed.dark : ed.onDark,
        padding: '0 18px',
        fontFamily: GRO,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {choiceLabel[choice]}
    </button>
  );
}

export function HardwarePreorder() {
  const [choice, setChoice] = useState<HardwareChoice>('both');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-ed0fe4c2/email-waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          name: email.trim().split('@')[0],
          source: 'hardware-preorder',
          hardwareInterest: choice,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) throw new Error(data?.error || 'Could not join the preorder list.');
      setStatus('success');
      setMessage(`You’re on the early-access list for ${choiceLabel[choice]}.`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not join the preorder list. Please try again.');
    }
  };

  return (
    <section id="hardware-preorder" aria-labelledby="hardware-preorder-title" style={{ background: ed.dark, color: ed.onDark, borderTop: `1px solid ${ed.onDarkHair}` }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: 'clamp(88px, 10vw, 156px) clamp(20px, 5vw, 72px)' }}>
        <header style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, .55fr)', gap: 'clamp(32px, 7vw, 112px)', alignItems: 'end', marginBottom: 'clamp(48px, 7vw, 92px)' }} className="r3-hardware-header">
          <div>
            <p style={{ margin: '0 0 18px', fontFamily: GRO, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C7D99F' }}>R³ hardware · early access</p>
            <h2 id="hardware-preorder-title" style={{ margin: 0, maxWidth: 920, fontFamily: DISPLAY, fontSize: 'clamp(3.5rem, 7.4vw, 8.2rem)', fontWeight: 380, lineHeight: .9, letterSpacing: '-0.045em' }}>
              Capture the moment. Not your life.
            </h2>
          </div>
          <p style={{ margin: 0, fontFamily: GRO, fontSize: 'clamp(16px, 1.4vw, 21px)', lineHeight: 1.55, color: ed.onDarkSoft }}>
            Two private, user-triggered companions for remembering what matters. Nothing records until you deliberately press the control.
          </p>
        </header>

        <div className="r3-hardware-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', borderTop: `1px solid ${ed.onDarkHair}`, borderBottom: `1px solid ${ed.onDarkHair}` }}>
          <article style={{ padding: 'clamp(28px, 4vw, 54px) clamp(0px, 3vw, 48px) clamp(42px, 5vw, 68px) 0', borderRight: `1px solid ${ed.onDarkHair}` }}>
            <div style={{ overflow: 'hidden', aspectRatio: '1.23 / 1', marginBottom: 30 }}><NoteRingArt /></div>
            <p style={{ margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C7D99F' }}>01 · Voice capture ring</p>
            <h3 style={{ margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(2.5rem, 4vw, 4.7rem)', fontWeight: 400, lineHeight: .95 }}>R³ Note</h3>
            <p style={{ margin: '0 0 24px', maxWidth: 620, fontFamily: GRO, fontSize: 17, lineHeight: 1.55, color: ed.onDarkSoft }}>Press the ring to record a short audio note, then let ROUTINE³ turn it into a private, organized memory or action.</p>
            <p style={{ margin: 0, fontFamily: GRO, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Press to record · release to stop · no ambient listening</p>
          </article>

          <article style={{ padding: 'clamp(28px, 4vw, 54px) 0 clamp(42px, 5vw, 68px) clamp(0px, 3vw, 48px)' }}>
            <div style={{ overflow: 'hidden', aspectRatio: '1.23 / 1', marginBottom: 30 }}><HeartCameraArt /></div>
            <p style={{ margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C7D99F' }}>02 · Camera wearable</p>
            <h3 style={{ margin: '0 0 14px', fontFamily: DISPLAY, fontSize: 'clamp(2.5rem, 4vw, 4.7rem)', fontWeight: 400, lineHeight: .95 }}>R³ Heart</h3>
            <p style={{ margin: '0 0 24px', maxWidth: 620, fontFamily: GRO, fontSize: 17, lineHeight: 1.55, color: ed.onDarkSoft }}>Wear it as a watch, pendant or clip. Press once to capture a meal or activity for your routine—without continuous video or life-logging.</p>
            <p style={{ margin: 0, fontFamily: GRO, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Visible capture light · deliberate clips · camera off by default</p>
          </article>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .8fr) minmax(320px, 1.2fr)', gap: 'clamp(28px, 7vw, 110px)', alignItems: 'end', paddingTop: 'clamp(40px, 6vw, 72px)' }} className="r3-preorder-row">
          <div>
            <p style={{ margin: '0 0 10px', fontFamily: GRO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C7D99F' }}>Choose your early-access list</p>
            <p style={{ margin: 0, fontFamily: GRO, fontSize: 15, lineHeight: 1.55, color: ed.onDarkSoft }}>No payment today. We’ll email product updates, launch pricing and availability.</p>
          </div>
          <form onSubmit={submit} aria-label="Hardware preorder interest" style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(['note', 'heart', 'both'] as HardwareChoice[]).map((item) => <ChoiceButton key={item} choice={item} selected={choice === item} onClick={() => setChoice(item)} />)}
            </div>
            <div className="r3-preorder-form" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <label htmlFor="hardware-preorder-email" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Email address</label>
              <input id="hardware-preorder-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email address" style={{ minHeight: 60, minWidth: 0, border: `1px solid ${ed.onDarkHair}`, borderRight: 0, borderRadius: 0, background: 'rgba(255,255,255,.04)', color: ed.onDark, padding: '0 20px', fontFamily: GRO, fontSize: 15, outlineOffset: 3 }} />
              <button type="submit" disabled={status === 'loading' || status === 'success'} style={{ minHeight: 60, border: 0, borderRadius: 0, background: '#C7D99F', color: ed.dark, padding: '0 26px', fontFamily: GRO, fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', cursor: status === 'loading' || status === 'success' ? 'default' : 'pointer', opacity: status === 'loading' ? .65 : 1 }}>
                {status === 'loading' ? 'Joining…' : status === 'success' ? 'Preorder saved' : 'Join preorder list'}
              </button>
            </div>
            {message && <p role="status" style={{ margin: 0, fontFamily: GRO, fontSize: 13, color: status === 'error' ? '#F3A89A' : '#C7D99F' }}>{message}</p>}
          </form>
        </div>
      </div>
      <style>{`
        .r3-hardware-grid svg { width: 100%; height: 100%; display: block; }
        @media (max-width: 800px) {
          .r3-hardware-header, .r3-preorder-row { grid-template-columns: 1fr !important; }
          .r3-hardware-grid { grid-template-columns: 1fr !important; }
          .r3-hardware-grid article:first-child { border-right: 0 !important; border-bottom: 1px solid ${ed.onDarkHair}; padding-right: 0 !important; }
          .r3-hardware-grid article:last-child { padding-left: 0 !important; }
        }
        @media (max-width: 560px) {
          .r3-preorder-form { grid-template-columns: 1fr !important; gap: 8px; }
          .r3-preorder-form input { border-right: 1px solid ${ed.onDarkHair} !important; }
        }
      `}</style>
    </section>
  );
}
