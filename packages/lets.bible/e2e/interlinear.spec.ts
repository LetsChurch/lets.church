import { expect, test } from '@playwright/test';

// Suite R — Interlinear view. A reading mode (`?view=interlinear`) that stacks
// each English word over its original-language lemma, transliteration, Strong's,
// and gloss; tapping a word opens the study panel. See docs §23.
// (Original-language text is asserted via lang/dir attributes rather than literal
// strings — Hebrew vowel points vary by Unicode normalization.)

test('LB-IL-01 Greek interlinear renders stacked word cells', async ({
  page,
}) => {
  await page.goto('/bible/john/1?view=interlinear');
  // interlinear tokens are buttons carrying data-strong (reading words are spans)
  await expect(page.locator('button[data-strong]').first()).toBeVisible();
  const cell = page.locator('button', { hasText: 'G3056' }).first(); // "Word"
  await expect(cell).toBeVisible();
  await expect(cell).toContainText('Word'); // English surface
  await expect(cell).toContainText('lógos'); // transliteration
  await expect(cell.locator('[lang="el"]')).toBeVisible(); // Greek lemma
  // the version trigger reflects interlinear mode (shows the Aα indicator)
  await expect(
    page.locator('header').getByRole('button', { name: /Aα/ }),
  ).toBeVisible();
});

test('articles retain normal contrast in both word orders', async ({
  page,
}) => {
  await page.goto('/bible/john/1?view=interlinear');

  const originalArticle = page
    .locator('button[data-strong="G3588"] [lang="el"]')
    .first();
  await expect(originalArticle).toBeVisible();
  await expect(originalArticle).toHaveClass(/text-ink-strong/);

  await page.getByRole('button', { name: 'English (reverse)' }).click();
  const reverseArticle = page
    .locator('button[data-strong="G3588"] [lang="el"]')
    .first();
  await expect(reverseArticle).toBeVisible();
  await expect(reverseArticle).toHaveClass(/text-ink-strong/);
});

test('LB-IL-02 tapping an interlinear word opens the study panel', async ({
  page,
}) => {
  await page.goto('/bible/john/1?view=interlinear');
  await page.locator('button', { hasText: 'G2316' }).first().click(); // "God"
  const panel = page.getByLabel('Word study');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('G2316');
  await expect(panel).toContainText('Greek');
  await expect(panel).toContainText('John 1:1'); // verse context
});

test('selecting a word highlights its other occurrences', async ({ page }) => {
  await page.goto('/bible/john/1?view=interlinear');

  const originalOccurrences = page.locator('button[data-strong="G3056"]');
  expect(await originalOccurrences.count()).toBeGreaterThan(1);
  await expect(async () => {
    await originalOccurrences.first().click();
    await expect(originalOccurrences.first()).toHaveAttribute(
      'data-highlight',
      'selected',
      { timeout: 1000 },
    );
  }).toPass();
  const originalRelated = page
    .locator('button[data-strong="G3056"][data-highlight="related"]')
    .first();
  await expect(originalRelated).toBeVisible();
  await expect(originalRelated).toHaveClass(/0\.055/);

  await page.getByRole('button', { name: 'English (reverse)' }).click();
  const reverseRelated = page
    .locator('button[data-strong="G3056"][data-highlight="related"]')
    .first();
  await expect(reverseRelated).toBeVisible();

  const reverseOccurrences = page.locator('button[data-strong="G3056"]');
  await reverseOccurrences.first().click();
  await expect(reverseOccurrences.first()).toHaveAttribute(
    'data-highlight',
    'selected',
  );
  await expect(
    page
      .locator('button[data-strong="G3056"][data-highlight="related"]')
      .first(),
  ).toBeVisible();
});

test('LB-IL-10 selecting a word does not shift the layout', async ({
  page,
}) => {
  await page.goto('/bible/john/1?view=interlinear');
  const word = page.locator('button[data-strong="G3056"]').first(); // "Word"
  await expect(word).toBeVisible();
  const before = await word.boundingBox();
  await expect(async () => {
    await word.click();
    await expect(page.getByLabel('Word study')).toBeVisible({ timeout: 1000 });
  }).toPass();
  // Selected styling uses color only, so it must not change the token's size.
  const after = await word.boundingBox();
  expect(Math.round(after?.width ?? 0)).toBe(Math.round(before?.width ?? -1));
  expect(Math.round(after?.height ?? 0)).toBe(Math.round(before?.height ?? -1));
});

test('LB-IL-09 controls bar toggles which lines show', async ({ page }) => {
  await page.goto('/bible/john/1?view=interlinear');
  // the full-width controls bar (a second sticky header)
  await expect(page.getByText('Word order')).toBeVisible();
  await expect(page.getByText('Lines')).toBeVisible();
  // a Strong's number is shown, then hidden when the Strong's line toggles off
  // (locate by the stable data-strong attribute, not the toggleable text)
  const cell = page.locator('button[data-strong="G3056"]').first();
  await expect(cell).toContainText('G3056');
  await page.getByRole('button', { name: /Strong/ }).click();
  await expect(cell).not.toContainText('G3056');
});

test('LB-IL-03 Hebrew interlinear renders RTL lemmas', async ({ page }) => {
  await page.goto('/bible/genesis/1?view=interlinear');
  const cell = page.locator('button', { hasText: 'H7225' }).first();
  await expect(cell).toBeVisible();
  await expect(cell).toContainText('In the beginning'); // English surface
  const lemma = cell.locator('[lang="he"]');
  await expect(lemma).toBeVisible();
  await expect(lemma).toHaveAttribute('dir', 'rtl');
});

test('LB-IL-04 version picker launches and exits interlinear', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  // reading mode → no interlinear token buttons
  await expect(page.locator('button[data-strong]')).toHaveCount(0);
  // open the version picker → the BSB row's interlinear (Aα) button. Retry the
  // open: the desktop popover swaps in after hydration.
  const interlinearBtn = page.getByTitle(/BSB interlinear/);
  await expect(async () => {
    await page.locator('header').getByRole('button', { name: /BSB/ }).click();
    await expect(interlinearBtn).toBeVisible({ timeout: 1000 });
  }).toPass();
  await interlinearBtn.click();
  await expect(page).toHaveURL(/view=interlinear/);
  await expect(page.locator('button[data-strong]').first()).toBeVisible();
  // exit: open the picker and pick the translation normally (reading mode)
  const nameLink = page.getByRole('link', { name: /Berean Standard Bible/ });
  await expect(async () => {
    await page.locator('header').getByRole('button', { name: /BSB/ }).click();
    await expect(nameLink).toBeVisible({ timeout: 1000 });
  }).toPass();
  await nameLink.click();
  await expect(page).not.toHaveURL(/view=interlinear/);
  await expect(page.locator('button[data-strong]')).toHaveCount(0);
});
