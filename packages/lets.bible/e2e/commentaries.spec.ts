import { expect, type Page, test } from '@playwright/test';

// Suite E — Commentaries tab (verse view). See docs §8 "Commentaries tab".

// Select a verse (one click opens the verse view; retry until hydrated, since a
// click before hydration is a no-op) and switch to the Commentaries tab.
async function openCommentaries(
  page: Page,
  book: string,
  chapter: number,
  verse: number,
) {
  await page.goto(`/bible/${book}/${chapter}`);
  const panel = page.getByLabel('Verse actions');
  await expect(async () => {
    await page.locator(`[data-verse="${verse}"]`).first().click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await panel.getByRole('tab', { name: 'Commentaries' }).click();
  return panel;
}

test('LB-CM-01 verse view has Verse and Commentaries tabs', async ({ page }) => {
  await page.goto('/bible/john/3');
  const panel = page.getByLabel('Verse actions');
  await expect(async () => {
    await page.locator('[data-verse="16"]').first().click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(panel.getByRole('tab', { name: 'Verse' })).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Commentaries' })).toBeVisible();
});

test('LB-CM-02 Commentaries tab lists works for the verse', async ({ page }) => {
  const panel = await openCommentaries(page, 'john', 3, 16);
  // John 3:16 is covered by multiple works (ordinal order starts with Calvin).
  await expect(
    panel.getByRole('button', { name: /Calvin's Commentaries/ }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: /Geneva Bible Translation Notes/ }),
  ).toBeVisible();
});

test('LB-CM-03 picking a work opens its detail with back link, body, and source', async ({
  page,
}) => {
  const panel = await openCommentaries(page, 'john', 3, 16);
  await panel.getByRole('button', { name: /Calvin's Commentaries/ }).click();
  await expect(
    panel.getByRole('button', { name: /All commentaries/ }),
  ).toBeVisible();
  // Distinctive Calvin-on-John-3:16 body text (not present in the verse text).
  await expect(
    panel.getByText(/Christ opens up the first cause/),
  ).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Source' })).toHaveAttribute(
    'href',
    /ccel\.org/,
  );
});

test('LB-CM-04 the followed work persists across verses', async ({ page }) => {
  const panel = await openCommentaries(page, 'john', 3, 16);
  await panel.getByRole('button', { name: /Calvin's Commentaries/ }).click();
  await expect(
    panel.getByText(/Christ opens up the first cause/),
  ).toBeVisible();

  // Select a different verse — the panel re-targets but stays on the
  // Commentaries tab, still following Calvin (now showing his note on v.17).
  await page.locator('[data-verse="17"]').first().click();
  await expect(panel.getByText('John 3:17')).toBeVisible();
  await expect(
    panel.getByRole('tab', { name: 'Commentaries', selected: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/For God sent not his Son into the world to condemn/),
  ).toBeVisible();
});

test('LB-CM-05 a section work shows an "on vv." range label', async ({
  page,
}) => {
  const panel = await openCommentaries(page, 'john', 3, 16);
  // Matthew Henry keys the whole passage at v.1, so on v.16 it spans vv. 1–21.
  await panel
    .getByRole('button', { name: /Matthew Henry's Complete Commentary/ })
    .click();
  await expect(panel.getByText(/on vv\. 1.21/)).toBeVisible();
});

test('LB-CM-07 the back link returns to the work list', async ({ page }) => {
  const panel = await openCommentaries(page, 'john', 3, 16);
  await panel.getByRole('button', { name: /Calvin's Commentaries/ }).click();
  await panel.getByRole('button', { name: /All commentaries/ }).click();
  // Back to the list — multiple works again, no back link.
  await expect(
    panel.getByRole('button', { name: /Geneva Bible Translation Notes/ }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: /All commentaries/ }),
  ).toHaveCount(0);
});

test('LB-OFF-CM-01 anonymous users can reach the library + offline commentaries', async ({
  page,
}) => {
  // A guest (no login) has a Library entry point in the header (reader + site
  // chrome), and the library hosts the per-work offline download UI.
  await page.goto('/bible/john/3');
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText('Offline commentaries')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download' }).first(),
  ).toBeVisible();
});

test('LB-CM-11 scripture references in a commentary render as reader links', async ({
  page,
}) => {
  const panel = await openCommentaries(page, 'john', 1, 1);
  await panel
    .getByRole('button', { name: /Matthew Henry's Complete Commentary/ })
    .click();
  // OSIS osisRef -> reader link (Matthew Henry's John 1:1 cites Prov. 25:1).
  await expect(
    panel.getByRole('link', { name: /Prov\. xxv\. 1/ }),
  ).toHaveAttribute('href', '/bible/proverbs/25?v=1');
});
