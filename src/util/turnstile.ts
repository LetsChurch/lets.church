import { z } from 'zod';

const { TURNSTILE_SECRET_KEY } = z
  .object({ TURNSTILE_SECRET_KEY: z.string() })
  .parse(process.env);

const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const responseSchema = z.object({ success: z.boolean() });

export async function validateTurnstile(
  token: string,
  ip?: string | null,
): Promise<boolean> {
  const result = await fetch(url, {
    body: JSON.stringify({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    }),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const parsed = responseSchema.parse(await result.json());

  if (!parsed.success) {
    return false;
  }

  return parsed.success;
}
