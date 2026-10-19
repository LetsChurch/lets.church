import { Popover } from '@base-ui/react/popover';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert, Button, Text, TextInput } from '@/components/ui';
import { formatDonationAmount } from '@/donations/amounts';
import { useTRPC } from '@/trpc/react';

function signedAmount(cents: number) {
  return `${cents > 0 ? '+' : ''}${formatDonationAmount(cents)}`;
}

/**
 * Budget-offset annotation on one recurring donation: a signed monthly
 * adjustment to what the plan counts toward the public budget, plus a note.
 * Edited in a popover from the plan's row on the admin Recurring tab.
 */
export function SubscriptionBudgetOffset({
  subscriptionId,
  donorLabel,
  budgetOffsetCents,
  budgetOffsetNote,
  countsTowardBudget,
}: {
  subscriptionId: string;
  donorLabel: string;
  budgetOffsetCents: number;
  budgetOffsetNote: string | null;
  countsTowardBudget: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation(
    trpc.donations.setSubscriptionBudgetOffset.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.donations.getAdminSubscriptions.pathFilter(),
          ),
          queryClient.invalidateQueries({
            queryKey: trpc.donations.getAdminBudget.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.donations.getBudget.queryKey(),
          }),
        ]);
        setOpen(false);
      },
    }),
  );
  const hasOffset = budgetOffsetCents !== 0;
  const parsed = amount.trim() === '' ? 0 : Number(amount);
  const valid = Number.isFinite(parsed);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setAmount(hasOffset ? String(budgetOffsetCents / 100) : '');
          setNote(budgetOffsetNote ?? '');
          save.reset();
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger
        aria-label={`${hasOffset ? 'Edit' : 'Add'} budget offset for ${donorLabel}`}
        render={(props) => (
          <button
            {...props}
            type="button"
            className="group flex max-w-48 cursor-pointer items-start gap-1.5 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {hasOffset ? (
              <span className="min-w-0">
                <span className="text-primary block text-sm tabular-nums">
                  {signedAmount(budgetOffsetCents)}/mo
                  <IconPencil
                    aria-hidden
                    size={13}
                    className="text-secondary ml-1 inline opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </span>
                {budgetOffsetNote ? (
                  <span className="text-secondary block truncate text-xs">
                    {budgetOffsetNote}
                  </span>
                ) : null}
                {countsTowardBudget ? null : (
                  <span className="block text-xs text-amber-600 dark:text-amber-400">
                    Not counted
                  </span>
                )}
              </span>
            ) : (
              <span className="text-secondary group-hover:text-brand inline-flex items-center gap-1 text-xs">
                <IconPlus aria-hidden size={13} />
                Offset
              </span>
            )}
          </button>
        )}
      />
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6}>
          <Popover.Popup className="border-fancy-pants w-72 rounded-lg bg-white p-4 shadow-xl transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-zinc-900">
            <Popover.Title className="text-primary text-sm font-semibold">
              Budget offset
            </Popover.Title>
            <Popover.Description className="text-secondary mt-0.5 mb-3 text-xs">
              Adjusts what this plan counts toward monthly giving. Use a
              negative amount to count less.
            </Popover.Description>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!valid) return;
                save.mutate({
                  subscriptionId,
                  budgetOffsetCents: Math.round(parsed * 100),
                  budgetOffsetNote: note,
                });
              }}
            >
              <TextInput
                label="Monthly adjustment"
                leftSection="$"
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="-13.03"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <TextInput
                label="Note"
                placeholder="Half designated to missions"
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {countsTowardBudget ? null : (
                <Text size="xs" c="dimmed">
                  This plan isn&apos;t active, so its offset won&apos;t count
                  until it is.
                </Text>
              )}
              {save.isError ? (
                <Alert color="red">
                  {save.error instanceof Error
                    ? save.error.message
                    : 'The offset was not saved.'}
                </Alert>
              ) : null}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="xs"
                  disabled={!valid}
                  loading={
                    save.isPending && save.variables?.budgetOffsetCents !== 0
                  }
                >
                  Save
                </Button>
                {hasOffset ? (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    loading={
                      save.isPending && save.variables?.budgetOffsetCents === 0
                    }
                    onClick={() =>
                      save.mutate({
                        subscriptionId,
                        budgetOffsetCents: 0,
                        budgetOffsetNote: '',
                      })
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
