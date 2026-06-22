import { expect, test } from '@playwright/test';

// Suite P — Compare translations. See docs §<compare>.

test('LB-CMP-01 compare shows verse-aligned columns for both translations', async ({
  page,
}) => {
  await page.goto('/compare/john/1');
  // Column headers for both translations.
  await expect(page.getByText('BSB')).toBeVisible();
  await expect(page.getByText('MSB')).toBeVisible();
  // Verse 1 text appears in both columns (same wording in John 1:1).
  await expect(
    page.getByText('In the beginning was the Word'),
  ).toHaveCount(2);
});

test('LB-CMP-02 version picker Compare opens the compare view', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  // Compare lives in the version picker, on each non-current translation row.
  // Retry opening the picker — the desktop popover swaps in after hydration.
  const compare = page.getByRole('link', { name: 'Compare' });
  await expect(async () => {
    await page.locator('header').getByRole('button', { name: /BSB/ }).click();
    await expect(compare).toBeVisible({ timeout: 1000 });
  }).toPass();
  await compare.click();
  await expect(page).toHaveURL(/\/compare\/john\/1/);
  await expect(page.getByText('· Compare')).toBeVisible();
});

test('LB-CMP-03 verse-toolbar Compare jumps to that verse', async ({ page }) => {
  await page.goto('/bible/john/1');
  // A direct ?v= only scrolls + flashes now (LB-READ-08); tap verse 3 to open the
  // verse view, then Compare. Retry: a tap before hydration is a no-op.
  const compare = page.getByRole('button', { name: 'Compare' });
  await expect(async () => {
    await page.locator('[data-verse="3"]').first().click();
    await expect(compare).toBeVisible({ timeout: 1000 });
  }).toPass();
  await compare.click();
  await expect(page).toHaveURL(/\/compare\/john\/1\?v=3/);
  // The target verse row is highlighted.
  await expect(page.locator('[data-compare-verse="3"]')).toBeVisible();
});

test('LB-CMP-04 compare back link returns to the reader', async ({ page }) => {
  await page.goto('/compare/john/1');
  await page.getByRole('link', { name: /Read/ }).click();
  await expect(page).toHaveURL(/\/bible\/john\/1/);
});
