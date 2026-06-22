import { expect, test } from '@playwright/test';

// Suite L — Source-text overlays. See docs §15.

test('LB-OV-01 divine name carries the source-text overlay', async ({
  page,
}) => {
  await page.goto('/bible/genesis/2');
  const lord = page
    .locator('span[data-strong="H3068"]', { hasText: 'LORD' })
    .first();
  // Deterministic: the divine name renders small-caps + a dotted underline
  // overlay. (The hover tooltip content "Literally YHWH…" is checked manually —
  // Base UI's hover tooltip doesn't open reliably under synthetic hover; see
  // LB-OV in the test plan.)
  await expect(lord).toHaveClass(/decoration-dotted/);
  await expect(lord).toHaveClass(/small-caps/);
});

test('LB-OV-13 OT quotation is verse-selectable and word-studyable', async ({
  page,
}) => {
  // Matthew 1:23 ("Behold, the virgin…") is an OT-quotation poetry block that
  // continues verse 23 across several lines. Selection used to fail here because
  // the quote runs carried no verse number; the parser now carries it.
  await page.goto('/bible/matthew/1');
  const behold = page.locator('[data-strong="G2400"]').first(); // "Behold"
  // The quote word carries the dotted-underline source overlay.
  await expect(behold).toHaveClass(/decoration-dotted/);

  // A single click selects the whole verse (the toolbar appears). Retry because
  // the line's click handler only works after hydration.
  await expect(async () => {
    await behold.click();
    await expect(page.getByText('Verse 23 selected')).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  // The verse spans several poetry lines; each is highlighted as selected.
  await expect(
    page.locator('[data-verse-selected="true"]').first(),
  ).toBeVisible();

  // The verse is selected, so a click on the word now selects it (opens the
  // study panel in word view) — no double-click gesture.
  const panel = page.getByLabel('Word study');
  await expect(async () => {
    await behold.click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(panel.getByText('G2400')).toBeVisible();
});

test('LB-OV-14 OT-quotation hover card links to its source passage', async ({
  page,
}) => {
  await page.goto('/bible/matthew/1');
  const behold = page.locator('[data-strong="G2400"]').first(); // "Behold"
  // Hovering the quote reveals a Base UI PreviewCard linking to the source
  // (Isaiah 7:14). PreviewCard's popup is hoverable, so the link is clickable —
  // the whole point of using it over a Tooltip. (Retry the hover open.)
  const sourceLink = page.locator('a[href="/bible/isaiah/7?v=14"]');
  await expect(async () => {
    await behold.hover();
    await expect(sourceLink).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(sourceLink).toHaveText('Isaiah 7:14');
  // The link is actually clickable (move into the hoverable card and click).
  await sourceLink.click();
  await expect(page).toHaveURL(/\/bible\/isaiah\/7\?v=14/);
});

test('LB-OV divine name renders as Yahweh per preference', async ({ page }) => {
  // Set the preference via the lb-prefs cookie (read on SSR + client).
  await page.context().addCookies([
    {
      name: 'lb-prefs',
      value: encodeURIComponent(JSON.stringify({ divineName: 'yahweh' })),
      url: 'http://localhost:4001',
    },
  ]);
  await page.goto('/bible/genesis/2');
  // Divine name renders as "Yahweh" (the word span; footnote markers split the
  // text node, so don't assert the full "that Yahweh God" phrase).
  await expect(page.getByText('Yahweh').first()).toBeVisible();
});
