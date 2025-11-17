/**
 * Utility for standardized tRPC procedure logging
 */

import type { Logger } from '@letschurch/util';

export type TrpcLogContext = {
  procedure: string;
  userId?: string;
  clientIp?: string;
  [key: string]: unknown;
};

/**
 * Create a child logger for a tRPC procedure
 */
export function createProcedureLogger(
  baseLogger: Logger,
  context: TrpcLogContext,
): Logger {
  return baseLogger.child({
    procedure: context.procedure,
    userId: context.userId,
    clientIp: context.clientIp,
  });
}

/**
 * Log the start of a tRPC procedure
 */
export function logProcedureStart(
  logger: Logger,
  procedure: string,
  input: unknown,
  context?: Omit<TrpcLogContext, 'procedure'>,
): void {
  logger.info(
    {
      ...context,
      input,
    },
    `tRPC procedure started: ${procedure}`,
  );
}

/**
 * Log the successful completion of a tRPC procedure
 */
export function logProcedureSuccess(
  logger: Logger,
  procedure: string,
  metadata?: Record<string, unknown>,
  durationMs?: number,
): void {
  logger.info(
    {
      ...metadata,
      durationMs,
    },
    `tRPC procedure completed: ${procedure}`,
  );
}

/**
 * Log an error in a tRPC procedure
 */
export function logProcedureError(
  logger: Logger,
  procedure: string,
  error: Error | unknown,
  context?: Record<string, unknown>,
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  logger.error(
    {
      ...context,
      error: errorObj.message,
      stack: errorObj.stack,
      errorName: errorObj.name,
    },
    `tRPC procedure error: ${procedure}`,
  );
}

/**
 * Measure execution time of a tRPC procedure
 */
export function measureProcedureDuration<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();

  return Promise.resolve(fn()).then((result) => ({
    result,
    durationMs: Date.now() - start,
  }));
}

/**
 * Helper to create a comprehensive logging wrapper for tRPC procedures
 */
export async function withProcedureLogging<T>(
  logger: Logger,
  procedure: string,
  input: unknown,
  fn: () => T | Promise<T>,
  context?: Omit<TrpcLogContext, 'procedure'>,
): Promise<T> {
  logProcedureStart(logger, procedure, input, context);

  try {
    const { result, durationMs } = await measureProcedureDuration(fn);

    logProcedureSuccess(logger, procedure, undefined, durationMs);

    return result;
  } catch (error) {
    logProcedureError(logger, procedure, error, {
      input,
      ...context,
    });
    throw error;
  }
}
