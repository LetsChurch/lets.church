import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const REDACT_PATHS = ['password', 'cookie'];

/**
 * Utility type that creates an object type where all specified keys are forbidden (set to never).
 * This is used to prevent specific properties from being used in a type.
 *
 * @template K - The property keys to forbid
 * @example
 * type Example = Forbid<'foo' | 'bar'>;
 * // Results in: { foo?: never; bar?: never; }
 */
type Forbid<K extends PropertyKey> = {
  [P in K]?: never;
};

/**
 * Utility type that adds a `context` field to an object type, but prevents the context
 * from containing any keys that already exist in the base type T.
 * This ensures that structured log fields stay at the top level for indexing,
 * while preventing duplicate keys in the context object.
 *
 * @template T - The base object type
 * @example
 * type Fields = WithContext<{ userId: string }>;
 * // Results in: { userId: string; context?: { userId?: never; [key: string]: unknown } }
 * // This prevents: logger.info({ userId: '123', context: { userId: '456' } })
 * // But allows: logger.info({ userId: '123', context: { procedure: 'foo' } })
 */
type WithContext<T extends object> = T & {
  /** Additional informational data (JSON stringified to avoid creating many indexed fields) */
  context?: Forbid<keyof T> & Record<string, unknown>;
};

/**
 * Allowed log fields - defines the exact set of fields that can be logged.
 * This enforces that only commonly-queried fields are logged at the top level,
 * while additional informational data should be placed in the `context` field.
 */
export type AllowedLogFields = WithContext<
  Partial<{
    // User/Request Identifiers
    /** User ID for the current request/operation */
    appUserId: string;
    /** Request correlation ID for tracing requests across services */
    requestId: string;

    // Resource Identifiers
    /** Channel resource ID */
    channelId: string;
    /** Organization resource ID */
    organizationId: string;
    /** S3 object key for uploaded files */
    s3UploadKey: string;
    /** Generic target resource ID */
    targetId: string;
    /** Upload/media resource ID */
    uploadId: string;
    /** Database record ID for upload tracking */
    uploadRecordId: string;

    // Temporal/Workflow Identifiers
    /** Temporal activity name being executed */
    temporalActivity: string;
    /** Temporal workflow ID */
    workflowId: string;

    // Service/Module Identifiers
    /** Service identity (set by bindings) - typically hostname or container ID */
    identity: string;
    /** Module name (set by child loggers) - specific code module/file */
    module: string;
    /** Package name (set by child loggers) - monorepo package name */
    package: string;
    /** Service name (set by bindings) - e.g., 'web', 'worker', etc. */
    serviceName: string;

    // Other
    /** Error objects (serialized by pino's error serializer) */
    err: Error;
  }>
>;

/**
 * Utility type that enforces no extra properties beyond AllowedLogFields.
 * Unlike Exact, this allows any subset of AllowedLogFields while preventing extra keys.
 */
type NoExtraKeys<T> = T & {
  [K in Exclude<keyof T, keyof AllowedLogFields>]: never;
};

