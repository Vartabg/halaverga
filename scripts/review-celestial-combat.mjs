import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:3489';
const out = process.env.REVIEW_OUTPUT ?? '/Users/vartny/.gemini/antigravity/brain/1e3e6b65-dacf-4f35-9151-d07848acd87b';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-gl=angle', '--use-angle=metal'],
});

const report = { base, captures: [], errors: [] };

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  page.on('pageerror', err => report.errors.push(err.message));

  console.log('Navigating to', base);
  await page.goto(`${base}/?shooter=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Ascend Mount Hermon') && !b.disabled), null, { timeout: 60000 });

  await page.screenshot({ path: `${out}/celestial-landing.png` });
  report.captures.push('celestial-landing.png');

  // Ascend
  await page.getByRole('button', { name: /Ascend Mount Hermon/ }).click();
  await page.getByRole('button', { name: 'Pause expedition' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);

  // Take flight
  await page.getByRole('button', { name: 'Lift', exact: true }).click();
  await page.waitForTimeout(1000);

  // Capture archangel in flight with covenant bracer
  await page.screenshot({ path: `${out}/celestial-flight.png` });
  report.captures.push('celestial-flight.png');

  // Aim at sky / turn to look for sentinels
  await page.keyboard.down('KeyE'); // aim toggle or right click
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/celestial-aim-bracer.png` });
  report.captures.push('celestial-aim-bracer.png');
  await page.keyboard.up('KeyE');

  // Smite attack
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/celestial-smite-fire.png` });
  report.captures.push('celestial-smite-fire.png');
  await page.keyboard.up('Space');

  // Turn around to view sentinels
  for (let k = 0; k < 6; k++) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: `${out}/celestial-sentinel-ophanim.png` });
  report.captures.push('celestial-sentinel-ophanim.png');

  writeFileSync(`${out}/celestial-combat-report.json`, JSON.stringify(report, null, 2));
  console.log('Review completed successfully. Captures:', report.captures);
} catch (err) {
  console.error('Review failed:', err);
} finally {
  await browser.close();
}
