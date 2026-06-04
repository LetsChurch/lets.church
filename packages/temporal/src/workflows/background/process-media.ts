import {
  executeChild,
  proxyActivities,
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

const {
  getFinalizedUploadKey,
  getStoredProbe,
  getUploadsMissingLlmData,
  storeTranscriptParagraphs,
} = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '10 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { sendUploadErrorNotification } = proxyActivities<
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
  // LLM stage control for reprocess flows:
  //   'run'           — run annotate + summarize (default)
  //   'skip'          — skip the LLM stages entirely
  //   'skip-existing' — skip only when the upload already has a summary
  //                     and annotations; run for uploads missing them
  llmMode: 'run' | 'skip' | 'skip-existing' = 'run',
) {
  // Propagate UploadId to every child / grandchild so the whole tree is
  // searchable in the Temporal UI by upload. Temporal does NOT inherit
  // search attributes automatically — see handle-multipart-media-upload.ts
  // for the same pattern. Other keys (channel, user) aren't readily
  // available here without an extra DB lookup; UploadId alone is enough to
  // navigate the tree.
  const childSearchAttrs = [{ key: UPLOAD_ID_KEY, value: targetId }];

  try {
    const s3UploadKey = await getFinalizedUploadKey(targetId);

    // Skip-probe reuses the stored probe.json; a null result (missing or
    // unparseable) transparently falls back to a live probe so no upload
    // is silently left unprocessed.
    const probeRes =
      (skipProbe ? await getStoredProbe(targetId) : null) ??
      (await probe(targetId, s3UploadKey));
    invariant(probeRes !== null, 'Probe is null!');

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

      await executeChild(indexDocumentWorkflow, {
        workflowId: `transcript:${s3UploadKey}`,
        args: ['transcript', targetId, res.transcriptKey],
        taskQueue: BACKGROUND_QUEUE,
        priority: { priorityKey: PRIORITY_USER },
        typedSearchAttributes: childSearchAttrs,
        retry: { maximumAttempts: 2 },
      });

      await storeTranscriptParagraphs(targetId, res.transcriptJsonKey);

      // LLM stage gating for reprocess flows. 'skip' skips the LLM
      // stages entirely; 'skip-existing' runs them only when this upload
      // is missing its summary/annotations, so a batch reprocess spends
      // LLM budget only on the gaps. 'run' (default) always runs them.
      let runLlm = llmMode !== 'skip';
      if (llmMode === 'skip-existing') {
        const missing = await getUploadsMissingLlmData([targetId]);
        runLlm = missing.length > 0;
      }

      if (runLlm) {
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
        // `embedParagraphs: true` because paragraphs are fresh from
        // storeTranscriptParagraphs and need embedding for the first time
        // (the admin regen path defaults this to false since paragraph text
        // is stable across summary prompt changes). `force` is NOT passed
        // — annotate / summarize both short-circuit on existing rows so a
        // parent retry costs one DB SELECT per child, not duplicate LLM
        // calls. The admin "Regenerate" mutations pass `force: true` to
        // bypass that idempotency.
        //
        // Graceful degradation: if annotate fails, we still attempt
        // summarize (it writes a sections-less summary), then re-throw
        // the annotate failure so the parent retry budget still applies.
        // This avoids paying for annotate then losing the summary on a
        // single-flake annotate failure.
        let annotateError: unknown = null;
        try {
          await executeChild(annotateTranscriptWorkflow, {
            workflowId: `annotateTranscript:on-transcribe:${s3UploadKey}`,
            args: [targetId],
            taskQueue: BACKGROUND_QUEUE,
            priority: { priorityKey: PRIORITY_USER },
            typedSearchAttributes: childSearchAttrs,
            retry: { maximumAttempts: 2 },
          });
        } catch (err) {
          annotateError = err;
        }

        await executeChild(summarizeUploadWorkflow, {
          workflowId: `summarizeUpload:on-transcribe:${s3UploadKey}`,
          args: [targetId, { embedParagraphs: true }],
          taskQueue: BACKGROUND_QUEUE,
          priority: { priorityKey: PRIORITY_USER },
          typedSearchAttributes: childSearchAttrs,
          retry: { maximumAttempts: 2 },
        });

        if (annotateError !== null) {
          throw new Error(
            `Post-transcribe pipeline: annotate failed — ${annotateError instanceof Error ? annotateError.message : String(annotateError)}`,
          );
        }
      }
    }

    await executeChild(indexDocumentWorkflow, {
      workflowId: `upload:${s3UploadKey}`,
      args: ['upload', targetId],
      taskQueue: BACKGROUND_QUEUE,
      priority: { priorityKey: PRIORITY_USER },
      typedSearchAttributes: childSearchAttrs,
      retry: { maximumAttempts: 2 },
    });
  } catch (err) {
    const { attempt, retryPolicy } = workflowInfo();
    const maxAttempts = retryPolicy?.maximumAttempts ?? 1;
    if (attempt >= maxAttempts) {
      await sendUploadErrorNotification(
        targetId,
        err instanceof Error ? err.message : String(err),
      );
    }
    throw err;
  }
}
