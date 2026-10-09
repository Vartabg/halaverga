'use client';
// OctoPocus hold guide (spec 6-7), Draw and Brush only: labelled template paths from the finger that fade as the stroke diverges,
// plus the brake-fill ring the arbiter reports (250 -> 900 ms). A pure display: it never brakes, never writes the gesture bus.
// The lab surface drives the model (holdShow on the arbiter's 'guide', holdTrack on moves, holdRing on 'brakeRing', holdHide on
// up or cancel); the component repaints only when the model's version changes and its rAF runs only while something shows.
import { useEffect, useRef } from 'react';
import type { LabScheme } from './guideSteps';

/** Template size on screen (px per unit), divergence that fully fades a template (units), and the no-fade start (units). */
export const HOLD_REACH = 110, HOLD_DIVERGE = .45, HOLD_GRACE = .08, HOLD_OVERRUN = .3, HOLD_MAX = 6, HOLD_ALPHA = .85;
export type HoldTemplate = { readonly label: string; readonly n: number; readonly x: Float32Array; readonly y: Float32Array;
  readonly s: Float32Array; readonly len: number; readonly d: string; readonly lx: number; readonly ly: number };

function template(label: string, pts: readonly number[]): HoldTemplate {
  const n = pts.length / 2, x = new Float32Array(n), y = new Float32Array(n), s = new Float32Array(n);
  let d = '', far = 0;
  for (let i = 0; i < n; i++) {
    x[i] = pts[2 * i]; y[i] = pts[2 * i + 1];
    s[i] = i ? s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) : 0;
    d += (i ? 'L' : 'M') + x[i].toFixed(3) + ' ' + y[i].toFixed(3);
    if (Math.hypot(x[i], y[i]) > Math.hypot(x[far], y[far])) far = i;
  }
  // The label sits at the point farthest from the finger (a closed circle's end is the finger itself).
  return { label, n, x, y, s, len: s[n - 1], d, lx: x[far], ly: y[far] };
}
function arc(fn: (k: number) => [number, number], steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(...fn(i / steps));
  return out;
}
// Unit space, y down, the finger at the origin.
const R = .42, CX = .3, CY = -.3, A0 = Math.atan2(-CY, -CX);
const circle = arc(k => [CX + R * Math.cos(A0 + k * 2 * Math.PI), CY + R * Math.sin(A0 + k * 2 * Math.PI)], 24);
const curve = arc(k => [.9 * k * k, -1.6 * k * (1 - k) - .7 * k * k], 16);
export const HOLD_TEMPLATES: Readonly<Record<LabScheme, readonly HoldTemplate[]>> = {
  draw: [template('Draw from here', curve)],
  conduct: [],
  brush: [template('Soar', [0, 0, 0, -1]), template('Dive', [0, 0, 0, 1]), template('Turn', [0, 0, -1, 0]), template('Turn', [0, 0, 1, 0]),
    template('Roll / Lock', circle)],
};

export type HoldModel = {
  active: boolean; scheme: LabScheme;
  /** The hold point (client px): the templates' origin. */
  x: number; y: number;
  /** Per-template opacity in [0, 1]; only ever falls during one hold. */
  alpha: Float32Array;
  /** Brake-fill progress in [0, 1], as reported by the arbiter. */
  ring: number;
  version: number;
  wake: (() => void) | null;
};
export const createHoldModel = (): HoldModel =>
  ({ active: false, scheme: 'brush', x: 0, y: 0, alpha: new Float32Array(HOLD_MAX), ring: 0, version: 0, wake: null });
const touched = (m: HoldModel) => { m.version++; m.wake?.(); };

/** The arbiter's 'guide' output. Conduct has no guide (resting is steering). */
export function holdShow(m: HoldModel, scheme: LabScheme, x: number, y: number) {
  m.scheme = scheme; m.x = x; m.y = y;
  m.active = HOLD_TEMPLATES[scheme].length > 0;
  m.alpha.fill(m.active ? 1 : 0);
  touched(m);
}

