import { expect, test } from '@playwright/test';

// Suite A — Smoke / health. See docs/letsbible-e2e-testing.md §4.

test('LB-SMOKE-01 home renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/lets\.bible/);
});

test('LB-SMOKE-02 reader renders a chapter', async ({ page }) => {
  await page.goto('/bible/john/1');
  // The big chapter heading (the ChapterPicker button also contains "Chapter 1").
  await expect(
    page.getByText('In the beginning was the Word'),
  ).toBeVisible();
});

test('LB-SMOKE-03 bare /bible redirects to a default passage', async ({
  page,
}) => {
  await page.goto('/bible');
  await expect(page).toHaveURL(/\/bible\/[a-z0-9-]+\/\d+/);
});

test('LB-SMOKE-05 no console errors on main routes', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  for (const route of ['/', '/bible/john/1', '/search', '/settings']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
