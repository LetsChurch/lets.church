import { createTransport, type SendMailOptions } from 'nodemailer';
import { z } from 'zod';
import logger from '../../util/logger';

export type EmailArgs = SendMailOptions;

const moduleLogger = logger.child({
  module: 'temporal/activities/background/send-email',
  temporalActivity: 'importMedia',
});

let transport: ReturnType<typeof createTransport> | null = null;

export function validateSendEmailConfig() {
  z.object({ SMTP_URL: z.string() }).parse(process.env);
}

function getTransport() {
  if (!transport) {
    const { SMTP_URL } = z.object({ SMTP_URL: z.string() }).parse(process.env);
    transport = createTransport(SMTP_URL, {
      opportunisticTLS: true,
    });
  }
  return transport;
}

export default async function sendEmailActivity(args: EmailArgs) {
  moduleLogger.info(`Sending email from ${args.from} to ${args.to}`);
  const res = await getTransport().sendMail(args);
  moduleLogger.info('Done!');
  return res;
}
