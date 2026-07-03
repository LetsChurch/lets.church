import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
  Badge,
  Button,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute(
  '/_main/dashboard/churches_/$churchId_/leaders',
)({
  component: ChurchLeadersPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurchDetails.queryOptions({
        churchId: params.churchId,
      }),
    );
    return {
      backNavigation: {
        label: 'Church Leaders',
        to: '/dashboard/churches/$churchId',
        params: { churchId: params.churchId },
      },
    };
  },
});

function ChurchLeadersPage() {
  const { churchId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: church } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchDetails.queryOptions({
      churchId,
    }),
  );

  const isAdmin = church.userMembership?.isAdmin ?? false;

  const [
    addLeaderModalOpened,
    { open: openAddLeaderModal, close: closeAddLeaderModal },
  ] = useDisclosure();

  const handleCloseModal = () => {
    closeAddLeaderModal();
    form.reset();
  };

  const form = useAppForm({
    defaultValues: {
      type: 'OTHER' as const,
      name: '',
      email: '',
      phoneNumber: '',
    },
    onSubmit: async ({ value }) => {
      addLeaderMutation.mutate({
        churchId,
        ...value,
      });
    },
  });

  const addLeaderMutation = useMutation(
    trpc.dashboard.churches.addLeader.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Leader added successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchDetails.queryKey({
            churchId,
          }),
        });
        handleCloseModal();
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to add leader' });
      },
    }),
  );

  const removeLeaderMutation = useMutation(
    trpc.dashboard.churches.removeLeader.mutationOptions({
      onSuccess: () => {
        showSuccess({ message: 'Leader removed successfully' });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchDetails.queryKey({
            churchId,
          }),
        });
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to remove leader' });
      },
    }),
  );

  const handleRemoveLeader = (leaderId: string) => {
    removeLeaderMutation.mutate({
      churchId,
      leaderId,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Leaders</Title>
          <Text c="dimmed">
            {church.name} • {church.leaders?.length || 0} registered leaders
          </Text>
        </div>

        {isAdmin && (
          <Tooltip label="Add a new leader to this church" disabled={isAdmin}>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={openAddLeaderModal}
              disabled={!isAdmin}
            >
              Add Leader
            </Button>
          </Tooltip>
        )}
      </div>

      <LcModal.Root
        open={addLeaderModalOpened}
        onOpenChange={(o) => {
          if (!o) handleCloseModal();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Add Church Leader" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
                <form.AppField name="name">
                  {(field) => (
                    <field.TextInputField
                      label="Full Name"
                      placeholder="Enter leader's full name"
                      required
                    />
                  )}
                </form.AppField>

                <form.AppField name="type">
                  {(field) => (
                    <field.SelectField
                      label="Leader Type"
                      data={[
                        { value: 'ELDER', label: 'Elder' },
                        { value: 'DEACON', label: 'Deacon' },
                        { value: 'OTHER', label: 'Other' },
                      ]}
                    />
                  )}
                </form.AppField>

                <form.AppField name="email">
                  {(field) => (
                    <field.TextInputField
                      label="Email"
                      placeholder="leader@example.com"
                    />
                  )}
                </form.AppField>

                <form.AppField name="phoneNumber">
                  {(field) => (
                    <field.TextInputField
                      label="Phone Number"
                      placeholder="(555) 123-4567"
                    />
                  )}
                </form.AppField>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                  <Button variant="outline" onClick={handleCloseModal}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={addLeaderMutation.isPending}>
                    Add Leader
                  </Button>
                </div>
              </div>
            </form>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Contact</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {church.leaders?.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed" className="py-8">
                  No leaders registered for this church
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            church.leaders?.map((leader) => (
              <Table.Tr key={leader.id}>
                <Table.Td>
                  <Text fw={500} size="sm">
                    {leader.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      leader.type === 'ELDER'
                        ? 'blue'
                        : leader.type === 'DEACON'
                          ? 'green'
                          : 'gray'
                    }
                    size="sm"
                  >
                    {leader.type}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <div className="flex flex-col gap-2.5">
                    {leader.email && (
                      <Text size="sm" c="dimmed">
                        {leader.email}
                      </Text>
                    )}
                    {leader.phoneNumber && (
                      <Text size="sm" c="dimmed">
                        {leader.phoneNumber}
                      </Text>
                    )}
                  </div>
                </Table.Td>
                <Table.Td>
                  {(() => {
                    const canRemove = isAdmin;
                    const tooltipText = !isAdmin
                      ? 'Only admins can remove leaders'
                      : 'Remove this leader from the church';

                    return (
                      <Tooltip label={tooltipText}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          disabled={!canRemove}
                          onClick={() =>
                            canRemove && handleRemoveLeader(leader.id)
                          }
                          loading={removeLeaderMutation.isPending}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    );
                  })()}
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </div>
  );
}
