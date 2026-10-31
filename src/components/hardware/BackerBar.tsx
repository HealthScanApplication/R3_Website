import React, { useEffect, useState } from 'react';
import { ed, GRO } from '../../config/editorialTheme';
import { fetchBackerCount } from '../../utils/hardwarePreorder';
import { BATCH_GOAL } from './copy';

export function BackerBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<{ paid: number; goal: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetchBackerCount().then(d => { if (live) setState({ paid: d.paid, goal: d.goal || BATCH_GOAL }); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [refreshKey]);

  if (failed) return <p style={{ fontFamily: GRO, fontSize: 13, color: ed.onDarkSoft, margin: 0 }}>Reserve yours — first batch is filling.</p>;
  const paid = state?.paid ?? 0, goal = state?.goal ?? BATCH_GOAL;
  const pct = Math.max(0, Math.min(100, Math.round((paid / goal) * 100)));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ fontFamily: GRO, fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#C7D99F', margin: 0 }}>{paid} of {goal} backers</p>
      <div role="progressbar" aria-valuenow={paid} aria-valuemin={0} aria-valuemax={goal} style={{ height: 6, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#C7D99F' }} />
      </div>
    </div>
  );
}
