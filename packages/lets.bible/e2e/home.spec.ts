import { expect, test } from '@playwright/test';

// Suite I — Homepage. See docs §12.

test('LB-HOME-03 verse of the day is a real DB verse linking into the reader', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Verse of the day')).toBeVisible();

  // The reference is the only verse deep-link on the initial page (search chips
  // link to /search). It points into the reader at that passage.
  const refLink = page.locator('a[href*="?v="]').first();
  await expect(refLink).toBeVisible();
  await expect(refLink).toHaveAttribute(
    'href',
    /^\/bible\/[a-z0-9-]+\/\d+\?v=\d+$/,
  );
  // Its label is a real "Book chapter:verse" reference (not a hardcoded blank).
  await expect(refLink).toHaveText(/\w+\s\d+:\d+/);
});
