import {
  condition,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';
import type * as backgroundActivities from '../../activities/background';
import { BACKGROUND_QUEUE, IMPORT_QUEUE, PRIORITY_IMPORT } from '../../queues';
import { muxRenditionReadySignal } from '../../refs';
import { CHANNEL_SLUG_KEY, UPLOAD_ID_KEY } from '../../search-attributes';
import { processMediaWorkflow } from './process-media';

// How long to wait for the rendition-ready signal before importing anyway (the
// activity retries also cover a rendition that's nearly-but-not-quite ready).
const RENDITION_READY_FALLBACK = '1 day';

const { importMuxRecording, deleteMuxAsset } = proxyActivities<{
  importMuxRecording: (
    uploadRecordId: string,
    muxAssetId: string,
    title?: string | null,
  ) => Promise<{ mediaUploadKey: string }>;
  deleteMuxAsset: (muxAssetId: string) => Promise<void>;
}>({
  startToCloseTimeout: '10 hours',
  heartbeatTimeout: '5 hours',
  taskQueue: IMPORT_QUEUE,
  // We trigger this workflow on video.asset.static_renditions.ready, so the
  // MP4 is downloadable by the first attempt; the retries are just a safety
  // net for transient download/API errors.
  retry: {
    maximumAttempts: 8,
    initialInterval: '10 seconds',
    maximumInterval: '1 minute',
    backoffCoefficient: 2,
  },
});

const { triggerPagerDutyAlert, isUploadFinalized } = proxyActivities<
  typeof backgroundActivities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type MuxImportRecordingWorkflowParams = {
  uploadRecordId: string;
  muxAssetId: string;
  // Optional, for search-attribute tagging + the staged filename.
  channelSlug?: string;
  title?: string | null;
};

// Imports a finished Mux live-stream recording into the (existing) live
// UploadRecord, then runs the normal processing pipeline. Once transcode
// finishes, the media procedure serves our CDN instead of Mux's live HLS, and
// the now-redundant Mux asset is deleted.
//
// Started when the broadcast goes idle, then waits for the rendition-ready
// signal (sent by the webhook when the downloadable MP4 lands) before
// importing — or falls back after a day if that signal never arrives. This
// single self-contained workflow replaces a separate delayed fallback job: the
// "timeout" is just an in-workflow timer, and there's nothing to cancel once
// the import completes.
export async function muxImportRecordingWorkflow({
  uploadRecordId,
  muxAssetId,
  channelSlug,
  title,
}: MuxImportRecordingWorkflowParams): Promise<string> {
  let renditionReady = false;
  setHandler(muxRenditionReadySignal, () => {
    renditionReady = true;
  });

  try {
    // Idempotency: a duplicate trigger (or a re-run after completion) no-ops if
    // the recording was already imported — avoids re-downloading a Mux asset
    // that may have been deleted after the first successful import.
    if (await isUploadFinalized(uploadRecordId)) {
      return uploadRecordId;
    }

    // Wait for the downloadable MP4 to be ready (signalled by the webhook), or
    // give up waiting after the fallback window and try anyway. Only on the
    // first attempt: the signal isn't redelivered to a workflow retry, so a
    // retry would otherwise block the full fallback window again — instead it
    // imports directly and leans on the import activity's own retries (which
    // poll Mux until the rendition is ready).
    if (workflowInfo().attempt === 1) {
      await condition(() => renditionReady, RENDITION_READY_FALLBACK);
    }

    const { mediaUploadKey } = await importMuxRecording(
      uploadRecordId,
      muxAssetId,
      title,
    );

    // Wait for our own pipeline (probe/transcode/transcribe) to finish before
    // deleting the Mux asset — we keep serving Mux's playback until our CDN
    // variants land, and we only want to drop the Mux copy once it's truly
    // redundant. If processing fails we leave the asset in place for retry.
    const child = await startChild(processMediaWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `processMedia:${mediaUploadKey}`,
      args: [uploadRecordId],
      priority: { priorityKey: PRIORITY_IMPORT },
      parentClosePolicy: ParentClosePolicy.ABANDON,
      typedSearchAttributes: [
        { key: UPLOAD_ID_KEY, value: uploadRecordId },
        ...(channelSlug ? [{ key: CHANNEL_SLUG_KEY, value: channelSlug }] : []),
      ],
      retry: { maximumAttempts: 5 },
    });
    await child.result();

    await deleteMuxAsset(muxAssetId);

    return uploadRecordId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // The workflow is started with a multi-attempt retry policy (see
    // startMuxImportRecording), so this only pages once retries are exhausted.
    const { attempt, retryPolicy } = workflowInfo();
    const maxAttempts = retryPolicy?.maximumAttempts ?? 1;
    if (attempt >= maxAttempts) {
      try {
        await triggerPagerDutyAlert({
          dedupKey: `mux-import-recording:${uploadRecordId}`,
          summary: `Mux recording import failed for ${uploadRecordId}: ${errorMessage}`,
          component: 'mux-import-recording',
          uploadId: uploadRecordId,
          customDetails: {
            uploadRecordId,
            muxAssetId,
            channelSlug,
            attempt,
            maxAttempts,
            error: errorMessage,
          },
        });
      } catch {
        // swallow — alerting is best-effort
      }
    }

    throw error;
  }
}
