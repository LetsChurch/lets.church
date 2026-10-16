import { executeChild, proxyActivities } from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE, PRIORITY_USER } from '../../queues';
import { annotateTranscriptWorkflow } from './annotate-transcript';
import { indexDocumentWorkflow } from './index-document';
import { summarizeUploadWorkflow } from './summarize-upload';

const { storeTranscriptParagraphs } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

/**
 * Re-derive an upload's transcript paragraphs from its stored transcript JSON
 * (no re-transcription) and, when that changes them, re-run the
 * paragraph-dependent post-processing the media pipeline runs after
 * transcription: annotate, then summarize (which embeds the new paragraphs and
 * re-indexes the doc). For backfilling a change to paragraph grouping, such as
 * splitting oversized paragraphs, onto existing uploads.
 *
 * Replacing paragraphs cascades their annotations and per-paragraph speaker
 * labels, so only run this on uploads that need it.
 */
export async function rebuildTranscriptParagraphsWorkflow(
  uploadRecordId: string,
  // Where the Python transcribe worker writes it (services/transcribe); uploads
  // from the legacy TS worker used `transcript.original.json` and can pass it.
  transcriptJsonKey = `${uploadRecordId}/transcript.json`,
) {
  const { changed } = await storeTranscriptParagraphs(
    uploadRecordId,
    transcriptJsonKey,
  );

  if (!changed) {
    await executeChild(indexDocumentWorkflow, {
      workflowId: `media:rebuild-paragraphs:${uploadRecordId}`,
      args: ['media', uploadRecordId],
      taskQueue: BACKGROUND_QUEUE,
      priority: { priorityKey: PRIORITY_USER },
    });
    return { changed: false };
  }

  // Sequential, as in process-media: summarize reads the OUTLINE annotations.
  await executeChild(annotateTranscriptWorkflow, {
    workflowId: `annotateTranscript:rebuild-paragraphs:${uploadRecordId}`,
    args: [uploadRecordId],
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_USER },
  });
  await executeChild(summarizeUploadWorkflow, {
    workflowId: `summarizeUpload:rebuild-paragraphs:${uploadRecordId}`,
    args: [uploadRecordId, { embedParagraphs: true }],
    taskQueue: BACKGROUND_QUEUE,
    priority: { priorityKey: PRIORITY_USER },
  });
  return { changed: true };
}
