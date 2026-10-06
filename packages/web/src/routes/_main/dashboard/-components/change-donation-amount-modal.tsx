import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { LcModal, ModalHeader } from '@/components/lc-modal';
import { Alert, Button, Checkbox, Text, TextInput } from '@/components/ui';
import { donationAmounts, formatDonationAmount } from '@/donations/amounts';
import { donationSubscriptionAmountSchema } from '@/schemas/donations';
import { useTRPC } from '@/trpc/react';

type Subscription = {
  id: string;
  baseAmountCents: number;
  feeCoverageCents: number;
  amountCents: number;
  currency: string;
  currentPeriodEnd: Date | null;
};

export function ChangeDonationAmountModal({
  subscription,
  cadence,
  open,
  onOpenChange,
  onChanged,
}: {
  subscription: Subscription;
  cadence: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const [amountInput, setAmountInput] = useState(() =>
    // Whole dollars read like the /donate presets ("25"); cents keep both
    // digits ("10.50").
    subscription.baseAmountCents % 100 === 0
      ? String(subscription.baseAmountCents / 100)
      : (subscription.baseAmountCents / 100).toFixed(2),
  );
  const [coverFees, setCoverFees] = useState(subscription.feeCoverageCents > 0);
  const [submitted, setSubmitted] = useState(false);
  const mutation = useMutation(
    trpc.donations.updateMySubscriptionAmount.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
        onChanged();
      },
    }),
  );

  const amountCents =
    amountInput.trim() === '' ? 0 : Math.round(Number(amountInput) * 100);
  const parsed = donationSubscriptionAmountSchema.safeParse({
    subscriptionId: subscription.id,
    amountCents: Number.isFinite(amountCents) ? amountCents : 0,
    coverFees,
  });
  const amountError = parsed.success ? null : parsed.error.issues[0]?.message;
  const total = donationAmounts(
    parsed.success ? parsed.data.amountCents : 0,
    coverFees,
  ).amountCents;
  const unchanged = parsed.success && total === subscription.amountCents;

  return (
    <LcModal.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          mutation.reset();
          setSubmitted(false);
        }
        onOpenChange(next);
      }}
    >
      <LcModal.Portal>
        <LcModal.Backdrop />
        <LcModal.Popup size="md">
          <ModalHeader title="Change donation amount" />
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
              if (!parsed.success || unchanged) return;
              mutation.mutate(parsed.data);
            }}
          >
            <LcModal.Description>
              You give{' '}
              {formatDonationAmount(
                subscription.amountCents,
                subscription.currency,
              )}{' '}
              {cadence} now. The new amount starts with your next payment
              {subscription.currentPeriodEnd
                ? ` on ${subscription.currentPeriodEnd.toLocaleDateString()}`
                : ''}
              . You won&apos;t be charged anything today.
            </LcModal.Description>

            <TextInput
              label="New amount"
              type="number"
              min="5"
              max="50000"
              step="0.01"
              inputMode="decimal"
              leftSection={<span className="text-secondary">$</span>}
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              error={submitted ? amountError : undefined}
              required
            />

            <Checkbox
              label={`Add ${formatDonationAmount(
                donationAmounts(
                  parsed.success ? parsed.data.amountCents : 0,
                  true,
                ).feeCoverageCents,
                subscription.currency,
              )} toward processing costs`}
              checked={coverFees}
              onChange={setCoverFees}
            />

            {mutation.isError ? (
              <Alert color="red">
                Stripe did not update this donation. Your current amount is
                unchanged. Try again or contact contact@lets.church.
              </Alert>
            ) : null}
            {submitted && unchanged ? (
              <Text size="sm" c="dimmed">
                That&apos;s the amount you already give.
              </Text>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                variant="light"
                color="gray"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                {parsed.success
                  ? `Give ${formatDonationAmount(total, subscription.currency)} ${cadence}`
                  : 'Update amount'}
              </Button>
            </div>
          </form>
        </LcModal.Popup>
      </LcModal.Portal>
    </LcModal.Root>
  );
}
