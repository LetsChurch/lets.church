import { logger as baseLogger, type Logger } from '@letschurch/util';

export type { Logger } from '@letschurch/util';

export const logger: Logger = baseLogger.child({
  package: '@letschurch/temporal',
});

export default logger;
