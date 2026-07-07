import {
  createPlaywrightRouter,
  PlaywrightCrawler,
  playwrightUtils,
} from 'crawlee';

import logger from '../../../util/logger';
import type { ScrapedMediaItem } from '../scrape-import-source';

const moduleLogger = logger.child({ module: 'scraper/sermonaudio' });

/**
 * Scrape SermonAudio.com using Crawlee
 */
export async function scrapeSermonAudio(
  url: string,
  earliestDate: Date | string | null,
): Promise<ScrapedMediaItem[]> {
  moduleLogger.info('SermonAudio scraper starting');

  const results: ScrapedMediaItem[] = [];
  const router = createPlaywrightRouter();

  // Main page handler - scroll and collect sermon links
  router.addHandler(
    'sermonaudio',
    async ({ page, request, enqueueLinks, log }) => {
      moduleLogger.info('Starting main page handler', {
        url: request.loadedUrl,
      });
      log.info('Scrolling to load all sermons');

      await playwrightUtils.infiniteScroll(page, {
        waitForSecs: 30,
        stopScrollCallback: async () => {
          const dates = await page
            .locator('span span')
            .filter({ hasText: '•' })
            .locator('+ span.italic')
            .allInnerTexts();

          moduleLogger.info('Checking scroll stop condition', {
            datesFound: dates.length,
            earliestDate: earliestDate
              ? new Date(earliestDate).toISOString()
              : null,
          });

          // Must find dates on the page
          if (dates.length === 0) {
            moduleLogger.warn('Could not find dates on page');
            log.warning('Could not find dates on page');
            return false;
          }

          // Check if we've reached the earliest date
          if (earliestDate) {
            const earliestDateObj = new Date(earliestDate);
            const oldDateFound = dates.some((dateStr) => {
              const date = new Date(dateStr);
              return date < earliestDateObj;
            });

            if (oldDateFound) {
              moduleLogger.info('Reached earliest date, stopping scroll');
              log.info('Reached earliest date, stopping scroll');
              return true;
            }
          }

          // Check if we've reached the end
          const end = await page
            .locator('.text-xs')
            .filter({ hasText: "That's Everything!" })
            .isVisible();

          if (end) {
            moduleLogger.info('Reached end of page');
            log.info('Reached end of page');
            return true;
          }

          return false;
        },
      });

      moduleLogger.info('Finished scrolling, collecting sermon links');
      log.info('Enqueueing sermon links');

      const links = await page
        .locator('ul li .ellipsis a.link[href^=\\/sermon]')
        .all();

      moduleLogger.info('Found sermon links', { count: links.length });

      let enqueuedCount = 0;
      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href) {
          const sermonUrl = new URL(href, request.loadedUrl);
          await enqueueLinks({
            urls: [sermonUrl.toString()],
            label: 'sermonaudio-sermon',
          });
          enqueuedCount++;
        }
      }

      moduleLogger.info('Enqueued sermon links', { count: enqueuedCount });
    },
  );

  // Individual sermon handler
  router.addHandler('sermonaudio-sermon', async ({ page, request, log }) => {
    moduleLogger.info('Starting sermon handler', { url: request.loadedUrl });

    try {
      const title = await page.locator('h1.text-2xl').first().innerText();
      moduleLogger.info('Processing sermon', { title, url: request.loadedUrl });
      log.info(`Processing sermon: ${title}`);

      let description = '';
      try {
        description = (await page.locator('.markdown').allInnerTexts()).join(
          '\n\n',
        );
        moduleLogger.info('Extracted description', {
          length: description.length,
        });
      } catch (error) {
        moduleLogger.warn('No description found', {
          url: request.loadedUrl,
          error: error instanceof Error ? error.message : String(error),
        });
        log.warning('No description found');
      }

      const dateText = await page
        .locator('td.uppercase')
        .filter({ hasText: 'Date' })
        .locator('+ td')
        .innerText();

      if (!dateText) {
        moduleLogger.error('Could not find date for sermon', {
          url: request.loadedUrl,
        });
        log.error('Could not find date for sermon');
        return;
      }

      const publishedAt = new Date(dateText);
      moduleLogger.info('Extracted date', {
        dateText,
        publishedAt: publishedAt.toISOString(),
      });

      // Filter by earliest date if provided (skip items before the last import)
      // Items on the same day will be re-checked and caught by deduplication
      if (earliestDate) {
        const earliestDateObj = new Date(earliestDate);
        if (publishedAt < earliestDateObj) {
          moduleLogger.info('Skipping sermon before earliest date', {
            title,
            publishedAt: publishedAt.toISOString(),
            earliestDate: earliestDateObj.toISOString(),
          });
          return;
        }
      }

      // Get media URL
      moduleLogger.info('Clicking download button');
      await page
        .locator(
          'button:has-text("Download"):not(:has-text("app")):not(:has-text("your weekly"))',
        )
        .click();

      const mediaUrl = await page
        .locator('a[download][href]:first-of-type')
        .getAttribute('href', { timeout: 5000 });

      if (!mediaUrl) {
        moduleLogger.error('Could not find media URL for sermon', {
          title,
          url: request.loadedUrl,
        });
        log.error('Could not find media URL for sermon');
        return;
      }

      const cleanUrl = new URL(mediaUrl);
      cleanUrl.searchParams.delete('ts');

      moduleLogger.info('Successfully extracted sermon data', {
        title,
        url: cleanUrl.toString(),
        publishedAt: publishedAt.toISOString(),
      });

      results.push({
        url: cleanUrl.toString(),
        title,
        description,
        publishedAt,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      moduleLogger.error('Error processing sermon', {
        url: request.loadedUrl,
        error: errorMessage,
      });
      log.error('Error processing sermon', {
        error: errorMessage,
      });
    }
  });

  const crawler = new PlaywrightCrawler({
    headless: true,
    requestHandlerTimeoutSecs: 900,
    requestHandler: router,
  });

  await crawler.run([{ url, label: 'sermonaudio' }]);

  moduleLogger.info(`Scraped ${results.length} items from SermonAudio`);
  return results;
}
