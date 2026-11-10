import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:3491';
const out = process.env.REVIEW_OUTPUT ?? '/Users/vartny/.gemini/antigravity/brain/1e3e6b65-dacf-4f35-9151-d07848acd87b/confrontation-audit';
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

  await page.screenshot({ path: `${out}/01-confrontation-landing.png` });
  report.captures.push('01-confrontation-landing.png');

  // Ascend
  await page.getByRole('button', { name: /Ascend Mount Hermon/ }).click();
  await page.getByRole('button', { name: 'Pause expedition' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);

  // Standing on summit with wings and ivory linen
  await page.screenshot({ path: `${out}/02-archangel-summit-stance.png` });
  report.captures.push('02-archangel-summit-stance.png');

  // Take flight
  await page.getByRole('button', { name: 'Lift', exact: true }).click();
  await page.waitForTimeout(1200);

  // In flight with open wings
  await page.screenshot({ path: `${out}/03-archangel-wings-flight.png` });
  report.captures.push('03-archangel-wings-flight.png');

  // Draw flaming sword / context action (Space / Key 2)
  await page.keyboard.press('Digit2'); // Sword command
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/04-flaming-sword-strike.png` });
  report.captures.push('04-flaming-sword-strike.png');

  // Hold Shield of Faith (KeyV)
  await page.keyboard.down('KeyV');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/05-shield-of-faith.png` });
  report.captures.push('05-shield-of-faith.png');
  await page.keyboard.up('KeyV');

  // Rebuke / Divine Banishment Ring (Digit1)
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/06-divine-rebuke-ring.png` });
  report.captures.push('06-divine-rebuke-ring.png');

  // Turn around to see the Watcher encounter
  for (let k = 0; k < 6; k++) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: `${out}/07-watcher-encounter-vista.png` });
  report.captures.push('07-watcher-encounter-vista.png');

  // Mobile iPhone portrait test
  const mobileContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${base}/?shooter=1`, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Ascend Mount Hermon') && !b.disabled), null, { timeout: 60000 });
  await mobilePage.getByRole('button', { name: /Ascend Mount Hermon/ }).click();
  await mobilePage.getByRole('button', { name: 'Pause expedition' }).waitFor({ timeout: 30000 });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: `${out}/08-mobile-portrait-confrontation.png` });
  report.captures.push('08-mobile-portrait-confrontation.png');

  writeFileSync(`${out}/confrontation-report.json`, JSON.stringify(report, null, 2));
  console.log('Visual audit complete. Captures:', report.captures);
} catch (err) {
  console.error('Audit failed:', err);
} finally {
  await browser.close();
}
