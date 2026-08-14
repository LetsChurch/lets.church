import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  getWebhookSecret: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  processStripeEvent: vi.fn(),
}));

vi.mock('@/donations/stripe-client', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: routeMocks.constructEvent },
  }),
  getStripeWebhookSecret: routeMocks.getWebhookSecret,
}));

vi.mock('@/donations/webhooks', () => ({
  processStripeEvent: routeMocks.processStripeEvent,
}));

vi.mock('@/util/logger', () => ({
  default: {
    child: () => ({
      error: routeMocks.loggerError,
      warn: routeMocks.loggerWarn,
    }),
  },
}));

import { Route } from './stripe';

type PostHandler = (context: { request: Request }) => Promise<Response>;

type EventEnvelope = Pick<Stripe.Event, 'created' | 'id' | 'type'> & {
  data: { object: { id: string } };
};

const secret = 'whsec_route_test_secret';
const stripe = new Stripe('sk_test_route_signature_verifier');
const validEvent = {
  created: 1_750_000_000,
  data: { object: { id: 'cs_route_test' } },
  id: 'evt_route_test',
  type: 'checkout.session.completed',
} satisfies EventEnvelope;

function postHandler(): PostHandler {
  const options = Route.options as unknown as {
    server: { handlers: { POST: PostHandler } };
  };
  return options.server.handlers.POST;
}

function signedRequest(
  payload: string,
  signature = stripe.webhooks.generateTestHeaderString({ payload, secret }),
) {
  return new Request('https://example.com/webhooks/stripe', {
    body: payload,
    headers: { 'stripe-signature': signature },
    method: 'POST',
  });
}

function loggedText() {
  return routeMocks.loggerError.mock.calls
    .flat()
    .concat(routeMocks.loggerWarn.mock.calls.flat())
    .map((value) => {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    })
    .join('\n');
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  routeMocks.constructEvent
    .mockReset()
    .mockImplementation(
      (payload: string, signature: string, webhookSecret: string) =>
        stripe.webhooks.constructEvent(payload, signature, webhookSecret),
    );
  routeMocks.getWebhookSecret.mockReset().mockReturnValue(secret);
  routeMocks.loggerError.mockReset();
  routeMocks.loggerWarn.mockReset();
  routeMocks.processStripeEvent.mockReset().mockResolvedValue({
    duplicate: false,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.sequential('Stripe webhook HTTP authenticity boundary', () => {
  it('accepts an SDK-signed payload and returns the receipt envelope', async () => {
    const payload = JSON.stringify(validEvent);
    const request = signedRequest(payload);

    const response = await postHandler()({ request });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      duplicate: false,
      received: true,
    });
    expect(routeMocks.constructEvent).toHaveBeenCalledWith(
      payload,
      request.headers.get('stripe-signature'),
      secret,
    );
    expect(routeMocks.processStripeEvent).toHaveBeenCalledWith(validEvent);
  });

  it('preserves the accepted duplicate envelope', async () => {
    routeMocks.processStripeEvent.mockResolvedValue({ duplicate: true });

    const response = await postHandler()({
      request: signedRequest(JSON.stringify(validEvent)),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      duplicate: true,
      received: true,
    });
    expect(routeMocks.processStripeEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing signature before verification or processing', async () => {
    const payload = JSON.stringify(validEvent);

    const response = await postHandler()({
      request: new Request('https://example.com/webhooks/stripe', {
        body: payload,
        method: 'POST',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe('webhook rejected');
    expect(routeMocks.constructEvent).not.toHaveBeenCalled();
    expect(routeMocks.processStripeEvent).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(payload);
  });

  it('rejects an invalid signature without processing provider state', async () => {
    const payload = JSON.stringify(validEvent);
    const invalidSignature =
      't=1750000000,v1=0000000000000000000000000000000000000000000000000000000000000000';

    const response = await postHandler()({
      request: signedRequest(payload, invalidSignature),
    });

    expect(response.status).toBe(400);
    expect(routeMocks.constructEvent).toHaveBeenCalledTimes(1);
    expect(routeMocks.processStripeEvent).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(payload);
    expect(loggedText()).not.toContain(invalidSignature);
  });

  it('rejects malformed signed JSON without processing provider state', async () => {
    const payload = '{"id":';

    const response = await postHandler()({
      request: signedRequest(payload),
    });

    expect(response.status).toBe(400);
    expect(routeMocks.constructEvent).toHaveBeenCalledTimes(1);
    expect(routeMocks.processStripeEvent).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(payload);
  });

  it('rejects declared oversized bodies before loading signature verification', async () => {
    const payload = JSON.stringify(validEvent);
    const response = await postHandler()({
      request: new Request('https://example.com/webhooks/stripe', {
        body: payload,
        headers: {
          'content-length': String(2 * 1024 * 1024 + 1),
          'stripe-signature': 'not-read',
        },
        method: 'POST',
      }),
    });

    expect(response.status).toBe(413);
    expect(routeMocks.constructEvent).not.toHaveBeenCalled();
    expect(routeMocks.processStripeEvent).not.toHaveBeenCalled();
  });

  it('rejects processor failure without logging the signed body or signature', async () => {
    const payload = JSON.stringify(validEvent);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    routeMocks.processStripeEvent.mockRejectedValue(
      new Error('database transaction failed'),
    );

    const response = await postHandler()({
      request: signedRequest(payload, signature),
    });

    expect(response.status).toBe(400);
    expect(routeMocks.processStripeEvent).toHaveBeenCalledTimes(1);
    expect(routeMocks.loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Stripe webhook failed',
    );
    expect(loggedText()).not.toContain(payload);
    expect(loggedText()).not.toContain(signature);
  });

  it('refuses production delivery when no webhook secret is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    routeMocks.getWebhookSecret.mockReturnValue(null);
    const payload = JSON.stringify(validEvent);

    const response = await postHandler()({
      request: new Request('https://example.com/webhooks/stripe', {
        body: payload,
        method: 'POST',
      }),
    });

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('webhook unavailable');
    expect(routeMocks.constructEvent).not.toHaveBeenCalled();
    expect(routeMocks.processStripeEvent).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(payload);
  });
});
