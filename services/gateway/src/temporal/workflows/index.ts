import {
  OpenTelemetryInboundInterceptor,
  OpenTelemetryOutboundInterceptor,
} from '@temporalio/interceptors-opentelemetry/lib/workflow';
import type { WorkflowInterceptorsFactory } from '@temporalio/workflow';

export { createUploadRecordWorkflow } from './create-upload-record';
export { deleteUploadWorkflow } from './delete-upload';
export { generatePeaksWorkflow } from './generate-peaks';
export {
  handleMultipartMediaUploadWorkflow,
  uploadDoneSignal,
} from './handle-multipart-media-upload';
export { indexDocumentWorkflow } from './index-document';
export { processImageWorkflow } from './process-image';
export { processMediaWorkflow } from './process-media';
export { sendEmailWorkflow } from './send-email';
export { updateCommentScoresWorkflow } from './update-comment-scores';
export {
  updateUploadRecordWorkflow,
  updateUploadRecordSignal,
} from './update-upload-record';
export { importMediaWorkflow } from './import-media';
export { recordDownloadSizeWorkflow } from './record-download-size';
export { remakeThumbnailsWorkflow } from './remake-thumbnails';
export { resetPasswordWorkflow } from './reset-password';
export { restitchTranscriptWorkflow } from './restitch-transcript';
export { updateDailySaltWorkflow } from './update-daily-salt';
export { updateUploadScoresWorkflow } from './update-upload-scores';

export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
});
