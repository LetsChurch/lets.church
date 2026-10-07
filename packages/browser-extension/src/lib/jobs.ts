/**
 * The mirror queue, persisted in `storage.local` so every extension context
 * sees the same state:
 *
 * - `job:<id>`    one `MirrorJob`. Created by the background on enqueue; after
 *                 that only the queue page (the transfer runner) writes it.
 * - `cancel:<id>` a cancel request from any UI. Kept separate from the job so a
 *                 cancel can't race the runner's progress writes.
 */
import { browser } from 'wxt/browser';

import type { LcVisibility, MirrorJob, StudioVideo } from './types';

const JOB_PREFIX = 'job:';
const CANCEL_PREFIX = 'cancel:';

export const ACTIVE_STATUSES: ReadonlySet<MirrorJob['status']> = new Set([
  'queued',
  'uploading',
  'finalizing',
]);

export async function listJobs(): Promise<Array<MirrorJob>> {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(JOB_PREFIX))
    .map(([, value]) => value as MirrorJob)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getJob(id: string): Promise<MirrorJob | null> {
  const key = JOB_PREFIX + id;
  const result = await browser.storage.local.get(key);
  return (result[key] as MirrorJob | undefined) ?? null;
}

export async function saveJob(job: MirrorJob) {
  await browser.storage.local.set({ [JOB_PREFIX + job.id]: job });
}

export async function patchJob(id: string, patch: Partial<MirrorJob>) {
  const job = await getJob(id);
  if (job) {
    await saveJob({ ...job, ...patch });
  }
}

export async function requestCancel(id: string) {
  await browser.storage.local.set({ [CANCEL_PREFIX + id]: true });
}

export async function isCancelRequested(id: string) {
  const key = CANCEL_PREFIX + id;
  return !!(await browser.storage.local.get(key))[key];
}

export async function removeJobs(ids: ReadonlyArray<string>) {
  await browser.storage.local.remove(
    ids.flatMap((id) => [JOB_PREFIX + id, CANCEL_PREFIX + id]),
  );
}

/** Put a job back in line (after an error or cancel). */
export async function retryJob(id: string) {
  await browser.storage.local.remove(CANCEL_PREFIX + id);
  await patchJob(id, {
    status: 'queued',
    error: null,
    warning: null,
    bytesUploaded: 0,
    bytesTotal: null,
    upload: null,
  });
}

/**
 * Add videos to the queue for a channel. Skips any video already queued,
 * in flight, or done for that channel.
 */
export async function enqueueJobs({
  videos,
  channelId,
  channelName,
  visibility,
}: {
  videos: ReadonlyArray<StudioVideo>;
  channelId: string;
  channelName: string;
  visibility: LcVisibility | null;
}): Promise<{ added: number; skipped: number }> {
  const existing = await listJobs();
  const taken = new Set(
    existing
      .filter((j) => j.channelId === channelId && j.status !== 'cancelled')
      .filter((j) => j.status !== 'error')
      .map((j) => j.video.videoId),
  );

  const now = Date.now();
  const jobs: Record<string, MirrorJob> = {};
  let skipped = 0;
  for (const [i, video] of videos.entries()) {
    if (taken.has(video.videoId)) {
      skipped++;
      continue;
    }
    // Retrying an errored/cancelled video replaces its old job.
    for (const old of existing) {
      if (old.channelId === channelId && old.video.videoId === video.videoId) {
        await removeJobs([old.id]);
      }
    }
    const id = crypto.randomUUID();
    jobs[JOB_PREFIX + id] = {
      id,
      createdAt: now + i,
      video,
      channelId,
      channelName,
      visibility,
      status: 'queued',
      bytesTotal: null,
      bytesUploaded: 0,
      error: null,
      warning: null,
      upload: null,
    };
  }

  await browser.storage.local.set(jobs);
  return { added: Object.keys(jobs).length, skipped };
}

/** Call `onChange` with the full job list whenever any job changes. */
export function watchJobs(onChange: (jobs: Array<MirrorJob>) => void) {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (
      area === 'local' &&
      Object.keys(changes).some((k) => k.startsWith(JOB_PREFIX))
    ) {
      void listJobs().then(onChange);
    }
  };
  browser.storage.onChanged.addListener(listener);
  void listJobs().then(onChange);
  return () => browser.storage.onChanged.removeListener(listener);
}
