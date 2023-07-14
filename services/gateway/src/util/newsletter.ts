import envariant from '@knpwrs/envariant';
import { stripIndent } from 'proper-tags';
import { sendEmail } from '../temporal';
import { emailHtml } from './email';
import prisma from './prisma';
import { uuidTranslator } from './uuid';

const WEB_URL = envariant('WEB_URL');

export async function subscribeToNewsletter(email: string) {
  const sub = await prisma.newsletterSubscription.upsert({
    where: {
      email,
    },
    create: {
      email,
    },
    update: {},
  });

  if (sub.verifiedAt) {
    return;
  }

  const verifyUrl = `${WEB_URL}/newsletter/verify?${new URLSearchParams({
    subscriptionId: uuidTranslator.fromUUID(sub.id),
    emailKey: uuidTranslator.fromUUID(sub.key),
  })}`;

  await sendEmail(`subscription:${email}`, {
    from: 'hello@lets.church',
    to: email,
    subject: "Please Verify Your Email for the Let's Church Newsletter",
    text: `You have subscribed to the Let's Church Newsletter. Please visit the following link to confirm your subscription: ${verifyUrl}`,
    html: emailHtml(
      "Let's Church Newsletter",
      stripIndent`
          You have been subscribed to the Let's Church Newsletter. Please click <a href="${verifyUrl}">here</a> to confirm your subscription.

          Alternatively, visit the following link to confirm your subscription: ${verifyUrl}
        `,
    ).html,
  });
}
