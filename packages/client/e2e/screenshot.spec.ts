import { test } from '@playwright/test';

/**
 * Run with: `npx playwright test e2e/screenshot.spec.ts --update-snapshots`
 * Saves visual baselines under e2e/__screenshots__/ for review.
 * Not part of the main smoke run — invoked manually when UI changes land.
 */
test('snapshot: planner page', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'e2e/__screenshots__/planner.png', fullPage: true });
});

test('snapshot: scheduler page', async ({ page }) => {
  await page.goto('/schedule');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'e2e/__screenshots__/scheduler.png', fullPage: true });
});
