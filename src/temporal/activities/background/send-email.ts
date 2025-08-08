import { createTransport, type SendMailOptions } from 'nodemailer';
import { z } from 'zod';
import logger from '@/util/logger';

const { SMTP_URL } = z.object({ SMTP_URL: z.string() }).parse(process.env);

const transport = createTransport(SMTP_URL, {
  opportunisticTLS: true,
});

export type EmailArgs = SendMailOptions;

const moduleLogger = logger.child({
  module: 'temporal/activities/background/send-email',
  temporalActivity: 'importMedia',
});

export default async function sendEmailActivity(args: EmailArgs) {
  moduleLogger.info(`Sending email from ${args.from} to ${args.to}`);
  const res = await transport.sendMail(args);
  moduleLogger.info('Done!');
  return res;
}
