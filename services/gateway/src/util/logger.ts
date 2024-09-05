import pino from 'pino';

/**
 * Logger fields:
 *   - serviceName: Name of the service
 *   - level: The log level
 *   - module: The relative path to the JavaScript module that emitted the log
 *   - args: Arguments sent to a file
 *   - args.targetId: The id of the resource that was targeted
 *   - meta: Stringified JSON for additional data that won't be indexed as a field
 */

const isProduction = process.env['NODE_ENV'] === 'production';

const logger = pino({
  formatters: {
    bindings(bindings) {
      return {
        ...bindings,
        serviceName: process.env['SERVICE_NAME'] ?? 'unknown',
        identity: process.env['IDENTITY'] ?? 'unknown',
      };
    },
  },
  transport: {
    targets: [
      {
        level: 'info',
        target: 'pino-pretty',
        options: {},
      },
      ...(isProduction
        ? [
            {
              level: 'info',
              target: '@axiomhq/pino',
              options: {
                dataset: process.env['AXIOM_DATASET'],
                token: process.env['AXIOM_TOKEN'],
              },
            },
          ]
        : []),
    ],
  },
});

export default logger;
