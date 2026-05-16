import { test, expect } from '@playwright/test';

const CONSOLE_IGNORE = [
  /Download the React DevTools/,
  /React Router Future Flag Warning/,
];

test.describe('DegreeForge smoke', () => {
  test('planner page renders without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (CONSOLE_IGNORE.some((re) => re.test(text))) return;
      consoleErrors.push(text);
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('scheduler page renders', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.locator('#root')).not.toBeEmpty();
  });
});
