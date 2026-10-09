import type { Insets } from '@/game/touchLayout';
// Screen geometry for the lazy touch layer. Everything is measured against the visual viewport (what the player actually
// sees, after Safari's toolbars and any page zoom), so layout, routing and the fixed overlay share one coordinate box.
export type ViewBox = { x: number; y: number; w: number; h: number };
const ZERO: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
/** The visual viewport box in layout-viewport (client) coordinates; the inner size when visualViewport is missing. */
export function viewportBox(): ViewBox {
  if (typeof window === 'undefined') return { x: 0, y: 0, w: 0, h: 0 };
  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) return { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height };
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}
const px = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(0, n) : 0; };
/** Safe-area insets read from a hidden fixed probe padded with env(safe-area-inset-*). No probe yet: all zero. */
export function readInsets(probe: HTMLElement | null): Insets {
  if (!probe || typeof getComputedStyle !== 'function') return { ...ZERO };
  const s = getComputedStyle(probe);
  return { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
}
/** Where touches may start below the header: its bottom edge in box coordinates plus 8 px; a safe fallback without it. */
export function headerBand(box: { y: number }, insetTop: number): number {
  const header = typeof document === 'undefined' ? null : document.querySelector('main header');
  const r = header?.getBoundingClientRect();
  if (r && r.height > 0) return Math.max(0, r.bottom - box.y) + 8;
  return Math.max(44, insetTop + 44) + 8;
}
