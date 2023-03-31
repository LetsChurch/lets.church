import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../../activities/background';

const { updateCommentScores } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

export async function updateCommentScoresWorkflow() {
  await updateCommentScores();
}
