import { expect, type Page } from '@playwright/test';
// A dart from a demon beyond the sword's reach is only deflected (no count), so the press is retried at the next warning.
/** Counters one demon attack in the running encounter and checks the dive. */
export async function counterOnce(page: Page) {
  const hud = page.getByTestId('battle-hud'), prompt = page.getByTestId('counter-prompt'), telemetry = page.getByTestId('flight-telemetry');
  for (let tries = 0; tries < 4 && (await hud.getAttribute('data-counters')) === '0'; tries++) {
    await expect(prompt).toBeVisible({ timeout: 45000 });
    await page.keyboard.press('KeyC');
    await expect.poll(async () => (await hud.getAttribute('data-counters')) !== '0' || !(await prompt.isVisible()), { timeout: 2000 }).toBe(true);
  }
  await expect(hud).toHaveAttribute('data-counters', '1');
  // Slow motion shows at once (about .8 s): the HUD vignette.
  await expect(page.locator('[class*="slow"]').first()).toBeAttached({ timeout: 1000 });
  // The credited counter always dives: strike speed is far above flight speed.
  await expect.poll(async () => Number(await telemetry.getAttribute('data-speed')), { timeout: 3000 }).toBeGreaterThan(40);
}
