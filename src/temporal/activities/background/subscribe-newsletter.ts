import { z } from 'zod';
import logger from '@/util/logger';

const { LISTMONK_INTERNAL_URL } = z
  .object({ LISTMONK_INTERNAL_URL: z.string() })
  .parse(process.env);

const moduleLogger = logger.child({
  module: 'temporal/activities/background/subscribe-newsletter',
  temporalActivity: 'subscribeNewsletter',
});

export default async function subscribeNewsletterActivity(email: string) {
  moduleLogger.info(`Subscribing ${email} to newsletter`);

  const form = new FormData();
  form.set('email', email);

  const response = await fetch(`${LISTMONK_INTERNAL_URL}/subscription/form`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    moduleLogger.error(
      `Failed to subscribe ${email} to newsletter: ${response.status} ${response.statusText}`,
    );
    throw new Error(`Newsletter subscription failed: ${response.statusText}`);
  }

  moduleLogger.info(`Successfully subscribed ${email} to newsletter`);
}
