/**
 * Utility for standardized Temporal activity logging
 */

import type { Logger } from '@letschurch/util';

export type ActivityLogContext = {
  temporalActivity: string;
  workflowId?: string;
  runId?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Create a child logger for a Temporal activity
 */
export function createActivityLogger(
  baseLogger: Logger,
  context: ActivityLogContext,
): Logger {
  return baseLogger.child({
    temporalActivity: context.temporalActivity,
    workflowId: context.workflowId,
    context: {
      args: context.args ?? {},
      runId: context.runId,
    },
  });
}

/**
 * Log the start of a Temporal activity
 */
export function logActivityStart(
  logger: Logger,
  activity: string,
  args?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): void {
  logger.info(
    {
      context: {
        args: args ?? {},
        meta: metadata,
      },
    },
    `Activity started: ${activity}`,
  );
}

/**
 * Log progress in a long-running Temporal activity
 */
export function logActivityProgress(
  logger: Logger,
  activity: string,
  progress: string | Record<string, unknown>,
  metadata?: Record<string, unknown>,
): void {
  const progressData =
    typeof progress === 'string' ? { message: progress } : progress;

  logger.info(
    {
      context: {
        progress: progressData,
        meta: metadata,
      },
    },
    `Activity progress: ${activity}`,
  );
}

/**
 * Log the successful completion of a Temporal activity
 */
export function logActivitySuccess(
  logger: Logger,
  activity: string,
  summary?: Record<string, unknown>,
  durationMs?: number,
): void {
  logger.info(
    {
      context: {
        summary: summary ?? {},
        durationMs,
      },
    },
    `Activity completed: ${activity}`,
  );
}

/**
 * Log an error in a Temporal activity
 */
export function logActivityError(
  logger: Logger,
  activity: string,
  error: Error | unknown,
  ctx?: {
    stdout?: string;
    stderr?: string;
    args?: Record<string, unknown>;
    [key: string]: unknown;
  },
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  logger.error(
    {
      err: errorObj,
      context: {
        args: ctx?.args,
        meta: ctx
          ? {
              stdout: ctx.stdout,
              stderr: ctx.stderr,
              ...ctx,
            }
          : undefined,
      },
    },
    `Activity error: ${activity}`,
  );
}

/**
 * Measure execution time of a Temporal activity
 */
export async function measureActivityDuration<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();

  const result = await Promise.resolve(fn());

  return {
    result,
    durationMs: Date.now() - start,
  };
}

/**
 * Helper to create a comprehensive logging wrapper for Temporal activities
 */
export async function withActivityLogging<T>(
  logger: Logger,
  activity: string,
  args: Record<string, unknown> | undefined,
  fn: () => T | Promise<T>,
  _options?: {
    onProgress?: (progress: string | Record<string, unknown>) => void;
  },
): Promise<T> {
  logActivityStart(logger, activity, args);

  try {
    const { result, durationMs } = await measureActivityDuration(fn);

    logActivitySuccess(logger, activity, undefined, durationMs);

    return result;
  } catch (error) {
    logActivityError(logger, activity, error, { args });
    throw error;
  }
}

/**
 * Create a progress logger function for long-running activities
 */
export function createProgressLogger(
  logger: Logger,
  activity: string,
): (progress: string | Record<string, unknown>) => void {
  return (progress) => logActivityProgress(logger, activity, progress);
}
