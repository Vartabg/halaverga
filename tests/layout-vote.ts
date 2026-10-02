import type { Page } from '@playwright/test';
import { VOTE_ROUND } from '../src/lib/vote/ballot';
import type { Mode } from './layout-audit';
// The vote's one rule as a layout check (addendum C5, C6, C7), one line per problem: a Vote button exists only where it works; the two dots and
// the pill never appear together; the dots' slot is always there; the Controls button is one width whatever the state; and the pill sits left of it
// with an 8 px gap. System Chrome emulation: the layout, never the feel of a thumb on a real iPhone.

/** The saved play record of two ways flown for 20 s or more in this view's family (touch or desktop): the vote is ready from the first frame. */
export const PLAYED = (v: { touch: boolean }) => ({ 'halaverga.vote.play.v2': JSON.stringify({ round: VOTE_ROUND,
  secs: v.touch ? { 'touch:one-finger': 25, 'touch:draw': 25 } : { 'desktop:cursor': 25, 'desktop:draw': 25 } }) });

/** The Controls button is one width in every state (ControlsPicker.module.css: its minimum holds the word, the gap and the reserved dots slot). */
export const CONTROLS_W = 108;

export async function voteProblems(page: Page, mode: Mode): Promise<string[]> {
  const problems: string[] = [], n = (id: string) => page.getByTestId(id).count(), ready = mode.vote === 'ready';
  const trigger = page.getByTestId('controls-trigger'), has = await trigger.count() > 0, chips = await n('vote-chip'), doors = await n('vote-open'), buttons = await n('controls-vote');
  const dotCount = await page.getByTestId('vote-dots').locator('i').count(), slot = await n('vote-dots'), pausedCard = await page.getByRole('region', { name: 'Expedition paused' }).count();
  if (has) {
    if (chips !== (ready ? 1 : 0)) problems.push(`${chips} Vote pill(s) while ${mode.vote}`);
    if (dotCount !== (ready ? 0 : 2)) problems.push(`${dotCount} dots while ${mode.vote}`);
    if (slot !== 1) problems.push(`the dots slot is not there (${slot})`);
    if (!mode.scale) {
      const tb = (await trigger.boundingBox())!;
      if (Math.abs(tb.width - CONTROLS_W) > .6) problems.push(`Controls is ${tb.width.toFixed(1)} px wide, not ${CONTROLS_W}`);
      if (ready) {
        const cb = (await page.getByTestId('vote-chip').boundingBox())!;
        if (Math.abs(tb.x - (cb.x + cb.width) - 8) > .6) problems.push(`the Vote pill is not 8 px left of Controls: ${JSON.stringify({ pill: cb, controls: tb })}`);
      }
    }
  }
  if (pausedCard && doors !== (ready ? 1 : 0)) problems.push(`${doors} vote door(s) on the pause card while ${mode.vote}`);
  if (mode.sheet && buttons !== (ready ? 1 : 0)) problems.push(`${buttons} Vote button(s) in the sheet while ${mode.vote}`);
  if (!has && !pausedCard && !mode.sheet) problems.push('no row, no pause card and no sheet to check the vote on');
  return problems;
}

/**
 * The shape of the top row with the Vote pill in it: one line (the pill 8 px left of Controls), or, when the readout needs the room (large text on a
 * phone), the pill wrapped under Controls with Pause still on the first line. Either way `--row-extra` is the header's height beyond the 44 px row (what
 * `--hdr` adds, so a hint or card lands under the pill) and no passive text (the readout, a hint) sits over a button. Returns whether it wrapped.
 */
export async function rowFormProblems(page: Page): Promise<{ stacked: boolean; problems: string[] }> {
  const box = (id: string) => page.getByTestId(id).boundingBox(), problems: string[] = [];
  const chip = await page.getByTestId('vote-chip').count() ? await box('vote-chip') : null, trig = (await box('controls-trigger'))!, header = (await page.locator('header').boundingBox())!;
  const pause = (await page.getByRole('button', { name: 'Pause expedition' }).boundingBox())!;
  const extra = await page.locator('main').evaluate(m => m.style.getPropertyValue('--row-extra'));
  const stacked = !!chip && chip.y > trig.y + 1;
  if (stacked) {
    if (Math.abs(pause.y - trig.y) > 1) problems.push(`Pause is not on Controls' line: ${JSON.stringify({ pause, controls: trig })}`);
    if (Math.abs(chip!.y - (trig.y + trig.height + 8)) > 1) problems.push(`the wrapped pill is not 8 px under Controls: ${JSON.stringify({ pill: chip, controls: trig })}`);
    if (Math.abs(chip!.x + chip!.width - (trig.x + trig.width)) > 1) problems.push(`the wrapped pill is not right-aligned under Controls: ${JSON.stringify({ pill: chip, controls: trig })}`);
    if (Math.abs(header.height - 96) > 1) problems.push(`the wrapped row is ${header.height.toFixed(1)} px tall, not 96`);
  } else if (chip && Math.abs(chip.y - trig.y) > 1) problems.push(`the pill is neither beside nor under Controls: ${JSON.stringify({ pill: chip, controls: trig })}`);
  if (!stacked && header.height > 44.5) problems.push(`the row is ${header.height.toFixed(1)} px tall without a wrapped pill`);
  const want = Math.round(header.height - 44);
  if (extra !== `${want}px`) problems.push(`--row-extra is "${extra}", the header is ${header.height.toFixed(1)} px tall (${want}px expected)`);
  // Passive text never sits over a button: the readout, and whichever hint is showing (the controls hint today, the hint slot after).
  const buttons = [trig, pause, ...(chip ? [chip] : [])];
  for (const id of ['flight-telemetry', 'controls-hint', 'hint-slot']) {
    const t = page.getByTestId(id);
    if (!await t.count()) continue;
    const b = await t.boundingBox();
    if (b) for (const o of buttons) if (Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x) > .5 && Math.min(b.y + b.height, o.y + o.height) - Math.max(b.y, o.y) > .5) problems.push(`${id} ${JSON.stringify(b)} sits over a button ${JSON.stringify(o)}`);
  }
  return { stacked, problems };
}
