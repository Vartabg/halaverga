// Screenshots of the landing page and the pause menu at four viewports, from a running production server.
// Usage: node shoot.mjs <base url> <out dir> <tag>   (tag: before | after). System Chrome, desktop emulation: not an iPhone.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node shoot.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const VIEWS = [
  { name: '1440x1000', width: 1440, height: 1000, touch: false },
  { name: '390x844', width: 390, height: 844, touch: true },
  { name: '844x390', width: 844, height: 390, touch: true },
  { name: '320x568', width: 320, height: 568, touch: true },
];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const watchdog = setTimeout(() => { console.error('watchdog: 240 s, giving up'); process.exit(3); }, 240000);
try {
  for (const v of VIEWS) {
    const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.touch, hasTouch: v.touch, deviceScaleFactor: v.touch ? 2 : 1 });
    const page = await context.newPage();
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const begin = page.getByRole('button', { name: 'Begin expedition' });
    await begin.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('button[disabled]')?.textContent?.includes('Preparing'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${tag}-landing-${v.name}.jpg`, type: 'jpeg', quality: 72 });
    if (v.touch) await begin.tap(); else await begin.click();
    const pause = page.getByRole('button', { name: 'Pause expedition' });
    await pause.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(800);
    if (v.touch) await pause.tap(); else await pause.click();
    await page.getByRole('region', { name: 'Expedition paused' }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('controls-row').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${tag}-pause-${v.name}.jpg`, type: 'jpeg', quality: 72 });
    await context.close();
    console.log(`${tag} ${v.name}: landing and pause saved`);
  }
} finally { clearTimeout(watchdog); await browser.close(); }
