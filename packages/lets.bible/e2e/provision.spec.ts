import { expect, test } from '@playwright/test';

import { provision } from '../src/db/provision';

function lifecycleHarness(childError?: Error) {
  const events: string[] = [];
  const queries: Array<[string, [number]]> = [];
  const client = {
    async query(statement: string, values: [number]) {
      queries.push([statement, values]);
      events.push(statement.includes('unlock') ? 'unlock' : 'lock');
    },
    release() {
      events.push('release');
    },
  };
  const pool = {
    async connect() {
      events.push('connect');
      return client;
    },
    async end() {
      events.push('end');
    },
  };
  const run = (script: string) => {
    events.push(`run:${script}`);
    if (childError) throw childError;
  };

  return { events, pool, queries, run };
}

test('one checked-out client owns the complete provisioning lifecycle', async () => {
  const { events, pool, queries, run } = lifecycleHarness();

  await provision(pool, run);

  expect(queries).toEqual([
    ['SELECT pg_advisory_lock($1)', [728_401_553]],
    ['SELECT pg_advisory_unlock($1)', [728_401_553]],
  ]);
  expect(events).toEqual([
    'connect',
    'lock',
    'run:db:migrate',
    'run:es:push-mappings',
    'unlock',
    'release',
    'end',
  ]);
});

test('a failed child still unlocks and releases before ending the pool', async () => {
  const failure = new Error('migration failed');
  const { events, pool, run } = lifecycleHarness(failure);

  await expect(provision(pool, run)).rejects.toThrow('migration failed');

  expect(events).toEqual([
    'connect',
    'lock',
    'run:db:migrate',
    'unlock',
    'release',
    'end',
  ]);
});
