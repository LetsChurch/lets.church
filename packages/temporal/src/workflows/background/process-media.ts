import {
  executeChild,
  patched,
  proxyActivities,
  setCurrentDetails,
  workflowInfo,
} from '@temporalio/workflow';
import { invariant } from 'es-toolkit';

import type * as backgroundActivities from '../../activities/background';
import type * as probeActivities from '../../activities/probe';
import type * as transcodeActivities from '../../activities/transcode';
import type * as transcribeActivities from '../../activities/transcribe';
import {
  BACKGROUND_QUEUE,
  PRIORITY_USER,
  PROBE_QUEUE,
  TRANSCODE_QUEUE,
  TRANSCRIBE_QUEUE,
} from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import { type LcLink, staticMeta } from '../../util/dashboard-links';
import { probeIsVideoFile } from '../../util/zod';
import { annotateTranscriptWorkflow } from './annotate-transcript';
import { indexDocumentWorkflow } from './index-document';
import { summarizeUploadWorkflow } from './summarize-upload';

const { probe } = proxyActivities<typeof probeActivities>({
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: PROBE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { transcode, createThumbnails } = proxyActivities<
  typeof transcodeActivities
>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { transcribe } = proxyActivities<typeof transcribeActivities>({
  startToCloseTimeout: '180 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCRIBE_QUEUE,
  retry: { maximumAttempts: 2 },
});

const { getFinalizedUploadKey, getStoredProbe, storeTranscriptParagraphs } =
  proxyActivities<typeof backgroundActivities>({
    startToCloseTimeout: '10 minute',
    heartbeatTimeout: '1 minute',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 5 },
  });

const { sendUploadErrorNotification, triggerPagerDutyAlert } = proxyActivities<
  typeof backgroundActivities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export async function processMediaWorkflow(
  targetId: string,
  scope: 'transcode' | 'transcribe' | 'everything' = 'everything',
  // When true, reuse the probe metadata persisted on the initial run
  // (via `getStoredProbe`) instead of paying for a fresh download +
  // ffprobe. Defaults to false so fresh uploads, imports, and retries
  // always probe live; reprocess flows opt in (and default it to true).
  skipProbe = false,
  // Resolved dashboard deep-links (upload + channel pages) forwarded by
  // the starter so every child workflow's User Metadata tab carries the
  // same links. Empty when the starter couldn't resolve them (e.g. no
  // channel, or WEB_URL unset). Built outside the workflow sandbox — never
  // call `uploadDashboardLinks`/`absoluteWebUrl` here (they read process.env).
  links: Array<LcLink> = [],
) {
  const inheritChildPriority = patched(
    'inherit-process-media-child-priority-v1',
  );
  // Propagate UploadId to every child / grandchild so the whole tree is
  // searchable in the Temporal UI by upload. Temporal does NOT inherit
  // search attributes automatically — see handle-multipart-media-upload.ts
  // for the same pattern. Other keys (channel, user) aren't readily
  // available here without an extra DB lookup; UploadId alone is enough to
  // navigate the tree.
  const childSearchAttrs = [{ key: UPLOAD_ID_KEY, value: targetId }];

  try {
    // Reflect the live stage in the Temporal UI's User Metadata tab so an
    // operator can see where a long media run is without reading the event
    // history. `setCurrentDetails` is overwrite-only single-line markdown.
    setCurrentDetails('Probing media');
    const s3UploadKey = await getFinalizedUploadKey(targetId);

    // Skip-probe reuses the stored probe.json; a null result (missing or
    // unparseable) transparently falls back to a live probe so no upload
    // is silently left unprocessed.
    const probeRes =
      (skipProbe ? await getStoredProbe(targetId) : null) ??
      (await probe(targetId, s3UploadKey));
    invariant(probeRes !== null, 'Probe is null!');

    setCurrentDetails(
      scope === 'transcode'
        ? 'Transcoding'
        : scope === 'transcribe'
          ? 'Transcribing'
          : 'Transcoding & transcribing',
    );

    const transcribePromise =
      scope === 'everything' || scope === 'transcribe'
        ? transcribe(targetId, s3UploadKey)
        : null;

    await Promise.all([
      transcribePromise,
      scope === 'everything' || scope === 'transcode'
        ? transcode(targetId, s3UploadKey, probeRes)
        : null,
      ...((scope === 'everything' || scope === 'transcode') &&
      probeIsVideoFile(probeRes)
        ? [createThumbnails(targetId, s3UploadKey, probeRes)]
        : []),
    ]);

    if (transcribePromise) {
      const res = await transcribePromise;

      await storeTranscriptParagraphs(targetId, res.transcriptJsonKey);

      // LLM post-processing. Summary and annotation pipelines run as
      // independent child workflows so admins can regenerate either one
      // from the dashboard without paying for the other (~$0.02 / call
      // each). They run **sequentially** — annotate first, then
      // summarize — because the summarize prompt consumes the OUTLINE
      // annotations written by annotate to produce per-section
      // descriptions (YouTube-style chapters). Without outlines on
      // disk first, summarize falls back to a flat summary with no
      // sections.
      //
      // These always run on the transcribe path (no skip option). A changed
      // transcript atomically replaces paragraphs, cascade-deletes annotations,
      // and invalidates summary state; an identical activity retry is a no-op.
      // The Batch submission checks below then skip any work that is already
      // present, preserving retry idempotency without retaining stale output.
      //
      // `embedParagraphs: true` because changed paragraphs need embedding (the
      // admin regen path defaults this to false since paragraph text is stable
      // across prompt changes). `force` is NOT passed — Batch submission skips
      // persisted results so a parent retry does not submit duplicate work. The
      // admin "Regenerate" mutations pass `force: true` to bypass that check.
      //
      // Graceful degradation: if annotate fails, we still attempt
      // summarize (it writes a sections-less summary), then re-throw
      // the annotate failure so the parent retry budget still applies.
      // This avoids paying for annotate then losing the summary on a
      // single-flake annotate failure.
      let annotateError: unknown = null;
      try {
        setCurrentDetails('Annotating transcript');
        await executeChild(annotateTranscriptWorkflow, {
          workflowId: `annotateTranscript:on-transcribe:${s3UploadKey}`,
          args: [targetId],
          taskQueue: BACKGROUND_QUEUE,
          ...(inheritChildPriority
            ? {}
            : { priority: { priorityKey: PRIORITY_USER } }),
          typedSearchAttributes: childSearchAttrs,
          ...staticMeta({ summary: 'Annotate transcript', links }),
          retry: { maximumAttempts: 2 },
        });
      } catch (err) {
        annotateError = err;
      }

      setCurrentDetails('Summarizing');
      await executeChild(summarizeUploadWorkflow, {
        workflowId: `summarizeUpload:on-transcribe:${s3UploadKey}`,
        args: [targetId, { embedParagraphs: true }],
        taskQueue: BACKGROUND_QUEUE,
        ...(inheritChildPriority
          ? {}
          : { priority: { priorityKey: PRIORITY_USER } }),
        typedSearchAttributes: childSearchAttrs,
        ...staticMeta({ summary: 'Summarize', links }),
        retry: { maximumAttempts: 2 },
      });

      if (annotateError !== null) {
        throw new Error(
          `Post-transcribe pipeline: annotate failed — ${annotateError instanceof Error ? annotateError.message : String(annotateError)}`,
        );
      }
    }

    // Final (re)index of the searchable media doc (lc_media_v1). On the
    // transcribe path summarize already indexed it; this keeps the non-transcribe
    // path covered and is a no-op until the upload has a summary embedding.
    setCurrentDetails('Indexing media');
    await executeChild(indexDocumentWorkflow, {
      workflowId: `media:${s3UploadKey}`,
      args: ['media', targetId],
      taskQueue: BACKGROUND_QUEUE,
      ...(inheritChildPriority
        ? {}
        : { priority: { priorityKey: PRIORITY_USER } }),
      typedSearchAttributes: childSearchAttrs,
      ...staticMeta({ summary: 'Index media', links }),
      retry: { maximumAttempts: 2 },
    });
  } catch (err) {
    const { attempt, retryPolicy } = workflowInfo();
    const maxAttempts = retryPolicy?.maximumAttempts ?? 1;
    if (attempt >= maxAttempts) {
      const message = err instanceof Error ? err.message : String(err);
      setCurrentDetails('Failed');
      await sendUploadErrorNotification(targetId, message);
      // Best-effort ops alert on final failure; never mask the original
      // error if PagerDuty itself is unavailable.
      try {
        await triggerPagerDutyAlert({
          dedupKey: `process-media:${targetId}`,
          summary: `Media processing failed for upload ${targetId}: ${message}`,
          component: 'process-media',
          uploadId: targetId,
          customDetails: {
            uploadRecordId: targetId,
            scope,
            attempt,
            maxAttempts,
            error: message,
          },
        });
      } catch {
        // swallow — alerting is best-effort
      }
    }
    throw err;
  }
}
