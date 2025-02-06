import { chromium } from 'playwright';
import { pEvent } from 'p-event';
import type { Logger } from '../logger';

export async function extractSubsplashM3u8(
  url: URL,
  log: Logger,
): Promise<string | null> {
  log.info('Launching chromium');
  const browser = await chromium.launch();

  const page = await browser.newPage();

  log.info(`Navigating to ${url}`);
  await page.goto(url.toString());

  const posterPlayButton = page.locator('.kit-player__button--play');

  const m3u8UrlPromise = pEvent(page, 'request', {
    filter: (req) => {
      return req.url().endsWith('.m3u8');
    },
    timeout: 20_000,
  }).then((req) => req.url());

  try {
    log.info('Clicking play button');
    await posterPlayButton.click();
    const m3u8Url = await m3u8UrlPromise;

    return m3u8Url;
  } catch (e) {
    // Rethrow any errors from playwright
    throw e;
  } finally {
    await browser.close();
  }
}
