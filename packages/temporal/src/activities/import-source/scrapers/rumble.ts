import { PlaywrightCrawler } from 'crawlee';

import logger from '../../../util/logger';
import type { ScrapedMediaItem } from '../scrape-import-source';

const moduleLogger = logger.child({ module: 'scraper/rumble' });

/**
 * Scrape Rumble.com using Crawlee
 */
export async function scrapeRumble(
  url: string,
  earliestDate: Date | string | null,
): Promise<ScrapedMediaItem[]> {
  moduleLogger.info('Rumble scraper starting');

  const results: ScrapedMediaItem[] = [];
  const formattedEarliestDate = earliestDate
    ? new Date(earliestDate).toISOString().split('T')[0]
    : null;

  const crawler = new PlaywrightCrawler({
    headless: true,
    requestHandlerTimeoutSecs: 900,
    async requestHandler({ page, request, enqueueLinks, log }) {
      const label = request.userData.label as string | undefined;

      // Main page handler - collect video links
      if (!label || label === 'main') {
        log.info('Collecting video links from Rumble');

        const gridItems = await page
          .locator(
            '.thumbnail__grid .videostream.thumbnail__grid--item:not(:has(.thumbnail__thumb--upcoming))',
          )
          .all();

        let enqueuedCount = 0;

        for (const gridItem of gridItems) {
          const time = await gridItem.locator('time').getAttribute('datetime');
          const href = await gridItem
            .locator('.videostream__link')
            .getAttribute('href');

          // Skip videos before earliest date
          // Videos on the same day will be re-checked and caught by deduplication
          if (time && formattedEarliestDate && time < formattedEarliestDate) {
            log.info(`Skipping ${href} (before ${formattedEarliestDate})`);
            continue;
          }

          if (href) {
            const videoUrl = new URL(href, request.loadedUrl);
            videoUrl.searchParams.delete('e9s');

            await enqueueLinks({
              urls: [videoUrl.toString()],
              userData: { label: 'video' },
            });

            enqueuedCount += 1;
          }
        }

        // Check if there's a next page to paginate
        if (enqueuedCount > 0) {
          const nextPageLink = await page
            .locator(
              '.paginator--li:has(.paginator--link--current) + .paginator--li a',
            )
            .first();

          if (await nextPageLink.count()) {
            await enqueueLinks({
              selector:
                '.paginator--li:has(.paginator--link--current) + .paginator--li a',
              userData: { label: 'main' },
            });
          }
        }
      }
      // Individual video handler
      else if (label === 'video') {
        const title = await page.locator('.media-info h1').first().innerText();
        log.info(`Processing video: ${title}`);

        // Extract date
        let dateStr: string | null = null;
        const timeElement = page
          .locator('.media-description-info-stream-time time')
          .first();

        if (await timeElement.count()) {
          dateStr = await timeElement.getAttribute('datetime');
        }

        if (!dateStr) {
          const titleElement = page
            .locator('.media-description-info-stream-time div[title]')
            .first();
          if (await titleElement.count()) {
            dateStr = await titleElement.getAttribute('title');
          }
        }

        const publishedAt = dateStr ? new Date(dateStr) : new Date();

        // Try to expand description
        try {
          await page
            .locator('.media-description--show-button')
            .click({ timeout: 5000 });
        } catch {
          log.info('No description expand button');
        }

        let description = '';
        try {
          description = await page
            .locator('.container.content.media-description')
            .innerText({ timeout: 5000 });
        } catch {
          log.info('No description found');
        }

        const cleanUrl = new URL(request.loadedUrl);
        cleanUrl.searchParams.delete('e9s');

        results.push({
          url: cleanUrl.toString(),
          title,
          description,
          publishedAt,
        });
      }
    },
  });

  await crawler.run([{ url, userData: { label: 'main' } }]);

  moduleLogger.info(`Scraped ${results.length} items from Rumble`);
  return results;
}