/** A move after the guide showed: (x, y) is the pointer, arc the stroke's path length since the hold point (px). */
export function holdTrack(m: HoldModel, x: number, y: number, arc: number) {
  if (!m.active) return;
  const list = HOLD_TEMPLATES[m.scheme], ux = (x - m.x) / HOLD_REACH, uy = (y - m.y) / HOLD_REACH, L = arc / HOLD_REACH;
  for (let k = 0; k < list.length; k++) {
    const t = list[k];
    let a = 0;
    if (L <= t.len + HOLD_OVERRUN) {
      // The template point at the same arc length as the stroke (clamped to the template's end).
      const at = Math.min(L, t.len);
      let i = 1;
      while (i < t.n - 1 && t.s[i] < at) i++;
      const seg = t.s[i] - t.s[i - 1] || 1, f = Math.min(1, Math.max(0, (at - t.s[i - 1]) / seg));
      const px = t.x[i - 1] + (t.x[i] - t.x[i - 1]) * f, py = t.y[i - 1] + (t.y[i] - t.y[i - 1]) * f;
      a = L < HOLD_GRACE ? 1 : 1 - Math.hypot(ux - px, uy - py) / HOLD_DIVERGE;
    }
    m.alpha[k] = Math.min(m.alpha[k], Math.max(0, a));
  }
  touched(m);
}

/** The arbiter's 'brakeRing' progress at the held point (the arbiter, not the guide, brakes at 900 ms). */
export function holdRing(m: HoldModel, progress: number, x = m.x, y = m.y) {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  if (p === m.ring && x === m.x && y === m.y) return;
  m.ring = p; m.x = x; m.y = y; touched(m);
}

export function holdHide(m: HoldModel) {
  if (!m.active && m.ring === 0) return;
  m.active = false; m.ring = 0; m.alpha.fill(0); touched(m);
}

const SVG_STYLE = { position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 3 } as const;
const LABEL_STYLE = { font: '600 13px system-ui, sans-serif', paintOrder: 'stroke' } as const;

export default function HoldGuide({ model, scheme }: { model: HoldModel; scheme: LabScheme }) {
  const svg = useRef<SVGSVGElement>(null), origin = useRef<SVGGElement>(null), ring = useRef<SVGCircleElement>(null);
  const items = useRef<(SVGGElement | null)[]>([]);
  const list = HOLD_TEMPLATES[scheme];
  useEffect(() => {
    let raf = 0, seen = -1;
    const paint = () => {
      const root = svg.current, g = origin.current, r = ring.current;
      if (!root || !g || !r) return;
      const on = model.active && model.scheme === scheme;
      root.style.display = on || model.ring > 0 ? '' : 'none';
      g.setAttribute('transform', `translate(${model.x} ${model.y})`);
      for (let k = 0; k < list.length; k++) items.current[k]?.setAttribute('opacity', on ? (model.alpha[k] * HOLD_ALPHA).toFixed(2) : '0');
      r.style.strokeDashoffset = String(1 - model.ring);
      r.setAttribute('opacity', model.ring > 0 ? '1' : '0');
    };
    const frame = () => {
      raf = 0;
      if (model.version !== seen) { seen = model.version; paint(); }
      if (model.active || model.ring > 0) raf = requestAnimationFrame(frame);
    };
    model.wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
    paint();
    return () => { if (raf) cancelAnimationFrame(raf); model.wake = null; };
  }, [model, scheme, list]);
  return <svg ref={svg} aria-hidden="true" focusable="false" style={{ ...SVG_STYLE, display: 'none' }}>
    <g ref={origin}>
      {list.map((t, k) => <g key={k} ref={el => { items.current[k] = el; }} opacity={0}>
        <path d={t.d} transform={`scale(${HOLD_REACH})`} fill="none" stroke="#e8fbff" strokeWidth={3} strokeLinecap="round"
          strokeDasharray="6 7" vectorEffect="non-scaling-stroke" />
        <text x={t.lx * HOLD_REACH + (t.lx < 0 ? -8 : 8)} y={t.ly * HOLD_REACH + (t.ly > 0 ? 18 : -8)}
          textAnchor={t.lx < -.1 ? 'end' : t.lx > .1 ? 'start' : 'middle'} fill="#ffffff" stroke="#0b1d24" strokeWidth={3}
          style={LABEL_STYLE}>{t.label}</text>
      </g>)}
      <circle ref={ring} r={34} fill="none" stroke="#ffd166" strokeWidth={4} pathLength={1} strokeDasharray="1" transform="rotate(-90)"
        opacity={0} />
    </g>
  </svg>;
}
