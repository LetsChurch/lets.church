import envariant from '@knpwrs/envariant';
import { createTransport, type SendMailOptions } from 'nodemailer';

const transport = createTransport(envariant('SMTP_URL'));

export type EmailArgs = SendMailOptions;

export default async function sendEmail(args: EmailArgs) {
  console.log(`Sending email from ${args.from} to ${args.to}`);
  const res = await transport.sendMail(args);
  console.log('Done!');
  return res;
}
