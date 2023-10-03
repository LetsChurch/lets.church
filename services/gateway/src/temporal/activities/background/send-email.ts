import envariant from '@knpwrs/envariant';
import { createTransport, type SendMailOptions } from 'nodemailer';
import logger from '../../../util/logger';

const transport = createTransport(envariant('SMTP_URL'));

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
