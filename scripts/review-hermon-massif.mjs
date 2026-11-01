import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:3366';
const out = process.env.HERMON_REVIEW_OUTPUT ?? '/tmp/halaverga-hermon-review';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-gl=angle', '--use-angle=metal'],
});
const requested = (process.env.HERMON_VIEWPORTS ?? 'desktop,portrait,landscape').split(',');
const prior = existsSync(`${out}/report.json`) ? JSON.parse(readFileSync(`${out}/report.json`, 'utf8')) : { captures: [] };
const report = { base, browser: 'system Chrome / ANGLE Metal', physicalIphoneSafari: 'not validated; viewport emulation only',
  captures: (prior.captures ?? []).filter(c => !requested.includes(c.viewport)) };
const hold = async (page, key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const activate = async (page, locator, touch) => touch ? locator.tap() : locator.click();
const position = async page => page.locator('[data-testid="flight-telemetry"]').getAttribute('data-position').catch(() => null);
async function pitchTo(page, target = -.18) {
  for (let i = 0; i < 8; i++) {
    const pitch = Number(await page.locator('[data-testid="flight-telemetry"]').getAttribute('data-pitch'));
    if (Math.abs(pitch - target) < .07) break;
    await hold(page, pitch > target ? 'ArrowDown' : 'ArrowUp', 120);
    await page.waitForTimeout(380);
  }
}

async function captureState(page, viewport, state, errors) {
  await page.screenshot({ path: `${out}/${viewport}-${state}.png` });
  report.captures.push({ viewport, state, position: await position(page), errors: [...errors] });
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(`[Hermon review] ${viewport}/${state} → ${report.captures.at(-1).position}`);
}

for (const [viewport, size, touch] of [
  ['desktop', { width: 1440, height: 1000 }, false],
  ['portrait', { width: 393, height: 852 }, true],
  ['landscape', { width: 852, height: 393 }, true],
].filter(([name]) => requested.includes(name))) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?shooter=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Ascend Mount Hermon') && !b.disabled), null, { timeout: 60000 });
  await captureState(page, viewport, 'landing', errors);
  await activate(page, page.getByRole('button', { name: /Ascend Mount Hermon/ }), touch);
  await page.getByRole('button', { name: 'Pause expedition' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(900);
  await captureState(page, viewport, 'arrival', errors);
  await activate(page, page.getByRole('button', { name: 'Lift', exact: true }), touch);
  await page.waitForTimeout(650);
  await captureState(page, viewport, 'liftoff', errors);
  await hold(page, 'KeyR', 3600);
  await hold(page, 'KeyW', 1700);
  await hold(page, 'ArrowDown', 420);
  await page.waitForTimeout(350);
  await captureState(page, viewport, 'vista', errors);
  await pitchTo(page, -.05);
  await hold(page, 'KeyR', 4800);
  await page.keyboard.press('Shift');
  await hold(page, 'KeyW', 6500);
  await pitchTo(page, -.18);
  await page.waitForTimeout(350);
  await captureState(page, viewport, 'horizon', errors);
  await activate(page, page.getByRole('button', { name: 'Pause expedition' }), touch);
  await page.getByRole('region', { name: 'Ascent paused' }).waitFor();
  await captureState(page, viewport, 'pause', errors);
  await activate(page, page.getByRole('button', { name: 'Field guide' }), touch);
  await page.getByRole('dialog').waitFor();
  await page.getByText('Explore through text', { exact: false }).waitFor({ timeout: 15000 });
  await captureState(page, viewport, 'guide', errors);
  if (errors.length) throw new Error(`${viewport}: ${errors.join('\n')}`);
  await context.close();
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`[Hermon review] Captured ${report.captures.length} states → ${out}`);