const baseLogger = pino({
  formatters: {
    bindings(bindings) {
      return {
        ...bindings,
        serviceName: process.env.SERVICE_NAME ?? 'unknown',
        identity: process.env.IDENTITY ?? 'unknown',
      };
    },
  },
  // Serialize the context field as JSON string to avoid creating many indexed fields
  serializers: {
    context: (value: Record<string, unknown>) => JSON.stringify(value),
    err: pino.stdSerializers.err,
  },
  // Redact sensitive information using pino's built-in redaction
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  // Only use pino-pretty transport in development for readability
  // In production, log to stdout as JSON (standard for containerized apps)
  // Logs are collected by Vector DaemonSet and shipped to Axiom
  ...(!isProduction && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});

class LcLogger<T extends AllowedLogFields> {
  private pino: pino.Logger;

  constructor(p: pino.Logger) {
    this.pino = p;
  }

  fatal<U extends T>(
    obj: NoExtraKeys<U>,
    msg?: string,
    ...args: Array<unknown>
  ): void;
  fatal(msg: string, ...args: Array<unknown>): void;
  fatal<U extends T>(
    objOrMsg: NoExtraKeys<U> | string,
    msgOrFirstArg?: string | unknown,
    ...restArgs: Array<unknown>
  ): void {
    if (typeof objOrMsg === 'string') {
      (this.pino.fatal as (msg: string, ...args: unknown[]) => void)(
        objOrMsg,
        msgOrFirstArg,
        ...restArgs,
      );
    } else {
      this.pino.fatal(objOrMsg as object, msgOrFirstArg as string, ...restArgs);
    }
  }

  error<U extends T>(
    obj: NoExtraKeys<U>,
    msg?: string,
    ...args: Array<unknown>
  ): void;
  error(msg: string, ...args: Array<unknown>): void;
  error<U extends T>(
    objOrMsg: NoExtraKeys<U> | string,
    msgOrFirstArg?: string | unknown,
    ...restArgs: Array<unknown>
  ): void {
    if (typeof objOrMsg === 'string') {
      (this.pino.error as (msg: string, ...args: unknown[]) => void)(
        objOrMsg,
        msgOrFirstArg,
        ...restArgs,
      );
    } else {
      this.pino.error(objOrMsg as object, msgOrFirstArg as string, ...restArgs);
    }
  }

  warn<U extends T>(
    obj: NoExtraKeys<U>,
    msg?: string,
    ...args: Array<unknown>
  ): void;
  warn(msg: string, ...args: Array<unknown>): void;
  warn<U extends T>(
    objOrMsg: NoExtraKeys<U> | string,
    msgOrFirstArg?: string | unknown,
    ...restArgs: Array<unknown>
  ): void {
    if (typeof objOrMsg === 'string') {
      (this.pino.warn as (msg: string, ...args: unknown[]) => void)(
        objOrMsg,
        msgOrFirstArg,
        ...restArgs,
      );
    } else {
      this.pino.warn(objOrMsg as object, msgOrFirstArg as string, ...restArgs);
    }
  }

  info<U extends T>(
    obj: NoExtraKeys<U>,
    msg?: string,
    ...args: Array<unknown>
  ): void;
  info(msg: string, ...args: Array<unknown>): void;
  info<U extends T>(
    objOrMsg: NoExtraKeys<U> | string,
    msgOrFirstArg?: string | unknown,
    ...restArgs: Array<unknown>
  ): void {
    if (typeof objOrMsg === 'string') {
      (this.pino.info as (msg: string, ...args: unknown[]) => void)(
        objOrMsg,
        msgOrFirstArg,
        ...restArgs,
      );
    } else {
      this.pino.info(objOrMsg as object, msgOrFirstArg as string, ...restArgs);
    }
  }

  debug<U extends T>(
    obj: NoExtraKeys<U>,
    msg?: string,
    ...args: Array<unknown>
  ): void;
  debug(msg: string, ...args: Array<unknown>): void;
  debug<U extends T>(
    objOrMsg: NoExtraKeys<U> | string,
    msgOrFirstArg?: string | unknown,
    ...restArgs: Array<unknown>
  ): void {
    if (typeof objOrMsg === 'string') {
      (this.pino.debug as (msg: string, ...args: unknown[]) => void)(
        objOrMsg,
        msgOrFirstArg,
        ...restArgs,
      );
    } else {
      this.pino.debug(objOrMsg as object, msgOrFirstArg as string, ...restArgs);
    }
  }

  trace<U extends T>(
    obj: NoExtraKeys<U>,
    msg?: string,
    ...args: Array<unknown>
  ): void;
  trace(msg: string, ...args: Array<unknown>): void;
  trace<U extends T>(
    objOrMsg: NoExtraKeys<U> | string,
    msgOrFirstArg?: string | unknown,
    ...restArgs: Array<unknown>
  ): void {
    if (typeof objOrMsg === 'string') {
      (this.pino.trace as (msg: string, ...args: unknown[]) => void)(
        objOrMsg,
        msgOrFirstArg,
        ...restArgs,
      );
    } else {
      this.pino.trace(objOrMsg as object, msgOrFirstArg as string, ...restArgs);
    }
  }

  child(obj: T): LcLogger<T> {
    return new LcLogger<T>(this.pino.child(obj));
  }
}

/**
 * Type-safe logger wrapper that enforces exact field matching.
 * Prevents arbitrary fields from being added to log entries.
 */
export const logger = new LcLogger<AllowedLogFields>(baseLogger);

export type Logger = LcLogger<AllowedLogFields>;
