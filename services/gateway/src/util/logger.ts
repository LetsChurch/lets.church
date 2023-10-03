import pino from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';

const logger = pino(
  isProduction ? undefined : { transport: { target: 'pino-pretty' } },
);

export default logger;
