import { expect, test } from '@playwright/test';

// Suite M / O — local-first library (guest, no auth) + the TanStack Form note
// editor. Each test gets a fresh context, so localStorage starts empty.
// See docs §16 (M), §19 (O).

test('LB-LIB-14 every highlight palette token resolves (no tree-shaking)', async ({
  page,
}) => {
  // Guard: highlights render via inline `var(--color-<key>)`, invisible to
  // Tailwind's scanner. A palette color must NOT live in @theme without a static
  // utility reference or it's tree-shaken and the highlight renders transparent
  // (this silently broke `sage`). Each token must resolve in light mode.
  await page.goto('/bible/john/1');
  const missing = await page.evaluate(() => {
    const keys = ['gold', 'sage', 'slate', 'rose', 'sky', 'plum'];
    const cs = getComputedStyle(document.documentElement);
    return keys.filter((k) => !cs.getPropertyValue(`--color-${k}`).trim());
  });
  expect(missing).toEqual([]);
});

test('LB-LIB-15 pre-existing highlight renders on a cold load (no click)', async ({
  page,
}) => {
  // A highlight lives only in localStorage (per-device), so it cannot be
  // server-rendered. The reader seeds the read snapshot synchronously from
  // localStorage on the first client render (readLocalRows) so the mark lands in
  // the first painted client frame instead of "flashing in" after the TanStack
  // DB collection's async hydration. Pre-seed before the page loads (no click),
  // then assert the verse renders highlighted — guards the cold-load seed parse.
  await page.addInitScript(() => {
    localStorage.setItem(
      'lb-highlights',
      JSON.stringify({
        's:JHN.3.16': {
          versionKey: 'x',
          data: {
            ref: 'JHN.3.16',
            book: 'JHN',
            chapter: 3,
            verse: 16,
            color: 'sage',
            updatedAt: 1,
            dirty: false,
            deleted: false,
          },
        },
      }),
    );
  });
  await page.goto('/bible/john/3');
  const verse = page.locator('[data-verse="16"]').first();
  await expect(verse).toHaveClass(/verse-highlight/);
  await expect
    .poll(() => verse.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe('rgba(0, 0, 0, 0)');
});

test('LB-LIB-10 selected + highlighted verse shows both (fill + gold underline)', async ({
  page,
}) => {
  await page.goto('/bible/john/3');
  const versePanel = page.getByLabel('Verse actions');
  // Select verse 16, then highlight it. Retry: a tap before hydration is a no-op.
  await expect(async () => {
    await page.locator('[data-verse="16"]').first().click();
    await expect(versePanel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await versePanel.getByRole('button', { name: 'Highlight sky' }).click();
  // While still selected, the verse shows BOTH: the highlight color fill (a
  // non-transparent background) and the selection's gold underline (box-shadow).
  // Poll the computed styles — the highlight applies on the next React render.
  const verse = page.locator('[data-verse="16"]').first();
  await expect(verse).toHaveClass(/verse-selected/);
  await expect
    .poll(() => verse.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe('rgba(0, 0, 0, 0)');
  await expect
    .poll(() => verse.evaluate((el) => getComputedStyle(el).boxShadow))
    .not.toBe('none');
});

test('LB-LIB-11 dark-mode highlight tints the text, not a background box', async ({
  page,
}) => {
  await page.goto('/bible/john/3');
  await page.emulateMedia({ colorScheme: 'dark' });
  const versePanel = page.getByLabel('Verse actions');
  await expect(async () => {
    await page.locator('[data-verse="16"]').first().click();
    await expect(versePanel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await versePanel.getByRole('button', { name: 'Highlight sky' }).click();
  // Switch focus away so the selection underline doesn't confuse the read, then
  // assert: in dark mode the highlight colors the TEXT and leaves no bg fill.
  const verse = page.locator('[data-verse="16"]').first();
  await expect(verse).toHaveClass(/verse-highlight/);
  await expect
    .poll(() => verse.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgba(0, 0, 0, 0)'); // no translucent box in dark mode
  // text is tinted (not the default ink color)
  const color = await verse.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe('rgb(232, 227, 215)'); // not --color-ink (dark)
});

test('LB-LIB-13 dark-mode highlight color overrides red-letter text', async ({
  page,
}) => {
  await page.goto('/bible/matthew/5'); // Beatitudes — words of Christ (red)
  await page.emulateMedia({ colorScheme: 'dark' });
  // Find a verse containing a red-letter run, select it, highlight it.
  const verseNum = await page.evaluate(() => {
    for (const v of document.querySelectorAll('[data-verse]')) {
      if (v.querySelector('.text-redletter')) {
        return v.getAttribute('data-verse');
      }
    }
    return null;
  });
  expect(verseNum).not.toBeNull();
  const verse = page.locator(`[data-verse="${verseNum}"]`).first();
  const versePanel = page.getByLabel('Verse actions');
  await expect(async () => {
    await verse.click();
    await expect(versePanel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await versePanel.getByRole('button', { name: 'Highlight sky' }).click();
  await expect(verse).toHaveClass(/verse-highlight/);
  // The red run now renders in the highlight color (= the verse span's color),
  // not the red-letter color.
  const red = verse.locator('.text-redletter').first();
  await expect
    .poll(async () => {
      const [runColor, verseColor] = await Promise.all([
        red.evaluate((el) => getComputedStyle(el).color),
        verse.evaluate((el) => getComputedStyle(el).color),
      ]);
      return runColor === verseColor;
    })
    .toBe(true);
});

test('LB-LIB-12 sign-out wipes all on-device data (anon data preserved)', async ({
  page,
}) => {
  // Seed a "just signed out" state: the prior-sign-in flag + account library data.
  await page.goto('/bible/john/3');
  await page.evaluate(() => {
    localStorage.setItem(
      'lb-highlights',
      JSON.stringify({
        's:JHN.3.16': {
          versionKey: 'x',
          data: {
            ref: 'JHN.3.16',
            book: 'JHN',
            chapter: 3,
            verse: 16,
            color: 'sky',
            updatedAt: 1,
            dirty: false,
            deleted: false,
          },
        },
      }),
    );
    localStorage.setItem('lb-merged', '1');
    localStorage.setItem('lb-was-signed-in', '1');
  });
  // Reload signed-out (no session in e2e): LocalSync detects the sign-out + wipes.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lb-highlights')))
    .toBeNull();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lb-was-signed-in')))
    .toBeNull();

  // Inverse: a never-signed-in visitor keeps their own local data.
  await page.evaluate(() => {
    localStorage.setItem(
      'lb-highlights',
      JSON.stringify({
        's:JHN.3.16': {
          versionKey: 'x',
          data: {
            ref: 'JHN.3.16',
            book: 'JHN',
            chapter: 3,
            verse: 16,
            color: 'gold',
            updatedAt: 1,
            dirty: true,
            deleted: false,
          },
        },
      }),
    );
    localStorage.removeItem('lb-was-signed-in');
    localStorage.removeItem('lb-merged');
  });
  await page.reload();
  await page.waitForTimeout(1200);
  expect(
    await page.evaluate(() => localStorage.getItem('lb-highlights')),
  ).toContain('JHN.3.16');
});

test('LB-LIB-05 guest highlight persists across reload + shows in Library', async ({
  page,
}) => {
  await page.goto('/bible/john/3');
  // A direct ?v= only scrolls + flashes now (LB-READ-08); tap the verse to open
  // verse view. Retry: a tap before hydration is a no-op.
  const sage = page.locator('button[aria-label="Highlight sage"]');
  await expect(async () => {
    await page.locator('[data-verse="16"]').first().click();
    await expect(sage).toBeVisible({ timeout: 1000 });
  }).toPass();
  await sage.click();

  // Persisted locally (no sign-in).
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('lb-highlights') ?? ''),
    )
    .toContain('JHN.3.16');

  await page.reload();
  await page.goto('/library');
  await expect(
    page.getByRole('link', { name: /John 3:16/ }),
  ).toBeVisible();
});

test('LB-LIB-06 reading records "Continue reading"/Recent locally', async ({
  page,
}) => {
  await page.goto('/bible/philippians/4');
  // Reading is recorded by an effect — wait for it to persist before leaving.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lb-progress') ?? ''))
    .toContain('PHP');
  await page.goto('/library');
  await expect(
    page.getByRole('link', { name: /Philippians 4/ }),
  ).toBeVisible();
});

test('LB-FORM note editor: Save disabled while empty, then saves', async ({
  page,
}) => {
  await page.goto('/bible/john/1');
  // A direct ?v= only scrolls + flashes now (LB-READ-08); tap verse 2 to open the
  // verse view. Retry: a tap before hydration is a no-op.
  const addNote = page.getByRole('button', { name: /Add note/ });
  await expect(async () => {
    await page.locator('[data-verse="2"]').first().click();
    await expect(addNote).toBeVisible({ timeout: 1000 });
  }).toPass();
  // Then open the note editor (retried separately so a slow panel open doesn't
  // race the Add-note click).
  const save = page.getByRole('button', { name: 'Save' });
  await expect(async () => {
    await addNote.click();
    await expect(save).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(save).toBeDisabled(); // onMount validation: empty note

  await page.locator('textarea').fill('A test note.');
  await expect(save).toBeEnabled();
  await save.click();

  // The verse gains a note marker, and the note persists locally.
  await expect(page.getByText('✎').first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lb-notes') ?? ''))
    .toContain('A test note.');
});
