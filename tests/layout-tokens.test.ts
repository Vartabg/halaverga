import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The screen cleanup's layout tokens, the shape of the one-row header and the layer map, read from the source (spec sections 2 and 10.2 and the
// lead's addendum H3). The row unit started it; the last unit adds the layers and the names that must be gone.
const css = readFileSync(new URL('../src/ui/Experience.module.css', import.meta.url), 'utf8');
const tsx = readFileSync(new URL('../src/ui/Experience.tsx', import.meta.url), 'utf8');
const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]()]/g, '\\$&')}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('layout tokens on .experience', () => {
  const experience = rule('.experience');
  it('defines the row tokens with the spec formulas', () => {
    expect(experience).toContain('--top:max(16px,env(safe-area-inset-top))');
    expect(experience).toContain('--row:44px');
    expect(experience).toContain('--hdr:calc(var(--top) + var(--row) + 8px + var(--row-extra,0px))'); // --row-extra is 0 unless the Vote pill wraps (useRowExtra)
    expect(experience).toContain('--gx:max(16px,4.5vw)');
  });
  it('keeps the pre-cleanup band as --band for the touch layers (B3), measured through the [data-band] marker', () => {
    expect(css).toContain('.experience{--band:calc(max(28px,env(safe-area-inset-top)) + 44px)}');
    expect(css).toContain('@media(max-width:839px){.experience{--band:calc(max(28px,env(safe-area-inset-top)) + 96px)}}');
    expect(css).toContain('@media(max-width:600px){.experience{--band:calc(max(20px,env(safe-area-inset-top)) + 96px)}}');
    expect(css).toContain('@media(max-height:550px) and (orientation:landscape) and (min-width:640px){.experience{--band:calc(max(12px,env(safe-area-inset-top)) + 44px)}}');
    expect(rule('.bandProbe')).toContain('height:var(--band)');
    expect(tsx).toContain('data-band=""');
  });
});

describe('the one-row header', () => {
  it('is one row at --top, 44 px tall, with 8 px between its buttons', () => {
    const header = rule('.header');
    expect(header).toContain('top:var(--top)'); expect(header).toContain('min-height:var(--row)'); expect(header).toContain('gap:8px');
    expect(css).not.toMatch(/\.headerActions\{[^}]*gap:5px/);
  });
  it('in play is only as wide as its buttons, and on touch passes touches through to the surface but its buttons', () => {
    expect(rule('.header[data-play]')).toMatch(/left:auto;width:max-content/);
    expect(css).toContain(':global(html[data-input=touch]) .header[data-play]{pointer-events:none}');
    expect(css).toContain(':global(html[data-input=touch]) .header[data-play] button{pointer-events:auto}');
  });
  it('the row buttons use the child combinator, so the picker pills keep their own styles', () => {
    expect(css).toContain('.headerActions>button{'); expect(css).not.toMatch(/\.headerActions button/);
  });
  it('has no second row: no bar slot, no --lab-row, no labBar', () => {
    for (const gone of ['barSlot', '--lab-row', 'data-lab-bar', 'data-bar', 'labBar']) { expect(css, gone).not.toContain(gone); expect(tsx, gone).not.toContain(gone); }
  });
  it('Pause is a 44 px circle with an inline icon, and the icon follows the text colour in forced colors (D4)', () => {
    expect(css).toMatch(/\.headerActions>\.pause\{[^}]*width:44px[^}]*border-radius:50%/);
    expect(css).toContain('.pause svg{fill:currentColor;forced-color-adjust:auto}');
    expect(tsx).toContain('aria-label="Pause expedition"'); expect(tsx).toMatch(/<svg viewBox="0 0 24 24" aria-hidden="true"><path/);
  });
});

