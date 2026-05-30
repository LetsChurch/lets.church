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

const { getFinalizedUploadKey, storeTranscriptParagraphs } = proxyActivities<
  typeof backgroundActivities
>({
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

    const probeRes = await probe(targetId, s3UploadKey);
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

      // LLM post-processing + new search-index write. Summary and
      // annotation pipelines run as independent child workflows so admins
      // can regenerate either one from the dashboard without paying for
      // the other (~$0.02 / call each). On the first-pass transcribe path
      // we want both, fanned out in parallel.
      //
      // `Promise.allSettled` (not `Promise.all`): if one child rejects
      // first, the other should still run to completion rather than
      // being terminated mid-LLM-call by the default
      // `parentClosePolicy: TERMINATE`. Without this, a summary failure
      // would kill an in-flight annotation that's already burned tokens
      // and written `llm_call` rows. After both settle, we re-throw any
      // failures so the parent workflow's retry budget still applies —
      // each child also has its own internal `maximumAttempts: 2` so
      // transient errors are absorbed before we get here.
      //
      // `embedParagraphs: true` because paragraphs are fresh from
      // storeTranscriptParagraphs and need embedding for the first time
      // (the admin regen path defaults this to false since paragraph text
      // is stable across summary prompt changes). `force` is NOT passed
      // — see the parent-retry note below for why default-false is
      // load-bearing here.
      //
      // Parent-retry race note: `executeChild`'s `ChildWorkflowOptions`
      // type does NOT support `workflowIdConflictPolicy` (it's
      // client-side only — see `@temporalio/workflow` interfaces.d.ts
      // where `ChildWorkflowOptions` Omits it from CommonWorkflowOptions).
      // The only available knob is `workflowIdReusePolicy`, which
      // governs Closed-vs-new collisions, not Running-vs-new. So if a
      // parent retry catches a prior child still Running on the server,
      // the server rejects with `WorkflowExecutionAlreadyStarted` —
      // there's no in-workflow API to attach to the running child.
      //
      // `Promise.allSettled` is our defense: both children fully settle
      // (to either fulfilled or rejected) before the aggregator
      // re-throws, so under normal flow no child is still Running when
      // the parent retries. The remaining race window only opens if
      // something cancels the parent mid-`allSettled` (timeout, signal,
      // worker death). In that case the parent retry will hit the
      // race; given how rare that is in practice we accept it rather
      // than `TERMINATE_IF_RUNNING` (which would kill healthy in-flight
      // children).
      //
      // Cost on a normal parent retry — when one child failed and the
      // other succeeded, parent retry re-runs BOTH child workflows.
      // The previously-failed child re-attempts its LLM call (the
      // point of the retry). The previously-succeeded child would
      // otherwise re-bill tokens for work already in the DB; the
      // activities' `force: false` default short-circuits as soon as
      // they see existing summary / annotation rows for this upload,
      // so the redundant attempt costs one DB SELECT and not a
      // duplicate LLM call. The admin "Regenerate" mutations pass
      // `force: true` to bypass that idempotency.
      const childResults = await Promise.allSettled([
        executeChild(summarizeUploadWorkflow, {
          workflowId: `summarizeUpload:on-transcribe:${s3UploadKey}`,
          args: [targetId, { embedParagraphs: true }],
          taskQueue: BACKGROUND_QUEUE,
          priority: { priorityKey: PRIORITY_USER },
          typedSearchAttributes: childSearchAttrs,
          retry: { maximumAttempts: 2 },
        }),
        executeChild(annotateTranscriptWorkflow, {
          workflowId: `annotateTranscript:on-transcribe:${s3UploadKey}`,
          args: [targetId],
          taskQueue: BACKGROUND_QUEUE,
          priority: { priorityKey: PRIORITY_USER },
          typedSearchAttributes: childSearchAttrs,
          retry: { maximumAttempts: 2 },
        }),
      ]);
      const childFailures = childResults
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) =>
          r.reason instanceof Error ? r.reason.message : String(r.reason),
        );
      if (childFailures.length > 0) {
        throw new Error(
          `Post-transcribe pipeline: ${childFailures.length} of ${childResults.length} child workflows failed — ${childFailures.join('; ')}`,
        );
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
