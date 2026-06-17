// Plain-data signal and query refs that can be imported by both worker code
// (workflow files) and host code (web SSR) without dragging @temporalio/workflow
// into the host bundle. `defineSignal(name)` and `defineQuery(name)` in the SDK
// literally return `{ type, name }` at runtime — the type brand is virtual and
// erased by TypeScript — so we can construct equivalent objects ourselves.
//
// See https://github.com/temporalio/sdk-typescript/issues/2098 for the
// underlying bundler regression that motivated this split.

import type { QueryDefinition, SignalDefinition } from '@temporalio/client';
import type { UploadRecordUpdateData } from './client';

// The argsBrand/retBrand fields on SignalDefinition/QueryDefinition are virtual
// type-only fields (never present at runtime), so we cast through `unknown` to
// produce the runtime-equivalent objects defineSignal/defineQuery would return.
function signal<Args extends unknown[], Name extends string>(
  name: Name,
): SignalDefinition<Args, Name> {
  return { type: 'signal', name } as unknown as SignalDefinition<Args, Name>;
}

function query<Ret, Args extends unknown[], Name extends string>(
  name: Name,
): QueryDefinition<Ret, Args, Name> {
  return {
    type: 'query',
    name,
  } as unknown as QueryDefinition<Ret, Args, Name>;
}

// ====== Signals ======

export const emptySignal = signal<[], 'empty'>('empty');

export const uploadDoneSignal = signal<[Array<string>, string], 'uploadDone'>(
  'uploadDone',
);

export const updateUploadRecordSignal = signal<
  [UploadRecordUpdateData, boolean?],
  'updateRecord'
>('updateRecord');

export const completeResetPasswordSignal = signal<
  [string],
  'completeResetPassword'
>('completeResetPassword');

// ====== Queries ======

export type BackfillProgress = {
  totalCreated: number;
  remaining: number;
  batchesCompleted: number;
};

export const getBackfillProgressQuery = query<
  BackfillProgress,
  [],
  'getBackfillProgress'
>('getBackfillProgress');

export type ReindexProgress = {
  totalIndexed: number;
  offset: number;
  total: number;
};

export const getReindexProgressQuery = query<
  ReindexProgress,
  [],
  'getReindexProgress'
>('getReindexProgress');

export type BackfillSizesProgress = {
  totalUpdated: number;
  totalSkipped: number;
  remaining: number;
  batchesCompleted: number;
};

export const getBackfillSizesProgressQuery = query<
  BackfillSizesProgress,
  [],
  'getBackfillSizesProgress'
>('getBackfillSizesProgress');

export type BackfillOriginalImagesProgress = {
  totalCreated: number;
  batchesCompleted: number;
};

export const getBackfillOriginalImagesProgressQuery = query<
  BackfillOriginalImagesProgress,
  [],
  'getBackfillOriginalImagesProgress'
>('getBackfillOriginalImagesProgress');

export type BackfillFilenamesProgress = {
  totalProcessed: number;
  totalUpdated: number;
  remaining: number;
  batchesCompleted: number;
};

export const getBackfillFilenamesProgressQuery = query<
  BackfillFilenamesProgress,
  [],
  'getBackfillFilenamesProgress'
>('getBackfillFilenamesProgress');

export type CleanupProgress = {
  totalDeleted: number;
  remaining: number;
  batchesCompleted: number;
};

export const getCleanupProgressQuery = query<
  CleanupProgress,
  [],
  'getCleanupProgress'
>('getCleanupProgress');

export type BulkBackupProgress = {
  totalStarted: number;
  batchesCompleted: number;
  remaining: number;
};

export const getBulkBackupProgressQuery = query<
  BulkBackupProgress,
  [],
  'getBulkBackupProgress'
>('getBulkBackupProgress');

export type DeleteChannelProgressState = {
  currentStep:
    | 'marking_deleted'
    | 'deleting_uploads'
    | 'deleting_channel_files'
    | 'deleting_associations'
    | 'deleting_channel_db'
    | 'completed';
  totalUploads: number;
  uploadsStarted: number;
  channelFilesDeleted: boolean;
  associationsDeleted: boolean;
  channelDeleted: boolean;
};

export const getDeleteChannelProgressQuery = query<
  DeleteChannelProgressState,
  [],
  'getDeleteChannelProgress'
>('getDeleteChannelProgress');

export type StorageAuditProgress = {
  phase: 'scanning' | 'reporting' | 'emailing' | 'done';
  shardsComplete: number;
  totalShards: number;
  orphans: number;
  missing: number;
};

export const getStorageAuditProgressQuery = query<
  StorageAuditProgress,
  [],
  'getStorageAuditProgress'
>('getStorageAuditProgress');
