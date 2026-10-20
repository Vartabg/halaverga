import { expect, test, type Page } from '@playwright/test';
import { openSettings } from './lab-browser';
// The authored flight clip on show, read from the telemetry label that samples the suit every 350 ms. Braking is not asserted here:
// its label lasts about .3 s, shorter than the sample; unit tests and the review strips cover it.
// Each settings change also returns to the arrival terrace and takes off again, so every segment starts from the same place
// instead of flying on into the city, where collision handling would steer (bank) or stop (brake) the explorer.
const settings = async (page: Page, change: () => Promise<void>) => {
  const telemetry = page.getByTestId('flight-telemetry');
  await openSettings(page); await change();
  await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
  // Closing the panel resumes only once the scene is ready; otherwise the pause screen offers Resume flight. Keys are ignored while paused.
  const playing = page.getByRole('button', { name: 'Pause expedition' }), resume = page.getByRole('button', { name: 'Resume flight' });
  await expect(playing.or(resume)).toBeVisible();
  if (await resume.isVisible()) { await expect(resume).toBeEnabled({ timeout: 10000 }); await resume.click(); }
  await expect(playing).toBeVisible(); await expect(telemetry).toHaveAttribute('data-flying', 'false');
  // Space on a focused button would press it, so return focus to the game first.
  await page.getByRole('main', { name: 'Halaverga expedition' }).focus(); await page.keyboard.press('Space'); await expect(telemetry).toHaveAttribute('data-flying', 'true');
  await page.keyboard.down('KeyW'); await expect.poll(async () => Number(await telemetry.getAttribute('data-speed'))).toBeGreaterThan(2);
};
test('the suit plays its authored flight clips and hands back to the ground', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?shooter=0'); await page.getByRole('button', { name: 'Begin expedition' }).click();
  // Polled every 50 ms, so no 350 ms telemetry sample slips between two checks.
  const telemetry = page.getByTestId('flight-telemetry'), clip = (name: string) =>
    expect.poll(() => telemetry.getAttribute('data-suit-clip'), { intervals: [50], timeout: 3000 }).toBe(name);
  // Each turn key is held a fixed .9 s while the label and the whole-body roll are watched, so the heading after the turns does not
  // depend on test timing. The roll (rad, positive rolls left) must reach .3 into the turn at 13 m/s.
  const roll = async () => Number(await telemetry.getAttribute('data-suit-roll'));
  // Straight flight shows the clip its speed calls for (flightMix FIST): cruise below 15 m/s, the fist (power-hero, or power with
  // classic poses) from 20 m/s, either one between. Momentum flight reaches about 30 m/s under W, so both bands are exercised.
  const straight = async (fist = 'power-hero') => {
    let seen = '';
    for (const end = Date.now() + 3000; Date.now() < end; await page.waitForTimeout(50)) {
      const speed = Number(await telemetry.getAttribute('data-speed')), c = await telemetry.getAttribute('data-suit-clip');
      seen = `${speed} m/s ${c}`;
      if (speed >= 20 ? c === fist : speed <= 15 ? c === 'cruise' : c === 'cruise' || c === fist) return;
    }
    expect(seen, 'straight flight shows the clip its speed calls for').toBe('');
  };
  const turn = async (key: string, name: string) => { await page.keyboard.down(key); const seen = clip(name);
    const rolled = expect.poll(async () => (await roll()) * (key === 'ArrowLeft' ? 1 : -1), { intervals: [50], timeout: 3000 }).toBeGreaterThan(.3);
    await page.waitForTimeout(900); await page.keyboard.up(key); await seen; await rolled; };
  // Under reduced motion the roll stays exactly 0 through the same turns.
  const level = async (key: string) => { await page.keyboard.down(key);
    for (let i = 0; i < 18; i++) { expect(Math.abs(await roll())).toBe(0); await page.waitForTimeout(50); } await page.keyboard.up(key); };
  await clip('ground');
  await page.keyboard.press('Space'); await expect(telemetry).toHaveAttribute('data-flying', 'true'); await clip('hover');
  await page.keyboard.down('KeyW'); await clip('cruise');
  await turn('ArrowLeft', 'bank-left'); await straight(); await turn('ArrowRight', 'bank-right'); await straight();
  // Held W carries momentum flight past the fist threshold: the hero fist must then be on show.
  await expect.poll(async () => Number(await telemetry.getAttribute('data-speed')), { timeout: 5000 }).toBeGreaterThan(20); await clip('power-hero');
  // Two seconds after the turn the body is level again.
  await page.waitForTimeout(2000); await expect.poll(async () => Math.abs(await roll()), { intervals: [50], timeout: 1000 }).toBeLessThan(.05);
  // Stable low-speed cruise, from the terrace so no building is in the way: W is released at 13 m/s and the angel glides down
  // through the cruise band (above 8 m/s, flightPose's cruise weight; at most 15 m/s, fist stowed) for about two seconds. Three
  // consecutive telemetry samples (it stamps every 350 ms) inside that band must all read cruise.
  await page.keyboard.up('KeyW'); await settings(page, async () => {});
  await expect.poll(async () => Number(await telemetry.getAttribute('data-speed')), { intervals: [50], timeout: 3000 }).toBeGreaterThan(13);
  await page.keyboard.up('KeyW');
  const samples: string[] = [];
  for (let last = -1, speed = 99; samples.length < 3 && speed > 8;) {
    speed = Number(await telemetry.getAttribute('data-speed'));
    if (speed !== last && speed > 8 && speed <= 15) samples.push(`${await telemetry.getAttribute('data-suit-clip')}`);
    last = speed; await page.waitForTimeout(60);
  }
  expect(samples).toEqual(['cruise', 'cruise', 'cruise']);
  // The surge starts from the terrace, straight ahead, like every later segment.
  await page.keyboard.up('KeyW'); await settings(page, async () => {});
  await page.keyboard.press('Shift'); await clip('power-hero');
  // Pausing clears held keys and surge; resume with classic poses.
  await page.keyboard.up('KeyW');
  await settings(page, () => page.getByLabel('Expressive hero poses').uncheck());
  await page.keyboard.press('Shift'); await clip('power');
  await page.keyboard.up('KeyW');
  await settings(page, () => page.getByLabel('Reduced camera motion').check());
  await clip('cruise'); await level('ArrowLeft'); await level('ArrowRight');
  await page.keyboard.press('Shift'); await clip('power'); await page.keyboard.up('KeyW');
  await openSettings(page);
  await page.getByRole('button', { name: 'Return to arrival terrace' }).click();
  await page.getByRole('button', { name: 'Resume flight' }).click(); // the dialog closes onto the pause card; the reset lands on the first step after Resume
  await expect(telemetry).toHaveAttribute('data-flying', 'false'); await clip('ground');
  expect(errors).toEqual([]);
});
