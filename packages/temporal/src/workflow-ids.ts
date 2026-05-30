import { xxh32 } from '@node-rs/xxhash';
import type { DocumentKind } from './activities/background/index-document';

/**
 * Centralized workflow ID generators for consistent naming across the application.
 * These functions ensure all workflow IDs follow the same format, making them
 * easier to find, debug, and manage.
 */

// Upload and Media Processing
export function makeMultipartMediaUploadWorkflowId(
  uploadRecordId: string,
  key: string,
) {
  return `handleMultipartMediaUpload:${xxh32(uploadRecordId)}:${key}`;
}

export function makeProcessMediaWorkflowId(uploadKey: string) {
  return `processMedia:${uploadKey}`;
}

export function makeProcessImageWorkflowId(uploadKey: string) {
  return `processImage:${uploadKey}`;
}

export function makeBackupToGlacierWorkflowId(uploadKey: string) {
  return `backupToGlacier:${uploadKey}`;
}

export function makeDeleteUploadWorkflowId(uploadRecordId: string) {
  return `deleteUpload:${uploadRecordId}:${Date.now()}`;
}

export function makeCreateUploadRecordWorkflowId(
  importId: string | undefined,
  publishedAt: Date,
  title: string,
) {
  return `createUploadRecord:${importId ? `${importId}` : `${publishedAt}:${title}`}`;
}

export function makeUpdateUploadRecordWorkflowId(uploadRecordId: string) {
  return `updateUploadRecord:${uploadRecordId}`;
}

// Per-upload run of the LLM summary + embeddings + lc_media_v1 indexer
// pipeline (`summarizeUploadWorkflow`). No timestamp suffix: we want
// Temporal to refuse a second concurrent run for the same upload (the admin
// procedure also catches RUNNING and surfaces a clean error, but
// ID-uniqueness is the belt to the procedure's braces).
export function makeSummarizeUploadWorkflowId(uploadRecordId: string) {
  return `summarizeUpload:${uploadRecordId}`;
}

// Per-upload run of the annotation pipeline (`annotateTranscriptWorkflow`):
// outline + scripture + keyword annotations, then a media-doc reindex so the
// new annotations land in lc_media_v1. Independent of the summary workflow
// — admins regenerate either one on its own. Same no-timestamp / refuse-
// concurrent rationale as the summary id.
export function makeAnnotateTranscriptWorkflowId(uploadRecordId: string) {
  return `annotateTranscript:${uploadRecordId}`;
}

export function makeRecordDownloadSizeWorkflowId(
  uploadRecordId: string,
  variant?: string,
) {
  return variant
    ? `recordDownloadSize:${uploadRecordId}:${variant}`
    : `recordDownloadSize:${uploadRecordId}`;
}

export function makeUploadWorkflowId(s3UploadKey: string) {
  return `upload:${s3UploadKey}`;
}

// Transcript workflows
export function makeTranscriptWorkflowId(s3UploadKey: string) {
  return `transcript:${s3UploadKey}`;
}

// Document indexing
export function makeIndexDocumentWorkflowId(
  kind: DocumentKind,
  uploadId: string,
) {
  return `${kind}:${uploadId}`;
}

// Email workflows
export function makeInvitationEmailWorkflowId(
  type: 'organization' | 'channel',
  invitationId: string,
) {
  return `${type}-invitation:${invitationId}:${Date.now()}`;
}

export function makeVerificationEmailWorkflowId(userId: string) {
  return `verification-email:${userId}:${Date.now()}`;
}

export function makeSignupEmailWorkflowId(email: string) {
  return `signup-email:${email}:${Date.now()}`;
}

// User workflows
export function makeResetPasswordWorkflowId(id: string) {
  return `resetPassword:${id}`;
}

export function makePostUserRegistrationWorkflowId(userId: string) {
  return `postUserRegistration:${userId}`;
}

// Organization workflows
export function makeGeocodeOrganizationWorkflowId(id: string) {
  return `geocodeOrganization:${id}:${Date.now()}`;
}

export function makeOrganizationWorkflowId(organizationId: string) {
  return `organization:${organizationId}`;
}

// Reprocessing workflows
export type { ReprocessScope } from './reprocess-scope';

import type { ReprocessScope } from './reprocess-scope';

export function makeReprocessAllWorkflowId(scope: ReprocessScope): string {
  if (scope.kind === 'channel')
    return `reprocessAll:channel:${scope.channelId}`;
  return `reprocessAll:${scope.kind}`;
}

export function makeReprocessUploadWorkflowId(uploadRecordId: string) {
  return `reprocessUpload:${uploadRecordId}`;
}

export type { RemuxScope } from './remux-scope';

import type { RemuxScope } from './remux-scope';

export function makeRemuxUploadWorkflowId(uploadRecordId: string) {
  return `remuxUpload:${uploadRecordId}`;
}

export function makeRemuxAllWorkflowId(
  scope: RemuxScope = { kind: 'legacy' },
): string {
  if (scope.kind === 'channel') return `remuxAll:channel:${scope.channelId}`;
  return `remuxAll:${scope.kind}`;
}

// Import workflows
export function makeImportMediaWorkflowId(url: string) {
  return `importMedia:${xxh32(url)}:${Date.now()}`;
}

export function makeImportMediaWithHashWorkflowId(
  importSourceId: string,
  urlHash: string,
) {
  return `importMedia:${importSourceId}:${urlHash}:${Date.now()}`;
}

export function makeScrapeAndImportWorkflowId(
  channelSlug: string,
  importSourceId: string,
  type: 'scheduled' | 'manual' | 'historical',
) {
  const suffix = type === 'scheduled' ? type : `${type}:${Date.now()}`;
  return `scrapeAndImport:${channelSlug}:${importSourceId}:${suffix}`;
}
