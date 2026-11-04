import { describe, expect, it, vi } from 'vitest';

vi.mock('@letschurch/db', () => ({ Donation: {}, db: {} }));

import type { DonationStatusDependencies } from './-status.server';
import { handleDonationStatusRequest } from './-status.server';

const checkout = {
  id: 'a1f2de6c-d737-4fa8-b42c-54b16db4ff74',
  status: 'OPEN' as const,
  frequency: 'ONE_TIME' as const,
  amountCents: 2_500,
  currency: 'usd',
};

function statusRequest(
  sessionId = 'cs_test_statusRouteSecret',
  headers?: HeadersInit,
) {
  return new Request(
    `https://example.com/api/donations/status?session_id=${encodeURIComponent(
      sessionId,
    )}`,
    { headers },
  );
}

function dependencies(
  overrides: Partial<DonationStatusDependencies> = {},
): DonationStatusDependencies {
  return {
    findCheckout: vi
      .fn<DonationStatusDependencies['findCheckout']>()
      .mockResolvedValue(checkout),
    findDonation: vi
      .fn<DonationStatusDependencies['findDonation']>()
      .mockResolvedValue(null),
    enforceRateLimit: vi
      .fn<DonationStatusDependencies['enforceRateLimit']>()
      .mockResolvedValue({ allowed: true }),
    reconcile: vi
      .fn<DonationStatusDependencies['reconcile']>()
      .mockResolvedValue(undefined),
    ...overrides,
  };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('donation checkout status', () => {
  it('reconciles an unknown session, since checkouts are stored only once Stripe reports on them', async () => {
    const findCheckout = vi
      .fn<DonationStatusDependencies['findCheckout']>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(checkout);
    const findDonation = vi
      .fn<DonationStatusDependencies['findDonation']>()
      .mockResolvedValue({ status: 'SUCCEEDED' });
    const deps = dependencies({ findCheckout, findDonation });

    const response = await handleDonationStatusRequest(statusRequest(), deps);

    expect(deps.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(deps.reconcile).toHaveBeenCalledWith('cs_test_statusRouteSecret');
    expect(await responseBody(response)).toEqual({
      status: 'SUCCEEDED',
      frequency: 'ONE_TIME',
      amountCents: 2_500,
      currency: 'usd',
    });
  });

  it('keeps sessions that stay unknown data-minimized', async () => {
    const deps = dependencies({
      findCheckout: vi.fn(async () => undefined),
    });

    const response = await handleDonationStatusRequest(
      statusRequest('cs_test_unknownSecret'),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({ status: 'PROCESSING' });
    expect(deps.findDonation).not.toHaveBeenCalled();
  });

  it('rejects ids that are not checkout sessions without any lookup', async () => {
    const deps = dependencies();

    for (const sessionId of [
      'not-a-session',
      'cs_test_',
      'pi_test_abc',
      'cs_live_a/b',
    ]) {
      const response = await handleDonationStatusRequest(
        statusRequest(sessionId),
        deps,
      );
      expect(response.status).toBe(400);
    }
    expect(deps.findCheckout).not.toHaveBeenCalled();
    expect(deps.enforceRateLimit).not.toHaveBeenCalled();
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it('answers a session-limited poll for an unknown session without provider work', async () => {
    const deps = dependencies({
      findCheckout: vi.fn(async () => undefined),
      enforceRateLimit: vi.fn(async () => ({
        allowed: false as const,
        limitedBy: 'session' as const,
        retryAfterSeconds: 10,
      })),
    });

    const response = await handleDonationStatusRequest(statusRequest(), deps);

    expect(await responseBody(response)).toEqual({ status: 'PROCESSING' });
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it('returns a completed local donation without admission or provider work', async () => {
    const deps = dependencies({
      findDonation: vi.fn(async () => ({ status: 'SUCCEEDED' as const })),
    });

    const response = await handleDonationStatusRequest(statusRequest(), deps);

    expect(await responseBody(response)).toEqual({
      status: 'SUCCEEDED',
      frequency: 'ONE_TIME',
      amountCents: 2_500,
      currency: 'usd',
    });
    expect(deps.enforceRateLimit).not.toHaveBeenCalled();
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it('returns an expired checkout without admission or provider work', async () => {
    const deps = dependencies({
      findCheckout: vi
        .fn<DonationStatusDependencies['findCheckout']>()
        .mockResolvedValue({ ...checkout, status: 'EXPIRED' }),
    });

    const response = await handleDonationStatusRequest(statusRequest(), deps);

    expect(await responseBody(response)).toEqual({
      status: 'EXPIRED',
      frequency: 'ONE_TIME',
      amountCents: 2_500,
      currency: 'usd',
    });
    expect(deps.enforceRateLimit).not.toHaveBeenCalled();
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it('allows the first pending poll to reconcile and reread durable state', async () => {
    const findDonation = vi
      .fn<DonationStatusDependencies['findDonation']>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'SUCCEEDED' });
    const deps = dependencies({ findDonation });

    const response = await handleDonationStatusRequest(statusRequest(), deps);

    expect(deps.reconcile).toHaveBeenCalledTimes(1);
    expect(findDonation).toHaveBeenCalledTimes(2);
    expect(await responseBody(response)).toEqual({
      status: 'SUCCEEDED',
      frequency: 'ONE_TIME',
      amountCents: 2_500,
      currency: 'usd',
    });
  });

  it('reconciles a session only once across repeated and concurrent polls', async () => {
    let admittedSession = false;
    const enforceRateLimit = vi.fn(async () => {
      if (admittedSession) {
        return {
          allowed: false as const,
          limitedBy: 'session' as const,
          retryAfterSeconds: 10,
        };
      }
      admittedSession = true;
      return { allowed: true as const };
    });
    const deps = dependencies({ enforceRateLimit });

    const sequential = await Promise.all([
      handleDonationStatusRequest(statusRequest(), deps),
      handleDonationStatusRequest(statusRequest(), deps),
    ]);
    const later = await handleDonationStatusRequest(statusRequest(), deps);

    expect(deps.reconcile).toHaveBeenCalledTimes(1);
    for (const response of [...sequential, later]) {
      expect(await responseBody(response)).toEqual({
        status: 'PROCESSING',
        frequency: 'ONE_TIME',
        amountCents: 2_500,
        currency: 'usd',
      });
    }
  });

  it('applies one IP ceiling across different checkout sessions', async () => {
    let admittedIp = false;
    const enforceRateLimit = vi.fn(async () => {
      if (admittedIp) {
        return {
          allowed: false as const,
          limitedBy: 'ip' as const,
          retryAfterSeconds: 7,
        };
      }
      admittedIp = true;
      return { allowed: true as const };
    });
    const deps = dependencies({ enforceRateLimit });

    const first = await handleDonationStatusRequest(
      statusRequest('cs_test_first', { 'X-Real-IP': '198.51.100.8' }),
      deps,
    );
    const denied = await handleDonationStatusRequest(
      statusRequest('cs_test_second', { 'X-Real-IP': '198.51.100.8' }),
      deps,
    );

    expect(first.status).toBe(200);
    expect(denied.status).toBe(429);
    expect(denied.headers.get('Cache-Control')).toBe('no-store');
    expect(denied.headers.get('Retry-After')).toBe('7');
    expect(await responseBody(denied)).toEqual({
      error: 'Too many requests. Wait a few minutes and try again.',
    });
    expect(deps.reconcile).toHaveBeenCalledTimes(1);
  });

  it('passes requests without a forwarded IP to admission', async () => {
    const deps = dependencies();
    const request = statusRequest();

    await handleDonationStatusRequest(request, deps);

    expect(deps.enforceRateLimit).toHaveBeenCalledWith(
      request.headers,
      'cs_test_statusRouteSecret',
    );
  });

  it('returns PROCESSING when provider reconciliation fails', async () => {
    const sessionId = 'cs_test_providerFailureSecret';
    const deps = dependencies({
      reconcile: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
    });

    const response = await handleDonationStatusRequest(
      statusRequest(sessionId),
      deps,
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'PROCESSING',
      frequency: 'ONE_TIME',
      amountCents: 2_500,
      currency: 'usd',
    });
    expect(JSON.stringify(body)).not.toContain(sessionId);
  });

  it('continues PROCESSING polling and converges after the cooldown', async () => {
    let admissionAttempt = 0;
    let donationStatus: 'SUCCEEDED' | null = null;
    const enforceRateLimit = vi.fn(async () => {
      admissionAttempt += 1;
      return admissionAttempt === 2
        ? {
            allowed: false as const,
            limitedBy: 'session' as const,
            retryAfterSeconds: 8,
          }
        : { allowed: true as const };
    });
    const reconcile = vi.fn(async () => {
      if (admissionAttempt === 3) donationStatus = 'SUCCEEDED';
    });
    const deps = dependencies({
      enforceRateLimit,
      reconcile,
      findDonation: vi.fn(async () =>
        donationStatus ? { status: donationStatus } : null,
      ),
    });

    const first = await handleDonationStatusRequest(statusRequest(), deps);
    const cooled = await handleDonationStatusRequest(statusRequest(), deps);
    const converged = await handleDonationStatusRequest(statusRequest(), deps);

    expect((await responseBody(first)).status).toBe('PROCESSING');
    expect((await responseBody(cooled)).status).toBe('PROCESSING');
    expect((await responseBody(converged)).status).toBe('SUCCEEDED');
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
});
