// Twin-stick touch layout (pure, landing-safe). All coordinates are in the visual-viewport box.
// Two separate edges (docs/touch-controls.md, "Layout"):
// - bands: where a touch may START. Only a thin strip at each physical edge is ignored (12 px; the bottom strip is the
//   home-indicator inset less 8, never under 12). Safe-area insets do not widen it: ignoring a touch in JS never stops an
//   iOS edge gesture, it only costs reach.
// - anchor: the corner the button cluster is measured from. Landscape: 12 px from the physical right edge (the Dynamic
//   Island is vertically centred, so the corner is free) and clear of the home indicator; a cluster that would reach into
//   the side inset beside the island shifts inward as one piece. Portrait: 12 px inside the side inset and the home indicator.
// Buttons are offsets (dx', dy') from the anchor scaled by k; every table has dx' >= r and dy' >= r, so no hit circle can leave
// the anchor corner at any k. A fit pass caps k by the available height and by the width the stick zone needs.
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Rect = { l: number; t: number; r: number; b: number };
export type TouchButton = 'fire' | 'aim' | 'rise' | 'descend';
export type ButtonSpot = { x: number; y: number; r: number; visual: number };
export type LayoutPrefs = { size: number; flip: boolean; fire: boolean; aim: boolean; tapPad: boolean };
export type TouchLayout = { orientation: 'landscape' | 'portrait'; variant: 'normal' | 'compact' | 'portrait'; k: number; R: number;
  cramped: boolean; bands: Rect; buttons: Partial<Record<TouchButton, ButtonSpot>>; stickZone: Rect | null;
  ghost: { x: number; y: number } | null; lookPad: Rect };
type Slot = { dx: number; dy: number; vis: number; r: number };
type Variant = TouchLayout['variant'];
/**
 * Landscape normal: Fire about 118 px from the right edge, Rise straight above it, Descend in the corner (crouch/prone spot),
 * Aim to Fire's left. Portrait: a two-column arc on the corner, Fire at the corner, Descend left, Rise above-left, Aim above.
 * Every centre is within about 215 px of the anchor, and every gap is at least 12 table px (8.9 px at the k floor).
 */
export const LAYOUT_TABLES: Record<Variant, Record<TouchButton, Slot>> = {
  normal: { fire: { dx: 106, dy: 88, vis: 80, r: 48 }, rise: { dx: 90, dy: 190, vis: 68, r: 40 },
    aim: { dx: 200, dy: 60, vis: 60, r: 36 }, descend: { dx: 34, dy: 34, vis: 56, r: 30 } },
  compact: { fire: { dx: 88, dy: 76, vis: 76, r: 46 }, rise: { dx: 188, dy: 114, vis: 60, r: 36 },
    aim: { dx: 280, dy: 74, vis: 52, r: 32 }, descend: { dx: 188, dy: 34, vis: 52, r: 32 } },
  portrait: { fire: { dx: 70, dy: 84, vis: 76, r: 46 }, descend: { dx: 168, dy: 50, vis: 56, r: 34 },
    rise: { dx: 144, dy: 160, vis: 64, r: 38 }, aim: { dx: 62, dy: 200, vis: 56, r: 34 } },
};
/** Ghost ring offsets from (bands.l, anchor bottom), per variant: x = bands.l + gx·k, y = anchor.b − gy·k. */
const GHOST: Record<Variant, { gx: number; gy: number }> = { normal: { gx: 130, gy: 96 }, compact: { gx: 100, gy: 76 }, portrait: { gx: 96, gy: 150 } };
const ORDER: readonly TouchButton[] = ['fire', 'aim', 'rise', 'descend'];
/**
 * kMin: k floor (below it the layout is cramped). kPrefMin: the smallest k the Control size preference may ask for (keeps Fire
 * 68 px or more). kCompact: compact switch. gap: stick zone to buttons. edge: the ignored strip at each physical edge.
 * cutout: half-height of the band beside a landscape Dynamic Island or notch (126 pt tall, vertically centred) plus margin.
 */
export const LAYOUT = { kMin: .74, kPrefMin: 60 / 76, kCompact: .85, gap: 12, edge: 12, homeLess: 8, cutout: 70 } as const;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Visible slots: blaster off hides Fire and Aim and moves Rise to Fire's offsets; aim:false hides Aim. Rise and Descend always show. */
function visibleSlots(variant: Variant, prefs: LayoutPrefs): Partial<Record<TouchButton, Slot>> {
  const t = LAYOUT_TABLES[variant], out: Partial<Record<TouchButton, Slot>> = {};
  if (prefs.fire) { out.fire = t.fire; if (prefs.aim) out.aim = t.aim; }
  out.rise = prefs.fire ? t.rise : { ...t.rise, dx: t.fire.dx, dy: t.fire.dy };
  out.descend = t.descend;
  return out;
}
/** Largest dy+r (height the cluster needs per unit k) and dx+r (width). */
function extent(slots: Partial<Record<TouchButton, Slot>>) {
  let y = 0, x = 0;
  for (const b of ORDER) { const s = slots[b]; if (s) { y = Math.max(y, s.dy + s.r); x = Math.max(x, s.dx + s.r); } }
  return { y, x };
}
const mirrorRect = (r: Rect, w: number): Rect => ({ l: w - r.r, r: w - r.l, t: r.t, b: r.b });

