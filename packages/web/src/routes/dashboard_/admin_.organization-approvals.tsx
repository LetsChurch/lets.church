import {
  ActionIcon,
  Avatar,
  Badge,
  Container,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/dashboard_/admin_/organization-approvals',
)({
  component: OrganizationApprovalsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    if (currentUser.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getPendingOrganizationApprovals.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

function OrganizationApprovalsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: pendingOrganizations } = useSuspenseQuery(
    trpc.dashboard.admin.getPendingOrganizationApprovals.queryOptions(),
  );

  const approveOrganizationMutation = useMutation(
    trpc.dashboard.admin.approveOrganization.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization approved successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.admin.getPendingOrganizationApprovals.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to approve organization',
          color: 'red',
        });
      },
    }),
  );

  const deleteOrganizationMutation = useMutation(
    trpc.dashboard.admin.deleteOrganization.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization deleted successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey:
            trpc.dashboard.admin.getPendingOrganizationApprovals.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to delete organization',
          color: 'red',
        });
      },
    }),
  );

  const handleApproveOrganization = (organizationId: string) => {
    approveOrganizationMutation.mutate({ organizationId });
  };

  const handleDeleteOrganization = (organizationId: string) => {
    deleteOrganizationMutation.mutate({ organizationId });
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm" mb="xs">
              <Title order={1}>Organization Approvals</Title>
              <Badge color="orange" size="sm">
                {pendingOrganizations.length} Pending
              </Badge>
            </Group>
            <Text c="dimmed" size="sm">
              Review and approve pending organization applications
            </Text>
          </div>
        </Group>

        {pendingOrganizations.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No pending organization approvals.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Organization</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Owner</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pendingOrganizations.map((organization) => (
                <Table.Tr key={organization.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <Avatar
                        size="sm"
                        src={organization.avatarUrl}
                        alt={organization.name}
                      >
                        {organization.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <div>
                        <Text
                          fw={500}
                          renderRoot={(rootProps) => (
                            <Link
                              {...rootProps}
                              to={
                                organization.type === 'CHURCH'
                                  ? '/dashboard/churches/$churchId'
                                  : '/dashboard/organizations/$orgId'
                              }
                              params={
                                organization.type === 'CHURCH'
                                  ? { churchId: organization.id }
                                  : { orgId: organization.id }
                              }
                              style={{
                                textDecoration: 'none',
                                color: 'inherit',
                              }}
                            >
                              {organization.name}
                            </Link>
                          )}
                        />
                        <Text size="xs" c="dimmed">
                          ~{organization.slug}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="blue" variant="light" size="sm">
                      {organization.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {organization.memberships[0]?.appUser ? (
                      <div>
                        <Text size="sm" fw={500}>
                          {organization.memberships[0].appUser.fullName}
                        </Text>
                        {organization.memberships[0].appUser.emails[0] && (
                          <Text size="xs" c="dimmed">
                            {
                              organization.memberships[0].appUser.emails[0]
                                .email
                            }
                          </Text>
                        )}
                      </div>
                    ) : (
                      <Text size="sm" c="dimmed">
                        No owner
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatDate(organization.createdAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        color="green"
                        variant="light"
                        size="sm"
                        onClick={() =>
                          handleApproveOrganization(organization.id)
                        }
                        loading={
                          approveOrganizationMutation.isPending &&
                          approveOrganizationMutation.variables
                            ?.organizationId === organization.id
                        }
                        aria-label="Approve organization"
                      >
                        <IconCheck size={14} />
                      </ActionIcon>
                      <ActionIcon
                        color="red"
                        variant="light"
                        size="sm"
                        onClick={() =>
                          handleDeleteOrganization(organization.id)
                        }
                        loading={
                          deleteOrganizationMutation.isPending &&
                          deleteOrganizationMutation.variables
                            ?.organizationId === organization.id
                        }
                        aria-label="Delete organization"
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
