import { IconHeartFilled, IconLock } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { Alert, Button, Text, Title } from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { donationAmounts, formatDonationAmount } from '@/donations/amounts';
import { rememberDonationCheckoutEmail } from '@/donations/sign-in-state';
import { donationCheckoutSchema } from '@/schemas/donations';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

const searchSchema = z.object({
  canceled: z.boolean().optional().catch(undefined),
});

const presetAmounts = [1_000, 2_500, 5_000, 10_000];

function validationMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return null;
}

export const Route = createFileRoute('/_main/donate')({
  component: DonatePage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Donate to Let's Church" },
      {
        name: 'description',
        content:
          "Support Let's Church's free, ad-free media platform with a one-time or monthly tax-deductible donation.",
      },
    ],
  }),
  loader: async ({ context: { queryClient, trpc } }) => {
    const [env, defaults] = await Promise.all([
      queryClient.ensureQueryData(trpc.common.getClientEnv.queryOptions()),
      queryClient.ensureQueryData(
        trpc.donations.getCheckoutDefaults.queryOptions(),
      ),
    ]);
    return { env, defaults };
  },
});

function DonatePage() {
  const { canceled } = Route.useSearch();
  const trpc = useTRPC();
  const { data: env } = useSuspenseQuery(
    trpc.common.getClientEnv.queryOptions(),
  );
  const { data: defaults } = useSuspenseQuery(
    trpc.donations.getCheckoutDefaults.queryOptions(),
  );
  const [error, setError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('25');

  const form = useAppForm({
    defaultValues: {
      amountCents: 2_500,
      frequency: 'MONTHLY' as 'ONE_TIME' | 'MONTHLY',
      coverFees: true,
      email: defaults?.email ?? '',
      name: defaults?.name ?? '',
      hcaptchaToken: '',
    },
    validators: {
      onSubmit: donationCheckoutSchema,
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const response = await fetch('/api/donations/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
        const result = (await response.json().catch(() => ({}))) as {
          url?: string;
          sessionId?: string;
          error?: string;
        };
        if (!response.ok || !result.url || !result.sessionId) {
          setError(result.error ?? 'We could not start checkout.');
          form.setFieldValue('hcaptchaToken', '');
          return;
        }
        rememberDonationCheckoutEmail(
          window.sessionStorage,
          result.sessionId,
          value.email,
        );
        window.location.assign(result.url);
      } catch {
        setError(
          'We could not reach checkout. Check your connection and retry.',
        );
        form.setFieldValue('hcaptchaToken', '');
      }
    },
  });

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-y-8 lg:px-8 lg:py-12 xl:px-0">
      <header className="lg:col-start-1 lg:row-start-1">
        <div className="mb-3 flex items-center gap-3 sm:mb-4 sm:gap-4">
          <div className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full sm:size-12">
            <IconHeartFilled size={22} />
          </div>
          <Title order={1} className="text-3xl sm:text-4xl">
            Support Let&apos;s Church
          </Title>
        </div>
        <Text className="max-w-xl text-base leading-relaxed sm:text-lg">
          Your gift pays for media storage, servers, and the tools churches use
          at no cost.
        </Text>
      </header>

      <section className="lg:border-fancy-pants lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:rounded-xl lg:bg-white lg:p-6 lg:shadow-lg lg:dark:bg-zinc-900">
        <Title order={2} className="mb-5 text-2xl">
          Choose your gift
        </Title>

        {canceled ? (
          <Alert color="blue" className="mb-4">
            Checkout was canceled. Your card or bank account was not charged.
          </Alert>
        ) : null}
        {error ? (
          <Alert
            color="red"
            title="Checkout error"
            withCloseButton
            onClose={() => setError(null)}
            className="mb-4"
          >
            {error}
          </Alert>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          <div className="flex flex-col gap-5">
            <form.AppField name="frequency">
              {(field) => (
                <div>
                  <p className="text-primary mb-2 text-sm font-medium">
                    Frequency
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['ONE_TIME', 'One time'],
                      ['MONTHLY', 'Monthly'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={field.state.value === value}
                        onClick={() =>
                          field.handleChange(value as 'ONE_TIME' | 'MONTHLY')
                        }
                        className={cn(
                          'rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors',
                          field.state.value === value
                            ? 'border-brand bg-brand text-white'
                            : 'border-gray-300 text-gray-700 hover:border-indigo-400 dark:border-zinc-700 dark:text-zinc-200',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form.AppField>

            <form.AppField name="amountCents">
              {(field) => (
                <div>
                  <p className="text-primary mb-2 text-sm font-medium">
                    Amount
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {presetAmounts.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        aria-pressed={field.state.value === amount}
                        onClick={() => {
                          field.handleChange(amount);
                          setAmountInput(String(amount / 100));
                        }}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-sm font-semibold transition-colors',
                          field.state.value === amount
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-gray-300 text-gray-700 hover:border-indigo-400 dark:border-zinc-700 dark:text-zinc-200',
                        )}
                      >
                        {formatDonationAmount(amount).replace('.00', '')}
                      </button>
                    ))}
                  </div>
                  <label className="relative block">
                    <span className="text-secondary absolute top-1/2 left-3 -translate-y-1/2">
                      $
                    </span>
                    <input
                      type="number"
                      min="5"
                      max="50000"
                      step="0.01"
                      inputMode="decimal"
                      aria-label="Custom donation amount"
                      value={amountInput}
                      onChange={(event) => {
                        const next = event.target.value;
                        setAmountInput(next);
                        field.handleChange(
                          next === '' ? 0 : Math.round(Number(next) * 100),
                        );
                      }}
                      onBlur={field.handleBlur}
                      className="text-primary focus:border-brand focus:ring-brand/25 w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-7 text-sm outline-none focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                  {validationMessage(field.state.meta.errors[0]) ? (
                    <Text size="xs" c="red" className="mt-1">
                      {validationMessage(field.state.meta.errors[0])}
                    </Text>
                  ) : null}
                </div>
              )}
            </form.AppField>

            <form.AppField name="coverFees">
              {(field) => (
                <form.Subscribe
                  selector={(state) => ({
                    amountCents: state.values.amountCents,
                  })}
                >
                  {({ amountCents }) => {
                    const amounts = donationAmounts(amountCents, true);
                    return (
                      <field.CheckboxField
                        label={`Add ${formatDonationAmount(
                          amounts.feeCoverageCents,
                        )} toward processing costs`}
                        description="Stripe may charge less for some payment methods. Your full payment counts as a donation."
                      />
                    );
                  }}
                </form.Subscribe>
              )}
            </form.AppField>

            <form.AppField name="email">
              {(field) => (
                <field.TextInputField
                  type="email"
                  label="Email"
                  description="Stripe sends your receipt to this address. A verified account with the same email can view this gift."
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="name">
              {(field) => (
                <field.TextInputField
                  label="Name"
                  description="Optional"
                  placeholder="Your name"
                />
              )}
            </form.AppField>

            <div className="flex justify-center">
              <form.AppField name="hcaptchaToken">
                {(field) => (
                  <field.HCaptchaField sitekey={env.HCAPTCHA_SITE_KEY} />
                )}
              </form.AppField>
            </div>

            <form.Subscribe
              selector={(state) => ({
                amountCents: state.values.amountCents,
                coverFees: state.values.coverFees,
                frequency: state.values.frequency,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ amountCents, coverFees, frequency, isSubmitting }) => {
                const total = donationAmounts(
                  amountCents,
                  coverFees,
                ).amountCents;
                return (
                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    loading={isSubmitting}
                  >
                    Donate {formatDonationAmount(total)}
                    {frequency === 'MONTHLY' ? ' each month' : ''}
                  </Button>
                );
              }}
            </form.Subscribe>

            <div className="text-secondary flex items-center justify-center gap-2 text-xs">
              <IconLock size={14} />
              <span>Stripe handles your payment details.</span>
            </div>
          </div>
        </form>
      </section>

      <aside className="lg:col-start-1 lg:row-start-2">
        <div className="lg:border-fancy-pants max-w-xl lg:rounded-lg lg:bg-white lg:p-5 lg:shadow-sm lg:dark:bg-zinc-900">
          <Title order={2} className="mb-3 text-lg">
            Tax information
          </Title>
          <Text size="sm" c="dimmed" className="leading-relaxed">
            Let&apos;s Church Inc. is a 501(c)(3) nonprofit. Your donation is
            tax-deductible in the United States. We provide no goods or services
            in exchange for your gift.
          </Text>
          <Text size="sm" c="dimmed" className="mt-3 leading-relaxed">
            EIN 92-3744006
            <br />
            2140 S Dupont Highway
            <br />
            Camden, DE 19934
          </Text>
        </div>
        <Text size="sm" c="dimmed" className="mt-4 max-w-xl">
          Already give each month?{' '}
          <Link
            to="/auth/email-sign-in"
            search={{
              redirect: '/dashboard/account/donations',
            }}
            className="text-brand font-medium hover:underline"
          >
            Manage your recurring donation
          </Link>{' '}
          using the email from checkout.
        </Text>
      </aside>
    </div>
  );
}
