import pino from 'pino';
import * as z from 'zod';
// Explicit imports to prevent tree-shaking by bundlers (Vite, Webpack)
// See: https://github.com/pinojs/pino/issues/1964
import '@axiomhq/pino';
import 'pino-pretty';

/**
 * Logger fields:
 *   - serviceName: Name of the service
 *   - level: The log level
 *   - module: The relative path to the JavaScript module that emitted the log
 *   - args: Arguments sent to a file
 *   - args.targetId: The id of the resource that was targeted
 *   - meta: Stringified JSON for additional data that won't be indexed as a field
 */

const isProduction = process.env.NODE_ENV === 'production';

const env = z
  .object({
    AXIOM_DATASET: z.string().optional(),
    AXIOM_TOKEN: z.string().optional(),
  })
  .parse(process.env);

if (!env.AXIOM_DATASET || !env.AXIOM_TOKEN) {
  console.warn('Missing Axiom configuration');
}

const logger = pino({
  formatters: {
    bindings(bindings) {
      return {
        ...bindings,
        serviceName: process.env.SERVICE_NAME ?? 'unknown',
        identity: process.env.IDENTITY ?? 'unknown',
      };
    },
  },
  transport: {
    targets: [
      ...(!isProduction || !env.AXIOM_DATASET || !env.AXIOM_TOKEN
        ? [
            {
              level: 'info',
              target: 'pino-pretty',
              options: {},
            },
          ]
        : []),
      ...(isProduction && env.AXIOM_DATASET && env.AXIOM_TOKEN
        ? [
            {
              level: 'info',
              target: '@axiomhq/pino',
              options: {
                dataset: env.AXIOM_DATASET,
                token: env.AXIOM_TOKEN,
              },
            },
          ]
        : []),
    ],
  },
});

export default logger;

export type Logger = typeof logger;
