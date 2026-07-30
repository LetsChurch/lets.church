import {
  IconCircleCheck,
  IconClock,
  IconExclamationCircle,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { Button, Loader, Text, Title } from '@/components/ui';
import { formatDonationAmount } from '@/donations/amounts';
import { takeDonationCheckoutEmail } from '@/donations/sign-in-state';

const searchSchema = z.object({
  session_id: z.string().min(1),
});

type CheckoutStatus = {
  status:
    | 'PROCESSING'
    | 'PENDING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'EXPIRED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'DISPUTED';
  frequency?: 'ONE_TIME' | 'MONTHLY';
  amountCents?: number;
  currency?: string;
};

export const Route = createFileRoute('/_main/donate_/success')({
  component: DonationSuccessPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Donation received | Let's Church" }],
  }),
});

function DonationSuccessPage() {
  const { session_id: sessionId } = Route.useSearch();
  const [donationEmail, setDonationEmail] = useState<string>();
  useEffect(() => {
    setDonationEmail(
      takeDonationCheckoutEmail(window.sessionStorage, sessionId),
    );
  }, [sessionId]);
  const query = useQuery({
    queryKey: ['donation-checkout-status', sessionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/donations/status?session_id=${encodeURIComponent(sessionId)}`,
      );
      if (!response.ok) throw new Error('Failed to check donation');
      return (await response.json()) as CheckoutStatus;
    },
    retry: 2,
    refetchInterval: (state) =>
      ['PROCESSING', 'PENDING'].includes(state.state.data?.status ?? '')
        ? 2_000
        : false,
  });

  const status = query.data?.status ?? 'PROCESSING';
  const successful = status === 'SUCCEEDED';
  const failed = status === 'FAILED' || status === 'EXPIRED';
  const lookupFailed = query.isError;

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl items-center justify-center py-12">
      <div className="border-fancy-pants w-full rounded-xl bg-white p-8 text-center shadow-lg dark:bg-zinc-900">
        <div className="mb-5 flex justify-center">
          {lookupFailed ? (
            <IconExclamationCircle className="text-red-600" size={56} />
          ) : successful ? (
            <IconCircleCheck className="text-green-600" size={56} />
          ) : failed ? (
            <IconExclamationCircle className="text-red-600" size={56} />
          ) : status === 'PENDING' ? (
            <IconClock className="text-brand" size={56} />
          ) : (
            <Loader size="xl" />
          )}
        </div>

        <Title order={1} className="mb-3 text-3xl">
          {lookupFailed
            ? 'We could not confirm this donation'
            : successful
              ? 'Thank you for supporting Let’s Church'
              : failed
                ? 'Stripe could not complete the donation'
                : status === 'PENDING'
                  ? 'Your payment is processing'
                  : 'Confirming your donation'}
        </Title>

        {query.data?.amountCents ? (
          <Text fw={500} className="mb-3 text-lg">
            {formatDonationAmount(query.data.amountCents, query.data.currency)}
            {query.data.frequency === 'MONTHLY' ? ' each month' : ''}
          </Text>
        ) : null}

        <Text c="dimmed" className="mb-6 leading-relaxed">
          {lookupFailed
            ? 'The status check failed. This does not mean the payment failed. Retry before starting another checkout.'
            : successful
              ? 'Stripe will email your receipt to the address you used at checkout.'
              : failed
                ? 'Return to the donation page to start a new checkout.'
                : 'Bank payments can take several days. Stripe will email you after the payment clears.'}
        </Text>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          {lookupFailed ? (
            <Button onClick={() => query.refetch()} loading={query.isFetching}>
              Check again
            </Button>
          ) : failed ? (
            <Button component={Link} to="/donate">
              Try again
            </Button>
          ) : (
            <Button
              component={Link}
              to="/auth/email-sign-in"
              search={{ redirect: '/dashboard/account/donations' }}
              state={(previous: Record<string, unknown>) => ({
                ...previous,
                donationEmail,
              })}
            >
              View or manage donations
            </Button>
          )}
          <Button component={Link} to="/" variant="light">
            Return home
          </Button>
        </div>

        {!failed && !lookupFailed ? (
          <Text size="sm" c="dimmed" className="mt-6">
            Use the email from checkout. We&apos;ll connect this gift to your
            account after you confirm the address.
          </Text>
        ) : null}
      </div>
    </div>
  );
}
