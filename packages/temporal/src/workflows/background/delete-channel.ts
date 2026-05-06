import {
  defineQuery,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  startChild,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { CHANNEL_ID_KEY } from '../../search-attributes';
import { deleteUploadWorkflow } from './delete-upload';

// Activity proxies with different timeout configurations
const { markChannelDeleted, getChannelUploadIds } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '2 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { deleteChannelFiles } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

const { deleteChannelAssociations, deleteChannelDb } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '2 minutes',
  heartbeatTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

// Progress tracking types
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

export const getDeleteChannelProgressQuery =
  defineQuery<DeleteChannelProgressState>('getDeleteChannelProgress');

export async function deleteChannelWorkflow(
  channelId: string,
  channelName: string,
) {
  // Initialize progress state
  const progressState: DeleteChannelProgressState = {
    currentStep: 'marking_deleted',
    totalUploads: 0,
    uploadsStarted: 0,
    channelFilesDeleted: false,
    associationsDeleted: false,
    channelDeleted: false,
  };

  // Set up query handler for progress tracking
  setHandler(getDeleteChannelProgressQuery, () => progressState);

  // Step 1: Soft-delete channel (mark as deleted and private)
  await markChannelDeleted(channelId);

  // Step 2: Get all uploads for this channel
  progressState.currentStep = 'deleting_uploads';
  const uploadIds = await getChannelUploadIds(channelId);
  progressState.totalUploads = uploadIds.length;

  // Step 3: Spawn child workflows to delete each upload
  for (const uploadId of uploadIds) {
    try {
      await startChild(deleteUploadWorkflow, {
        args: [uploadId],
        workflowId: `deleteUpload:${uploadId}:${Date.now()}`,
        taskQueue: BACKGROUND_QUEUE,
        parentClosePolicy: ParentClosePolicy.ABANDON,
        typedSearchAttributes: [{ key: CHANNEL_ID_KEY, value: channelId }],
        retry: { maximumAttempts: 3 },
      });
      progressState.uploadsStarted += 1;
    } catch (err) {
      const isAlreadyStartedError =
        err instanceof Error &&
        err.name === 'WorkflowExecutionAlreadyStartedError';
      if (!isAlreadyStartedError) {
        throw err;
      }
      // If workflow already exists, count it as started
      progressState.uploadsStarted += 1;
    }
  }

  // Step 4: Delete channel-specific files (avatar, thumbnail, backups)
  progressState.currentStep = 'deleting_channel_files';
  await deleteChannelFiles(channelId);
  progressState.channelFilesDeleted = true;

  // Step 5: Delete associations (memberships, subscriptions, org links)
  progressState.currentStep = 'deleting_associations';
  await deleteChannelAssociations(channelId);
  progressState.associationsDeleted = true;

  // Step 6: Final database deletion
  progressState.currentStep = 'deleting_channel_db';
  await deleteChannelDb(channelId);
  progressState.channelDeleted = true;

  // Mark as completed
  progressState.currentStep = 'completed';

  return {
    channelId,
    channelName,
    uploadsDeleted: progressState.totalUploads,
  };
}
