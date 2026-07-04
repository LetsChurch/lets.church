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

// Requires the v3 index built WITH embeddings + OPENAI_API_KEY configured on the
// server (the hybrid semantic branch); degrades to lexical-only otherwise, where
// this paraphrase does NOT surface Genesis 50:20 and the test would fail.
test('LB-SR-12 hybrid search surfaces a paraphrased verse', async ({ page }) => {
  // "they meant bad but God meant good" shares almost no words with Genesis
  // 50:20 ("what you intended against me for evil, God intended for good") — a
  // lexical-only search misses it entirely. The semantic branch of hybrid search
  // surfaces it on the first page of results.
  await page.goto('/search?q=they meant bad but God meant good');
  const genesis = page
    .locator('ul a')
    .filter({ hasText: 'Genesis 50:20' })
    .first();
  await expect(genesis).toBeVisible({ timeout: 15000 });
  await expect(genesis).toHaveAttribute('href', /\/bible\/genesis\/50\?v=20/);
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
