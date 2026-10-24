import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';

/**
 * The header's menu: whatever did not fit in the bar (links, and the account actions on a narrow bar).
 * Same voice as the rest of the masthead: ink hairline, 2px corners, uppercase Archivo, hairline dividers between rows,
 * one filled ink row for the primary action. Scoped CSS because index.css is prebuilt (no Tailwind JIT).
 */
export const R3_MENU_CSS = `
.r3-menu{background:#FFFFFF!important;border:1px solid #16140F!important;border-radius:2px!important;padding:0!important;box-shadow:0 14px 34px rgba(22,20,15,.14)!important}
.r3-menu [role=menuitem]{border-radius:0!important;padding:11px 14px!important;font-family:"Archivo","Inter",sans-serif!important;font-size:11px!important;font-weight:600!important;letter-spacing:.12em!important;text-transform:uppercase!important;color:#16140F!important;display:flex!important;align-items:center!important;cursor:pointer}
.r3-menu [role=menuitem]+[role=menuitem]{border-top:1px solid rgba(22,20,15,.12)}
.r3-menu [role=menuitem]:focus,.r3-menu [role=menuitem]:hover{background:#F2EFE7!important}
.r3-menu [role=menuitem][data-tone=primary]{background:#16140F!important;color:#F4F1EA!important}
.r3-menu [role=menuitem][data-tone=primary]:focus,.r3-menu [role=menuitem][data-tone=primary]:hover{background:#2B2822!important}
.r3-menu [role=separator]{margin:0!important;background:#16140F!important}
.r3-menu svg{color:#16140F!important}
.r3-menu-tag{margin-left:auto;border:1px solid #16140F;border-radius:2px;padding:1px 6px;font-size:9px;letter-spacing:.1em}
@media (pointer:coarse){.r3-menu [role=menuitem]{padding:15px 16px!important}}
.r3-menu-trigger{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:1px solid currentColor;border-radius:2px;background:transparent;cursor:pointer;transition:background 200ms ease,color 200ms ease,border-color 350ms ease}
.r3-menu-trigger::after{content:"";position:absolute;inset:-6px}
.r3-menu-trigger:hover,.r3-menu-trigger[data-state=open]{background:#16140F;color:#F4F1EA!important;border-color:#16140F}
.r3-menu-trigger svg{width:16px;height:16px}
.r3-menu-trigger:focus-visible,nav[aria-label="Main navigation"] a:focus-visible,nav[aria-label="Main navigation"] button:focus-visible{outline:2px solid #9A6A2F;outline-offset:2px;border-radius:2px}
`;

export interface MenuItemSpec {
  key: string;
  label: string;
  onSelect?: () => void;
  /** A link that goes to another page. */
  href?: string;
  /** The one filled row (Subscribe). */
  tone?: 'primary';
  /** A small boxed label on the right (the admin level). */
  tag?: string;
  icon?: ReactNode;
}

/** Groups are separated by an ink rule; an empty group is skipped. */
export function HeaderMenu({ groups, color }: { groups: MenuItemSpec[][]; color: string }) {
  const shown = groups.filter((g) => g.length);
  if (!shown.length) return null;
  const row = (item: MenuItemSpec) => {
    const body = <>{item.icon}{item.label}{item.tag && <span className="r3-menu-tag">{item.tag}</span>}</>;
    return item.href
      ? <DropdownMenuItem key={item.key} asChild data-tone={item.tone}><a href={item.href} style={{ textDecoration: 'none' }}>{body}</a></DropdownMenuItem>
      : <DropdownMenuItem key={item.key} data-tone={item.tone} onSelect={item.onSelect}>{body}</DropdownMenuItem>;
  };
  // Not modal: a row may open a dialog (Sign in, Subscribe), which must not fight the menu for focus and pointer events.
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Menu" className="r3-menu-trigger" style={{ color }}><MoreHorizontal aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={12} className="r3-menu" style={{ width: 'min(calc(100vw - 32px), 300px)' }}>
        {shown.map((group, i) => <div key={i} role="group">{i > 0 && <DropdownMenuSeparator />}{group.map(row)}</div>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
