import { Switch } from '@base-ui/react/switch';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

/**
 * Whether one recurring donation counts toward the public budget's monthly
 * giving. Toggled from the plan's row on the admin Recurring tab, for special
 * arrangements that shouldn't count.
 */
export function SubscriptionBudgetToggle({
  subscriptionId,
  donorLabel,
  excludeFromBudget,
  eligibleForBudget,
}: {
  subscriptionId: string;
  donorLabel: string;
  excludeFromBudget: boolean;
  eligibleForBudget: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const save = useMutation(
    trpc.donations.setSubscriptionExcludeFromBudget.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries(
            trpc.donations.getAdminSubscriptions.pathFilter(),
          ),
          queryClient.invalidateQueries({
            queryKey: trpc.donations.getAdminBudget.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.donations.getBudget.queryKey(),
          }),
        ]),
    }),
  );
  const counted = save.isPending
    ? !save.variables.excludeFromBudget
    : !excludeFromBudget;

  return (
    <div className="flex flex-col gap-1">
      <Switch.Root
        aria-label={`Count ${donorLabel} toward the budget`}
        checked={counted}
        disabled={save.isPending}
        onCheckedChange={(checked) =>
          save.mutate({ subscriptionId, excludeFromBudget: !checked })
        }
        className="data-[checked]:bg-brand relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-gray-300 p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 data-[disabled]:cursor-wait data-[disabled]:opacity-60 dark:bg-zinc-700"
      >
        <Switch.Thumb className="size-5 rounded-full bg-white shadow transition-transform data-[checked]:translate-x-5" />
      </Switch.Root>
      {eligibleForBudget ? null : (
        <Text size="xs" c="dimmed">
          Not active
        </Text>
      )}
      {save.isError ? (
        <Text size="xs" c="red">
          Not saved
        </Text>
      ) : null}
    </div>
  );
}
