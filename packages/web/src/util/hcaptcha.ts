import { z } from 'zod';

const { HCAPTCHA_SECRET_KEY, HCAPTCHA_SITE_KEY } = z
  .object({
    HCAPTCHA_SECRET_KEY: z.string(),
    HCAPTCHA_SITE_KEY: z.string(),
  })
  .parse(process.env);

const url = 'https://api.hcaptcha.com/siteverify';

const responseSchema = z.object({ success: z.boolean() });

export async function validateHCaptcha(
  token: string,
  ip?: string | null,
): Promise<boolean> {
  const body = new URLSearchParams({
    secret: HCAPTCHA_SECRET_KEY,
    response: token,
    sitekey: HCAPTCHA_SITE_KEY,
  });

  if (ip) {
    body.set('remoteip', ip);
  }

  const result = await fetch(url, {
    body,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return responseSchema.parse(await result.json()).success;
}