export function computeLayout(w: number, h: number, insets: Insets, topBand: number, prefs: LayoutPrefs): TouchLayout {
  // Flip: lay out right-handed with the side insets swapped, then mirror every x.
  const ins = prefs.flip ? { ...insets, left: insets.right, right: insets.left } : insets;
  const landscape = w > h, E = LAYOUT.edge;
  const bands: Rect = { l: E, r: w - E, t: topBand, b: h - Math.max(E, ins.bottom - LAYOUT.homeLess) };
  const anchor = { r: w - E - (landscape ? 0 : ins.right), b: h - Math.max(E, ins.bottom) };
  const availH = anchor.b - bands.t, availW = anchor.r - bands.l;
  const minZone = Math.min(120, .4 * w);
  const fit = (v: Variant) => {
    const e = extent(visibleSlots(v, prefs));
    return Math.min(availH / e.y, (availW - LAYOUT.gap - minZone) / e.x);
  };
  const size = Number.isFinite(prefs.size) ? prefs.size : 1;
  const kPref = Math.max(LAYOUT.kPrefMin, clamp(Math.min(w, h) / 390, .85, 1) * clamp(size, .85, 1.2));
  let variant: Variant = landscape ? 'normal' : 'portrait', kFit = fit(variant);
  if (landscape && kFit < LAYOUT.kCompact) { const c = fit('compact'); if (c > kFit) { variant = 'compact'; kFit = c; } }
  let k = Math.min(kPref, kFit), cramped = false;
  if (!(k >= LAYOUT.kMin)) { k = LAYOUT.kMin; cramped = true; }
  const slots = visibleSlots(variant, prefs), buttons: Partial<Record<TouchButton, ButtonSpot>> = {};
  for (const b of ORDER) {
    const s = slots[b];
    if (s) buttons[b] = { x: anchor.r - s.dx * k, y: anchor.b - s.dy * k, r: s.r * k, visual: s.vis * k };
  }
  // Landscape: a hit circle beside the island or notch stays out of the side inset; the whole cluster moves, so gaps hold.
  let shift = 0;
  if (landscape && ins.right > E) for (const b of ORDER) {
    const s = buttons[b];
    if (s && Math.abs(s.y - h / 2) < LAYOUT.cutout + s.r) shift = Math.max(shift, s.x + s.r - (w - ins.right));
  }
  let leftEdge = anchor.r, top = anchor.b;
  for (const b of ORDER) {
    const s = buttons[b]; if (!s) continue;
    s.x -= shift; leftEdge = Math.min(leftEdge, s.x - s.r); top = Math.min(top, s.y - s.r);
  }
  const zone: Rect = { l: bands.l, t: Math.max(bands.t, (landscape ? .3 : .45) * h), b: bands.b,
    r: Math.min((landscape ? .45 : .5) * w, leftEdge - LAYOUT.gap) };
  const g = GHOST[variant];
  const ghost = { x: clamp(bands.l + g.gx * k, zone.l, zone.r), y: clamp(anchor.b - g.gy * k, zone.t, zone.b) };
  // Look pad: where only look starts. Landscape: between the stick zone and the cluster. Portrait: above both of them.
  const lookPad: Rect = landscape ? { l: zone.r, r: leftEdge, t: bands.t, b: bands.b }
    : { l: bands.l, r: bands.r, t: bands.t, b: Math.min(zone.t, top) - LAYOUT.gap };
  const out: TouchLayout = { orientation: landscape ? 'landscape' : 'portrait', variant, k, R: (landscape ? 64 : 56) * k, cramped,
    bands, buttons, stickZone: prefs.tapPad ? null : zone, ghost: prefs.tapPad ? null : ghost, lookPad };
  if (!prefs.flip) return out;
  out.bands = mirrorRect(bands, w); out.lookPad = mirrorRect(lookPad, w);
  if (out.stickZone) out.stickZone = mirrorRect(out.stickZone, w);
  if (out.ghost) out.ghost = { x: w - out.ghost.x, y: out.ghost.y };
  for (const b of ORDER) { const s = buttons[b]; if (s) s.x = w - s.x; }
  return out;
}

export type Route = { kind: 'button'; button: TouchButton } | { kind: 'stick' } | { kind: 'look' } | { kind: 'ignore' };
const STICK: Route = { kind: 'stick' }, LOOK: Route = { kind: 'look' }, IGNORE: Route = { kind: 'ignore' };
/** Role of a touch at touch-down: nearest visible button whose hit circle holds it; else outside bands → ignore; stick zone → stick; else look. */
export function routeTouch(layout: TouchLayout, x: number, y: number): Route {
  let best: TouchButton | null = null, bestD = Infinity;
  for (const b of ORDER) {
    const s = layout.buttons[b]; if (!s) continue;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d <= s.r && d < bestD) { best = b; bestD = d; }
  }
  if (best) return { kind: 'button', button: best };
  const B = layout.bands;
  if (!(x >= B.l && x <= B.r && y >= B.t && y <= B.b)) return IGNORE;
  const z = layout.stickZone;
  return z && x >= z.l && x <= z.r && y >= z.t && y <= z.b ? STICK : LOOK;
}
