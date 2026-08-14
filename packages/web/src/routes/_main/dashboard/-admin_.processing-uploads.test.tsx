import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  PROCESSING_UPLOADS_POLLING_OPTIONS,
  PROCESSING_UPLOADS_REFETCH_INTERVAL_MS,
  processingUploadsRefetchInterval,
} from './admin_.processing-uploads';

afterEach(() => {
  vi.useRealTimers();
});

describe('processing uploads polling', () => {
  test('uses the slower active cadence while rows remain', () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    const interval = processingUploadsRefetchInterval({
      state: { data: [{ id: 'upload' }] },
    });
    expect(interval).toBe(PROCESSING_UPLOADS_REFETCH_INTERVAL_MS);

    const timer = setInterval(refetch, interval || 1);
    vi.advanceTimersByTime(PROCESSING_UPLOADS_REFETCH_INTERVAL_MS - 1);
    expect(refetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    clearInterval(timer);
  });

  test('stops polling when no processing rows remain or data is unavailable', () => {
    expect(processingUploadsRefetchInterval({ state: { data: [] } })).toBe(
      false,
    );
    expect(
      processingUploadsRefetchInterval({ state: { data: undefined } }),
    ).toBe(false);
  });

  test('pauses interval work in hidden tabs and refetches after focus or reconnect', () => {
    expect(PROCESSING_UPLOADS_POLLING_OPTIONS).toMatchObject({
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });
  });
});
