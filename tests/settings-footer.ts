import type { Page } from '@playwright/test';
// Flight settings' footer (the lime Resume): at the top of the scroll it must sit flush with the dialog's bottom edge, so no live control
// shows in a strip under it. A sticky box is held against the scroller's content box, not its padding box, and `bottom:0` once left a
// 20 to 28 px strip there (a settings row peeked out under Resume at 852 x 393, 375 x 667 and 1440 x 900). One line per problem; an empty
// list means the footer is flush. `end` measures at the bottom of the scroll instead (the footer must be flush there too). System Chrome
// emulation: the layout, never how it looks on a real iPhone.
export function settingsFootProblems(page: Page, end = false): Promise<string[]> {
  return page.evaluate(end => {
    const foot = document.querySelector<HTMLElement>('[data-testid=settings-foot]'), dialog = foot?.closest('dialog');
    if (!foot || !dialog) return ['the Flight settings footer is not on screen'];
    if (end) dialog.scrollTop = dialog.scrollHeight;
    const out: string[] = [], f = foot.getBoundingClientRect(), d = dialog.getBoundingClientRect(), cs = getComputedStyle(dialog);
    const edge = d.bottom - parseFloat(cs.borderBottomWidth); // the dialog's padding-box bottom: where the footer has to end
    if (!end && dialog.scrollTop !== 0) out.push(`the dialog is scrolled to ${Math.round(dialog.scrollTop)}, so this measures the wrong place`);
    if (d.left < -.5 || d.top < -.5 || d.right > innerWidth + .5 || d.bottom > innerHeight + .5) out.push(`the dialog is outside the viewport: ${Math.round(d.left)},${Math.round(d.top)} to ${Math.round(d.right)},${Math.round(d.bottom)}`);
    if (Math.abs(f.bottom - edge) > 1) out.push(`the footer ends ${Math.round((edge - f.bottom) * 10) / 10} px above the dialog's bottom edge (expected 0)`);
    // The visible consequence: just inside that edge, across the footer, the hit is the footer, never a setting under it.
    for (const x of [f.left + 8, f.left + f.width / 2, f.right - 8]) {
      const hit = document.elementFromPoint(x, edge - 2);
      if (!hit || !foot.contains(hit)) out.push(`at ${Math.round(x)},${Math.round(edge - 2)} the hit is ${hit?.tagName ?? 'nothing'}, not the footer`);
    }
    return out;
  }, end);
}
