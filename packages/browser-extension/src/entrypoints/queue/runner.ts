/**
 * Works through the mirror queue one video at a time. Runs only in the queue
 * page; `main.tsx` starts it once per tab.
 */
import { browser } from 'wxt/browser';

import { isCancelRequested, listJobs, patchJob } from '@/lib/jobs';
import { describeApiError, lcApi } from '@/lib/lc-api';
import { sendToTab } from '@/lib/messages';
import { CancelledError, clearSpoolFiles, runTransfer } from '@/lib/transfer';
import type { MirrorJob } from '@/lib/types';

const CANCEL_POLL_MS = 1000;

async function freshDownloadUrl(videoId: string): Promise<string | null> {
  const tabs = await browser.tabs.query({
    url: 'https://studio.youtube.com/*',
  });
  for (const tab of tabs) {
    if (tab.id === undefined) {
      continue;
    }
    try {
      const [video] = await sendToTab(tab.id, {
        type: 'studio:getVideos',
        videoIds: [videoId],
      });
      if (video?.downloadUrl) {
        return video.downloadUrl;
      }
    } catch {
      // Tab is on another Google account, still loading, etc. Try the next.
    }
  }
  return null;
}

async function abortServerUpload(job: MirrorJob) {
  if (!job.upload) {
    return;
  }
  await lcApi
    .abortUpload({ channelId: job.channelId, ...job.upload })
    .catch(() => undefined);
}

async function runJob(job: MirrorJob) {
  const controller = new AbortController();
  const cancelWatch = window.setInterval(() => {
    void isCancelRequested(job.id).then((cancel) => {
      if (cancel) {
        controller.abort(new CancelledError('Cancelled'));
      }
    });
  }, CANCEL_POLL_MS);

  // Track the latest server-side upload so cancel/error can clean it up.
  let current = job;
  const update = async (patch: Partial<MirrorJob>) => {
    current = { ...current, ...patch };
    await patchJob(job.id, patch);
  };

  try {
    await update({ status: 'uploading', error: null, bytesUploaded: 0 });
    await runTransfer(current, {
      signal: controller.signal,
      refreshDownloadUrl: () => freshDownloadUrl(job.video.videoId),
      onUpdate: update,
    });
    await update({
      status: 'done',
      bytesUploaded: current.bytesTotal ?? current.bytesUploaded,
    });
  } catch (err) {
    const cancelled =
      controller.signal.aborted || err instanceof CancelledError;
    await abortServerUpload(current);
    await update({
      status: cancelled ? 'cancelled' : 'error',
      error: cancelled ? null : describeApiError(err),
      upload: null,
    });
  } finally {
    window.clearInterval(cancelWatch);
  }
}

/**
 * Jobs left mid-flight by a closed tab or browser restart can't resume (their
 * download stream is gone), so clean up their server-side upload and requeue.
 */
async function recoverInterrupted() {
  for (const job of await listJobs()) {
    if (job.status === 'uploading' || job.status === 'finalizing') {
      await abortServerUpload(job);
      await patchJob(job.id, {
        status: 'queued',
        bytesUploaded: 0,
        bytesTotal: null,
        upload: null,
      });
    }
  }
}

function waitForChange() {
  return new Promise<void>((resolve) => {
    const listener = () => {
      browser.storage.onChanged.removeListener(listener);
      resolve();
    };
    browser.storage.onChanged.addListener(listener);
  });
}

export async function startRunner() {
  await clearSpoolFiles().catch(() => undefined);
  await recoverInterrupted();
  for (;;) {
    const next = (await listJobs()).find((j) => j.status === 'queued');
    if (!next) {
      await waitForChange();
      continue;
    }
    if (await isCancelRequested(next.id)) {
      await patchJob(next.id, { status: 'cancelled' });
      continue;
    }
    await runJob(next);
  }
}
