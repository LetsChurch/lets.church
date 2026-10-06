import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

import { toLetsChurchPublishedAt } from '@/lib/dates';
import { enqueueJobs } from '@/lib/jobs';
import { lcApi } from '@/lib/lc-api';
import { onMessage, send } from '@/lib/messages';

/**
 * Transfers run in the queue page, not here: an MV3 service worker (Chrome) or
 * event page (Firefox) can be suspended mid-download, while a tab stays alive
 * and shows the user that work is in progress.
 */
async function openQueue() {
  try {
    const tabId = await send({ type: 'queue:ping' });
    await browser.tabs.update(tabId, { active: true });
  } catch {
    await browser.tabs.create({ url: browser.runtime.getURL('/queue.html') });
  }
}

export default defineBackground(() => {
  onMessage((message) => {
    switch (message.type) {
      case 'lc:getContext':
        return lcApi.getContext();
      case 'lc:findDuplicates':
        return lcApi.findDuplicates({
          channelId: message.channelId,
          candidates: message.videos.map((v) => ({
            key: v.videoId,
            title: v.title,
            publishedAt: toLetsChurchPublishedAt(v.publishedAt),
            lengthSeconds: v.lengthSeconds,
            originalFileName: v.originalFileName,
          })),
        });
      case 'queue:enqueue':
        return enqueueJobs(message).then(async (result) => {
          await openQueue();
          return result;
        });
      case 'queue:open':
        return openQueue().then(() => null);
      default:
        return undefined;
    }
  });
});
