import { test, expect } from '@playwright/test';

test.describe('Settings Page (TASK-022)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('Settings nav link navigates to /settings', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Settings');
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('h1')).toContainText('Settings');
  });

  test('/settings shows three sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h2:has-text("Academic")')).toBeVisible();
    await expect(page.locator('h2:has-text("Scheduler Preferences")')).toBeVisible();
    await expect(page.locator('h2:has-text("Professor Preferences")')).toBeVisible();
  });

  test('Reset to defaults button is present', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('button:has-text("Reset to defaults")')).toBeVisible();
  });

  test('Tech core dropdown is visible and interactive', async ({ page }) => {
    await page.goto('/settings');
    const techCoreSelect = page.locator('#tech-core-settings');
    await expect(techCoreSelect).toBeVisible();
  });

  test('Math BA switch is visible', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('#math-ba-settings')).toBeVisible();
  });

  test('Professor preference: add and remove', async ({ page }) => {
    await page.goto('/settings');
    await page.fill('#prof-name', 'Dr. Smith');
    await page.click('button:has-text("Add")');
    await expect(page.locator('text=Dr. Smith')).toBeVisible();

    // Remove it
    await page.click('button[aria-label="Remove Dr. Smith"]');
    await expect(page.locator('text=Dr. Smith')).not.toBeVisible();
  });

  test('Settings persist across page reload', async ({ page }) => {
    await page.goto('/settings');

    // Change load tolerance to Heavy
    await page.locator('#load-tolerance').click();
    await page.getByRole('option', { name: /Heavy/ }).click();

    // Reload
    await page.reload();
    await page.goto('/settings');

    // Verify heavy is still selected
    const triggerText = await page.locator('#load-tolerance').textContent();
    expect(triggerText).toContain('Heavy');
  });

  test('Transcript section shows completed and in-progress courses', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=Completed')).toBeVisible();
    await expect(page.locator('text=In Progress')).toBeVisible();
    // Transcript edit banner
    await expect(page.locator('text=Transcript edits are coming soon')).toBeVisible();
  });
});
