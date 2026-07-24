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

// Field names whose values must never reach durable logs. The base pino logger
// only redacts top-level `password`/`cookie`, but procedure input is nested
// under `context.input` (and serialized to a JSON string), so we redact it here
// before it is ever handed to the logger.
//
// Matched as substrings (case-insensitive) so composite names are also covered:
// `password` catches `newPassword`/`passwordHash`; `token` catches
// `accessToken`/`refreshToken`; `secret` catches `clientSecret`; etc.
const SENSITIVE_SUBSTRINGS = [
  'password',
  'secret',
  'token',
  'hcaptcha',
  'authorization',
  'cookie',
  'credential',
  'apikey',
  'jwt',
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_SUBSTRINGS.some((s) => k.includes(s))) {
    return true;
  }
  // `key` on its own (the reset key) and `...Key` suffixes (apiKey, signingKey,
  // privateKey) — but not arbitrary words that merely contain "key".
  return k === 'key' || k.endsWith('key');
}

/**
 * Recursively redact sensitive values (passwords, CAPTCHA tokens, invitation/
 * reset tokens) from an arbitrary value so it is safe to log.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      if (isSensitiveKey(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, redactSensitive(val, depth + 1)];
    }),
  );
}

/**
 * Create a child logger for a tRPC procedure
 */
export function createProcedureLogger(
  baseLogger: Logger,
  context: TrpcLogContext,
): Logger {
  return baseLogger.child({
    appUserId: context.userId,
    context: {
      procedure: context.procedure,
      clientIp: context.clientIp,
    },
  });
}

/**
 * Log the start of a tRPC procedure
 */
export function logProcedureStart(
  logger: Logger,
  procedure: string,
  input: unknown,
  ctx?: Omit<TrpcLogContext, 'procedure'>,
): void {
  logger.info(
    {
      appUserId: ctx?.userId as string | undefined,
      context: {
        ...ctx,
        input: redactSensitive(input),
      },
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
      context: {
        ...metadata,
        durationMs,
      },
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
  ctx?: Record<string, unknown>,
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  logger.error(
    {
      err: errorObj,
      context: ctx,
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
      input: redactSensitive(input),
      ...context,
    });
    throw error;
  }
}