describe('the readout', () => {
  const telemetry = rule('.telemetry');
  it('is passive, top-left of the row, and its plate is at least 85 percent opaque (D2)', () => {
    expect(telemetry).toContain('pointer-events:none'); expect(telemetry).toContain('top:var(--top)'); expect(telemetry).toContain('min-height:var(--row)');
    const alpha = /background:#[0-9a-f]{6}([0-9a-f]{2})/.exec(telemetry)?.[1];
    expect(alpha, 'an 8-digit hex plate').toBeDefined();
    expect(parseInt(alpha!, 16) / 255).toBeGreaterThanOrEqual(.85);
  });
  it('drops the place line at 600 px and narrower and the unit at 400 and narrower (D1); the number stays 20 px bold', () => {
    expect(css).toContain('@media(max-width:600px){.telemetry .place{display:none}}');
    expect(css).toContain('@media(max-width:400px){.telemetry small{display:none}}');
    expect(css).toMatch(/\.telemetry \.alt\{font-size:20px;font-weight:700/);
  });
  it('pads 6 px a side at 400 px wide and narrower, so the 38 px number fits the 56 px box it gets at 320 wide and is not cut to an ellipsis', () => {
    // Room for the readout = the row minus the buttons: Controls + Pause is 160 px at normal text, and the pill adds up to 232 px (Vote 64 + Controls 108 +
    // Pause 44 + 2 gaps). 320 - 2 x 16 - 232 = 56 px with the pill, less 12 px of padding = 44 for the number. The words grow with larger text, the
    // rest does not, so the budget is `max(normal, fixed px + k em)` of the readout's own font size (layout-fit.spec.ts: 150 and 200 percent).
    expect(telemetry).toMatch(/max-width:calc\(100% - 2 \* var\(--gx\) - max\(160px, 104px \+ 4\.7em\)\)/);
    expect(css).toContain('@media(max-width:400px){.telemetry{padding:2px 6px}}');
  });
  it('with the Vote pill the row, not the readout, gives way: the header is capped at the row minus the readout\'s natural width and the pill wraps under Controls (the 200 percent repair)', () => {
    const picker = readFileSync(new URL('../src/ui/controls/ControlsPicker.module.css', import.meta.url), 'utf8');
    // The readout's natural width in em of its own 11 px (measured: 3.5 em + 12 px of padding for the number alone, 7.0 to 7.2 em + 20 px with its unit), plus a little slack.
    expect(picker).toContain('@media(max-width:400px){:global(header[data-play]):has(.chip){font-size:11px;max-width:calc(100% - 2 * var(--gx) - 3.6em - 12px)}}');
    expect(picker).toContain('@media(min-width:401px) and (max-width:600px){:global(header[data-play]):has(.chip){font-size:11px;max-width:calc(100% - 2 * var(--gx) - 7.3em - 20px)}}');
    expect(picker).toContain('.root:has(.chip){display:flex;flex-wrap:wrap-reverse;justify-content:flex-end;gap:8px}');
    // The readout is no longer budgeted for the pill (that clipped the number at 200 percent); its own cap is the room beside Controls and Pause.
    expect(picker).not.toMatch(/has\(\.chip\) ~ :global\(\[data-testid=flight-telemetry\]\)/);
    expect(css).toMatch(/\.headerActions\{[^}]*align-items:flex-start/); // so Pause stays on the first line when the pill wraps under Controls
  });
  it('has one rule: no per-orientation touch overrides', () => {
    expect(css).not.toMatch(/data-input=touch\]\) \.telemetry/);
  });
});

// ---- the layers (spec 2.2; addendum H3) ------------------------------------------------------------------------------------------------
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(SRC), under = (f: string) => f.slice(SRC.length + 1), read = (f: string) => readFileSync(`${SRC}/${f}`, 'utf8');
const globals = read('app/globals.css');
const LAYERS = ['world', 'veil', 'surface', 'hud', 'play', 'sheet', 'bar', 'card', 'vote'] as const; // back to front
const z = Object.fromEntries([...globals.matchAll(/--z-([a-z]+):(-?\d+)/g)].map(m => [m[1], Number(m[2])])) as Record<(typeof LAYERS)[number], number>;
const zOf = (file: string, selector: string) => new RegExp(`${selector.replace(/[.[\]()]/g, '\\$&')}\\{[^}]*z-index:([^;}]+)`).exec(read(file))?.[1];

