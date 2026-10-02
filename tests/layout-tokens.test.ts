import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// The screen cleanup's layout tokens and the shape of the one-row header, read from the source (spec section 2 and the lead's addendum).
// Started with the top-row unit; later units add the layer map and the hint slot.
const css = readFileSync(new URL('../src/ui/Experience.module.css', import.meta.url), 'utf8');
const tsx = readFileSync(new URL('../src/ui/Experience.tsx', import.meta.url), 'utf8');
const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]()]/g, '\\$&')}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('layout tokens on .experience', () => {
  const experience = rule('.experience');
  it('defines the row tokens with the spec formulas', () => {
    expect(experience).toContain('--top:max(16px,env(safe-area-inset-top))');
    expect(experience).toContain('--row:44px');
    expect(experience).toContain('--hdr:calc(var(--top) + var(--row) + 8px)');
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
    expect(telemetry).toMatch(/max-width:calc\(100% - 2 \* var\(--gx\) - 232px\)/); // 320 - 2 x 16 - 232 = 56 px, less 12 px of padding = 44 for the number
    expect(css).toContain('@media(max-width:400px){.telemetry{padding:2px 6px}}');
  });
  it('has one rule: no per-orientation touch overrides', () => {
    expect(css).not.toMatch(/data-input=touch\]\) \.telemetry/);
  });
});
