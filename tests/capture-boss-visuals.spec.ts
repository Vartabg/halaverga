import { test } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/vartny/.gemini/antigravity/brain/1e3e6b65-dacf-4f35-9151-d07848acd87b';

test('capture high-fidelity Blender models and dopamine combat visual proof', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });

  // Click "Ascend Mount Hermon" to enter active gameplay
  const ascendButton = page.locator('button:has-text("Ascend Mount Hermon")').first();
  await ascendButton.waitFor({ state: 'visible', timeout: 5000 });
  await ascendButton.click();
  await page.waitForTimeout(800);

  // Dismiss intro dialogue to unleash Semjaza into active combat
  const continueBtn = page.locator('button:has-text("Continue")').first();
  if (await continueBtn.isVisible()) {
    await continueBtn.click();
  }

  // Move forward toward Semjaza with KeyW
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1400);
  await page.keyboard.up('KeyW');

  // Trigger Melee Strike with Spear of Dawn (KeyJ)
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(80);

  // Capture 1: Showdown on Mount Hermon summit with Blender Semjaza & Spear
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'blender-boss-showdown.png'),
  });

  // Chain attack combo 2 (thrust) and 3 (overhead cleave) to deal posture stagger
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(160);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(100);

  // Capture 2: Melee strike with radiant golden swing arc and hitstop
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'blender-spear-thrust.png'),
  });

  // Capture 3: Combat engagement and Posture Stagger HUD
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'blender-stagger-hud.png'),
  });

  // Mobile viewport capture (iPhone 15 Pro)
  await page.setViewportSize({ width: 393, height: 852 });
  await page.waitForTimeout(1000);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'blender-mobile-portrait.png'),
  });
});
