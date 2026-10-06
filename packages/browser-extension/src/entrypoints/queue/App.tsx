import { useEffect, useState } from 'react';

import {
  Button,
  formatBytes,
  formatDuration,
  ProgressBar,
} from '@/components/ui';
import { uploadEditUrl } from '@/lib/config';
import {
  ACTIVE_STATUSES,
  removeJobs,
  requestCancel,
  retryJob,
  watchJobs,
} from '@/lib/jobs';
import type { MirrorJob } from '@/lib/types';

const STATUS_LABEL: Record<MirrorJob['status'], string> = {
  queued: 'Waiting',
  uploading: 'Uploading',
  finalizing: 'Finishing',
  done: 'Mirrored',
  error: 'Failed',
  cancelled: 'Cancelled',
};

function JobRow({ job }: { job: MirrorJob }) {
  const progress =
    job.bytesTotal && job.bytesTotal > 0
      ? job.bytesUploaded / job.bytesTotal
      : 0;
  const active = ACTIVE_STATUSES.has(job.status);

  return (
    <li className="border-rule bg-surface flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium" title={job.video.title}>
            {job.video.title || job.video.videoId}
          </p>
          <p className="text-muted text-xs">
            to {job.channelName} · {formatDuration(job.video.lengthSeconds)} ·{' '}
            {new Date(job.video.publishedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={
              job.status === 'error'
                ? 'text-danger text-xs font-medium'
                : job.status === 'done'
                  ? 'text-success text-xs font-medium'
                  : 'text-muted text-xs font-medium'
            }
          >
            {STATUS_LABEL[job.status]}
          </span>
          {active ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => void requestCancel(job.id)}
            >
              Cancel
            </Button>
          ) : null}
          {job.status === 'error' || job.status === 'cancelled' ? (
            <Button size="sm" onClick={() => void retryJob(job.id)}>
              Retry
            </Button>
          ) : null}
          {job.status === 'done' && job.upload ? (
            <a
              href={uploadEditUrl(job.channelId, job.upload.uploadId)}
              target="_blank"
              rel="noreferrer"
              className="text-link text-xs font-medium underline"
            >
              View
            </a>
          ) : null}
          {!active ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void removeJobs([job.id])}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {job.status === 'uploading' || job.status === 'finalizing' ? (
        <div className="flex items-center gap-3">
          <ProgressBar
            value={progress}
            label={`Upload progress for ${job.video.title}`}
          />
          <span className="text-muted shrink-0 text-xs tabular-nums">
            {formatBytes(job.bytesUploaded)} / {formatBytes(job.bytesTotal)}
          </span>
        </div>
      ) : null}
      {job.error ? <p className="text-danger text-sm">{job.error}</p> : null}
    </li>
  );
}

export function App() {
  const [jobs, setJobs] = useState<Array<MirrorJob>>([]);
  useEffect(() => watchJobs(setJobs), []);

  const active = jobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  const finished = jobs.filter((j) => !ACTIVE_STATUSES.has(j.status));

  // Closing the tab stops in-flight uploads; make that a deliberate choice.
  useEffect(() => {
    if (active.length === 0) {
      return;
    }
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active.length]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Mirroring to Let&apos;s Church
          </h1>
          <p className="text-muted mt-1 text-sm">
            {active.length > 0
              ? 'Keep this tab open until uploads finish. Videos upload one at a time.'
              : 'Nothing in progress. Choose videos in YouTube Studio to mirror them.'}
          </p>
        </div>
        {finished.length > 0 ? (
          <Button
            size="sm"
            onClick={() => void removeJobs(finished.map((j) => j.id))}
          >
            Clear finished
          </Button>
        ) : null}
      </header>

      {jobs.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {[...active, ...finished].map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </ul>
      ) : null}

      {finished.some((j) => j.status === 'done') ? (
        <p className="text-muted text-sm">
          Mirrored videos are now processing on Let&apos;s Church (transcoding
          and transcripts can take a while).
        </p>
      ) : null}
    </main>
  );
}
