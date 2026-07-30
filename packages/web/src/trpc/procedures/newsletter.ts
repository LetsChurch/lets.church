import { db } from '@letschurch/db';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';

import { validateHCaptcha } from '@/util/hcaptcha';
import logger from '@/util/logger';
import { getClientIpAddress } from '@/util/request-ip';

import { publicProcedure } from '../trpc';

const { LISTMONK_INTERNAL_URL } = z
  .object({
    LISTMONK_INTERNAL_URL: z.string().optional(),
  })
  .parse(process.env);

const moduleLogger = logger.child({
  module: 'trpc/procedures/newsletter',
});

const subscribeSchema = z.object({
  email: z.email(),
  hcaptchaToken: z.string().min(1),
});

type SubscribeResponse = { success: true } | { success: false; error: string };

export const newsletterProcedures = {
  subscribe: publicProcedure
    .input(subscribeSchema)
    .mutation(
      async ({
        input: { email, hcaptchaToken },
      }): Promise<SubscribeResponse> => {
        const clientIp = getClientIpAddress(getRequest().headers);

        moduleLogger.info('Newsletter subscription attempt');

        // Validate hCaptcha
        try {
          const isValid = await validateHCaptcha(hcaptchaToken, clientIp);
          if (!isValid) {
            moduleLogger.warn(
              {
                context: {
                  clientIp,
                },
              },
              'Newsletter subscription failed - invalid CAPTCHA',
            );
            return {
              success: false,
              error: 'Invalid verification. Please try again.',
            };
          }
        } catch (e) {
          moduleLogger.error(
            {
              context: {
                error: e instanceof Error ? e.message : String(e),
              },
            },
            'hCaptcha validation error',
          );
          return {
            success: false,
            error: 'Verification failed. Please try again.',
          };
        }

        // Check if Listmonk is configured
        if (!LISTMONK_INTERNAL_URL) {
          moduleLogger.error(
            'Newsletter subscription failed - Listmonk not configured',
          );
          return {
            success: false,
            error: 'Newsletter service is not available at this time.',
          };
        }

        // Subscribe to newsletter via Listmonk
        try {
          // Get enabled public lists from database
          // Only public lists can be subscribed to via the subscription form endpoint
          const enabledLists = await db.query.NewsletterMailingList.findMany({
            where: (t, { eq, and }) =>
              and(eq(t.enabled, true), eq(t.type, 'public')),
            columns: { listmonkUuid: true },
          });

          if (enabledLists.length === 0) {
            moduleLogger.warn('No enabled public newsletter lists configured');
            return {
              success: false,
              error: 'Newsletter service is not configured.',
            };
          }

          const form = new FormData();
          form.set('email', email);

          // Add enabled list UUIDs
          for (const list of enabledLists) {
            form.append('l', list.listmonkUuid);
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

          const response = await fetch(
            `${LISTMONK_INTERNAL_URL}/subscription/form`,
            {
              method: 'POST',
              body: form,
              signal: controller.signal,
            },
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            const responseText = await response.text();
            const errorDetails = {
              email,
              status: response.status,
              statusText: response.statusText,
              url: `${LISTMONK_INTERNAL_URL}/subscription/form`,
              responseBody: responseText,
              headers: Object.fromEntries(response.headers.entries()),
            };

            // Use console.error to ensure we see the output
            console.error(
              'LISTMONK API ERROR DETAILS:',
              JSON.stringify(errorDetails, null, 2),
            );

            moduleLogger.error(
              {
                context: errorDetails,
              },
              'Listmonk API error',
            );
            return {
              success: false,
              error:
                'Unable to subscribe at this time. Please try again later.',
            };
          }

          const responseText = await response.text();
          moduleLogger.info(
            {
              context: {
                responseBody: responseText,
              },
            },
            'Newsletter subscription successful',
          );

          return { success: true };
        } catch (e) {
          // Handle network errors, timeouts, etc.
          if (e instanceof Error) {
            if (e.name === 'AbortError') {
              moduleLogger.error(
                {
                  context: {
                    error: 'Request timeout',
                  },
                },
                'Newsletter subscription timeout',
              );
            } else {
              moduleLogger.error(
                {
                  context: {
                    error: e.message,
                  },
                },
                'Newsletter subscription error',
              );
            }
          }

          // Use console.error to ensure we see the output
          console.error('LISTMONK API CAUGHT ERROR:', e);

          return {
            success: false,
            error: 'Unable to subscribe at this time. Please try again later.',
          };
        }
      },
    ),
};
