/**
 * A confirmation that lives in the page instead of the browser's own dialog. Embedded browsers and some settings
 * suppress `window.confirm` (it answers "no" without showing anything), which made every Delete button look dead.
 * Resolves true on the confirm button, false on Cancel, Escape or a click outside.
 */
export function confirmInPage(message: string, confirmLabel = 'Delete'): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div');
    overlay.setAttribute('data-confirm-overlay', '');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:rgba(0,0,0,.6);padding:20px';
    const box = document.createElement('div');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', message);
    box.style.cssText = 'width:min(440px,100%);box-sizing:border-box;background:#111210;color:#F5F2EA;border:1px solid rgba(245,242,234,.35);padding:22px;font-family:"EuclidCircularA","DM Sans",Arial,sans-serif';
    const text = document.createElement('p');
    text.textContent = message;
    text.style.cssText = 'margin:0 0 18px;font-size:15px;line-height:1.45';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
    const button = (label: string, primary: boolean) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = label;
      el.style.cssText = `min-height:40px;padding:0 18px;border:1px solid ${primary ? '#F5F2EA' : 'rgba(245,242,234,.4)'};background:${primary ? '#F5F2EA' : 'transparent'};color:${primary ? '#090A08' : '#F5F2EA'};font:700 11px/1 inherit;letter-spacing:.08em;text-transform:uppercase;cursor:pointer`;
      return el;
    };
    const cancel = button('Cancel', false);
    const confirm = button(confirmLabel, true);
    const finish = (answer: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      try { previous?.focus(); } catch { /* the opener may be gone */ }
      resolve(answer);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); finish(false); } };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) finish(false); });
    document.addEventListener('keydown', onKey, true);
    row.append(cancel, confirm);
    box.append(text, row);
    overlay.append(box);
    document.body.append(overlay);
    confirm.focus();
  });
}
