import {
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';

import { SortableItem, SortableList } from '@/components/sortable-list';
import {
  ActionIcon,
  Alert,
  Button,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@/components/ui';
import { formatDonationAmount } from '@/donations/amounts';
import { useTRPC } from '@/trpc/react';

type CategoryDraft = {
  id?: string;
  name: string;
  description: string;
  amount: string;
};

type UntrackedGiftDraft = {
  id?: string;
  label: string;
  amount: string;
};

function parseCents(dollars: string) {
  if (dollars.trim() === '') return null;
  const value = Number(dollars);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The change was not saved.';
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border-fancy-pants rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={500} className="mt-1 text-2xl tabular-nums">
        {value}
      </Text>
      {detail ? (
        <Text size="xs" c="dimmed" className="mt-1">
          {detail}
        </Text>
      ) : null}
    </div>
  );
}

function CategoryEditor({
  draft,
  onCancel,
  onSaved,
}: {
  draft: CategoryDraft;
  onCancel: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const [value, setValue] = useState(draft);
  const save = useMutation(
    trpc.donations.saveBudgetCategory.mutationOptions({ onSuccess: onSaved }),
  );
  const amountCents = parseCents(value.amount);
  const valid =
    value.name.trim() !== '' && amountCents != null && amountCents >= 0;

  return (
    <form
      className="border-fancy-pants mt-4 grid gap-4 rounded-lg bg-white p-5 shadow-sm md:grid-cols-[2fr_1fr] dark:bg-zinc-900"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        save.mutate({
          id: value.id,
          name: value.name,
          description: value.description,
          monthlyAmountCents: amountCents,
        });
      }}
    >
      <TextInput
        label="Name"
        placeholder="Storage"
        required
        maxLength={80}
        value={value.name}
        onChange={(event) => setValue({ ...value, name: event.target.value })}
      />
      <TextInput
        label="Monthly amount"
        leftSection="$"
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        required
        value={value.amount}
        onChange={(event) => setValue({ ...value, amount: event.target.value })}
      />
      <Textarea
        label="Description"
        description="Optional. Shown under the name on the donate page."
        maxLength={280}
        value={value.description}
        onChange={(event) =>
          setValue({ ...value, description: event.target.value })
        }
        wrapperClassName="md:col-span-2"
      />
      {save.isError ? (
        <Alert color="red" className="md:col-span-2">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={!valid} loading={save.isPending}>
          {value.id ? 'Save category' : 'Add category'}
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function UntrackedGiftEditor({
  draft,
  onCancel,
  onSaved,
}: {
  draft: UntrackedGiftDraft;
  onCancel: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const [value, setValue] = useState(draft);
  const save = useMutation(
    trpc.donations.saveUntrackedGift.mutationOptions({ onSuccess: onSaved }),
  );
  const amountCents = parseCents(value.amount);
  const valid =
    value.label.trim() !== '' && amountCents != null && amountCents > 0;

  return (
    <form
      className="border-fancy-pants mt-4 grid gap-4 rounded-lg bg-white p-5 shadow-sm md:grid-cols-[2fr_1fr] dark:bg-zinc-900"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        save.mutate({
          id: value.id,
          label: value.label,
          monthlyAmountCents: amountCents,
        });
      }}
    >
      <TextInput
        label="Label"
        placeholder="Monthly check from a partner church"
        required
        maxLength={120}
        value={value.label}
        onChange={(event) => setValue({ ...value, label: event.target.value })}
      />
      <TextInput
        label="Monthly amount"
        leftSection="$"
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        required
        value={value.amount}
        onChange={(event) => setValue({ ...value, amount: event.target.value })}
      />
      {save.isError ? (
        <Alert color="red" className="md:col-span-2">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={!valid} loading={save.isPending}>
          {value.id ? 'Save gift' : 'Add gift'}
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DonationBudgetAdmin() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: budget } = useSuspenseQuery(
    trpc.donations.getAdminBudget.queryOptions(),
  );
  const [category, setCategory] = useState<CategoryDraft | null>(null);
  const [gift, setGift] = useState<UntrackedGiftDraft | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.donations.getAdminBudget.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.donations.getBudget.queryKey(),
      }),
    ]);
  const deleteCategory = useMutation(
    trpc.donations.deleteBudgetCategory.mutationOptions({ onSuccess: refresh }),
  );
  const deleteGift = useMutation(
    trpc.donations.deleteUntrackedGift.mutationOptions({ onSuccess: refresh }),
  );
  const reorderCategories = useMutation(
    trpc.donations.reorderBudgetCategories.mutationOptions({
      onSettled: refresh,
    }),
  );
  const { summary } = budget;

  const handleReorder = (categories: typeof budget.categories) => {
    // Show the new order immediately; the refresh after the mutation settles
    // replaces it with the saved order (or restores the old one on failure).
    queryClient.setQueryData(trpc.donations.getAdminBudget.queryKey(), {
      ...budget,
      categories,
    });
    reorderCategories.mutate({ categoryIds: categories.map(({ id }) => id) });
  };

  return (
    <>
      <Text size="sm" c="dimmed" className="mb-4">
        Categories and the monthly comparison appear on the donate page once at
        least one category exists. Scheduled gifts count active monthly plans at
        their charge less an estimated card fee of 2.9% + 30¢ (quarterly and
        yearly plans are spread per month) and leave out plans set to stop.
        Exclude a plan from its row on the Recurring tab.
      </Text>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Monthly costs"
          value={formatDonationAmount(summary.expensesCents)}
          detail={
            budget.categories.length === 1
              ? '1 category'
              : `${budget.categories.length} categories`
          }
        />
        <SummaryCard
          label="Scheduled monthly gifts"
          value={formatDonationAmount(summary.recurringCents)}
          detail={
            budget.excludedSubscriptionCount > 0
              ? `${plural(budget.countedSubscriptionCount, 'plan')} counted · ${budget.excludedSubscriptionCount} excluded`
              : `${plural(budget.countedSubscriptionCount, 'plan')} counted`
          }
        />
        <SummaryCard
          label="Untracked gifts"
          value={formatDonationAmount(summary.untrackedCents)}
          detail={plural(budget.untrackedGifts.length, 'gift')}
        />
        <SummaryCard
          label={
            summary.differenceCents < 0
              ? 'Monthly shortfall'
              : 'Monthly surplus'
          }
          value={formatDonationAmount(Math.abs(summary.differenceCents))}
          detail={`${formatDonationAmount(summary.incomeCents)} intake`}
        />
      </div>

      {deleteCategory.isError || deleteGift.isError ? (
        <Alert
          color="red"
          title="Delete failed"
          withCloseButton
          onClose={() => {
            deleteCategory.reset();
            deleteGift.reset();
          }}
          className="mb-5"
        >
          {errorMessage(deleteCategory.error ?? deleteGift.error)}
        </Alert>
      ) : null}
      {reorderCategories.isError ? (
        <Alert
          color="red"
          title="Reorder failed"
          withCloseButton
          onClose={() => reorderCategories.reset()}
          className="mb-5"
        >
          {errorMessage(reorderCategories.error)}
        </Alert>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3">
        <Title order={2} className="text-lg">
          Expense categories
        </Title>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            setCategory({
              name: '',
              description: '',
              amount: '',
            })
          }
        >
          Add category
        </Button>
      </div>
      <Table withTableBorder highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-0">
              <span className="sr-only">Reorder</span>
            </Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Monthly</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        {budget.categories.length === 0 ? (
          <Table.Tbody>
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text size="sm" c="dimmed">
                  No categories yet. The donate page hides the breakdown until
                  you add one.
                </Text>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        ) : (
          <SortableList
            as="tbody"
            items={budget.categories}
            getId={(row) => row.id}
            onReorder={handleReorder}
          >
            {(row) => (
              <SortableItem key={row.id} id={row.id}>
                {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                  <tr
                    ref={setNodeRef}
                    style={style}
                    className={
                      isDragging
                        ? 'relative z-10 bg-white shadow-md dark:bg-zinc-900'
                        : undefined
                    }
                  >
                    <Table.Td className="w-0 pr-0">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={`Reorder ${row.name}`}
                        className="cursor-grab touch-none"
                        {...attributes}
                        {...listeners}
                      >
                        <IconGripVertical size={16} />
                      </ActionIcon>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={500}>{row.name}</Text>
                      {row.description ? (
                        <Text size="xs" c="dimmed">
                          {row.description}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td className="tabular-nums">
                      {formatDonationAmount(row.monthlyAmountCents)}
                    </Table.Td>
                    <Table.Td>
                      <div className="flex justify-end gap-1">
                        <ActionIcon
                          variant="subtle"
                          aria-label={`Edit ${row.name}`}
                          onClick={() =>
                            setCategory({
                              id: row.id,
                              name: row.name,
                              description: row.description ?? '',
                              amount: String(row.monthlyAmountCents / 100),
                            })
                          }
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`Delete ${row.name}`}
                          onClick={() => {
                            if (
                              window.confirm(`Delete the ${row.name} category?`)
                            ) {
                              deleteCategory.mutate({ id: row.id });
                            }
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </div>
                    </Table.Td>
                  </tr>
                )}
              </SortableItem>
            )}
          </SortableList>
        )}
      </Table>
      {category ? (
        <CategoryEditor
          key={category.id ?? 'new'}
          draft={category}
          onCancel={() => setCategory(null)}
          onSaved={async () => {
            await refresh();
            setCategory(null);
          }}
        />
      ) : null}

      <div className="mt-10 mb-3 flex items-center justify-between gap-3">
        <div>
          <Title order={2} className="text-lg">
            Untracked gifts
          </Title>
          <Text size="sm" c="dimmed">
            Monthly checks, transfers, or pledges that don&apos;t run through
            Stripe.
          </Text>
        </div>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() => setGift({ label: '', amount: '' })}
        >
          Add gift
        </Button>
      </div>
      <Table withTableBorder highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Gift</Table.Th>
            <Table.Th>Monthly</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {budget.untrackedGifts.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text size="sm" c="dimmed">
                  No untracked gifts. Intake is the scheduled monthly gifts
                  alone.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : null}
          {budget.untrackedGifts.map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>
                <Text fw={500}>{row.label}</Text>
              </Table.Td>
              <Table.Td className="tabular-nums">
                {formatDonationAmount(row.monthlyAmountCents)}
              </Table.Td>
              <Table.Td>
                <div className="flex justify-end gap-1">
                  <ActionIcon
                    variant="subtle"
                    aria-label={`Edit ${row.label}`}
                    onClick={() =>
                      setGift({
                        id: row.id,
                        label: row.label,
                        amount: String(row.monthlyAmountCents / 100),
                      })
                    }
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Delete ${row.label}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${row.label}"?`)) {
                        deleteGift.mutate({ id: row.id });
                      }
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </div>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {gift ? (
        <UntrackedGiftEditor
          key={gift.id ?? 'new'}
          draft={gift}
          onCancel={() => setGift(null)}
          onSaved={async () => {
            await refresh();
            setGift(null);
          }}
        />
      ) : null}
    </>
  );
}
