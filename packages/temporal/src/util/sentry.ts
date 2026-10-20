import * as Sentry from '@sentry/node';

const DENY_IDENTIFYING = {
  deny: ['forwarded', '-ip', 'remote-', 'via', '-user'],
};

/**
 * Initialize Sentry for a worker process (skipped in development).
 *
 * Sentry v11 collects user info, cookies, raw headers, HTTP bodies, database
 * queries, and GenAI inputs/outputs when `dataCollection` is unset. Pin the v10
 * baseline instead so an SDK upgrade never widens what leaves the process
 * (docs/security.md §5); loosen a category here deliberately if we need it.
 */
export function initSentry(dsn: string) {
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'default',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: DENY_IDENTIFYING, response: DENY_IDENTIFYING },
      httpBodies: [],
      urlQueryParams: DENY_IDENTIFYING,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
  });
}
