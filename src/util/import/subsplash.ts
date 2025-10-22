import { invariant, noop } from 'es-toolkit';
import { pEvent } from 'p-event';
import { firefox, type Request } from 'playwright';
import type { Logger } from '../logger';
import type { DownloadResult } from '.';
import { downloadUrl } from './download';
import { ytdlp } from './yt-dlp';

async function launchFirefox() {
  const browser = await firefox.launch();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0',
  });

  return { browser, context };
}

async function extractSubsplashMedia(
  url: URL,
  log: Logger,
): Promise<string | null> {
  log.info('Launching Firefox to extract m3u8');
  const { browser, context } = await launchFirefox();
  const page = await context.newPage();

  log.info(`Navigating to ${url}`);
  await page.goto(url.toString());

  const posterPlayButton = page
    .frameLocator('.sap-embed-player > iframe')
    .locator('.kit-player__button--play');

  const m3u8UrlPromise = pEvent(page, 'request', {
    filter: (req) => {
      const u = (req as Request).url();
      return u.endsWith('.m3u8') || u.endsWith('.mp3');
    },
    timeout: 20_000,
  }).then((req) => (req as Request).url());

  try {
    log.info('Clicking play button');
    await posterPlayButton.click();
    const m3u8Url = await m3u8UrlPromise;

    return m3u8Url;
  } finally {
    await browser.close();
  }
}

async function downloadSubsplashThumbnail(
  url: URL,
  dir: string,
  log: Logger,
): Promise<string | null> {
  log.info('Launching Firefox to download thumbnail');
  const { browser, context } = await launchFirefox();
  try {
    const page = await context.newPage();

    log.info(`Navigating to ${url}`);
    page.goto(url.toString());

    const thumbnailContainer = page
      .frameLocator('.sap-embed-player > iframe')
      .locator('.kit-image__cover-image');
    const style = await thumbnailContainer.getAttribute('style');

    if (!style) {
      return null;
    }

    const match = style.match(/background-image: url\("([^"]+)"\)/);
    const thumbUrl = match?.[1] ?? null;

    if (thumbUrl) {
      return downloadUrl(thumbUrl, dir, log);
    }

    return null;
  } catch (e) {
    log.error('Error downloading thumbnail', e);
    return null;
  } finally {
    await browser.close();
  }
}

export async function downloadSubsplash(
  url: URL,
  dir: string,
  log: Logger,
  heartbeat: typeof noop = noop,
): Promise<DownloadResult> {
  const mediaUrl = await extractSubsplashMedia(url, log);
  invariant(mediaUrl, 'Missing m3u8 url');

  const res = await ytdlp(mediaUrl, dir, log, heartbeat);
  const mediaPath = res.mediaPath;

  const thumbnailPath = await downloadSubsplashThumbnail(url, dir, log);

  return { mediaPath, thumbnailPath };
}
