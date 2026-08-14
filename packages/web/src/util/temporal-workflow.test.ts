import { beforeEach, describe, expect, test, vi } from 'vitest';

const temporalMocks = vi.hoisted(() => ({
  describe: vi.fn(),
  error: vi.fn(),
  getHandle: vi.fn(),
  info: vi.fn(),
  list: vi.fn(),
  makeProcessMediaWorkflowId: vi.fn(
    (uploadKey: string) => `processMedia:${uploadKey}`,
  ),
}));

vi.mock('@/temporal', () => ({
  client: Promise.resolve({
    workflow: {
      getHandle: temporalMocks.getHandle,
      list: temporalMocks.list,
    },
  }),
  makeProcessMediaWorkflowId: temporalMocks.makeProcessMediaWorkflowId,
}));

vi.mock('./logger', () => ({
  default: {
    child: () => ({
      error: temporalMocks.error,
      info: temporalMocks.info,
    }),
  },
}));

import {
  filterUploadsWithActiveWorkflows,
  filterUploadsWithoutActiveWorkflows,
  WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE,
} from './temporal-workflow';

type Upload = {
  finalizedUploadKey: string | null;
  marker: string;
};

function upload(finalizedUploadKey: string | null, marker?: string): Upload {
  return { finalizedUploadKey, marker: marker ?? finalizedUploadKey ?? 'null' };
}

function visibilityResults(workflowIds: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const workflowId of workflowIds) yield { workflowId };
    },
  };
}

beforeEach(() => {
  temporalMocks.describe.mockReset();
  temporalMocks.error.mockReset();
  temporalMocks.getHandle.mockReset();
  temporalMocks.info.mockReset();
  temporalMocks.list.mockReset();
  temporalMocks.makeProcessMediaWorkflowId.mockClear();
});

