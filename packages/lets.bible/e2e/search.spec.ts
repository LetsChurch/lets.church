import { expect, test } from '@playwright/test';

// Suite G/H — Search autocomplete + results. See docs §10–11.

test('LB-SR-01 phrase search ranks the exact match first', async ({ page }) => {
  await page.goto('/search?q=fruit of the Spirit');
  const firstHit = page.locator('ul a').first();
  await expect(firstHit).toContainText('Galatians 5:22');
  // The matched phrase is highlighted.
  await expect(page.locator('mark').first()).toBeVisible();
});

test('LB-SR-02 reference query shows a go-to-reference card', async ({
  page,
}) => {
  await page.goto('/search?q=John 3:16');
  const card = page.getByRole('link', { name: /Go to reference/i });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('href', /\/bible\/john\/3\?v=16/);
});

test('LB-AC-05 autocomplete reference jump scrolls to the verse', async ({
  page,
}) => {
  // Regression: clicking a reference suggestion must navigate AND scroll the
  // verse into view — the autocomplete's go() sets resetScroll:false for a ?v=
  // target so the router's scroll restoration doesn't reset to the top.
  await page.goto('/');
  const input = page.getByPlaceholder(/Search a reference/i);
  await expect(async () => {
    await input.fill('');
    await input.pressSequentially('John 3:16', { delay: 100 });
    await expect(input).toHaveValue('John 3:16');
  }).toPass({ timeout: 20000 });
  const refOption = page
    .getByRole('option')
    .filter({ hasText: 'Reference' })
    .first();
  await expect(refOption).toBeVisible({ timeout: 15000 });
  await expect(async () => {
    await refOption.click();
    await expect(page).toHaveURL(/\/bible\/john\/3\?v=16/, { timeout: 2000 });
  }).toPass();
  await expect(page.locator('[data-verse="16"]')).toBeInViewport();
});

test('LB-AC autocomplete mixes entry kinds', async ({ page }) => {
  await page.goto('/search');
  const input = page.getByPlaceholder(/Search a reference/i);
  // Real typing drives Base UI's dropdown open, but early keystrokes get dropped
  // when the page is busy under parallel load — so retry typing until the input
  // actually holds the query.
  await expect(async () => {
    await input.fill('');
    await input.pressSequentially('john 3', { delay: 100 });
    await expect(input).toHaveValue('john 3');
  }).toPass({ timeout: 20000 });
  // Suggestions come from a debounced Elasticsearch query. Mixed entry kinds:
  // a reference row + the catch-all "Search" row.
  await expect(
    page.getByRole('option').filter({ hasText: 'John 3' }).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole('option').filter({ hasText: /Search/ }).first(),
  ).toBeVisible();
});
