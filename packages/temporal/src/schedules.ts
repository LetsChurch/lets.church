import type { Client, ScheduleSpec } from '@temporalio/client';

import { BACKGROUND_QUEUE } from './queues';
import logger from './util/logger';
import type * as backgroundWorkflows from './workflows/background';

const moduleLogger = logger.child({ module: 'temporal/schedules' });

type ScheduleDefinition = {
  scheduleId: string;
  workflowType: keyof typeof backgroundWorkflows & `${string}Workflow`;
  spec: ScheduleSpec;
};

/**
 * Fixed, app-wide schedules. These are the source of truth: the background
 * worker reconciles Temporal against this list on every boot, so adding or
 * changing a schedule ships with the code. Per-import-source schedules are
 * managed separately (startImportSourceScheduler in the web app).
 */
export const SCHEDULES: ScheduleDefinition[] = [
  {
    scheduleId: 'update-daily-salt',
    workflowType: 'updateDailySaltWorkflow',
    spec: { cronExpressions: ['@daily'] },
  },
  {
    scheduleId: 'update-upload-scores',
    workflowType: 'updateUploadScoresWorkflow',
    spec: { intervals: [{ every: '5m' }] },
  },
  {
    scheduleId: 'update-comment-scores',
    workflowType: 'updateCommentScoresWorkflow',
    spec: { intervals: [{ every: '5m' }] },
  },
  {
    // Mondays 13:00 UTC: morning in the US.
    scheduleId: 'org-channel-link-digest',
    workflowType: 'organizationChannelLinkDigestWorkflow',
    spec: { cronExpressions: ['0 13 * * 1'] },
  },
];

function isNamedError(err: unknown, name: string) {
  return err instanceof Error && err.name === name;
}

/**
 * Create each schedule that is missing and bring existing ones in line with
 * their definition. Idempotent and safe to run concurrently from every worker
 * replica: a create that loses the race is treated as success, and pause state
 * set by an operator is preserved. Failures are logged rather than thrown so a
 * Temporal hiccup can't keep the worker from starting; the next boot retries.
 */
export async function ensureSchedules(client: Client) {
  for (const { scheduleId, workflowType, spec } of SCHEDULES) {
    const action = {
      type: 'startWorkflow' as const,
      workflowType,
      args: [],
      taskQueue: BACKGROUND_QUEUE,
      workflowId: scheduleId,
    };

    try {
      try {
        await client.schedule.getHandle(scheduleId).update((previous) => ({
          ...previous,
          spec,
          action,
        }));
        moduleLogger.info({ context: { scheduleId } }, 'Schedule up to date');
        continue;
      } catch (err) {
        if (!isNamedError(err, 'ScheduleNotFoundError')) throw err;
      }

      try {
        await client.schedule.create({ scheduleId, spec, action });
        moduleLogger.info({ context: { scheduleId } }, 'Schedule created');
      } catch (err) {
        if (!isNamedError(err, 'ScheduleAlreadyRunning')) throw err;
        moduleLogger.info(
          { context: { scheduleId } },
          'Schedule created concurrently by another worker',
        );
      }
    } catch (err) {
      moduleLogger.error(
        {
          err: err instanceof Error ? err : new Error(String(err)),
          context: { scheduleId },
        },
        'Failed to ensure schedule',
      );
    }
  }
}