describe('filterUploadsWithActiveWorkflows', () => {
  test('does not query Temporal for empty input or null upload keys', async () => {
    await expect(filterUploadsWithActiveWorkflows([])).resolves.toEqual([]);
    await expect(
      filterUploadsWithActiveWorkflows([upload(null)]),
    ).resolves.toEqual([]);

    expect(temporalMocks.list).not.toHaveBeenCalled();
  });

  test('returns running executions in input order while preserving duplicates', async () => {
    temporalMocks.list.mockReturnValue(
      visibilityResults(['processMedia:running', 'processMedia:unexpected']),
    );
    const runningFirst = upload('running', 'first');
    const runningDuplicate = upload('running', 'duplicate');
    const candidates = [
      upload(null),
      runningFirst,
      upload('closed'),
      upload('missing'),
      runningDuplicate,
    ];

    await expect(filterUploadsWithActiveWorkflows(candidates)).resolves.toEqual(
      [runningFirst, runningDuplicate],
    );
    expect(temporalMocks.list).toHaveBeenCalledTimes(1);

    const [{ query, pageSize }] = temporalMocks.list.mock.calls[0] as [
      { query: string; pageSize: number },
    ];
    expect(pageSize).toBe(WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE);
    expect(query.match(/WorkflowId = 'processMedia:running'/g)).toHaveLength(1);
    expect(query).toContain("WorkflowId = 'processMedia:closed'");
    expect(query).toContain("WorkflowId = 'processMedia:missing'");
    expect(query).toContain("ExecutionStatus = 'Running'");
  });

  test('consumes the complete paginated visibility iterator', async () => {
    let pagesRead = 0;
    temporalMocks.list.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        pagesRead += 1;
        yield { workflowId: 'processMedia:first' };
        await Promise.resolve();
        pagesRead += 1;
        yield { workflowId: 'processMedia:second' };
      },
    });
    const first = upload('first');
    const second = upload('second');

    await expect(
      filterUploadsWithActiveWorkflows([first, second]),
    ).resolves.toEqual([first, second]);
    expect(pagesRead).toBe(2);
  });

  test('bounds 100 processing-row lookups by the documented chunk size and consumes all results', async () => {
    const candidates = Array.from({ length: 100 }, (_, index) =>
      upload(`key-${index}`),
    );
    temporalMocks.list.mockImplementation(({ query }: { query: string }) =>
      visibilityResults(
        ['processMedia:key-0', 'processMedia:key-99'].filter((workflowId) =>
          query.includes(`WorkflowId = '${workflowId}'`),
        ),
      ),
    );

    await expect(filterUploadsWithActiveWorkflows(candidates)).resolves.toEqual(
      [candidates[0], candidates[99]],
    );
    expect(temporalMocks.list).toHaveBeenCalledTimes(
      Math.ceil(candidates.length / WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE),
    );
    expect(temporalMocks.getHandle).not.toHaveBeenCalled();
    expect(temporalMocks.info).toHaveBeenCalledWith(
      {
        context: expect.objectContaining({
          candidateCount: 100,
          chunkCount: 3,
          rpcCount: 3,
          durationMs: expect.any(Number),
        }),
      },
      'Filtered upload workflows with Temporal visibility',
    );
  });

  test('escapes adversarial workflow IDs without adding visibility terms', async () => {
    temporalMocks.list.mockReturnValue(visibilityResults([]));
    const adversarialKey = "safe\\' OR ExecutionStatus = 'Closed";

    await filterUploadsWithActiveWorkflows([upload(adversarialKey)]);

    const [{ query }] = temporalMocks.list.mock.calls[0] as [{ query: string }];
    expect(query).toContain(
      "WorkflowId = 'processMedia:safe\\\\'' OR ExecutionStatus = ''Closed'",
    );
    expect(query).not.toContain(
      "WorkflowId = 'processMedia:safe\\' OR ExecutionStatus = 'Closed'",
    );
  });

  test('rejects overlong exact IDs before issuing a visibility query', async () => {
    await expect(
      filterUploadsWithActiveWorkflows([upload('x'.repeat(8_001))]),
    ).rejects.toThrow(RangeError);
    expect(temporalMocks.list).not.toHaveBeenCalled();
  });

  test('propagates a visibility failure after an earlier chunk instead of returning partial results', async () => {
    const candidates = Array.from(
      { length: WORKFLOW_VISIBILITY_QUERY_CHUNK_SIZE + 1 },
      (_, index) => upload(`key-${index}`),
    );
    temporalMocks.list
      .mockReturnValueOnce(visibilityResults(['processMedia:key-0']))
      .mockImplementationOnce(() => ({
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              throw new TypeError('visibility unavailable');
            },
          };
        },
      }));

    await expect(filterUploadsWithActiveWorkflows(candidates)).rejects.toThrow(
      'visibility unavailable',
    );
    expect(temporalMocks.list).toHaveBeenCalledTimes(2);
    expect(temporalMocks.error).toHaveBeenCalledWith(
      {
        context: expect.objectContaining({
          candidateCount: candidates.length,
          chunkCount: 2,
          rpcCount: 2,
          errorClass: 'TypeError',
        }),
      },
      'Failed to filter upload workflows with Temporal visibility',
    );
  });
});

describe('filterUploadsWithoutActiveWorkflows', () => {
  test('uses strongly consistent descriptions, memoizes duplicates, and preserves order', async () => {
    temporalMocks.getHandle.mockImplementation((workflowId: string) => ({
      describe: async () => {
        temporalMocks.describe(workflowId);
        if (workflowId === 'processMedia:missing') {
          const error = new Error('missing');
          error.name = 'WorkflowNotFoundError';
          throw error;
        }
        return {
          status: {
            name:
              workflowId === 'processMedia:running' ? 'RUNNING' : 'COMPLETED',
          },
        };
      },
    }));
    const nullKey = upload(null);
    const closed = upload('closed', 'closed-first');
    const closedDuplicate = upload('closed', 'closed-duplicate');
    const missing = upload('missing');

    await expect(
      filterUploadsWithoutActiveWorkflows([
        upload('running'),
        nullKey,
        closed,
        closedDuplicate,
        missing,
      ]),
    ).resolves.toEqual([nullKey, closed, closedDuplicate, missing]);
    expect(temporalMocks.describe).toHaveBeenCalledTimes(3);
    expect(temporalMocks.list).not.toHaveBeenCalled();
  });

  test('fails closed when any Temporal description is ambiguous', async () => {
    temporalMocks.getHandle.mockImplementation((workflowId: string) => ({
      describe: async () => {
        if (workflowId === 'processMedia:failed') {
          throw new Error('Temporal unavailable');
        }
        return { status: { name: 'COMPLETED' } };
      },
    }));

    await expect(
      filterUploadsWithoutActiveWorkflows([upload('closed'), upload('failed')]),
    ).rejects.toThrow('Temporal unavailable');
  });
});
