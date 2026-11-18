import {
  ActivityCancellationType,
  ApplicationFailure,
  CancellationScope,
  executeChild,
  patched,
  proxyActivities,
  setCurrentDetails,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import { invariant } from 'es-toolkit';

import type * as backgroundActivities from '../../activities/background';
import type * as probeActivities from '../../activities/probe';
import type * as transcodeActivities from '../../activities/transcode';
import {
  BACKGROUND_QUEUE,
  PRIORITY_USER,
  PROBE_QUEUE,
  TRANSCODE_QUEUE,
  TRANSCRIBE_QUEUE,
} from '../../queues';
import { UPLOAD_ID_KEY } from '../../search-attributes';
import { type LcLink, staticMeta } from '../../util/dashboard-links';
import {
  DETERMINISTIC_LLM_FALLBACK_FAILURE,
  isDeterministicLlmFallbackFailure,
} from '../../util/llm-completion-guards';
import { type Probe, probeIsVideoFile } from '../../util/zod';
import { annotateTranscriptWorkflow } from './annotate-transcript';
import { indexDocumentWorkflow } from './index-document';
import { moveUploadRecordWorkflow } from './storage-move';
import { summarizeUploadWorkflow } from './summarize-upload';
import { isUploadDeletedFailure, uploadIsDeleted } from './upload-deleted';

const { probe } = proxyActivities<typeof probeActivities>({
  startToCloseTimeout: '20 minutes',
  heartbeatTimeout: '10 minutes',
  taskQueue: PROBE_QUEUE,
  retry: { maximumAttempts: 2 },
});

// These write files. On cancel, wait for them to actually stop before this
// workflow closes, so a delete that waits for it to close (see
// cancelUploadProcessing) doesn't race files still being uploaded.
const TRANSCODE_ACTIVITY_OPTIONS = {
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  heartbeatTimeout: '10 minutes',
  taskQueue: TRANSCODE_QUEUE,
  retry: { maximumAttempts: 2 },
} as const;

/**
 * Transcode/transcribe time limit, scaled to the media's length: a flat 180
 * minutes timed out a 5.7-hour video on every attempt on slower (software)
 * encoders. The heartbeat timeout still catches hung work quickly.
 */
export function mediaTimeoutMinutes(probeRes: Probe) {
  const seconds = Number(probeRes.format.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return 180;
  return Math.max(180, Math.ceil((seconds / 60) * 1.5) + 60);
}

/** transcode and createThumbnails (which decodes the whole video too). */
function transcodeActivitiesFor(probeRes: Probe) {
  return proxyActivities<typeof transcodeActivities>({
    ...TRANSCODE_ACTIVITY_OPTIONS,
    startToCloseTimeout: `${mediaTimeoutMinutes(probeRes)} minutes`,
  });
}

// Served by the Python worker (services/transcribe), so there's no TS module to
// derive the type from; this mirrors its `transcribe` activity signature.
type TranscribeActivities = {
  transcribe(
    uploadRecordId: string,
    s3UploadKey: string,
    storageLocation?: string,
  ): Promise<{
    transcriptKey: string;
    transcriptJsonKey: string;
    additionalKeys: string[];
  }>;
};

function transcribeFor(probeRes: Probe) {
  return proxyActivities<TranscribeActivities>({
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    startToCloseTimeout: `${mediaTimeoutMinutes(probeRes)} minutes`,
    heartbeatTimeout: '10 minutes',
    taskQueue: TRANSCRIBE_QUEUE,
    retry: { maximumAttempts: 2 },
  }).transcribe;
}

const {
  getFinalizedUploadKey,
  getStoredProbe,
  storeTranscriptParagraphs,
  ensureStorageCapacity,
  getUploadStorageLocation,
  createRecordMove,
} = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '10 minute',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

// Listing a record's public prefix can take a while for long HLS ladders.
const { measurePublicUsage } = proxyActivities<typeof backgroundActivities>({
  startToCloseTimeout: '30 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

// How often a parked upload re-checks for storage capacity.
const STORAGE_RECHECK_INTERVAL = '10 minutes';

/**
 * Make sure the record's location can hold the processed output before any
 * artifact is written: proceed, relocate the record (cheap before transcode;
 * a full move if it already has artifacts), or park and re-check until
 * capacity frees up. Returns the location processing should use.
 */
async function waitForStorageCapacity(
  targetId: string,
  probe: Probe,
): Promise<string> {
  for (;;) {
    const decision = await ensureStorageCapacity(targetId, probe);
    if (decision.action === 'proceed') {
      return decision.storageLocation;
    }
    if (decision.action === 'relocate') {
      setCurrentDetails(
        `Relocating to ${decision.targetLocation} for storage capacity`,
      );
      const storageMoveId = await createRecordMove({
        uploadRecordId: targetId,
        targetLocation: decision.targetLocation,
        reason: 'capacity',
      });
      const moved = await executeChild(moveUploadRecordWorkflow, {
        args: [{ storageMoveId, uploadRecordId: targetId }],
        workflowId: `storageMove:${storageMoveId}`,
        taskQueue: BACKGROUND_QUEUE,
      });
      if (!moved.ok) {
        // e.g. the target filled up meanwhile; back off before re-deciding.
        setCurrentDetails(`Relocation failed: ${moved.reason}`);
        await sleep(STORAGE_RECHECK_INTERVAL);
      }
      continue;
    }
    setCurrentDetails(
      decision.action === 'moving'
        ? 'Waiting for a storage move to finish'
        : 'Waiting for storage capacity',
    );
    await sleep(
      decision.action === 'moving' ? '1 minute' : STORAGE_RECHECK_INTERVAL,
    );
  }
}

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
  const storageLocationsV1 = patched('storage-locations-v1');
  const stopQuietlyWhenDeleted = patched('process-media-stop-when-deleted-v1');
  const annotateFailureNonFatal = patched('process-media-annotate-nonfatal-v1');
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
    // Probe/transcode/transcribe workers have no DB access; they're told
    // which location holds the record.
    let storageLocation = storageLocationsV1
      ? await getUploadStorageLocation(targetId)
      : undefined;

    // Skip-probe reuses the stored probe.json; a null result (missing or
    // unparseable) transparently falls back to a live probe so no upload
    // is silently left unprocessed.
    const probeRes =
      (skipProbe ? await getStoredProbe(targetId) : null) ??
      (await probe(targetId, s3UploadKey, storageLocation));
    invariant(probeRes !== null, 'Probe is null!');

    // Capacity is re-checked with a precise estimate before transcoding writes
    // anything to public (and may relocate the record). Transcribe-only runs
    // write a few small transcript files, so they skip the check.
    if (storageLocationsV1 && scope !== 'transcribe') {
      setCurrentDetails('Checking storage capacity');
      storageLocation = await waitForStorageCapacity(targetId, probeRes);
    }

    setCurrentDetails(
      scope === 'transcode'
        ? 'Transcoding'
        : scope === 'transcribe'
          ? 'Transcribing'
          : 'Transcoding & transcribing',
    );

    const transcribePromise =
      scope === 'everything' || scope === 'transcribe'
        ? transcribeFor(probeRes)(targetId, s3UploadKey, storageLocation)
        : null;

    const work = [
      transcribePromise,
      scope === 'everything' || scope === 'transcode'
        ? transcodeActivitiesFor(probeRes).transcode(
            targetId,
            s3UploadKey,
            probeRes,
            storageLocation,
          )
        : null,
      ...((scope === 'everything' || scope === 'transcode') &&
      probeIsVideoFile(probeRes)
        ? [
            transcodeActivitiesFor(probeRes).createThumbnails(
              targetId,
              s3UploadKey,
              probeRes,
              storageLocation,
            ),
          ]
        : []),
    ];
    try {
      await Promise.all(work);
    } catch (err) {
      // When cancelled, wait for every writer to acknowledge (see the
      // WAIT_CANCELLATION_COMPLETED proxies) before closing, not just the
      // first; otherwise fail fast as before.
      if (CancellationScope.current().consideredCancelled) {
        await Promise.allSettled(work);
      }
      throw err;
    }

    if (storageLocationsV1) {
      await measurePublicUsage(targetId);
    }

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
      // Graceful degradation: if annotate fails, still attempt summarize, then
      // finish the run and page ops (below). Runs from before that patch
      // instead fail: retryably for a transient annotation failure, or
      // non-retryably for a deterministic fallback failure.
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
      });

      if (annotateError !== null && annotateFailureNonFatal) {
        // Annotations (outline/chapters) are an enhancement: the media is
        // transcoded, transcribed and summarized, so don't fail the run. A
        // parent retry would redo hours of transcode/transcribe for nothing
        // (annotate already retries its own LLM calls for up to 3 days), and
        // the uploader would be emailed about a working upload. Page ops so
        // an admin can regenerate annotations once the cause is fixed.
        const message =
          annotateError instanceof Error
            ? annotateError.message
            : String(annotateError);
        setCurrentDetails('Annotation failed (media processed)');
        try {
          // Deleted meanwhile: nothing to regenerate, so no page.
          if (
            isUploadDeletedFailure(annotateError) ||
            (await uploadIsDeleted(targetId))
          ) {
            return;
          }
          await triggerPagerDutyAlert({
            dedupKey: `annotate-transcript:${targetId}`,
            summary: `Annotating transcript failed for upload ${targetId}: ${message}`,
            component: 'annotate-transcript',
            uploadId: targetId,
            customDetails: { uploadRecordId: targetId, error: message },
          });
        } catch {
          // swallow — alerting is best-effort
        }
      } else if (annotateError !== null) {
        const message = `Post-transcribe pipeline: annotate failed — ${
          annotateError instanceof Error
            ? annotateError.message
            : String(annotateError)
        }`;
        if (isDeterministicLlmFallbackFailure(annotateError)) {
          throw ApplicationFailure.nonRetryable(
            message,
            DETERMINISTIC_LLM_FALLBACK_FAILURE,
          );
        }
        throw ApplicationFailure.retryable(
          message,
          'PostTranscribeAnnotationFailed',
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
    // This workflow was cancelled (e.g. the upload is being deleted): not a
    // failure, so no error email or page. Cancellation isn't retried, so just
    // propagate. Checks the scope, not the error: a cancelled child or activity
    // alone is still a real failure of this run.
    if (CancellationScope.current().consideredCancelled) throw err;
    // The upload is being (or was) deleted: its files and record are going
    // away, so this run and every retry would fail. Also not a failure.
    // deleteUploadWorkflow tombstones the record and cancels this workflow;
    // a run that slips past the cancel lands here. Finish without retrying,
    // emailing, or paging.
    if (
      stopQuietlyWhenDeleted &&
      (isUploadDeletedFailure(err) || (await uploadIsDeleted(targetId)))
    ) {
      setCurrentDetails('Upload deleted — stopped');
      return;
    }
    const { attempt, retryPolicy } = workflowInfo();
    const maxAttempts = retryPolicy?.maximumAttempts ?? 1;
    const terminal =
      isDeterministicLlmFallbackFailure(err) || attempt >= maxAttempts;
    if (terminal) {
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
