import { expect, test } from '@playwright/test';

// Suite B — Reading experience. See docs/letsbible-e2e-testing.md §5.

test('LB-READ-01 John 1 opens with verse 1 text', async ({ page }) => {
  await page.goto('/bible/john/1');
  await expect(page.getByText('In the beginning was the Word')).toBeVisible();
});

test('LB-READ-12 reader header has a sign-in affordance when signed out', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  await expect(
    page.locator('header').getByRole('link', { name: 'Sign in' }),
  ).toBeVisible();
});

test('LB-READ-08 deep link scrolls to + flashes the verse (no selection)', async ({
  page,
}) => {
  await page.goto('/bible/john/3?v=16');
  const verse = page.locator('[data-verse="16"]').first();
  // The flash highlight is applied on load (transient — fades out ~1.8s, so read
  // the class once rather than with a retrying matcher).
  expect(await verse.getAttribute('class')).toContain('verse-flash');
  // The verse is scrolled to the center of the viewport (the scroll runs after
  // mount, so let toBeInViewport retry until it lands).
  await expect(verse).toBeInViewport();
  // A direct ?v= visit does NOT select the verse or open the study panel.
  await expect(page.locator('[data-verse-selected="true"]')).toHaveCount(0);
  await expect(page.getByLabel('Verse actions')).toHaveCount(0);
});

test('LB-READ-11 verse ref from search results scrolls into view (SPA nav)', async ({
  page,
}) => {
  // Regression: on client-side navigation TanStack Router's scroll restoration
  // resets scroll to top after the route renders, so the deep-link scroll must
  // be re-asserted to win. Clicking the search "Go to reference" card must land
  // the verse in the viewport, not at the top.
  await page.goto('/search?q=John%203%3A16');
  const ref = page.locator('a[href*="/bible/john/3?v=16"]').first();
  await expect(async () => {
    await ref.click();
    await expect(page).toHaveURL(/\/bible\/john\/3\?v=16/, { timeout: 2000 });
  }).toPass();
  await expect(page.locator('[data-verse="16"]')).toBeInViewport();
});

test('LB-READ-07 next-chapter link navigates across the canon', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  // Ensure the reader is rendered, then click the next-chapter link. Retry the
  // click+navigation: a click before hydration is a no-op, and client-side nav
  // doesn't fire a `load` event.
  const next = page.locator('a[href*="/bible/john/2"]').first();
  await expect(next).toBeVisible();
  await expect(async () => {
    await next.click();
    await expect(page).toHaveURL(/\/bible\/john\/2/, { timeout: 3000 });
  }).toPass();
  await expect(
    page.getByText('On the third day a wedding took place'),
  ).toBeVisible();
});