describe('the layers: every z-index is one named layer, defined once in globals.css', () => {
  it('defines the nine layers in order, back to front, under the skip link\'s literal 100', () => {
    expect(Object.keys(z)).toEqual([...LAYERS]);
    const order = LAYERS.map(l => z[l]);
    expect(order, 'strictly ascending').toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(LAYERS.length);
    expect(z.world).toBeLessThan(z.veil); expect(z.veil).toBeLessThan(0); expect(z.surface).toBeGreaterThan(0); expect(z.vote).toBeLessThan(100);
    expect(globals).toMatch(/\.skip\{[^}]*z-index:100[;}]/);
  });
  it('every z-index in the CSS is var(--z-<layer>), except the skip link (100) and the vote card\'s sticky footer (1, local to the card)', () => {
    const odd: string[] = [], seen = new Set<string>();
    for (const f of files.filter(f => f.endsWith('.css'))) for (const m of read(under(f)).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{[^{}]*z-index:\s*([^;}]+)/g)) {
      const value = m[2].trim(), name = /^var\(--z-([a-z]+)\)$/.exec(value)?.[1];
      if (name) { seen.add(name); if (!(name in z)) odd.push(`${under(f)} ${m[1].trim()}: --z-${name} is not defined`); continue; }
      const local = (under(f) === 'app/globals.css' && value === '100') || (under(f) === 'ui/vote/VoteCard.module.css' && value === '1' && m[1].includes('.foot[data-ballot]'));
      if (!local) odd.push(`${under(f)} ${m[1].trim()}: z-index:${value}`);
    }
    expect(odd).toEqual([]);
    expect([...seen].sort(), 'no layer is defined and then never used').toEqual([...LAYERS].sort());
  });
  it('no inline zIndex in the .tsx or .ts files but the two Gesture Lab guides, and they use the play layer, not a bare number', () => {
    const inline = files.filter(f => /\.tsx?$/.test(f)).flatMap(f => read(under(f)).split('\n').filter(l => /zIndex/.test(l)).map(l => `${under(f)}: ${l.trim().replace(/\s+/g, ' ')}`));
    expect(inline.map(l => l.split(':')[0]).sort()).toEqual(['ui/gesture/GhostGuide.tsx', 'ui/gesture/HoldGuide.tsx']);
    for (const l of inline) expect(l, 'a layer, never a bare number').toContain("zIndex: 'var(--z-play)'");
  });
  it('the layer map: each piece of the screen is on its layer', () => {
    const MAP: [string, string, string][] = [
      ['ui/Experience.module.css', '.world', 'world'], ['ui/Experience.module.css', '.vignette', 'veil'],
      ['ui/Experience.module.css', '.flightSurface', 'surface'], ['ui/gesture/Gesture.module.css', '.surface', 'surface'],
      ['ui/Experience.module.css', '.telemetry', 'hud'], ['ui/Experience.module.css', '.legend', 'hud'], ['ui/Flow.module.css', '.hud', 'hud'],
      ['ui/ShooterHud.module.css', '.hud', 'surface'], ['ui/gesture/Gesture.module.css', '.ink', 'hud'],
      ['ui/Experience.module.css', '.stick', 'play'], ['ui/Experience.module.css', '.actions', 'play'], ['ui/Experience.module.css', '.tapPad', 'play'], ['ui/TouchControls.module.css', '.layer', 'play'],
      ['ui/controls/ControlsPicker.module.css', '.backdrop', 'sheet'], ['ui/controls/ControlsPicker.module.css', '.sheet', 'sheet'],
      ['ui/Experience.module.css', '.header', 'bar'], ['ui/Experience.module.css', '.hint', 'bar'],
      ['ui/Experience.module.css', '.pauseCard', 'card'], ['ui/Experience.module.css', '.recovery', 'card'], ['ui/vote/VoteCard.module.css', '.scrim', 'vote'],
    ];
    for (const [file, selector, layer] of MAP) expect(zOf(file, selector), `${file} ${selector}`).toBe(`var(--z-${layer})`);
  });
  it('keeps the stacking that mattered: the hint slot is above the touch layer, the sheet above play but under the top row (Pause above the backdrop, D3), cards above the row, the vote on top', () => {
    expect(z.hud).toBeLessThan(z.play); expect(z.play).toBeLessThan(z.sheet); expect(z.sheet).toBeLessThan(z.bar);
    expect(z.bar).toBeLessThan(z.card); expect(z.card).toBeLessThan(z.vote); expect(z.surface).toBeLessThan(z.hud);
  });
});

describe('the names the cleanup removed are gone from src (spec 10.2)', () => {
  it('has no second header row, flight toast, caption, terminal button, trackpad hint, hint flags or old vote-chip progress', () => {
    const GONE = ['--lab-row', 'data-lab-bar', 'barSlot', 'flightHint', 'touchHint', 'trackpadHint', '.discovery', 'styles.discovery', 'hintVisible', 'seriesOpen', 'ControlsSection', 'chipProgress', 'chipHint'];
    const hits = files.flatMap(f => { const text = read(under(f)); return GONE.filter(g => text.includes(g)).map(g => `${under(f)}: ${g}`); });
    expect(hits).toEqual([]);
  });
  it('the Municipal record line in the hint slot is a 44 px target', () => {
    expect(css).toMatch(/\.hint\[data-kind=record\]\{[^}]*min-height:44px/);
    expect(css).toMatch(/\.read\{[^}]*min-height:44px/);
  });
});
