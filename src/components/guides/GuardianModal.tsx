import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type GuardianModalProps = {
  label: string;
  onClose: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  panelStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  footerStyle?: React.CSSProperties;
  closeLabel?: string;
  zIndex?: number;
  /** A short confirmation: 520px wide and as tall as its content, not the full 640 × 760 frame. */
  compact?: boolean;
};

/** Guardian-owned dialogs share one viewport-safe frame; only their body scrolls. */
export function GuardianModal({ label, onClose, header, footer, children, panelStyle, headerStyle, bodyStyle, footerStyle, closeLabel = 'Close', zIndex = 1000, compact = false }: GuardianModalProps) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = previousOverflow; opener?.focus(); };
  }, []);

  function handleKeys(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); close.current(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getAttribute('type') !== 'hidden');
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <div style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16, boxSizing: 'border-box', overflow: 'hidden' }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-label={label} onKeyDown={handleKeys} style={{ background: '#fff', color: '#111827', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.3)', ...panelStyle, width: compact ? 520 : 640, height: compact ? 'auto' : 760, maxWidth: '100%', maxHeight: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: 24, ...headerStyle, flexShrink: 0, position: 'relative', paddingRight: 64 }}>
        {header}
        <button type="button" aria-label={closeLabel} onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, borderRadius: 4, color: 'inherit', cursor: 'pointer' }}><X size={20} /></button>
      </header>
      <div style={{ padding: 24, ...bodyStyle, flex: '1 1 auto', minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>{children}</div>
      {footer != null && <footer style={{ padding: 24, borderTop: '1px solid currentColor', ...footerStyle, flexShrink: 0 }}>{footer}</footer>}
    </section>
  </div>;
}
