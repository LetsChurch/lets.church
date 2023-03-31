import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../../activities/background';

const { updateUploadScores } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export async function updateUploadScoresWorkflow() {
  await updateUploadScores();
}
