import { prisma } from '@letschurch/db';
import { z } from 'zod';
import logger from '../../util/logger';

const { LISTMONK_INTERNAL_URL } = z
  .object({
    LISTMONK_INTERNAL_URL: z.string(),
  })
  .parse(process.env);

const moduleLogger = logger.child({
  module: 'temporal/activities/background/subscribe-newsletter',
  temporalActivity: 'subscribeNewsletter',
});

export default async function subscribeNewsletterActivity(email: string) {
  moduleLogger.info(`Subscribing ${email} to newsletter`);

  // Get lists configured for auto-subscribe on registration
  // Only public lists can be subscribed to via the subscription form endpoint
  const registrationLists = await prisma.newsletterMailingList.findMany({
    where: {
      enabled: true,
      subscribeOnRegistration: true,
      type: 'PUBLIC',
    },
    select: { listmonkUuid: true },
  });

  if (registrationLists.length === 0) {
    moduleLogger.warn('No lists configured for auto-subscribe on registration');
    return; // Silently skip if no lists configured
  }

  const form = new FormData();
  form.set('email', email);

  // Add list UUIDs
  for (const list of registrationLists) {
    form.append('l', list.listmonkUuid);
  }

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
