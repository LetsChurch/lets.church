import pino from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';

const logger = pino({
  formatters: {
    bindings(bindings) {
      return {
        ...bindings,
        serviceName: process.env['SERVICE_NAME'] ?? 'unknown',
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
