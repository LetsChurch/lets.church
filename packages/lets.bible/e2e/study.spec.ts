import { expect, type Page, test } from '@playwright/test';

// Suite F — Word study panel. See docs §9.

// Select a word with two deliberate clicks (first selects the verse, second
// selects the word — there's no double-click gesture). Each click re-locates the
// word, so the panel opening (which shifts the reading) doesn't mis-target the
// second click. Retries because the click handler only works after hydration.
async function openStudy(page: Page, strong: string) {
  const word = page.locator(`[data-strong="${strong}"]`).first();
  const panel = page.getByLabel('Word study');
  await expect(async () => {
    await word.click();
    await word.click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  return panel;
}

test('LB-WS-01 double-click a word opens the Greek study panel', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  const panel = await openStudy(page, 'G2316'); // "God"
  await expect(panel.getByText('G2316')).toBeVisible();
  await expect(panel.getByText('Greek')).toBeVisible();
});

test('LB-WS-02 Hebrew word resolves in the study panel', async ({ page }) => {
  await page.goto('/bible/genesis/1');
  const panel = await openStudy(page, 'H7225'); // "In the beginning"
  await expect(panel.getByText('H7225')).toBeVisible();
  await expect(panel.getByText('Hebrew')).toBeVisible();
});

test('LB-VS-07 panel verse words open the word study', async ({ page }) => {
  await page.goto('/bible/john/1');
  const versePanel = page.getByLabel('Verse actions');
  // Select verse 1 (verse view). Retry: a click before hydration is a no-op.
  await expect(async () => {
    await page.locator('[data-verse="1"]').first().click();
    await expect(versePanel).toBeVisible({ timeout: 1000 });
  }).toPass();
  // The panel's verse text renders each word as a role=button; clicking one
  // opens that word's study (hierarchical nav: verse → word).
  await versePanel.getByRole('button', { name: /God/ }).first().click();
  const wordPanel = page.getByLabel('Word study');
  await expect(wordPanel).toBeVisible();
  await expect(wordPanel).toContainText('Greek');
});

test('LB-VS-08 verse view lists footnotes, cross-refs, and source-text', async ({
  page,
}) => {
  // Footnotes: John 1:5 has footnote "a" ("Or comprehended").
  await page.goto('/bible/john/1');
  const versePanel = page.getByLabel('Verse actions');
  await expect(async () => {
    await page.locator('[data-verse="5"]').first().click();
    await expect(versePanel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(versePanel.getByText('Footnotes')).toBeVisible();
  await expect(versePanel.getByText('Or comprehended')).toBeVisible();

  // Cross-references + source text: Matthew 1:23 quotes Isaiah 7:14.
  await page.goto('/bible/matthew/1');
  const panel2 = page.getByLabel('Verse actions');
  await expect(async () => {
    await page.locator('[data-verse="23"]').first().click();
    await expect(panel2).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(
    panel2.getByText('Cross-references', { exact: true }),
  ).toBeVisible();
  await expect(
    panel2.getByRole('link', { name: 'Isaiah 7:14' }),
  ).toHaveAttribute('href', '/bible/isaiah/7?v=14');
  await expect(panel2.getByText('Old Testament quotation')).toBeVisible();
});

test('LB-WS-12 word view shows verse context and returns to it (mutually exclusive)', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  const panel = await openStudy(page, 'G2316'); // "God" in John 1:1
  // The word view shows the verse it came from, with the verse text.
  const context = panel.getByRole('button', { name: /John 1:1/ });
  await expect(context).toBeVisible();
  await expect(panel).toContainText('In the beginning was the Word');

  // Clicking the context returns to the verse view — the word is deselected
  // (mutually exclusive), so the word panel is gone and verse actions show.
  await context.click();
  await expect(page.getByLabel('Word study')).toHaveCount(0);
  const verse = page.getByLabel('Verse actions');
  await expect(verse).toBeVisible();
  await expect(verse.getByRole('button', { name: 'Compare' })).toBeVisible();
});

test('LB-WS-13 reading column is centered while idle (panel mounts on selection)', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  // Nothing selected → no study rail mounted, so the reading column is centered
  // in the viewport (no reserved gutter).
  await expect(page.getByLabel('Word study')).toHaveCount(0);
  await expect(page.getByLabel('Verse actions')).toHaveCount(0);
  const gaps = await page
    .locator('.max-w-\\[660px\\]')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: window.innerWidth - r.right };
    });
  expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(2);
});

test('LB-WS-14 word hover affordance only when a click would study it', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  const word = page.locator('span[data-strong="G2316"]').first(); // "God", v1
  // Idle: a click would select the verse, not the word → no word-hover affordance.
  await expect(word).not.toHaveClass(/cursor-pointer/);
  // Select the verse; now a click on the word would study it → affordance appears.
  await word.click();
  await expect(word).toHaveClass(/cursor-pointer/);
});
