import { emailSchema } from '@/schemas/auth';
import { normalizeEmail } from '@/util/normalize-email';

const checkoutEmailKey = (sessionId: string) =>
  `donation-checkout-email:${sessionId}`;

export function donationEmailFromHistoryState(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;

  const result = emailSchema.safeParse(
    (value as { donationEmail?: unknown }).donationEmail,
  );
  return result.success ? result.data : undefined;
}

export function rememberDonationCheckoutEmail(
  storage: Pick<Storage, 'setItem'>,
  sessionId: string,
  email: string,
) {
  const parsedSessionId = sessionId.trim();
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedSessionId || !parsedEmail.success) return;

  try {
    storage.setItem(
      checkoutEmailKey(parsedSessionId),
      normalizeEmail(parsedEmail.data),
    );
  } catch {
    // Checkout should still proceed when browser storage is unavailable.
  }
}

export function takeDonationCheckoutEmail(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  sessionId: string,
) {
  const parsedSessionId = sessionId.trim();
  if (!parsedSessionId) return undefined;

  try {
    const key = checkoutEmailKey(parsedSessionId);
    const value = storage.getItem(key);
    storage.removeItem(key);
    const parsedEmail = emailSchema.safeParse(value);
    return parsedEmail.success ? parsedEmail.data : undefined;
  } catch {
    return undefined;
  }
}
