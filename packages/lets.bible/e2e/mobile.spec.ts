import { expect, type Locator, type Page, test } from '@playwright/test';

// Suite Q — Mobile responsiveness. Below the `lg` breakpoint the study panel and
// the reader-nav pickers become Base UI bottom-sheet drawers, the reader chrome
// collapses, and words are studied with a press-and-hold. See docs §22.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const drawer = (page: Page) => page.locator('[data-drawer]');

// Press-and-hold a word (touch). The word's onSelect fires on the long-press
// timer, before the finger lifts.
async function longPress(page: Page, target: Locator) {
  const init = {
    pointerType: 'touch',
    bubbles: true,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
  };
  await target.dispatchEvent('pointerdown', init);
  await page.waitForTimeout(550);
  await target.dispatchEvent('pointerup', init);
}

// Press-and-hold a word until its study drawer opens. Retries because the word's
// pointer handlers only fire after hydration, which can land after the first
// press on a cold page.
async function studyWord(page: Page, strong: string) {
  const sheet = drawer(page);
  await expect(async () => {
    await longPress(page, page.locator(`[data-strong="${strong}"]`).first());
    await expect(sheet).toContainText(strong, { timeout: 800 });
  }).toPass();
  return sheet;
}

test('LB-MOB-01 study panel opens as a bottom drawer (verse view)', async ({
  page,
}) => {
  await page.goto('/bible/john/3');
  const sheet = drawer(page);
  // A direct ?v= only scrolls + flashes now (LB-READ-08); tap the verse to open
  // the study panel. Retry: a tap before hydration is a no-op.
  await expect(async () => {
    await page.locator('[data-verse="16"]').first().click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(sheet).toContainText('John 3:16');
  await expect(
    sheet.getByText(/For God so loved the world/),
  ).toBeVisible();
  // verse actions are all visible
  await expect(sheet.getByRole('button', { name: 'Highlight gold' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Copy' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Compare' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Add note' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Study a word/ })).toBeVisible();

  // the desktop side rail is never rendered on mobile
  await expect(page.locator('aside[aria-label="Verse actions"]')).toHaveCount(0);

  // Esc dismisses it
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
});

test('LB-MOB-02 press-and-hold a word opens the word study drawer', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  await expect(page.locator('[data-strong="G2316"]').first()).toBeVisible();
  const sheet = await studyWord(page, 'G2316'); // "God"
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('God');
  await expect(sheet).toContainText('Greek');
  // verse context is shown and visible
  await expect(sheet.getByText('In the beginning was the Word')).toBeVisible();
  await expect(sheet.getByText('Other occurrences')).toBeVisible();
});

test('LB-MOB-03 word view returns to the verse view in the same drawer', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  const sheet = await studyWord(page, 'G2316');
  // tap the verse-context button → verse view (mutually exclusive)
  await sheet.getByRole('button', { name: /John 1:1/ }).click();
  await expect(sheet.getByRole('button', { name: 'Add note' })).toBeVisible();
  await expect(sheet).not.toContainText('G2316');
});

test('LB-MOB-04 chapter picker opens as a bottom drawer', async ({ page }) => {
  await page.goto('/bible/john/3');
  await page.locator('header').getByRole('button', { name: /Chapter 3/ }).click();
  const sheet = drawer(page);
  await expect(sheet).toBeVisible();
  const ch9 = sheet.getByRole('link', { name: '9', exact: true });
  await expect(ch9).toBeVisible();
  await ch9.click();
  await expect(page).toHaveURL(/\/bible\/john\/9/);
  await expect(drawer(page)).toHaveCount(0);
});

test('LB-MOB-05 book picker opens as a bottom drawer', async ({ page }) => {
  await page.goto('/bible/john/3');
  await page.locator('header').getByRole('button', { name: /John/ }).click();
  const sheet = drawer(page);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Old Testament')).toBeVisible();
  await expect(sheet.getByText('New Testament')).toBeVisible();
  const genesis = sheet.getByRole('link', { name: 'Genesis' });
  await expect(genesis).toBeVisible();
  await genesis.click();
  await expect(page).toHaveURL(/\/bible\/genesis\/1/);
  await expect(drawer(page)).toHaveCount(0);
});

test('LB-MOB-06 translation picker opens as a bottom drawer', async ({
  page,
}) => {
  await page.goto('/bible/john/3');
  await page.locator('header').getByRole('button', { name: /BSB/ }).click();
  const sheet = drawer(page);
  await expect(sheet).toBeVisible();
  const msb = sheet.getByRole('link', { name: /MSB/ });
  await expect(msb).toBeVisible();
  await msb.click();
  await expect(page).toHaveURL(/translation=MSB/);
  await expect(drawer(page)).toHaveCount(0);
});

test('LB-MOB-07 reader chrome collapses on mobile', async ({ page }) => {
  await page.goto('/bible/john/3');
  const header = page.locator('header');
  // the pickers + the interlinear toggle are still reachable
  await expect(
    header.getByRole('button', { name: /Chapter 3/ }),
  ).toBeVisible();
  // the version picker trigger is reachable (compare + interlinear live inside it)
  await expect(header.getByRole('button', { name: /BSB/ })).toBeVisible();
  // compare + interlinear are no longer header controls
  await expect(header.getByRole('link', { name: 'Compare' })).toHaveCount(0);
});

test('LB-MOB-08 compare view stays readable on mobile', async ({ page }) => {
  await page.goto('/compare/john/3');
  const row = page.locator('[data-compare-verse="1"]');
  await expect(row).toBeVisible();
  // both translation columns render and are visible
  const cols = row.locator('p');
  await expect(cols).toHaveCount(2);
  await expect(cols.first()).toBeVisible();
  await expect(cols.nth(1)).toBeVisible();
  await expect(cols.first()).toContainText('Now there was a man');
  // no horizontal overflow: the document isn't wider than the viewport
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('LB-MOB-09 homepage fits the phone viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'lets.bible' }).first()).toBeVisible();
  await expect(page.getByPlaceholder(/Search a reference/)).toBeVisible();
  await expect(page.getByText('Verse of the day')).toBeVisible();
  // the ⌘K hint is present but hidden on mobile
  await expect(page.getByText('⌘K')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('LB-MOB-12 interlinear word opens the study drawer on mobile', async ({
  page,
}) => {
  await page.goto('/bible/genesis/1?view=interlinear');
  const cell = page.locator('button', { hasText: 'H430' }).first(); // "God"
  await expect(cell).toBeVisible();
  await cell.click();
  const sheet = drawer(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('God');
  await expect(sheet).toContainText('H430');
  await expect(sheet).toContainText('Hebrew');
});
