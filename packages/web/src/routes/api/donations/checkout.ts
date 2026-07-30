import { createFileRoute } from '@tanstack/react-router';

import { donationCheckoutSchema } from '@/schemas/donations';
import logger from '@/util/logger';
import {
  readRequestBody,
  RequestBodyTooLargeError,
} from '@/util/read-request-body';

const moduleLogger = logger.child({
  module: 'routes/api/donations/checkout',
});
const MAX_CHECKOUT_BODY_BYTES = 16_384;

function checkoutResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export const Route = createFileRoute('/api/donations/checkout')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = JSON.parse(
            await readRequestBody(request, MAX_CHECKOUT_BODY_BYTES),
          );
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            return checkoutResponse(
              { error: 'The checkout request is too large.' },
              413,
            );
          }
          return checkoutResponse(
            { error: 'Check the donation details and try again.' },
            400,
          );
        }

        const parsed = donationCheckoutSchema.safeParse(body);
        if (!parsed.success) {
          return checkoutResponse(
            { error: 'Check the donation details and try again.' },
            400,
          );
        }

        const [{ validateHCaptcha }, { getClientIpAddress }, { getSession }] =
          await Promise.all([
            import('@/util/hcaptcha'),
            import('@/util/request-ip'),
            import('@/util/auth'),
          ]);
        const clientIp = getClientIpAddress(request.headers);
        if (!(await validateHCaptcha(parsed.data.hcaptchaToken, clientIp))) {
          return checkoutResponse(
            { error: 'Complete the CAPTCHA and try again.' },
            400,
          );
        }

        const { enforcePublicActionRateLimit, publicActionRateLimitResponse } =
          await import('@/util/public-action-rate-limit');
        const rateLimit = await enforcePublicActionRateLimit({
          headers: request.headers,
          email: parsed.data.email,
          kind: 'donation-checkout',
        });
        if (!rateLimit.allowed) {
          moduleLogger.warn(
            {
              context: {
                limitedBy: rateLimit.limitedBy,
                retryAfterSeconds: rateLimit.retryAfterSeconds,
              },
            },
            'Donation checkout request rate limited',
          );
          return publicActionRateLimitResponse(rateLimit);
        }

        try {
          const [{ createDonationCheckout }, session] = await Promise.all([
            import('@/donations/checkout'),
            getSession(),
          ]);
          const checkout = await createDonationCheckout(
            parsed.data,
            session?.appUserId ?? null,
          );
          return checkoutResponse(checkout);
        } catch (error) {
          moduleLogger.error(
            {
              err: error instanceof Error ? error : new Error(String(error)),
            },
            'Failed to create donation checkout',
          );
          return checkoutResponse(
            { error: 'We could not start checkout. Try again in a moment.' },
            500,
          );
        }
      },
    },
  },
});
