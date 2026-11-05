import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Context } from '@/trpc/context';

const mocks = vi.hoisted(() => ({
  canView: vi.fn(),
  findUpload: vi.fn(),
  findGuide: vi.fn(),
  workflowState: vi.fn(),
  start: vi.fn(),
  consume: vi.fn(),
  enforceAi: vi.fn(),
}));

vi.mock('@letschurch/db', () => ({
  db: {
    query: {
      UploadRecord: { findFirst: mocks.findUpload },
      StudyGuide: { findFirst: mocks.findGuide },
    },
  },
}));
vi.mock('@/temporal', () => ({
  getStudyGuideWorkflowState: mocks.workflowState,
  startGenerateStudyGuide: mocks.start,
}));
vi.mock('@/util/maintenance', () => ({
  getMaintenanceConfig: async () => ({ maintenanceMode: false }),
}));
vi.mock('@/util/media-visibility', () => ({ canViewMediaById: mocks.canView }));
vi.mock('@/util/rate-limit', () => ({
  consumeTokenBucketWithFallback: mocks.consume,
}));
vi.mock('@/ai/abuse-control', () => ({
  enforceAiRateLimit: mocks.enforceAi,
}));
vi.mock('@/util/logger', () => ({
  default: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { studyGuideProcedures, studyGuideUrl } from './study-guide';

const mediaId = '00000000-0000-4000-8000-000000000002';

function caller() {
  return studyGuideProcedures.createCaller({
    isSiteAdmin: false,
    req: new Request('http://localhost/trpc', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    }),
    resHeaders: new Headers(),
    session: null,
  } as unknown as Context);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canView.mockResolvedValue(true);
  mocks.findUpload.mockResolvedValue({
    summarizedAt: new Date(),
    lengthSeconds: 1800,
    downloadsEnabled: true,
  });
  mocks.findGuide.mockResolvedValue(undefined);
  mocks.workflowState.mockResolvedValue('none');
  mocks.consume.mockResolvedValue({ allowed: true });
  mocks.enforceAi.mockResolvedValue({ allowed: true });
});

describe('studyGuide.request', () => {
  it('returns a current guide without starting anything', async () => {
    mocks.findGuide.mockResolvedValue({ version: 1 });

    await expect(caller().request({ mediaId })).resolves.toEqual({
      status: 'ready',
      url: studyGuideUrl(mediaId),
    });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.enforceAi).not.toHaveBeenCalled();
  });

  it('joins a running generation without spending budget', async () => {
    mocks.workflowState.mockResolvedValue('running');

    await expect(caller().request({ mediaId })).resolves.toEqual({
      status: 'pending',
    });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('starts generating when there is no guide, and after a failure', async () => {
    await expect(caller().request({ mediaId })).resolves.toEqual({
      status: 'pending',
    });
    mocks.workflowState.mockResolvedValue('failed');
    await caller().request({ mediaId });

    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenCalledWith(mediaId);
  });

  it('regenerates a guide from an older version', async () => {
    mocks.findGuide.mockResolvedValue({ version: 0 });

    await caller().request({ mediaId });
    expect(mocks.start).toHaveBeenCalled();
  });

  it('charges the shared AI quota for this media, then the site-wide cap', async () => {
    await caller().request({ mediaId });

    expect(mocks.enforceAi).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'study-guide',
        resourceId: `study-guide:${mediaId}`,
      }),
    );
    expect(mocks.consume).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'study-guide:global' }),
    );
    expect(mocks.enforceAi.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.consume.mock.invocationCallOrder[0] as number,
    );
  });

  it('refuses without spending the site-wide cap when the AI quota is out', async () => {
    mocks.enforceAi.mockResolvedValue({
      allowed: false,
      limitedBy: 'ip',
      retryAfterSeconds: 30,
    });

    await expect(caller().request({ mediaId })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('refuses when the site-wide cap is spent', async () => {
    mocks.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });

    await expect(caller().request({ mediaId })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('hides media the viewer cannot see', async () => {
    mocks.canView.mockResolvedValue(false);

    await expect(caller().request({ mediaId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.findGuide).not.toHaveBeenCalled();
  });

  it('waits for the transcript pipeline to finish', async () => {
    mocks.findUpload.mockResolvedValue({
      summarizedAt: null,
      lengthSeconds: 1800,
      downloadsEnabled: true,
    });

    await expect(caller().request({ mediaId })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('refuses uploads with downloads turned off', async () => {
    mocks.findUpload.mockResolvedValue({
      summarizedAt: new Date(),
      lengthSeconds: 1800,
      downloadsEnabled: false,
    });

    await expect(caller().request({ mediaId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.enforceAi).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('refuses uploads under the minimum length', async () => {
    mocks.findUpload.mockResolvedValue({
      summarizedAt: new Date(),
      lengthSeconds: 9 * 60,
      downloadsEnabled: true,
    });

    await expect(caller().request({ mediaId })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.enforceAi).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});

describe('studyGuide.status', () => {
  it('reports ready when the workflow finished between reads', async () => {
    mocks.findGuide
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ version: 1 });

    await expect(caller().status({ mediaId })).resolves.toEqual({
      status: 'ready',
      url: studyGuideUrl(mediaId),
    });
  });

  it('never starts generation', async () => {
    await expect(caller().status({ mediaId })).resolves.toEqual({
      status: 'none',
    });
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
