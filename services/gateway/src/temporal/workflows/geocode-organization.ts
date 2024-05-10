import { executeChild, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';
import { indexDocumentWorkflow } from './index-document';

const { geocodeOrganization: geocodeOrganizationActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 5 },
});

export async function geocodeOrganizationWorkflow(organizationId: string) {
  const count = await geocodeOrganizationActivity(organizationId);

  if (count > 0) {
    await executeChild(indexDocumentWorkflow, {
      workflowId: `organization:${organizationId}`,
      args: ['organization', organizationId],
      taskQueue: BACKGROUND_QUEUE,
      retry: {
        maximumAttempts: 2,
      },
    });
  }
}
