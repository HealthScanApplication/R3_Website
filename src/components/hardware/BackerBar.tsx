import React, { useEffect, useRef, useState } from 'react';
import { ed, GRO } from '../../config/editorialTheme';
import { fetchBackerCount } from '../../utils/hardwarePreorder';
import { BATCH_GOAL } from './copy';

export type BackerData = { paid: number; goal: number; deadline: string; status: string };

export function BackerBar({ refreshKey = 0, onData }: { refreshKey?: number; onData?: (d: BackerData) => void }) {
  const [counts, setCounts] = useState<{ paid: number; goal: number } | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  useEffect(() => {
    let live = true;
    fetchBackerCount().then(d => {
      if (!live) return;
      setCounts({ paid: d.paid, goal: d.goal || BATCH_GOAL });
      onDataRef.current?.({ paid: d.paid, goal: d.goal, deadline: d.deadline, status: d.status });
    }).catch(() => {});
    return () => { live = false; };
  }, [refreshKey]);

  if (!counts) return <p style={{ fontFamily: GRO, fontSize: 13, color: ed.onDarkSoft, margin: 0 }}>Reserve yours — first batch is filling.</p>;
  const { paid, goal } = counts;
  const pct = Math.max(0, Math.min(100, Math.round((paid / goal) * 100)));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ fontFamily: GRO, fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#C7D99F', margin: 0 }}>{paid} of {goal} backers</p>
      <div role="progressbar" aria-label="Backers reserved" aria-valuenow={Math.min(paid, goal)} aria-valuemin={0} aria-valuemax={goal} style={{ height: 6, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#C7D99F' }} />
      </div>
    </div>
  );
}
