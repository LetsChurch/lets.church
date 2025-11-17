import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const REDACT_PATHS = ['password', 'cookie'];

/**
 * Logger fields:
 *   - serviceName: Name of the service
 *   - level: The log level
 *   - module: The relative path to the JavaScript module that emitted the log
 *   - args: Arguments sent to a file
 *   - args.targetId: The id of the resource that was targeted
 *   - meta: Stringified JSON for additional data that won't be indexed as a field
 */
export const logger = pino({
  formatters: {
    bindings(bindings) {
      return {
        ...bindings,
        serviceName: process.env.SERVICE_NAME ?? 'unknown',
        identity: process.env.IDENTITY ?? 'unknown',
      };
    },
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

export type Logger = typeof logger;
